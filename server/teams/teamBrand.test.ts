import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { THEMES, designSchema } from "@shared/design";
import { parsePageConfig } from "@shared/pageConfig";
import { cards, users, workspaceChangeRequests, workspaces } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { createTestDb } from "../billing/testDb";
import { TEAM_BRAND_SCHEMA_STATEMENTS } from "./schemaSql";

vi.mock("../_core/rateLimit", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/rateLimit")>()),
  rateLimit: vi.fn(async () => ({ allowed: true, count: 1, resetMs: 0 })),
}));
vi.mock("../_core/mail", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/mail")>()),
  sendMail: vi.fn(async () => true),
}));
vi.mock("../uploadSweep", () => ({ tidyOwnerUploads: vi.fn() }));
vi.mock("../storage", async importOriginal => ({
  ...(await importOriginal<typeof import("../storage")>()),
  storagePut: vi.fn(async (key: string) => ({ key, url: `https://files.test/${key}` })),
}));

const { appRouter } = await import("../routers");
const { setTestDb } = await import("../db");
const { storagePut } = await import("../storage");

const saved = { ...ENV };
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;

const req = { protocol: "https", headers: {}, ip: "203.0.113.9", get: () => "heyitsme.test", query: {} } as unknown as TrpcContext["req"];
const callerFor = (user: typeof users.$inferSelect | null) => appRouter.createCaller({ user, req, res: {} as TrpcContext["res"] });

let seq = 0;
async function makeUser(email: string, name = email.split("@")[0]) {
  const [row] = await db.insert(users).values({ openId: `b-${++seq}`, email, name }).returning();
  return row;
}

async function makeTeam(name = "Acme") {
  const owner = await makeUser(`owner${++seq}@brand.test`, "Olive Owner");
  const workspace = await callerFor(owner).teams.create({ name });
  return { owner, workspace, workspaceId: workspace.id, asOwner: callerFor(owner) };
}
type Team = Awaited<ReturnType<typeof makeTeam>>;

async function join(team: Team, role: "admin" | "member" = "member") {
  const email = `person${++seq}@brand.test`;
  const user = await makeUser(email);
  const invite = await team.asOwner.teams.invite({ workspaceId: team.workspaceId, email, role });
  await callerFor(user).teams.acceptInvite({ token: invite.inviteUrl.split("/").pop()! });
  return { user, memberId: invite.memberId, as: callerFor(user) };
}

const details = (displayName = "Sam Seller") => ({ displayName, title: "Account Manager" });

/** A company card held by a new member. */
async function heldCard(team: Team) {
  const holder = await join(team);
  const card = await team.asOwner.teamCards.create({ workspaceId: team.workspaceId, ...details(), assignMemberId: holder.memberId });
  return { holder, card };
}

const rowOf = async (cardId: number) => (await db.select().from(cards).where(eq(cards.id, cardId)))[0];
const midnight = THEMES[3].design;
const template = (name = "Sales") => ({ name, design: midnight, company: "Acme Ltd", location: "Bangkok", lockedFields: ["title" as const] });
const noLocks = { primary: null, accent: null, lockedFields: [] };
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString("base64");

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  closeDb = () => created.client.close();
  setTestDb(db);
});
beforeEach(() => {
  Object.assign(ENV, saved, { teamsEnabled: true, siteUrl: "https://heyitsme.test" });
  vi.mocked(storagePut).mockClear();
});
afterEach(() => Object.assign(ENV, saved));
afterAll(() => closeDb());

describe("team brand schema", () => {
  it("ensureSchema runs exactly the statements of drizzle/0015_team_brand.sql", () => {
    const file = readFileSync(path.resolve(__dirname, "../../drizzle/0015_team_brand.sql"), "utf8");
    const statements = file
      .split("\n")
      .filter(line => !line.startsWith("--"))
      .join("\n")
      .split(";")
      .map(s => s.trim().replaceAll("\r", ""))
      .filter(Boolean);
    expect([...TEAM_BRAND_SCHEMA_STATEMENTS]).toEqual(statements);
  });
});

describe("brand", () => {
  it("lets admins set colors and locks, lets members read them, and refuses member changes", async () => {
    const team = await makeTeam();
    const admin = await join(team, "admin");
    const member = await join(team);
    const workspaceId = team.workspaceId;
    await admin.as.teamBrand.save({ workspaceId, primary: "#112233", accent: null, lockedFields: ["company", "title"] });
    expect(await member.as.teamBrand.get({ workspaceId })).toEqual({ logoUrl: null, primary: "#112233", accent: null, lockedFields: ["title", "company"] });
    await expect(member.as.teamBrand.save({ workspaceId, ...noLocks })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teamBrand.removeLogo({ workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teamBrand.uploadLogo({ workspaceId, fileName: "logo.png", contentType: "image/png", dataBase64: png })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("hides the brand from people outside the team and rejects unknown lock names", async () => {
    const team = await makeTeam();
    const outsider = callerFor(await makeUser(`out${++seq}@brand.test`));
    await expect(outsider.teamBrand.get({ workspaceId: team.workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(outsider.teamBrand.save({ workspaceId: team.workspaceId, ...noLocks })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      team.asOwner.teamBrand.save({ workspaceId: team.workspaceId, primary: null, accent: null, lockedFields: ["ownerUserId" as never] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("puts the logo on company cards only, in the team's own folder, and takes it off again", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const personal = await team.asOwner.cards.create(details("Olive Owner"));
    const card = await team.asOwner.teamCards.create({ workspaceId, ...details() });
    const { logoUrl } = await team.asOwner.teamBrand.uploadLogo({ workspaceId, fileName: "logo.png", contentType: "image/png", dataBase64: png });
    expect(vi.mocked(storagePut).mock.calls[0][0]).toMatch(new RegExp(`^team-${workspaceId}/logo-`));
    expect((await rowOf(card.id)).logoUrl).toBe(logoUrl);
    expect((await rowOf(personal.id)).logoUrl ?? null).toBeNull();
    // A card made after the upload carries the logo too.
    const later = await team.asOwner.teamCards.create({ workspaceId, ...details("Later Person") });
    expect((await rowOf(later.id)).logoUrl).toBe(logoUrl);
    await team.asOwner.teamBrand.removeLogo({ workspaceId });
    expect((await rowOf(card.id)).logoUrl).toBeNull();
    expect((await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)))[0].logoUrl).toBeNull();
  });

  it("refuses a logo that is not really an image", async () => {
    const team = await makeTeam();
    const pdf = Buffer.from("%PDF-1.4 not an image").toString("base64");
    await expect(
      team.asOwner.teamBrand.uploadLogo({ workspaceId: team.workspaceId, fileName: "logo.png", contentType: "image/png", dataBase64: pdf })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storagePut).not.toHaveBeenCalled();
  });
});

describe("templates", () => {
  it("are for admins only and stay inside their team", async () => {
    const team = await makeTeam();
    const other = await makeTeam("Other");
    const member = await join(team);
    const workspaceId = team.workspaceId;
    await expect(member.as.teamTemplates.create({ workspaceId, ...template() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teamTemplates.list({ workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const made = await team.asOwner.teamTemplates.create({ workspaceId, ...template() });
    const card = await other.asOwner.teamCards.create({ workspaceId: other.workspaceId, ...details() });
    // Another team can neither use nor change it, and it cannot be put on another team's card.
    await expect(other.asOwner.teamTemplates.update({ workspaceId: other.workspaceId, templateId: made.id, ...template("Stolen") })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(other.asOwner.teamTemplates.applyTo({ workspaceId: other.workspaceId, templateId: made.id, cardId: card.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(team.asOwner.teamTemplates.applyTo({ workspaceId, templateId: made.id, cardId: card.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await rowOf(card.id)).templateId).toBeNull();
    expect((await team.asOwner.teamTemplates.list({ workspaceId })).templates.map(t => t.name)).toEqual(["Sales"]);
  });

  it("refuse an unreadable design", async () => {
    const team = await makeTeam();
    const design = { ...midnight, text: midnight.colors[0], colors: [midnight.colors[0]] };
    await expect(team.asOwner.teamTemplates.create({ workspaceId: team.workspaceId, ...template(), design })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("apply their look and company details, keep the rest of the card, and follow later edits", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const card = await team.asOwner.teamCards.create({ workspaceId, ...details(), email: "sam@acme.test" });
    const made = await team.asOwner.teamTemplates.create({ workspaceId, ...template() });
    expect(await team.asOwner.teamTemplates.applyTo({ workspaceId, templateId: made.id, cardId: card.id })).toEqual({ cards: 1 });
    let row = await rowOf(card.id);
    expect(row).toMatchObject({ templateId: made.id, company: "Acme Ltd", location: "Bangkok", displayName: "Sam Seller", email: "sam@acme.test" });
    expect(parsePageConfig(row.page).design).toEqual(designSchema.parse(midnight));

    const aurora = THEMES[4].design;
    expect(await team.asOwner.teamTemplates.update({ workspaceId, templateId: made.id, ...template(), design: aurora, company: "Acme Group" })).toEqual({ cards: 1 });
    row = await rowOf(card.id);
    expect(row.company).toBe("Acme Group");
    expect(parsePageConfig(row.page).design).toEqual(designSchema.parse(aurora));
    const listed = await team.asOwner.teamCards.list({ workspaceId });
    expect(listed.cards[0]).toMatchObject({ templateId: made.id, templateName: "Sales", lockedFields: ["title"] });
    expect((await team.asOwner.teamTemplates.list({ workspaceId })).templates[0].cards).toBe(1);
  });

  it("start new cards with the default template, and stop when it is archived", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const made = await team.asOwner.teamTemplates.create({ workspaceId, ...template() });
    await team.asOwner.teamTemplates.setDefault({ workspaceId, templateId: made.id });
    const first = await team.asOwner.teamCards.create({ workspaceId, ...details() });
    expect(await rowOf(first.id)).toMatchObject({ templateId: made.id, company: "Acme Ltd" });

    await team.asOwner.teamTemplates.setArchived({ workspaceId, templateId: made.id, archived: true });
    const second = await team.asOwner.teamCards.create({ workspaceId, ...details("Second Person") });
    expect((await rowOf(second.id)).templateId).toBeNull();
    // The card that already uses it keeps its look.
    expect((await rowOf(first.id)).templateId).toBe(made.id);
    await expect(team.asOwner.teamTemplates.setDefault({ workspaceId, templateId: made.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(team.asOwner.teamTemplates.applyTo({ workspaceId, templateId: made.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("locked details", () => {
  it("stop a member changing them, while other details and admins are unaffected", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const { holder, card } = await heldCard(team);
    await team.asOwner.teamBrand.save({ workspaceId, primary: null, accent: null, lockedFields: ["displayName"] });
    const made = await team.asOwner.teamTemplates.create({ workspaceId, ...template() });
    await team.asOwner.teamTemplates.applyTo({ workspaceId, templateId: made.id, cardId: card.id });

    // Locked by the team (name) and by the template (title).
    await expect(holder.as.teamCards.update({ workspaceId, cardId: card.id, ...details("New Name"), company: "Acme Ltd", location: "Bangkok" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(holder.as.teamCards.update({ workspaceId, cardId: card.id, displayName: "Sam Seller", title: "Director", company: "Acme Ltd", location: "Bangkok" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await rowOf(card.id)).toMatchObject({ displayName: "Sam Seller", title: "Account Manager" });

    await holder.as.teamCards.update({ workspaceId, cardId: card.id, ...details(), company: "Acme Ltd", location: "Bangkok", phone: "+66 2 000 0000" });
    expect((await rowOf(card.id)).phone).toBe("+66 2 000 0000");
    expect((await holder.as.teamCards.list({ workspaceId })).cards[0].lockedFields).toEqual(["displayName", "title"]);

    await team.asOwner.teamCards.update({ workspaceId, cardId: card.id, displayName: "Sam Seller", title: "Director" });
    expect((await rowOf(card.id)).title).toBe("Director");
  });
});

describe("change requests", () => {
  async function lockedCard() {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const { holder, card } = await heldCard(team);
    await team.asOwner.teamBrand.save({ workspaceId, primary: null, accent: null, lockedFields: ["title", "displayName"] });
    return { team, workspaceId, holder, card };
  }

  it("keep only the locked details that change, and apply them when an admin approves", async () => {
    const { team, workspaceId, holder, card } = await lockedCard();
    const admin = await join(team, "admin");
    const request = await holder.as.teamRequests.create({ workspaceId, cardId: card.id, displayName: "Sam Seller", title: "Director", phone: "+66 2 999 9999", note: "Promoted" });
    const [stored] = await db.select().from(workspaceChangeRequests).where(eq(workspaceChangeRequests.id, request.id));
    expect(stored.changes).toEqual({ title: "Director" });
    expect(await rowOf(card.id)).toMatchObject({ title: "Account Manager", phone: null });

    const listed = await admin.as.teamRequests.list({ workspaceId });
    expect(listed.canDecide).toBe(true);
    expect(listed.requests[0]).toMatchObject({ id: request.id, status: "pending", note: "Promoted", changes: [{ field: "title", label: "Job title", from: "Account Manager", to: "Director" }] });

    await admin.as.teamRequests.decide({ workspaceId, requestId: request.id, approve: true });
    expect(await rowOf(card.id)).toMatchObject({ title: "Director", displayName: "Sam Seller", phone: null });
    await expect(admin.as.teamRequests.decide({ workspaceId, requestId: request.id, approve: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await holder.as.teamRequests.list({ workspaceId })).requests[0].status).toBe("approved");
  });

  it("change nothing when declined, and can be cancelled only by the sender", async () => {
    const { team, workspaceId, holder, card } = await lockedCard();
    const first = await holder.as.teamRequests.create({ workspaceId, cardId: card.id, ...details(), title: "Director" });
    await team.asOwner.teamRequests.decide({ workspaceId, requestId: first.id, approve: false, note: "Not yet" });
    expect((await rowOf(card.id)).title).toBe("Account Manager");

    const second = await holder.as.teamRequests.create({ workspaceId, cardId: card.id, ...details(), title: "Lead" });
    await expect(team.asOwner.teamRequests.cancel({ workspaceId, requestId: second.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await holder.as.teamRequests.cancel({ workspaceId, requestId: second.id });
    await expect(team.asOwner.teamRequests.decide({ workspaceId, requestId: second.id, approve: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await rowOf(card.id)).title).toBe("Account Manager");
  });

  it("replace an older waiting request for the same card", async () => {
    const { workspaceId, holder, card } = await lockedCard();
    const first = await holder.as.teamRequests.create({ workspaceId, cardId: card.id, ...details(), title: "Director" });
    const second = await holder.as.teamRequests.create({ workspaceId, cardId: card.id, ...details(), title: "Lead" });
    const statuses = Object.fromEntries((await holder.as.teamRequests.list({ workspaceId })).requests.map(r => [r.id, r.status]));
    expect(statuses).toEqual({ [first.id]: "cancelled", [second.id]: "pending" });
  });

  it("are refused for someone else's card, for no real change, and for members deciding", async () => {
    const { team, workspaceId, holder, card } = await lockedCard();
    const stranger = await join(team);
    await expect(stranger.as.teamRequests.create({ workspaceId, cardId: card.id, ...details(), title: "Director" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Phone is not locked, so there is nothing to ask for.
    await expect(holder.as.teamRequests.create({ workspaceId, cardId: card.id, ...details(), phone: "+66 2 111 1111" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const request = await holder.as.teamRequests.create({ workspaceId, cardId: card.id, ...details(), title: "Director" });
    await expect(holder.as.teamRequests.decide({ workspaceId, requestId: request.id, approve: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(stranger.as.teamRequests.decide({ workspaceId, requestId: request.id, approve: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Another member sees no requests but their own.
    expect((await stranger.as.teamRequests.list({ workspaceId })).requests).toEqual([]);
    expect((await rowOf(card.id)).title).toBe("Account Manager");
  });

  it("cannot be decided or read from another team", async () => {
    const { workspaceId, holder, card } = await lockedCard();
    const other = await makeTeam("Other");
    const request = await holder.as.teamRequests.create({ workspaceId, cardId: card.id, ...details(), title: "Director" });
    await expect(other.asOwner.teamRequests.decide({ workspaceId: other.workspaceId, requestId: request.id, approve: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(other.asOwner.teamRequests.decide({ workspaceId, requestId: request.id, approve: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await other.asOwner.teamRequests.list({ workspaceId: other.workspaceId })).requests).toEqual([]);
    expect((await rowOf(card.id)).title).toBe("Account Manager");
  });
});
