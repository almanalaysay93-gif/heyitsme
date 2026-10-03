import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { contacts, users, workspaceAuditLog } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { createTestDb } from "../billing/testDb";
import { TEAM_CONTACTS_SCHEMA_STATEMENTS } from "./schemaSql";

vi.mock("../_core/rateLimit", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/rateLimit")>()),
  rateLimit: vi.fn(async () => ({ allowed: true, count: 1, resetMs: 0 })),
}));
vi.mock("../_core/mail", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/mail")>()),
  sendMail: vi.fn(async () => true),
}));
vi.mock("../uploadSweep", () => ({ tidyOwnerUploads: vi.fn() }));

const { appRouter } = await import("../routers");
const { setTestDb } = await import("../db");
const { sendMail } = await import("../_core/mail");

const saved = { ...ENV };
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;

const req = { protocol: "https", headers: {}, ip: "203.0.113.9", get: () => "heyitsme.test", query: {} } as unknown as TrpcContext["req"];
const callerFor = (user: typeof users.$inferSelect | null) => appRouter.createCaller({ user, req, res: {} as TrpcContext["res"] });

let seq = 0;
async function makeUser(email: string, name = email.split("@")[0]) {
  const [row] = await db.insert(users).values({ openId: `k-${++seq}`, email, name }).returning();
  return row;
}

async function makeTeam(name = "Acme") {
  const owner = await makeUser(`owner${++seq}@contacts.test`, "Olive Owner");
  const workspace = await callerFor(owner).teams.create({ name });
  return { owner, workspace, workspaceId: workspace.id, asOwner: callerFor(owner) };
}
type Team = Awaited<ReturnType<typeof makeTeam>>;

async function join(team: Team, role: "admin" | "member" = "member") {
  const email = `person${++seq}@contacts.test`;
  const user = await makeUser(email);
  const invite = await team.asOwner.teams.invite({ workspaceId: team.workspaceId, email, role });
  await callerFor(user).teams.acceptInvite({ token: invite.inviteUrl.split("/").pop()! });
  return { user, memberId: invite.memberId, as: callerFor(user) };
}

/** A published company card held by a new member. */
async function liveCard(team: Team) {
  const holder = await join(team);
  const card = await team.asOwner.teamCards.create({ workspaceId: team.workspaceId, displayName: "Sam Seller", title: "Account Manager", assignMemberId: holder.memberId });
  await team.asOwner.teamCards.publish({ workspaceId: team.workspaceId, cardId: card.id, published: true });
  return { holder, card };
}

/** A visitor leaves their details on a card. */
async function meet(cardId: number, name: string, extra: { email?: string; phone?: string } = {}) {
  const contact = await callerFor(null).publicCard.exchange({ cardId, name, ...extra });
  return contact.id;
}

const rowOf = async (contactId: number) => (await db.select().from(contacts).where(eq(contacts.id, contactId)))[0];
const names = (list: { items: { name: string }[] }) => list.items.map(item => item.name).sort();

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  closeDb = () => created.client.close();
  setTestDb(db);
});
beforeEach(() => Object.assign(ENV, saved, { teamsEnabled: true, siteUrl: "https://heyitsme.test" }));
afterEach(() => Object.assign(ENV, saved));
afterAll(() => closeDb());

describe("team contacts schema", () => {
  it("ensureSchema runs exactly the statements of drizzle/0016_team_contacts.sql", () => {
    const file = readFileSync(path.resolve(__dirname, "../../drizzle/0016_team_contacts.sql"), "utf8");
    const statements = file
      .split("\n")
      .filter(line => !line.startsWith("--"))
      .join("\n")
      .split(";")
      .map(s => s.trim().replaceAll("\r", ""))
      .filter(Boolean);
    expect([...TEAM_CONTACTS_SCHEMA_STATEMENTS]).toEqual(statements);
  });

  it("moves contacts that were filed under the card holder to the team, keeping the holder assigned", async () => {
    const team = await makeTeam();
    const { holder, card } = await liveCard(team);
    const [old] = await db
      .insert(contacts)
      .values({ ownerUserId: holder.user.id, workspaceId: team.workspaceId, capturedByUserId: holder.user.id, cardId: card.id, name: "Old Lead", tags: "[]" })
      .returning();
    const [personal] = await db.insert(contacts).values({ ownerUserId: holder.user.id, name: "Private Friend", tags: "[]" }).returning();
    for (const statement of TEAM_CONTACTS_SCHEMA_STATEMENTS) await db.execute(statement);
    expect(await rowOf(old.id)).toMatchObject({ ownerUserId: team.owner.id, assignedUserId: holder.user.id, workspaceId: team.workspaceId });
    expect(await rowOf(personal.id)).toMatchObject({ ownerUserId: holder.user.id, assignedUserId: null, workspaceId: null });
  });
});

describe("collecting team contacts", () => {
  it("files a company card's contact with the team, assigned to the holder and their department", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const { holder, card } = await liveCard(team);
    const department = await team.asOwner.teamDepartments.create({ workspaceId, name: "Sales" });
    await team.asOwner.teamDepartments.assignMember({ workspaceId, memberId: holder.memberId, departmentId: department.id });

    const contactId = await meet(card.id, "Vera Visitor", { email: "vera@visitor.test" });
    expect(await rowOf(contactId)).toMatchObject({
      ownerUserId: team.owner.id,
      workspaceId,
      assignedUserId: holder.user.id,
      capturedByUserId: holder.user.id,
      departmentId: department.id,
    });
    const mail = vi.mocked(sendMail).mock.calls.at(-1)?.[0];
    expect(mail).toMatchObject({ to: holder.user.email });
    expect(mail?.text).toContain(`/app/team/${workspaceId}`);

    const list = await holder.as.teamContacts.list({ workspaceId });
    expect(list.items[0]).toMatchObject({ name: "Vera Visitor", cardName: "Sam Seller", departmentName: "Sales", assignedUserId: holder.user.id });
  });

  it("keeps team contacts out of everyone's personal contacts and export", async () => {
    const team = await makeTeam();
    const { holder, card } = await liveCard(team);
    const contactId = await meet(card.id, "Vera Visitor", { email: "vera@visitor.test" });
    for (const person of [holder.as, team.asOwner]) {
      expect((await person.contacts.list()).items).toEqual([]);
      expect(await person.contacts.export()).not.toContain("Vera Visitor");
      await expect(person.contacts.update({ id: contactId, notes: "mine now" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await person.contacts.delete({ id: contactId });
    }
    expect(await rowOf(contactId)).toMatchObject({ name: "Vera Visitor", notes: null });
  });

  it("leaves a contact from an unassigned card with nobody, for admins to hand out", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const card = await team.asOwner.teamCards.create({ workspaceId, displayName: "Front Desk", title: "Reception" });
    await team.asOwner.teamCards.publish({ workspaceId, cardId: card.id, published: true });
    const contactId = await meet(card.id, "Walk In");
    expect(await rowOf(contactId)).toMatchObject({ ownerUserId: team.owner.id, assignedUserId: null, capturedByUserId: null });
    expect(names(await team.asOwner.teamContacts.list({ workspaceId, holder: "unassigned" }))).toEqual(["Walk In"]);
  });
});

describe("who sees team contacts", () => {
  it("shows a member only their own, an admin every one, and a stranger nothing", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const a = await liveCard(team);
    const b = await liveCard(team);
    const admin = await join(team, "admin");
    const mine = await meet(a.card.id, "Anna Lead", { email: "anna@lead.test" });
    const theirs = await meet(b.card.id, "Boris Lead", { email: "boris@lead.test" });

    expect(names(await a.holder.as.teamContacts.list({ workspaceId }))).toEqual(["Anna Lead"]);
    expect(names(await admin.as.teamContacts.list({ workspaceId }))).toEqual(["Anna Lead", "Boris Lead"]);
    expect(names(await admin.as.teamContacts.list({ workspaceId, holder: b.holder.memberId }))).toEqual(["Boris Lead"]);
    expect(names(await admin.as.teamContacts.list({ workspaceId, search: "boris@" }))).toEqual(["Boris Lead"]);
    // A member cannot widen their view with an admin filter.
    expect(names(await a.holder.as.teamContacts.list({ workspaceId, holder: b.holder.memberId }))).toEqual(["Anna Lead"]);

    await a.holder.as.teamContacts.update({ workspaceId, contactId: mine, notes: "Met at expo", tags: ["expo"], status: "contacted" });
    expect(await rowOf(mine)).toMatchObject({ notes: "Met at expo", status: "contacted", tags: '["expo"]' });
    await expect(a.holder.as.teamContacts.update({ workspaceId, contactId: theirs, notes: "peek" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(a.holder.as.teamContacts.reassign({ workspaceId, contactIds: [theirs], memberId: a.holder.memberId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(a.holder.as.teamContacts.remove({ workspaceId, contactId: mine })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(a.holder.as.teamContacts.duplicates({ workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const stranger = callerFor(await makeUser("stranger@else.test"));
    await expect(stranger.teamContacts.list({ workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stranger.teamContacts.exportCsv({ workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const memberCsv = await a.holder.as.teamContacts.exportCsv({ workspaceId });
    expect(memberCsv.csv).toContain("Anna Lead");
    expect(memberCsv.csv).not.toContain("Boris Lead");
    expect((await admin.as.teamContacts.exportCsv({ workspaceId })).count).toBe(2);
  });

  it("keeps one team's contacts away from another team's admins", async () => {
    const team = await makeTeam();
    const other = await makeTeam("Globex");
    const { card } = await liveCard(team);
    const contactId = await meet(card.id, "Anna Lead");
    const workspaceId = other.workspaceId;
    expect((await other.asOwner.teamContacts.list({ workspaceId })).items).toEqual([]);
    await expect(other.asOwner.teamContacts.update({ workspaceId, contactId, notes: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(other.asOwner.teamContacts.remove({ workspaceId, contactId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(other.asOwner.teamContacts.reassign({ workspaceId, contactIds: [contactId], memberId: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(other.asOwner.teamContacts.merge({ workspaceId, keepId: contactId, mergeId: contactId + 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await rowOf(contactId)).toMatchObject({ workspaceId: team.workspaceId, notes: null });
  });

  it("is closed while Teams is switched off", async () => {
    const team = await makeTeam();
    ENV.teamsEnabled = false;
    await expect(team.asOwner.teamContacts.list({ workspaceId: team.workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("managing team contacts", () => {
  it("lets an admin hand contacts to another active person, and only inside the team", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const a = await liveCard(team);
    const b = await join(team);
    const outsider = await join(await makeTeam("Globex"));
    const contactId = await meet(a.card.id, "Anna Lead");

    await expect(team.asOwner.teamContacts.reassign({ workspaceId, contactIds: [contactId], memberId: outsider.memberId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await team.asOwner.teamContacts.reassign({ workspaceId, contactIds: [contactId], memberId: b.memberId });
    expect(await rowOf(contactId)).toMatchObject({ assignedUserId: b.user.id, capturedByUserId: a.holder.user.id });
    expect((await a.holder.as.teamContacts.list({ workspaceId })).items).toEqual([]);
    expect((await b.as.teamContacts.list({ workspaceId })).items[0]).toMatchObject({ name: "Anna Lead", capturedByName: a.holder.user.name });
  });

  it("flags possible duplicates and merges only when an admin says so", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const a = await liveCard(team);
    const b = await liveCard(team);
    const first = await meet(a.card.id, "Dana Buyer", { email: "Dana@Buyer.test" });
    const second = await meet(b.card.id, "D. Buyer", { email: "dana@buyer.test", phone: "+66 81 234 5678" });
    const third = await meet(b.card.id, "Someone Else", { phone: "+66 81 999 0000" });
    await a.holder.as.teamContacts.update({ workspaceId, contactId: first, notes: "Wants a quote", tags: ["hot"] });
    await b.holder.as.teamContacts.update({ workspaceId, contactId: second, notes: "Call Friday", tags: ["expo"] });

    // Nothing was merged on its own, and a member sees no hint about a colleague's contacts.
    expect((await a.holder.as.teamContacts.list({ workspaceId })).items[0].possibleDuplicate).toBe(false);
    const all = await team.asOwner.teamContacts.list({ workspaceId });
    expect(all.items.filter(item => item.possibleDuplicate).map(item => item.id).sort()).toEqual([first, second].sort());
    const { groups } = await team.asOwner.teamContacts.duplicates({ workspaceId });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ reason: "email", value: "dana@buyer.test" });
    expect(groups[0].contacts.map(item => item.id).sort()).toEqual([first, second].sort());

    await team.asOwner.teamContacts.merge({ workspaceId, keepId: first, mergeId: second });
    expect(await rowOf(first)).toMatchObject({ phone: "+66 81 234 5678", notes: "Wants a quote\n\nCall Friday", tags: '["hot","expo"]', assignedUserId: a.holder.user.id });
    expect(await rowOf(second)).toMatchObject({ status: "archived", name: "D. Buyer" });
    expect(await rowOf(third)).toMatchObject({ status: "new" });
    expect((await team.asOwner.teamContacts.duplicates({ workspaceId })).groups).toEqual([]);
    expect(names(await team.asOwner.teamContacts.list({ workspaceId, view: "archived" }))).toEqual(["D. Buyer"]);
  });

  it("deletes a contact only for an admin, and writes it down", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const { card } = await liveCard(team);
    const contactId = await meet(card.id, "Forget Me");
    await team.asOwner.teamContacts.remove({ workspaceId, contactId });
    expect(await rowOf(contactId)).toBeUndefined();
    const log = await db.select().from(workspaceAuditLog).where(eq(workspaceAuditLog.workspaceId, workspaceId));
    expect(log.some(entry => entry.action === "contact.deleted" && entry.entityId === String(contactId))).toBe(true);
  });
});

describe("team contacts when people move", () => {
  it("keeps, hands over or archives a removed person's contacts, and never deletes them", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const heir = await join(team);

    const a = await liveCard(team);
    const kept = await meet(a.card.id, "Kept Lead");
    expect((await team.asOwner.teams.members({ workspaceId })).members.find(person => person.id === a.holder.memberId)?.contactCount).toBe(1);
    await team.asOwner.teams.removeMember({ workspaceId, memberId: a.holder.memberId });
    expect(await rowOf(kept)).toMatchObject({ assignedUserId: null, status: "new", workspaceId, capturedByUserId: a.holder.user.id });

    const b = await liveCard(team);
    const moved = await meet(b.card.id, "Moved Lead");
    await expect(team.asOwner.teams.removeMember({ workspaceId, memberId: b.holder.memberId, contacts: "transfer" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await team.asOwner.teams.removeMember({ workspaceId, memberId: b.holder.memberId, contacts: "transfer", contactsToMemberId: heir.memberId });
    expect(await rowOf(moved)).toMatchObject({ assignedUserId: heir.user.id, status: "new" });

    const c = await liveCard(team);
    const shelved = await meet(c.card.id, "Shelved Lead");
    await team.asOwner.teams.removeMember({ workspaceId, memberId: c.holder.memberId, contacts: "archive" });
    expect(await rowOf(shelved)).toMatchObject({ assignedUserId: null, status: "archived", workspaceId });

    // The people who left see none of it, in the team or in their own contacts.
    await expect(a.holder.as.teamContacts.list({ workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await a.holder.as.contacts.list()).items).toEqual([]);
  });

  it("leaves a person's personal contacts alone when they are removed from a team", async () => {
    const team = await makeTeam();
    const member = await join(team);
    const [personal] = await db.insert(contacts).values({ ownerUserId: member.user.id, name: "Private Friend", tags: "[]" }).returning();
    await team.asOwner.teams.removeMember({ workspaceId: team.workspaceId, memberId: member.memberId, contacts: "archive" });
    expect(await rowOf(personal.id)).toMatchObject({ ownerUserId: member.user.id, status: "new", workspaceId: null });
    expect(names(await member.as.contacts.list())).toEqual(["Private Friend"]);
  });

  it("unassigns contacts when a person leaves, and moves them with the ownership", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const { holder, card } = await liveCard(team);
    const contactId = await meet(card.id, "Anna Lead");
    await holder.as.teams.leave({ workspaceId });
    expect(await rowOf(contactId)).toMatchObject({ assignedUserId: null, ownerUserId: team.owner.id });

    const next = await join(team, "admin");
    await team.asOwner.teams.transferOwnership({ workspaceId, memberId: next.memberId });
    expect(await rowOf(contactId)).toMatchObject({ ownerUserId: next.user.id, workspaceId });
    expect(names(await next.as.teamContacts.list({ workspaceId }))).toEqual(["Anna Lead"]);
  });
});
