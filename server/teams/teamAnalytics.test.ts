import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsEvents, users, workspaceAuditLog } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { createTestDb } from "../billing/testDb";
import { TEAM_ANALYTICS_SCHEMA_STATEMENTS } from "./schemaSql";

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

const saved = { ...ENV };
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;

const req = { protocol: "https", headers: {}, ip: "203.0.113.9", get: () => "heyitsme.test", query: {} } as unknown as TrpcContext["req"];
const callerFor = (user: typeof users.$inferSelect | null) => appRouter.createCaller({ user, req, res: {} as TrpcContext["res"] });

let seq = 0;
async function makeUser(email: string, name = email.split("@")[0]) {
  const [row] = await db.insert(users).values({ openId: `a-${++seq}`, email, name }).returning();
  return row;
}

async function makeTeam(name = "Acme") {
  const owner = await makeUser(`owner${++seq}@analytics.test`, "Olive Owner");
  const workspace = await callerFor(owner).teams.create({ name });
  return { owner, workspace, workspaceId: workspace.id, asOwner: callerFor(owner) };
}
type Team = Awaited<ReturnType<typeof makeTeam>>;

async function join(team: Team, name: string, role: "admin" | "member" = "member") {
  const email = `person${++seq}@analytics.test`;
  const user = await makeUser(email, name);
  const invite = await team.asOwner.teams.invite({ workspaceId: team.workspaceId, email, role });
  await callerFor(user).teams.acceptInvite({ token: invite.inviteUrl.split("/").pop()! });
  return { user, memberId: invite.memberId, as: callerFor(user) };
}

/** A published company card held by a new member. */
async function liveCard(team: Team, name: string) {
  const holder = await join(team, name);
  const card = await team.asOwner.teamCards.create({ workspaceId: team.workspaceId, displayName: name, title: "Account Manager", assignMemberId: holder.memberId });
  await team.asOwner.teamCards.publish({ workspaceId: team.workspaceId, cardId: card.id, published: true });
  return { holder, card };
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
async function seed(cardId: number, counts: Record<string, number>, createdAt = new Date()) {
  const rows = Object.entries(counts).flatMap(([type, count]) => Array.from({ length: count }, () => ({ cardId, type, createdAt })));
  if (rows.length) await db.insert(analyticsEvents).values(rows);
}

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  closeDb = () => created.client.close();
  setTestDb(db);
});
beforeEach(() => Object.assign(ENV, saved, { teamsEnabled: true, siteUrl: "https://heyitsme.test" }));
afterEach(() => Object.assign(ENV, saved));
afterAll(() => closeDb());

describe("team analytics schema", () => {
  it("ensureSchema runs exactly the statements of drizzle/0017_team_analytics.sql", () => {
    const file = readFileSync(path.resolve(__dirname, "../../drizzle/0017_team_analytics.sql"), "utf8");
    const statements = file
      .split("\n")
      .filter(line => !line.startsWith("--"))
      .join("\n")
      .split(";")
      .map(s => s.trim().replaceAll("\r", ""))
      .filter(Boolean);
    expect([...TEAM_ANALYTICS_SCHEMA_STATEMENTS]).toEqual(statements);
  });
});

describe("team analytics", () => {
  it("adds up the workspace for admins, by card, person and department", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const maria = await liveCard(team, "Maria");
    const john = await liveCard(team, "John");
    const sales = await team.asOwner.teamDepartments.create({ workspaceId, name: "Sales" });
    await team.asOwner.teamDepartments.assignMember({ workspaceId, memberId: maria.holder.memberId, departmentId: sales.id });
    await seed(maria.card.id, { view: 10, vcard: 3, save: 2, qr: 4, link: 5, share: 1 });
    await seed(john.card.id, { view: 6, save: 1 }, daysAgo(2));

    const summary = await team.asOwner.teamAnalytics.summary({ workspaceId, days: 7 });
    expect(summary.canViewAll).toBe(true);
    expect(summary.totals).toEqual({ views: 16, saves: 3, exchanges: 3, qrScans: 4, linkClicks: 5, shares: 1 });
    expect(summary.conversionRate).toBeCloseTo(3 / 16);
    expect(summary.cardCounts).toEqual({ total: 2, published: 2, active: 2 });
    expect(summary.activePeople).toBe(2);
    expect(summary.daily).toHaveLength(7);
    expect(summary.daily.reduce((sum, point) => sum + point.views, 0)).toBe(16);
    expect(summary.daily[6].views).toBe(10);
    expect(summary.cards.map(card => [card.displayName, card.views, card.holderName])).toEqual([["Maria", 10, "Maria"], ["John", 6, "John"]]);
    expect(summary.people.map(person => [person.name, person.views, person.cards])).toEqual([["John", 6, 1], ["Maria", 10, 1]]);
    expect(summary.departments.map(row => [row.name, row.views])).toEqual([["Sales", 10], ["No department", 6]]);
    expect(summary.leaderboard).toBeNull();
  });

  it("narrows by person, department, card and template, and by time range", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const maria = await liveCard(team, "Maria");
    const john = await liveCard(team, "John");
    const spare = await team.asOwner.teamCards.create({ workspaceId, displayName: "Front Desk", title: "Reception" });
    const sales = await team.asOwner.teamDepartments.create({ workspaceId, name: "Sales" });
    await team.asOwner.teamDepartments.assignMember({ workspaceId, memberId: maria.holder.memberId, departmentId: sales.id });
    await seed(maria.card.id, { view: 10 });
    await seed(maria.card.id, { view: 7 }, daysAgo(20));
    await seed(john.card.id, { view: 6 });
    await seed(spare.id, { view: 2 });

    const views = async (filter: Record<string, unknown>) => (await team.asOwner.teamAnalytics.summary({ workspaceId, days: 7, ...filter })).totals.views;
    expect(await views({})).toBe(18);
    expect(await views({ days: 30 })).toBe(25);
    expect(await views({ memberId: maria.holder.memberId })).toBe(10);
    expect(await views({ memberId: "unassigned" })).toBe(2);
    expect(await views({ departmentId: sales.id })).toBe(10);
    expect(await views({ cardId: john.card.id })).toBe(6);
    expect(await views({ templateId: 999_999 })).toBe(0);

    const options = await team.asOwner.teamAnalytics.filters({ workspaceId });
    expect(options.people.map(person => person.name)).toEqual(["John", "Maria", "Olive Owner"]);
    expect(options.cards.map(card => card.name)).toEqual(["Front Desk", "John", "Maria"]);
    expect(options.departments.map(department => department.name)).toEqual(["Sales"]);
  });

  it("shows a member only their own cards, whatever filter they send", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const maria = await liveCard(team, "Maria");
    const john = await liveCard(team, "John");
    await seed(maria.card.id, { view: 10, save: 2 });
    await seed(john.card.id, { view: 6 });

    const own = await john.holder.as.teamAnalytics.summary({ workspaceId, days: 30 });
    expect(own.canViewAll).toBe(false);
    expect(own.totals.views).toBe(6);
    expect(own.cards.map(card => card.displayName)).toEqual(["John"]);
    expect(own.cards[0].holderName).toBeNull();
    expect(own.people).toEqual([]);
    expect(own.departments).toEqual([]);
    expect(own.activePeople).toBeNull();
    expect(own.leaderboard).toBeNull();

    const peeking = await john.holder.as.teamAnalytics.summary({ workspaceId, days: 30, cardId: maria.card.id, memberId: maria.holder.memberId });
    expect(peeking.totals.views).toBe(6);
    expect(peeking.cards.map(card => card.displayName)).toEqual(["John"]);

    await expect(john.holder.as.teamAnalytics.adoption({ workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(john.holder.as.teamAnalytics.filters({ workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(john.holder.as.teamAnalytics.setLeaderboard({ workspaceId, enabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps teams apart, hides teams from strangers, and follows the Teams switch", async () => {
    const team = await makeTeam();
    const other = await makeTeam("Globex");
    const maria = await liveCard(team, "Maria");
    const rival = await liveCard(other, "Rival");
    await seed(maria.card.id, { view: 10 });
    await seed(rival.card.id, { view: 99 });

    expect((await team.asOwner.teamAnalytics.summary({ workspaceId: team.workspaceId, days: 30 })).totals.views).toBe(10);
    expect((await team.asOwner.teamAnalytics.summary({ workspaceId: team.workspaceId, days: 30, cardId: rival.card.id })).totals.views).toBe(0);
    await expect(team.asOwner.teamAnalytics.summary({ workspaceId: other.workspaceId, days: 30 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(team.asOwner.teamAnalytics.adoption({ workspaceId: other.workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerFor(null).teamAnalytics.summary({ workspaceId: team.workspaceId, days: 30 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    ENV.teamsEnabled = false;
    await expect(team.asOwner.teamAnalytics.summary({ workspaceId: team.workspaceId, days: 30 })).rejects.toBeTruthy();
  });

  it("leaves company cards out of personal insights", async () => {
    const team = await makeTeam();
    const maria = await liveCard(team, "Maria");
    await seed(maria.card.id, { view: 10 });
    const personal = await team.asOwner.insights.summary({ days: 30 });
    expect(personal.totals.views).toBe(0);
    expect(personal.cards).toEqual([]);
  });

  it("reports adoption: people, published cards, and who has shared", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const maria = await liveCard(team, "Maria");
    const john = await liveCard(team, "John");
    const ana = await join(team, "Ana");
    await team.asOwner.teamCards.create({ workspaceId, displayName: "Draft Card", title: "Draft" });
    await team.asOwner.teams.invite({ workspaceId, email: `waiting${++seq}@analytics.test`, role: "member" });
    await seed(maria.card.id, { share: 2 });
    await seed(john.card.id, { share: 1 }, daysAgo(40));

    const adoption = await team.asOwner.teamAnalytics.adoption({ workspaceId });
    const now = new Date();
    const johnThisMonth = daysAgo(40).getTime() >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) ? 1 : 0;
    expect(adoption).toEqual({
      totalMembers: 5,
      activeMembers: 4,
      cardsPublished: 2,
      cardsNotPublished: 1,
      sharedThisMonth: 1 + johnThisMonth,
      // The owner and Ana have never shared a card.
      neverShared: 2,
    });
    expect(ana.memberId).toBeGreaterThan(0);
  });

  it("keeps the leaderboard off until an admin turns it on, then shows it to the whole team", async () => {
    const team = await makeTeam();
    const workspaceId = team.workspaceId;
    const maria = await liveCard(team, "Maria");
    const john = await liveCard(team, "John");
    const ana = await liveCard(team, "Ana");
    await seed(maria.card.id, { view: 20, save: 3, qr: 5, link: 9 });
    await seed(john.card.id, { view: 30, save: 1 });

    expect((await john.holder.as.teamAnalytics.summary({ workspaceId, days: 30 })).leaderboard).toBeNull();

    await team.asOwner.teamAnalytics.setLeaderboard({ workspaceId, enabled: true });
    const seen = await maria.holder.as.teamAnalytics.summary({ workspaceId, days: 30 });
    expect(seen.leaderboardEnabled).toBe(true);
    expect(seen.leaderboard).toEqual([
      { memberId: john.holder.memberId, name: "John", views: 30, exchanges: 1, qrScans: 0, you: false },
      { memberId: maria.holder.memberId, name: "Maria", views: 20, exchanges: 3, qrScans: 5, you: true },
    ]);
    // The leaderboard shows only the agreed numbers. A member's own totals stay their own.
    expect(seen.totals.views).toBe(20);
    expect(seen.cards.map(card => card.displayName)).toEqual(["Maria"]);
    expect(ana.card.id).toBeGreaterThan(0);

    // A filtered admin view still ranks the whole team.
    const filtered = await team.asOwner.teamAnalytics.summary({ workspaceId, days: 30, cardId: maria.card.id });
    expect(filtered.totals.views).toBe(20);
    expect(filtered.leaderboard?.map(row => row.name)).toEqual(["John", "Maria"]);

    await team.asOwner.teamAnalytics.setLeaderboard({ workspaceId, enabled: false });
    expect((await maria.holder.as.teamAnalytics.summary({ workspaceId, days: 30 })).leaderboard).toBeNull();
    const audit = await db.select().from(workspaceAuditLog).where(eq(workspaceAuditLog.workspaceId, workspaceId));
    expect(audit.map(row => row.action)).toEqual(expect.arrayContaining(["analytics.leaderboard_on", "analytics.leaderboard_off"]));
  });
});
