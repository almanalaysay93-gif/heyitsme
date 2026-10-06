import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEAMS_PLAN } from "@shared/plans";
import { payments, users, workspaceAuditLog, workspaces } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import type { CheckoutRequest, PaymentProvider, PaymentResult } from "./provider";
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
const { setPaymentProvider } = await import("./checkout");
const { _test: routes } = await import("./paymentRoutes");
const { sendMail } = await import("../_core/mail");

/** A gateway that records what it was asked and answers inquiries from a table the test controls. */
class FakeGateway implements PaymentProvider {
  readonly name = "fake";
  requests: CheckoutRequest[] = [];
  inquiry = new Map<string, PaymentResult>();
  async createCheckout(request: CheckoutRequest) {
    this.requests.push(request);
    return { redirectUrl: `https://gateway.test/pay/${request.invoiceNo}`, providerToken: "tok" };
  }
  createOneTimePayment(request: CheckoutRequest) {
    return this.createCheckout(request);
  }
  async createRecurringSubscription(): Promise<never> {
    throw new Error("not used");
  }
  async cancelSubscription() {}
  async getSubscriptionStatus() {
    return "unknown" as const;
  }
  async verifyCallback(body: unknown) {
    const b = body as { signed?: boolean; invoiceNo?: string };
    return b?.signed && b.invoiceNo
      ? { invoiceNo: b.invoiceNo, status: "succeeded" as const, amountMinor: 0, currency: "PHP", providerRef: null, channelCode: null, code: "0000" }
      : null;
  }
  async getPaymentStatus(invoiceNo: string) {
    return this.inquiry.get(invoiceNo) ?? { invoiceNo, status: "pending" as const, amountMinor: 0, currency: "PHP", providerRef: null, channelCode: null, code: "0001" };
  }
  async refundPayment() {}
}

const saved = { ...ENV };
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;
let gateway: FakeGateway;

const req = { protocol: "https", headers: {}, ip: "203.0.113.9", get: () => "heyitsme.test", query: {} } as unknown as TrpcContext["req"];
const callerFor = (user: typeof users.$inferSelect) => appRouter.createCaller({ user, req, res: {} as TrpcContext["res"] });

let seq = 0;
async function makeUser() {
  const [row] = await db.insert(users).values({ openId: `t-${++seq}`, email: `owner${seq}@teams.test`, name: `Owner ${seq}` }).returning();
  return row;
}
const DAY = 86_400_000;
const teamRow = async (id: number) => (await db.select().from(workspaces).where(eq(workspaces.id, id)))[0];

/** A team started while Teams is sold: it exists, unpaid. */
async function paidSignup() {
  const owner = await makeUser();
  const as = callerFor(owner);
  const workspace = await as.teams.create({ name: "Acme" });
  return { owner, as, workspaceId: workspace.id };
}
/** A team started before Teams was sold: no end date. */
async function freeTeam() {
  ENV.teamsBillingEnabled = false;
  const team = await paidSignup();
  ENV.teamsBillingEnabled = true;
  return team;
}
/** The gateway says the money arrived, then its signed callback lands. */
async function settle(invoiceNo: string, amountMinor: number = TEAMS_PLAN.priceMinor) {
  gateway.inquiry.set(invoiceNo, { invoiceNo, status: "succeeded", amountMinor, currency: "PHP", providerRef: "T1", channelCode: "GCASH", code: "0000" });
  const res = { statusCode: 200, status(code: number) { res.statusCode = code; return res; }, json() { return res; } };
  await routes.handleCallback({ body: { signed: true, invoiceNo }, headers: {}, ip: "1.1.1.1", get: () => "heyitsme.test", protocol: "https" } as never, res as never);
  return res.statusCode;
}

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  closeDb = () => test.client.close();
  setTestDb(db);
  gateway = new FakeGateway();
  setPaymentProvider(gateway);
  vi.mocked(sendMail).mockClear();
  Object.assign(ENV, saved, {
    teamsEnabled: true,
    teamsBillingEnabled: true,
    paymentsEnabled: true,
    gcashEnabled: true,
    googlePayEnabled: true,
    complimentaryEmails: [],
    siteUrl: "https://heyitsme.test",
  });
});
afterEach(async () => {
  Object.assign(ENV, saved);
  setPaymentProvider(null);
  setTestDb(null);
  await closeDb();
});
afterAll(() => vi.restoreAllMocks());

describe("starting a team while Teams is sold", () => {
  it("makes the team unpaid and read-only until it is paid", async () => {
    const team = await paidSignup();
    const row = await teamRow(team.workspaceId);
    expect(row.seatLimit).toBe(TEAMS_PLAN.seats);
    expect(row.accessUntil?.getTime()).toBe(row.createdAt.getTime());

    const seen = await team.as.teams.get({ workspaceId: team.workspaceId });
    expect(seen).toMatchObject({ planState: "unpaid", planEnded: true });
    await expect(team.as.teams.update({ workspaceId: team.workspaceId, name: "Renamed" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const billing = await team.as.teams.billing({ workspaceId: team.workspaceId });
    expect(billing.state).toBe("unpaid");
    expect(billing.plan).toEqual({ checkoutOpen: true, channels: expect.arrayContaining(["gcash"]), priceMinor: TEAMS_PLAN.priceMinor, seats: TEAMS_PLAN.seats });
    expect(await team.as.billing.teamPlans()).toEqual([{ id: team.workspaceId, name: "Acme", accessUntil: row.accessUntil, state: "unpaid" }]);
  });

  it("stays free with no end date while Teams is not sold", async () => {
    ENV.teamsBillingEnabled = false;
    const team = await paidSignup();
    expect(await teamRow(team.workspaceId)).toMatchObject({ seatLimit: null, accessUntil: null });
    expect((await team.as.teams.get({ workspaceId: team.workspaceId })).planState).toBe("free");
    expect((await team.as.billing.me()).teams).toMatchObject({ enabled: true, checkoutOpen: false });
    await expect(team.as.billing.createTeamCheckout({ workspaceId: team.workspaceId, channel: "gcash" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(gateway.requests).toHaveLength(0);
  });

  it("needs payments on and an open channel", async () => {
    ENV.paymentsEnabled = false;
    const closed = await paidSignup();
    expect((await closed.as.billing.offer()).teams.checkoutOpen).toBe(false);
    expect((await teamRow(closed.workspaceId)).accessUntil).toBeNull();
  });
});

describe("Teams checkout", () => {
  it("charges the server's price, whatever the browser sends", async () => {
    const team = await paidSignup();
    const result = await team.as.billing.createTeamCheckout({ workspaceId: team.workspaceId, channel: "gcash" });
    expect(result.redirectUrl).toMatch(/^https:\/\/gateway\.test\/pay\//);
    expect(gateway.requests[0]).toMatchObject({ amountMinor: TEAMS_PLAN.priceMinor, currency: "PHP", channel: "gcash" });
    const [row] = await db.select().from(payments).where(eq(payments.providerTransactionId, result.invoiceNo));
    expect(row).toMatchObject({ purpose: "teams", planCode: "teams", billingCycle: "monthly", amountMinor: TEAMS_PLAN.priceMinor, status: "pending", userId: team.owner.id });
    expect(JSON.parse(row.metadataJson!)).toEqual({ workspaceId: team.workspaceId });

    await expect(team.as.billing.createTeamCheckout({ workspaceId: team.workspaceId, channel: "gcash", amountMinor: 100 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is only for the team's owner", async () => {
    const team = await paidSignup();
    const stranger = callerFor(await makeUser());
    await expect(stranger.billing.createTeamCheckout({ workspaceId: team.workspaceId, channel: "gcash" })).rejects.toThrow();
    expect(gateway.requests).toHaveLength(0);
    expect(await stranger.billing.teamPlans()).toEqual([]);
  });

  it("refuses a team that has no end date", async () => {
    const team = await freeTeam();
    await expect(team.as.billing.createTeamCheckout({ workspaceId: team.workspaceId, channel: "gcash" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("nothing to pay"),
    });
    expect(gateway.requests).toHaveLength(0);
    expect(await db.select().from(payments)).toHaveLength(0);
  });

  it("refuses a channel that is switched off", async () => {
    const team = await paidSignup();
    ENV.gcashEnabled = false;
    await expect(team.as.billing.createTeamCheckout({ workspaceId: team.workspaceId, channel: "gcash" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(gateway.requests).toHaveLength(0);
  });
});

describe("a verified Teams payment", () => {
  it("opens the team for one month, once, and leaves the owner's own plan alone", async () => {
    const team = await paidSignup();
    const { invoiceNo } = await team.as.billing.createTeamCheckout({ workspaceId: team.workspaceId, channel: "gcash" });
    const before = Date.now();
    expect(await settle(invoiceNo)).toBe(200);

    const row = await teamRow(team.workspaceId);
    const days = (row.accessUntil!.getTime() - before) / DAY;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    expect(row.seatLimit).toBe(TEAMS_PLAN.seats);
    expect(await team.as.teams.get({ workspaceId: team.workspaceId })).toMatchObject({ planState: "active", planEnded: false });
    await team.as.teams.update({ workspaceId: team.workspaceId, name: "Renamed" });
    expect((await team.as.billing.me()).entitlements.plan).toBe("free");

    const status = await team.as.billing.paymentStatus({ invoiceNo });
    expect(status).toMatchObject({ status: "succeeded", planCode: "teams", workspaceId: team.workspaceId });
    expect(vi.mocked(sendMail).mock.calls.at(-1)?.[0]).toMatchObject({ to: team.owner.email, subject: expect.stringContaining("Teams") });

    // The gateway may call again. The date must not move twice.
    await settle(invoiceNo);
    expect((await teamRow(team.workspaceId)).accessUntil?.getTime()).toBe(row.accessUntil!.getTime());
    const audit = (await db.select().from(workspaceAuditLog).where(eq(workspaceAuditLog.workspaceId, team.workspaceId))).filter(entry => entry.action === "plan.paid");
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ invoiceNo, seatLimit: TEAMS_PLAN.seats });
  });

  it("does nothing when the amount is not the price", async () => {
    const team = await paidSignup();
    const { invoiceNo } = await team.as.billing.createTeamCheckout({ workspaceId: team.workspaceId, channel: "gcash" });
    await settle(invoiceNo, 100);
    expect((await team.as.teams.get({ workspaceId: team.workspaceId })).planState).toBe("unpaid");
    const [row] = await db.select().from(payments).where(eq(payments.providerTransactionId, invoiceNo));
    expect(row.status).not.toBe("succeeded");
  });

  it("does nothing on an unsigned callback", async () => {
    const team = await paidSignup();
    const { invoiceNo } = await team.as.billing.createTeamCheckout({ workspaceId: team.workspaceId, channel: "gcash" });
    const res = { statusCode: 200, status(code: number) { res.statusCode = code; return res; }, json() { return res; } };
    await routes.handleCallback({ body: { invoiceNo, respCode: "0000" }, headers: {}, ip: "1.1.1.1", get: () => "heyitsme.test", protocol: "https" } as never, res as never);
    expect(res.statusCode).toBe(400);
    expect((await team.as.teams.get({ workspaceId: team.workspaceId })).planState).toBe("unpaid");
  });

  it("renewing early adds a month to the date already paid for", async () => {
    const team = await paidSignup();
    const end = new Date(Date.now() + 10 * DAY);
    await db.update(workspaces).set({ accessUntil: end, seatLimit: 25 }).where(eq(workspaces.id, team.workspaceId));
    const { invoiceNo } = await team.as.billing.createTeamCheckout({ workspaceId: team.workspaceId, channel: "googlepay" });
    await settle(invoiceNo);
    const row = await teamRow(team.workspaceId);
    const days = (row.accessUntil!.getTime() - end.getTime()) / DAY;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    // Seats heyitsme set above the included number are kept.
    expect(row.seatLimit).toBe(25);
  });

  it("a lapsed team starts again from today, with nothing deleted", async () => {
    const team = await paidSignup();
    await db.update(workspaces).set({ createdAt: new Date(Date.now() - 80 * DAY), accessUntil: new Date(Date.now() - 40 * DAY) }).where(eq(workspaces.id, team.workspaceId));
    expect((await team.as.teams.get({ workspaceId: team.workspaceId })).planState).toBe("ended");
    const { invoiceNo } = await team.as.billing.createTeamCheckout({ workspaceId: team.workspaceId, channel: "gcash" });
    const before = Date.now();
    await settle(invoiceNo);
    const row = await teamRow(team.workspaceId);
    expect((row.accessUntil!.getTime() - before) / DAY).toBeGreaterThan(27);
    expect(row.name).toBe("Acme");
  });

  it("never gives an end date to a team that had none", async () => {
    const team = await paidSignup();
    const { invoiceNo } = await team.as.billing.createTeamCheckout({ workspaceId: team.workspaceId, channel: "gcash" });
    // heyitsme made the team free after checkout opened.
    await db.update(workspaces).set({ accessUntil: null }).where(eq(workspaces.id, team.workspaceId));
    await settle(invoiceNo);
    expect((await teamRow(team.workspaceId)).accessUntil).toBeNull();
    expect((await team.as.teams.get({ workspaceId: team.workspaceId })).planState).toBe("free");
  });
});
