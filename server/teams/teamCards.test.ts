import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cards, contacts, users, workspaceMembers } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { countOwnedCards } from "../billing/service";
import { createTestDb } from "../billing/testDb";
import { TEAM_CARDS_SCHEMA_STATEMENTS } from "./schemaSql";

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
  const [row] = await db.insert(users).values({ openId: `c-${++seq}`, email, name }).returning();
  return row;
}

async function makeTeam(name = "Acme") {
  const owner = await makeUser(`owner${++seq}@cards.test`, "Olive Owner");
  const workspace = await callerFor(owner).teams.create({ name });
  return { owner, workspace, workspaceId: workspace.id, asOwner: callerFor(owner) };
}

async function join(team: Awaited<ReturnType<typeof makeTeam>>, role: "admin" | "member" = "member") {
  const email = `person${++seq}@cards.test`;
  const user = await makeUser(email);
  const invite = await team.asOwner.teams.invite({ workspaceId: team.workspaceId, email, role });
  await callerFor(user).teams.acceptInvite({ token: invite.inviteUrl.split("/").pop()! });
  return { user, memberId: invite.memberId, as: callerFor(user) };
}

const details = (displayName = "Sam Seller") => ({ displayName, title: "Account Manager" });

/** A published company card held by a new member. */
async function liveCard(team: Awaited<ReturnType<typeof makeTeam>>) {
  const holder = await join(team);
  const card = await team.asOwner.teamCards.create({ workspaceId: team.workspaceId, ...details(), assignMemberId: holder.memberId });
  await team.asOwner.teamCards.publish({ workspaceId: team.workspaceId, cardId: card.id, published: true });
  return { holder, card };
}

const rowOf = async (cardId: number) => (await db.select().from(cards).where(eq(cards.id, cardId)))[0];

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  closeDb = () => created.client.close();
  setTestDb(db);
});
beforeEach(() => {
  Object.assign(ENV, saved, { teamsEnabled: true, siteUrl: "https://heyitsme.test" });
  vi.mocked(sendMail).mockClear();
});
afterEach(() => Object.assign(ENV, saved));
afterAll(() => closeDb());

describe("company cards schema", () => {
  it("ensureSchema runs exactly the statements of drizzle/0014_team_cards.sql", () => {
    const file = readFileSync(path.resolve(__dirname, "../../drizzle/0014_team_cards.sql"), "utf8");
    const statements = file
      .split("\n")
      .filter(line => !line.startsWith("--"))
      .join("\n")
      .split(";")
      .map(s => s.trim().replaceAll("\r", ""))
      .filter(Boolean);
    expect([...TEAM_CARDS_SCHEMA_STATEMENTS]).toEqual(statements);
  });
});

describe("company cards stay apart from personal cards", () => {
  it("never shows up in, counts toward, or opens through the owner's personal account", async () => {
    const team = await makeTeam();
    const card = await team.asOwner.teamCards.create({ workspaceId: team.workspaceId, ...details() });
    expect((await rowOf(card.id)).ownerUserId).toBe(team.owner.id);

    expect(await team.asOwner.cards.list()).toEqual([]);
    expect(await countOwnedCards(db, team.owner.id)).toBe(0);
    expect(await team.asOwner.cards.get({ id: card.id })).toBeUndefined();
    await expect(team.asOwner.cards.publish({ id: card.id, published: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(team.asOwner.cards.delete({ id: card.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await rowOf(card.id)).toMatchObject({ published: false, deletedAt: null });
  });

  it("leaves a personal card untouched by team calls", async () => {
    const team = await makeTeam();
    const personal = await team.asOwner.cards.create(details("Olive Owner"));
    const workspaceId = team.workspaceId;
    expect((await team.asOwner.teamCards.list({ workspaceId })).cards).toEqual([]);
    await expect(team.asOwner.teamCards.update({ workspaceId, cardId: personal.id, ...details("Hijack") })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(team.asOwner.teamCards.setStatus({ workspaceId, cardId: personal.id, status: "archived" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await rowOf(personal.id)).toMatchObject({ displayName: "Olive Owner", workspaceId: null, teamStatus: null });
    expect(await team.asOwner.cards.list()).toHaveLength(1);
  });
});

describe("company card permissions", () => {
  it("lets admins create cards and refuses members", async () => {
    const team = await makeTeam();
    const admin = await join(team, "admin");
    const member = await join(team);
    const workspaceId = team.workspaceId;
    const card = await admin.as.teamCards.create({ workspaceId, ...details() });
    // Held in the owner's name even when an admin made it.
    expect(await rowOf(card.id)).toMatchObject({ ownerUserId: team.owner.id, workspaceId, assignedUserId: null, published: false });
    await expect(member.as.teamCards.create({ workspaceId, ...details() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teamCards.assign({ workspaceId, cardId: card.id, memberId: member.memberId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teamCards.setStatus({ workspaceId, cardId: card.id, status: "archived" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets a member see and edit only the card assigned to them", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const mine = await liveCard(team);
    const other = await team.asOwner.teamCards.create({ workspaceId, ...details("Other Person") });

    const listed = await mine.holder.as.teamCards.list({ workspaceId });
    expect(listed.canManageAll).toBe(false);
    expect(listed.cards.map(card => card.id)).toEqual([mine.card.id]);
    expect(listed.cards[0]).toMatchObject({ mine: true, canEdit: true, status: "published" });

    await mine.holder.as.teamCards.update({ workspaceId, cardId: mine.card.id, ...details("Sam S.") });
    expect((await rowOf(mine.card.id)).displayName).toBe("Sam S.");
    await expect(mine.holder.as.teamCards.update({ workspaceId, cardId: other.id, ...details("Nope") })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(mine.holder.as.teamCards.publish({ workspaceId, cardId: other.id, published: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await team.asOwner.teamCards.list({ workspaceId })).cards).toHaveLength(2);
  });

  it("stops a member editing their card while an admin has paused it", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const { holder, card } = await liveCard(team);
    await team.asOwner.teamCards.setStatus({ workspaceId, cardId: card.id, status: "suspended" });
    await expect(holder.as.teamCards.update({ workspaceId, cardId: card.id, ...details("Sneaky") })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await holder.as.teamCards.list({ workspaceId })).cards[0]).toMatchObject({ status: "suspended", canEdit: false });
    await team.asOwner.teamCards.setStatus({ workspaceId, cardId: card.id, status: "active" });
    await holder.as.teamCards.update({ workspaceId, cardId: card.id, ...details("Back") });
  });

  it("hides one team's cards from another team and from strangers", async () => {
    const team = await makeTeam();
    const rival = await makeTeam("Rival");
    const stranger = callerFor(await makeUser("stranger@cards.test"));
    const { card } = await liveCard(team);

    // Their own workspace number with our card number, and our workspace number outright.
    await expect(rival.asOwner.teamCards.update({ workspaceId: rival.workspaceId, cardId: card.id, ...details("Stolen") })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(rival.asOwner.teamCards.setStatus({ workspaceId: rival.workspaceId, cardId: card.id, status: "archived" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(rival.asOwner.teamCards.list({ workspaceId: team.workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stranger.teamCards.update({ workspaceId: team.workspaceId, cardId: card.id, ...details("Stolen") })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerFor(null).teamCards.list({ workspaceId: team.workspaceId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await rowOf(card.id)).toMatchObject({ displayName: "Sam Seller", teamStatus: null });
  });

  it("only assigns a card to someone who has joined this team", async () => {
    const team = await makeTeam();
    const rival = await makeTeam("Rival");
    const outsider = await join(rival);
    const workspaceId = team.workspaceId;
    const card = await team.asOwner.teamCards.create({ workspaceId, ...details() });
    const invited = await team.asOwner.teams.invite({ workspaceId, email: "pending@cards.test", role: "member" });
    await expect(team.asOwner.teamCards.assign({ workspaceId, cardId: card.id, memberId: invited.memberId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(team.asOwner.teamCards.assign({ workspaceId, cardId: card.id, memberId: outsider.memberId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await rowOf(card.id)).assignedUserId).toBeNull();
  });

  it("refuses everything while Teams is off", async () => {
    const team = await makeTeam();
    const card = await team.asOwner.teamCards.create({ workspaceId: team.workspaceId, ...details() });
    ENV.teamsEnabled = false;
    await expect(team.asOwner.teamCards.list({ workspaceId: team.workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(team.asOwner.teamCards.update({ workspaceId: team.workspaceId, cardId: card.id, ...details("x y") })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(team.asOwner.teamDepartments.create({ workspaceId: team.workspaceId, name: "Sales" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("company cards in public", () => {
  it("shows a published card, and hides it once paused or archived", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const { card } = await liveCard(team);
    const visitor = callerFor(null);
    const shown = await visitor.publicCard.bySlug({ slug: card.slug });
    expect(shown).toMatchObject({ id: card.id, displayName: "Sam Seller" });
    expect(shown).not.toHaveProperty("workspaceId");
    expect(shown).not.toHaveProperty("assignedUserId");

    for (const status of ["suspended", "archived"] as const) {
      await team.asOwner.teamCards.setStatus({ workspaceId, cardId: card.id, status });
      expect(await visitor.publicCard.bySlug({ slug: card.slug })).toBeNull();
      await expect(visitor.publicCard.exchange({ cardId: card.id, name: "Vera Visitor", email: "vera@visitor.test" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await visitor.publicCard.track({ cardId: card.id, type: "share" })).toEqual({ ok: false });
    }
    await team.asOwner.teamCards.setStatus({ workspaceId, cardId: card.id, status: "active" });
    expect(await visitor.publicCard.bySlug({ slug: card.slug })).not.toBeNull();
  });

  it("gives a new contact to the person holding the card and marks it as the team's", async () => {
    const team = await makeTeam();
    const { holder, card } = await liveCard(team);
    await callerFor(null).publicCard.exchange({ cardId: card.id, name: "Vera Visitor", email: "vera@visitor.test" });
    const [contact] = await db.select().from(contacts).where(eq(contacts.cardId, card.id));
    expect(contact).toMatchObject({ ownerUserId: team.owner.id, assignedUserId: holder.user.id, workspaceId: team.workspaceId, capturedByUserId: holder.user.id });
    expect(vi.mocked(sendMail).mock.calls.at(-1)?.[0]).toMatchObject({ to: holder.user.email });
  });
});

describe("company cards when people move", () => {
  it("keeps the cards when a person is removed: unassigned, archived or handed over", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const heir = await join(team);

    const a = await liveCard(team);
    await team.asOwner.teams.removeMember({ workspaceId, memberId: a.holder.memberId });
    expect(await rowOf(a.card.id)).toMatchObject({ assignedUserId: null, teamStatus: null, workspaceId });

    const b = await liveCard(team);
    await team.asOwner.teams.removeMember({ workspaceId, memberId: b.holder.memberId, cards: "archive" });
    expect(await rowOf(b.card.id)).toMatchObject({ assignedUserId: null, teamStatus: "archived" });

    const c = await liveCard(team);
    await expect(team.asOwner.teams.removeMember({ workspaceId, memberId: c.holder.memberId, cards: "transfer" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(team.asOwner.teams.removeMember({ workspaceId, memberId: c.holder.memberId, cards: "transfer", transferToMemberId: c.holder.memberId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await team.asOwner.teams.removeMember({ workspaceId, memberId: c.holder.memberId, cards: "transfer", transferToMemberId: heir.memberId });
    expect(await rowOf(c.card.id)).toMatchObject({ assignedUserId: heir.user.id, teamStatus: null });

    // The removed person is locked out; their account is still there.
    await expect(c.holder.as.teamCards.update({ workspaceId, cardId: c.card.id, ...details("Ghost") })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(users).where(eq(users.id, c.holder.user.id))).toHaveLength(1);
    expect((await team.asOwner.teamCards.list({ workspaceId })).cards).toHaveLength(3);
  });

  it("frees a person's cards when they leave", async () => {
    const team = await makeTeam();
    const { holder, card } = await liveCard(team);
    await holder.as.teams.leave({ workspaceId: team.workspaceId });
    expect(await rowOf(card.id)).toMatchObject({ assignedUserId: null, workspaceId: team.workspaceId });
    expect(await holder.as.cards.list()).toEqual([]);
  });

  it("moves the cards to the new owner's name, and takes them offline when the team closes", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const { card } = await liveCard(team);
    const next = await join(team, "admin");
    await team.asOwner.teams.transferOwnership({ workspaceId, memberId: next.memberId });
    expect(await rowOf(card.id)).toMatchObject({ ownerUserId: next.user.id, workspaceId });
    expect(await next.as.cards.list()).toEqual([]);

    await next.as.teams.close({ workspaceId });
    expect(await rowOf(card.id)).toMatchObject({ teamStatus: "archived", deletedAt: null });
    expect(await callerFor(null).publicCard.bySlug({ slug: card.slug })).toBeNull();
  });

  it("shows admins how many cards each person holds", async () => {
    const team = await makeTeam();
    const { holder } = await liveCard(team);
    const seenByOwner = await team.asOwner.teams.members({ workspaceId: team.workspaceId });
    expect(seenByOwner.members.find(m => m.id === holder.memberId)?.cardCount).toBe(1);
    const seenByMember = await holder.as.teams.members({ workspaceId: team.workspaceId });
    expect(seenByMember.members.every(m => m.cardCount === null)).toBe(true);
  });
});

describe("departments", () => {
  it("lets admins create, rename, archive and fill departments", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const member = await join(team);
    const sales = await team.asOwner.teamDepartments.create({ workspaceId, name: "Sales" });
    await expect(team.asOwner.teamDepartments.create({ workspaceId, name: " sales " })).rejects.toMatchObject({ code: "CONFLICT" });

    await team.asOwner.teamDepartments.assignMember({ workspaceId, memberId: member.memberId, departmentId: sales.id });
    await team.asOwner.teamDepartments.setLead({ workspaceId, departmentId: sales.id, memberId: member.memberId });
    await team.asOwner.teamDepartments.rename({ workspaceId, departmentId: sales.id, name: "Field Sales" });
    expect(await member.as.teamDepartments.list({ workspaceId })).toEqual([{ id: sales.id, name: "Field Sales", leadMemberId: member.memberId, archived: false, people: 1 }]);
    expect((await team.asOwner.teams.members({ workspaceId })).members.find(m => m.id === member.memberId)?.departmentId).toBe(sales.id);

    // Leading a department is a label. It grants nothing.
    await expect(member.as.teamDepartments.rename({ workspaceId, departmentId: sales.id, name: "Mine" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teamCards.create({ workspaceId, ...details() })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await team.asOwner.teamDepartments.setArchived({ workspaceId, departmentId: sales.id, archived: true });
    expect(await member.as.teamDepartments.list({ workspaceId })).toEqual([]);
    expect(await team.asOwner.teamDepartments.list({ workspaceId })).toMatchObject([{ id: sales.id, archived: true }]);
    await expect(team.asOwner.teamDepartments.assignMember({ workspaceId, memberId: team.workspace.id, departmentId: sales.id })).rejects.toThrow();
    const [row] = await db.select().from(workspaceMembers).where(eq(workspaceMembers.id, member.memberId));
    expect(row.departmentId).toBe(sales.id);
  });

  it("keeps departments inside their own team", async () => {
    const team = await makeTeam();
    const rival = await makeTeam("Rival");
    const member = await join(team);
    const theirs = await rival.asOwner.teamDepartments.create({ workspaceId: rival.workspaceId, name: "Ops" });
    const workspaceId = team.workspaceId;
    await expect(team.asOwner.teamDepartments.rename({ workspaceId, departmentId: theirs.id, name: "Taken" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(team.asOwner.teamDepartments.assignMember({ workspaceId, memberId: member.memberId, departmentId: theirs.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(rival.asOwner.teamDepartments.assignMember({ workspaceId: rival.workspaceId, memberId: member.memberId, departmentId: theirs.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(member.as.teamDepartments.list({ workspaceId: rival.workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
