import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FREE_TEAM_NOTICE_DAYS, PAUSED_MESSAGE, TEAM_HOLD_MESSAGE } from "@shared/hold";
import { billingAccounts, cards, entitlementOverrides, subscriptions, users, workspaces } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { createTestDb } from "./testDb";

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
const { endFreeTeams, remindEndedPro, remindEndedTeams } = await import("./planCron");

const saved = { ...ENV };
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ORIGIN = "https://heyitsme.test";
const req = { protocol: "https", headers: {}, ip: "203.0.113.9", get: () => "heyitsme.test", query: {} } as unknown as TrpcContext["req"];
const callerFor = (user: typeof users.$inferSelect | null) => appRouter.createCaller({ user, req, res: {} as TrpcContext["res"] });
const visitor = () => callerFor(null);

let seq = 0;
async function makeUser() {
  const [row] = await db.insert(users).values({ openId: `h-${++seq}`, email: `owner${seq}@hold.test`, name: `Owner ${seq}` }).returning();
  return row;
}
/** A published personal card, written straight to the table so a test can give it what Free would refuse. */
async function makeCard(ownerUserId: number, page: object | null = null, workspaceId: number | null = null) {
  const [card] = await db
    .insert(cards)
    .values({ ownerUserId, workspaceId, displayName: "Ada Lane", title: "Designer", slug: `ada-${++seq}`, published: true, page: page ? JSON.stringify(page) : null })
    .returning();
  return card;
}
/** Pro that was given for a while and ran out this many days ago. */
const proEnded = (userId: number, daysAgo: number) =>
  db.insert(entitlementOverrides).values({ userId, entitlement: "plan", valueJson: '"pro"', reason: "test", expiresAt: ago(daysAgo) });
/** Pro that was paid for and ran out this many days ago. */
async function paidProEnded(userId: number, daysAgo: number) {
  const [account] = await db.insert(billingAccounts).values({ ownerUserId: userId }).returning();
  await db.insert(subscriptions).values({
    billingAccountId: account.id, planCode: "pro", billingCycle: "monthly", status: "active", priceMinor: 29900,
    currentPeriodStart: ago(daysAgo + 30), currentPeriodEnd: ago(daysAgo),
  });
}
const paused = { code: "FORBIDDEN", message: PAUSED_MESSAGE };
const teamOnHold = { code: "FORBIDDEN", message: TEAM_HOLD_MESSAGE };

/** A team with its owner. accessUntil: a date, or null for a team from when Teams was free. */
async function makeTeam(accessUntil: Date | null) {
  const owner = await makeUser();
  ENV.teamsBillingEnabled = false;
  const { id } = await callerFor(owner).teams.create({ name: "Acme" });
  ENV.teamsBillingEnabled = true;
  if (accessUntil) await db.update(workspaces).set({ accessUntil }).where(eq(workspaces.id, id));
  return { owner, as: callerFor(owner), workspaceId: id };
}

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  closeDb = () => test.client.close();
  setTestDb(db);
  vi.mocked(sendMail).mockClear();
  Object.assign(ENV, saved, {
    teamsEnabled: true, teamsBillingEnabled: true, paymentsEnabled: true, gcashEnabled: true, googlePayEnabled: true,
    planLimitsEnabled: false, complimentaryEmails: [], siteUrl: ORIGIN,
  });
});
afterEach(async () => {
  setTestDb(null);
  await closeDb();
});
afterAll(() => {
  Object.assign(ENV, saved);
});

describe("a personal card after Pro ends", () => {
  it("is paused once the days of grace are over, when it still uses a Pro feature", async () => {
    const owner = await makeUser();
    const card = await makeCard(owner.id, { hideBranding: true });
    await proEnded(owner.id, 4);
    await expect(visitor().publicCard.bySlug({ slug: card.slug })).rejects.toMatchObject(paused);
    await expect(visitor().publicCard.track({ cardId: card.id, type: "link" })).resolves.toMatchObject({ ok: false });
  });

  it("stays online during the days of grace", async () => {
    const owner = await makeUser();
    const card = await makeCard(owner.id, { hideBranding: true });
    await proEnded(owner.id, 2);
    await expect(visitor().publicCard.bySlug({ slug: card.slug })).resolves.toBeTruthy();
  });

  it("stays online when it uses nothing paid", async () => {
    const owner = await makeUser();
    const card = await makeCard(owner.id);
    await proEnded(owner.id, 30);
    await expect(visitor().publicCard.bySlug({ slug: card.slug })).resolves.toBeTruthy();
  });

  it("is never paused for an owner who never had a paid plan", async () => {
    const owner = await makeUser();
    const card = await makeCard(owner.id, { hideBranding: true });
    await expect(visitor().publicCard.bySlug({ slug: card.slug })).resolves.toBeTruthy();
  });

  it("is never paused for a complimentary owner", async () => {
    const owner = await makeUser();
    const card = await makeCard(owner.id, { hideBranding: true });
    await proEnded(owner.id, 30);
    ENV.complimentaryEmails = [owner.email!];
    await expect(visitor().publicCard.bySlug({ slug: card.slug })).resolves.toBeTruthy();
  });

  it("comes back the moment Pro is on again", async () => {
    const owner = await makeUser();
    const card = await makeCard(owner.id, { hideBranding: true });
    await paidProEnded(owner.id, 10);
    await expect(visitor().publicCard.bySlug({ slug: card.slug })).rejects.toMatchObject(paused);
    await db.insert(entitlementOverrides).values({ userId: owner.id, entitlement: "plan", valueJson: '"pro"', reason: "test" });
    await expect(visitor().publicCard.bySlug({ slug: card.slug })).resolves.toBeTruthy();
  });

  it("with plan limits on, keeps the oldest card and pauses the extra ones", async () => {
    ENV.planLimitsEnabled = true;
    const owner = await makeUser();
    const first = await makeCard(owner.id);
    const second = await makeCard(owner.id);
    await proEnded(owner.id, 4);
    await expect(visitor().publicCard.bySlug({ slug: first.slug })).resolves.toBeTruthy();
    await expect(visitor().publicCard.bySlug({ slug: second.slug })).rejects.toMatchObject(paused);
  });

  it("tells the owner which cards are paused and why", async () => {
    const owner = await makeUser();
    const card = await makeCard(owner.id, { hideBranding: true });
    await makeCard(owner.id);
    expect((await callerFor(owner).billing.me()).cardHolds).toBeNull();
    await proEnded(owner.id, 4);
    const { cardHolds } = await callerFor(owner).billing.me();
    expect(cardHolds).toMatchObject({ held: true, cards: [{ id: card.id, uses: ["hidden heyitsme branding"] }] });
  });
});

describe("a team on hold", () => {
  it("is on hold from the start when it was never paid for", async () => {
    const owner = await makeUser();
    const as = callerFor(owner);
    const { id: workspaceId } = await as.teams.create({ name: "Acme" });
    await expect(as.teams.get({ workspaceId })).resolves.toMatchObject({ held: true, planState: "unpaid" });
    await expect(as.teams.billing({ workspaceId })).resolves.toMatchObject({ held: true });
    await expect(as.teams.members({ workspaceId })).rejects.toMatchObject(teamOnHold);
    await expect(as.teamContacts.exportCsv({ workspaceId })).rejects.toMatchObject(teamOnHold);
  });

  it("stays readable for the days of grace after its plan ends, then locks", async () => {
    const team = await makeTeam(ago(1));
    await expect(team.as.teams.get({ workspaceId: team.workspaceId })).resolves.toMatchObject({ held: false, planEnded: true });
    await expect(team.as.teams.members({ workspaceId: team.workspaceId })).resolves.toBeTruthy();
    await db.update(workspaces).set({ accessUntil: ago(4) }).where(eq(workspaces.id, team.workspaceId));
    await expect(team.as.teams.get({ workspaceId: team.workspaceId })).resolves.toMatchObject({ held: true });
    await expect(team.as.teams.members({ workspaceId: team.workspaceId })).rejects.toMatchObject(teamOnHold);
  });

  it("pauses its company cards, and brings them back when it is paid", async () => {
    const team = await makeTeam(ago(4));
    const card = await makeCard(team.owner.id, null, team.workspaceId);
    await expect(visitor().publicCard.bySlug({ slug: card.slug })).rejects.toMatchObject(paused);
    await db.update(workspaces).set({ accessUntil: new Date(Date.now() + 30 * DAY) }).where(eq(workspaces.id, team.workspaceId));
    await expect(visitor().publicCard.bySlug({ slug: card.slug })).resolves.toBeTruthy();
  });

  it("can still be closed by its owner, with nothing deleted", async () => {
    const team = await makeTeam(ago(4));
    await team.as.teams.close({ workspaceId: team.workspaceId });
    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId));
    expect(row.deletedAt).not.toBeNull();
  });

  it("leaves a team with no end date alone", async () => {
    const team = await makeTeam(null);
    await expect(team.as.teams.get({ workspaceId: team.workspaceId })).resolves.toMatchObject({ held: false, planState: "free" });
  });
});

describe("the daily plan run", () => {
  it("gives a team that was free its end date once, and tells its owner", async () => {
    const team = await makeTeam(null);
    const now = new Date();
    expect(await endFreeTeams(db, ORIGIN, now)).toBe(1);
    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId));
    expect(row.accessUntil?.getTime()).toBe(now.getTime() + FREE_TEAM_NOTICE_DAYS * DAY);
    expect(vi.mocked(sendMail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendMail).mock.calls[0][0]).toMatchObject({ to: team.owner.email });
    expect(await endFreeTeams(db, ORIGIN, now)).toBe(0);
    expect(vi.mocked(sendMail)).toHaveBeenCalledTimes(1);
  });

  it("leaves free teams alone while Teams is not sold", async () => {
    const team = await makeTeam(null);
    ENV.teamsBillingEnabled = false;
    expect(await endFreeTeams(db, ORIGIN)).toBe(0);
    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId));
    expect(row.accessUntil).toBeNull();
  });

  it("reminds a team's owner once when its plan has ended", async () => {
    await makeTeam(ago(1));
    await makeTeam(ago(10));
    await makeTeam(new Date(Date.now() + 5 * DAY));
    expect(await remindEndedTeams(db, ORIGIN)).toBe(1);
    expect(await remindEndedTeams(db, ORIGIN)).toBe(0);
    expect(vi.mocked(sendMail)).toHaveBeenCalledTimes(1);
  });

  it("reminds an account once when its Pro has ended", async () => {
    const lapsed = await makeUser();
    await paidProEnded(lapsed.id, 1);
    const longGone = await makeUser();
    await paidProEnded(longGone.id, 10);
    expect(await remindEndedPro(db, ORIGIN)).toBe(1);
    expect(vi.mocked(sendMail).mock.calls[0][0]).toMatchObject({ to: lapsed.email });
    expect(await remindEndedPro(db, ORIGIN)).toBe(0);
  });
});
