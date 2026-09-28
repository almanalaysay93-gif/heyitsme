import { count, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { cards, contacts, payments, users } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import type { CheckoutRequest, PaymentProvider, PaymentResult } from "./provider";
import { createTestDb } from "./testDb";

vi.mock("../_core/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_core/rateLimit")>()),
  rateLimit: vi.fn(async () => ({ allowed: true, count: 1, resetMs: 0 })),
}));
vi.mock("../_core/mail", async (importOriginal) => ({ ...(await importOriginal<typeof import("../_core/mail")>()), sendMail: vi.fn(async () => true) }));
vi.mock("../uploadSweep", () => ({ tidyOwnerUploads: vi.fn() }));

const { appRouter } = await import("../routers");
const { setTestDb } = await import("../db");
const { setPaymentProvider } = await import("./checkout");
const { _test: routes } = await import("./paymentRoutes");

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
    return b?.signed && b.invoiceNo ? { invoiceNo: b.invoiceNo, status: "succeeded" as const, amountMinor: 0, currency: "PHP", providerRef: null, channelCode: null, code: "0000" } : null;
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
const publicCaller = () => appRouter.createCaller({ user: null, req, res: {} as TrpcContext["res"] });

async function makeUser(email = "ada@example.com") {
  const [row] = await db.insert(users).values({ openId: `g-${Math.random()}`, email }).returning();
  return row;
}
const callerFor = (user: typeof users.$inferSelect) => appRouter.createCaller({ user, req, res: {} as TrpcContext["res"] });

function fakeRes() {
  const res = { statusCode: 200, body: undefined as unknown, location: "", status(code: number) { res.statusCode = code; return res; }, json(body: unknown) { res.body = body; return res; }, redirect(code: number, url: string) { res.statusCode = code; res.location = url; return res; } };
  return res;
}

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  closeDb = () => test.client.close();
  setTestDb(db);
  gateway = new FakeGateway();
  setPaymentProvider(gateway);
  Object.assign(ENV, { planLimitsEnabled: true, paymentsEnabled: true, googlePayEnabled: true, gcashEnabled: true, googlePayRecurringEnabled: false, foundingOfferEnabled: true, complimentaryEmails: [] });
});

afterEach(async () => {
  Object.assign(ENV, saved);
  setPaymentProvider(null);
  setTestDb(null);
  await closeDb();
});

afterAll(() => vi.restoreAllMocks());

describe("checkout", () => {
  it("prices on the server and ignores any amount the browser sends", async () => {
    const user = await makeUser();
    const result = await callerFor(user).billing.createCheckout({ planCode: "pro", billingCycle: "annual", channel: "googlepay", amountMinor: 1, founding: true } as never);
    expect(result.redirectUrl).toMatch(/^https:\/\/gateway\.test\/pay\//);
    expect(gateway.requests[0].amountMinor).toBe(99900);
    const [row] = await db.select().from(payments).where(eq(payments.providerTransactionId, result.invoiceNo));
    expect(row).toMatchObject({ amountMinor: 99900, foundingPrice: true, status: "pending", userId: user.id });
  });

  it("stays closed while payments are off", async () => {
    ENV.paymentsEnabled = false;
    const user = await makeUser();
    await expect(callerFor(user).billing.createCheckout({ planCode: "pro", billingCycle: "annual", channel: "googlepay" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(gateway.requests).toHaveLength(0);
  });

  it("refuses monthly until recurring billing is confirmed", async () => {
    const user = await makeUser();
    await expect(callerFor(user).billing.createCheckout({ planCode: "pro", billingCycle: "monthly", channel: "googlepay" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("refuses Teams until Teams is enabled", async () => {
    const user = await makeUser();
    await expect(callerFor(user).billing.createCheckout({ planCode: "teams", billingCycle: "annual", channel: "googlepay" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("payment verification", () => {
  async function startPro() {
    const user = await makeUser();
    const { invoiceNo } = await callerFor(user).billing.createCheckout({ planCode: "pro", billingCycle: "annual", channel: "googlepay" });
    return { user, invoiceNo };
  }

  it("the browser return never unlocks Pro", async () => {
    const { user, invoiceNo } = await startPro();
    const res = fakeRes();
    routes.handleReturn({ query: { invoice: invoiceNo, respCode: "0000" }, body: { respCode: "0000" } } as never, res as never);
    expect(res.statusCode).toBe(303);
    expect(res.location).toBe(`/app/billing?payment=${invoiceNo}`);
    expect((await callerFor(user).billing.me()).entitlements.plan).toBe("free");
  });

  it("rejects an unsigned callback without touching the payment", async () => {
    const { user, invoiceNo } = await startPro();
    const res = fakeRes();
    await routes.handleCallback({ body: { invoiceNo, respCode: "0000" }, headers: {}, ip: "1.1.1.1", get: () => "heyitsme.test", protocol: "https" } as never, res as never);
    expect(res.statusCode).toBe(400);
    expect((await callerFor(user).billing.me()).entitlements.plan).toBe("free");
  });

  it("trusts the gateway inquiry, not the callback body", async () => {
    const { user, invoiceNo } = await startPro();
    gateway.inquiry.set(invoiceNo, { invoiceNo, status: "failed", amountMinor: 99900, currency: "PHP", providerRef: null, channelCode: null, code: "4200" });
    const res = fakeRes();
    await routes.handleCallback({ body: { signed: true, invoiceNo }, headers: {}, ip: "1.1.1.1", get: () => "heyitsme.test", protocol: "https" } as never, res as never);
    expect(res.statusCode).toBe(200);
    expect((await callerFor(user).billing.me()).entitlements.plan).toBe("free");
  });

  it("Free user to Pro: checkout, verified callback, Pro entitlement", async () => {
    const { user, invoiceNo } = await startPro();
    gateway.inquiry.set(invoiceNo, { invoiceNo, status: "succeeded", amountMinor: 99900, currency: "PHP", providerRef: "T9", channelCode: "GOOGLEPAY", code: "0000" });
    const res = fakeRes();
    await routes.handleCallback({ body: { signed: true, invoiceNo }, headers: {}, ip: "1.1.1.1", get: () => "heyitsme.test", protocol: "https" } as never, res as never);
    expect(res.statusCode).toBe(200);
    const me = await callerFor(user).billing.me();
    expect(me.entitlements.plan).toBe("pro");
    expect(me.subscription).toMatchObject({ foundingMember: true, foundingMemberNumber: 1, billingCycle: "annual" });
    expect(me.insightRanges).toEqual([7, 30, 90, 365]);
    const status = await callerFor(user).billing.paymentStatus({ invoiceNo });
    expect(status.status).toBe("succeeded");
  });

  it("another user cannot read someone else's payment", async () => {
    const { invoiceNo } = await startPro();
    const other = await makeUser("eve@example.com");
    await expect(callerFor(other).billing.paymentStatus({ invoiceNo })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("free plan enforcement", () => {
  async function ownerWithCard(email = "ada@example.com") {
    const owner = await makeUser(email);
    const [card] = await db.insert(cards).values({ ownerUserId: owner.id, displayName: "Ada Lane", title: "Designer", slug: `ada-${owner.id}`, published: true }).returning();
    return { owner, card };
  }

  it("accepts lead 10, refuses lead 11 before saving it, and closes the public form", async () => {
    const { owner, card } = await ownerWithCard();
    for (let i = 0; i < 10; i += 1) await publicCaller().publicCard.exchange({ cardId: card.id, name: `Visitor ${i}` });
    await expect(publicCaller().publicCard.exchange({ cardId: card.id, name: "Visitor 11", email: "v11@example.com" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [saved] = await db.select({ n: count() }).from(contacts).where(eq(contacts.ownerUserId, owner.id));
    expect(saved.n).toBe(10);
    const page = await publicCaller().publicCard.bySlug({ slug: card.slug });
    expect(page?.acceptsDetails).toBe(false);
    const me = await callerFor(owner).billing.me();
    expect(me.usage.leads).toMatchObject({ used: 10, limit: 10, state: "paused" });
  });

  it("leaves lead capture unlimited while plan limits are off", async () => {
    ENV.planLimitsEnabled = false;
    const { card } = await ownerWithCard();
    for (let i = 0; i < 12; i += 1) await publicCaller().publicCard.exchange({ cardId: card.id, name: `Visitor ${i}` });
    expect((await publicCaller().publicCard.bySlug({ slug: card.slug }))?.acceptsDetails).toBe(true);
  });

  it("keeps lead capture open for complimentary owners", async () => {
    ENV.complimentaryEmails = ["owner@example.com"];
    const { card } = await ownerWithCard("owner@example.com");
    for (let i = 0; i < 12; i += 1) await publicCaller().publicCard.exchange({ cardId: card.id, name: `Visitor ${i}` });
    expect((await publicCaller().publicCard.bySlug({ slug: card.slug }))?.acceptsDetails).toBe(true);
  });

  it("blocks a second Free card but keeps the first", async () => {
    const { owner } = await ownerWithCard();
    await expect(callerFor(owner).cards.create({ displayName: "Second", title: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await callerFor(owner).cards.list()).toHaveLength(1);
  });

  it("refuses longer insights ranges on Free and allows 7 days", async () => {
    const { owner } = await ownerWithCard();
    await expect(callerFor(owner).insights.summary({ days: 30 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(owner).insights.summary({ days: 7 })).resolves.toMatchObject({ days: 7 });
  });

  it("refuses turning on branding removal on Free, but keeps it on a card that already has it", async () => {
    const { owner, card } = await ownerWithCard();
    await expect(callerFor(owner).cards.update({ id: card.id, displayName: "Ada Lane", title: "Designer", page: JSON.stringify({ template: "professional", hideBranding: true }) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.update(cards).set({ page: JSON.stringify({ template: "professional", hideBranding: true }) }).where(eq(cards.id, card.id));
    await expect(callerFor(owner).cards.update({ id: card.id, displayName: "Ada L.", title: "Designer", page: JSON.stringify({ template: "professional", hideBranding: true }) })).resolves.toBeTruthy();
  });
});
