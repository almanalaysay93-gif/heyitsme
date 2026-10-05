import { count, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi,
} from "vitest";
import type { TrpcContext } from "../_core/context";
import { cards, contacts, payments, users,
  entitlementOverrides,
  qrCampaigns,
} from "../../drizzle/schema";
import { ENV } from "../_core/env";
import type { CheckoutRequest, PaymentProvider, PaymentResult,
} from "./provider";
import { createTestDb } from "./testDb";

vi.mock("../_core/rateLimit", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/rateLimit")>()),
  rateLimit: vi.fn(async () => ({ allowed: true, count: 1, resetMs: 0 })),
}));
vi.mock("../_core/mail", async importOriginal => ({ ...(await importOriginal<typeof import("../_core/mail")>()), sendMail: vi.fn(async () => true),
}));
vi.mock("../uploadSweep", () => ({ tidyOwnerUploads: vi.fn() }));

import { designSchema } from "@shared/design";

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
    return { redirectUrl: `https://gateway.test/pay/${request.invoiceNo}`,
      providerToken: "tok",
    };
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
      ? {
          invoiceNo: b.invoiceNo,
          status: "succeeded" as const,
          amountMinor: 0,
          currency: "PHP",
          providerRef: null,
          channelCode: null,
          code: "0000",
        }
      : null;
  }
  async getPaymentStatus(invoiceNo: string) {
    return (
      this.inquiry.get(invoiceNo) ?? {
        invoiceNo,
        status: "pending" as const,
        amountMinor: 0,
        currency: "PHP",
        providerRef: null,
        channelCode: null,
        code: "0001",
      }
    );
  }
  async refundPayment() {}
}

const saved = { ...ENV };
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;
let gateway: FakeGateway;

const req = {
  protocol: "https",
  headers: {},
  ip: "203.0.113.9",
  get: () => "heyitsme.test",
  query: {},
} as unknown as TrpcContext["req"];
const publicCaller = () =>
  appRouter.createCaller({ user: null, req, res: {} as TrpcContext["res"] });

async function makeUser(email = "ada@example.com") {
  const [row] = await db
    .insert(users)
    .values({ openId: `g-${Math.random()}`, email })
    .returning();
  return row;
}
const callerFor = (user: typeof users.$inferSelect) =>
  appRouter.createCaller({ user, req, res: {} as TrpcContext["res"] });

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    location: "",
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    redirect(code: number, url: string) {
      res.statusCode = code;
      res.location = url;
      return res;
    },
  };
  return res;
}

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  closeDb = () => test.client.close();
  setTestDb(db);
  gateway = new FakeGateway();
  setPaymentProvider(gateway);
  Object.assign(ENV, {
    planLimitsEnabled: true,
    paymentsEnabled: true,
    googlePayEnabled: true,
    gcashEnabled: true,
    googlePayRecurringEnabled: false,
    foundingOfferEnabled: true,
    complimentaryEmails: [],
  });
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
    const result = await callerFor(user).billing.createCheckout({
      planCode: "pro",
      billingCycle: "monthly",
      channel: "googlepay",
    });
    expect(result.redirectUrl).toMatch(/^https:\/\/gateway\.test\/pay\//);
    expect(gateway.requests[0].amountMinor).toBe(29900);
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.providerTransactionId, result.invoiceNo));
    expect(row).toMatchObject({
      amountMinor: 29900,
      foundingPrice: false,
      status: "pending",
      userId: user.id,
    });
  });

  it("stays closed while payments are off", async () => {
    ENV.paymentsEnabled = false;
    const user = await makeUser();
    await expect(
      callerFor(user).billing.createCheckout({
        planCode: "pro",
        billingCycle: "monthly",
        channel: "googlepay",
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(gateway.requests).toHaveLength(0);
  });

  it("refuses annual checkout", async () => {
    const user = await makeUser();
    await expect(
      callerFor(user).billing.createCheckout({
        planCode: "pro",
        billingCycle: "annual",
        channel: "googlepay",
      } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses Teams until Teams is enabled", async () => {
    const user = await makeUser();
    await expect(
      callerFor(user).billing.createCheckout({
        planCode: "teams",
        billingCycle: "monthly",
        channel: "googlepay",
      } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("payment verification", () => {
  async function startPro() {
    const user = await makeUser();
    const { invoiceNo } = await callerFor(user).billing.createCheckout({
      planCode: "pro",
      billingCycle: "monthly",
      channel: "googlepay",
    });
    return { user, invoiceNo };
  }

  it("the browser return never unlocks Pro", async () => {
    const { user, invoiceNo } = await startPro();
    const res = fakeRes();
    routes.handleReturn(
      {
        query: { invoice: invoiceNo, respCode: "0000" },
        body: { respCode: "0000" },
      } as never,
      res as never
    );
    expect(res.statusCode).toBe(303);
    expect(res.location).toBe(`/app/billing?payment=${invoiceNo}`);
    expect((await callerFor(user).billing.me()).entitlements.plan).toBe("free");
  });

  it("rejects an unsigned callback without touching the payment", async () => {
    const { user, invoiceNo } = await startPro();
    const res = fakeRes();
    await routes.handleCallback(
      {
        body: { invoiceNo, respCode: "0000" },
        headers: {},
        ip: "1.1.1.1",
        get: () => "heyitsme.test",
        protocol: "https",
      } as never,
      res as never
    );
    expect(res.statusCode).toBe(400);
    expect((await callerFor(user).billing.me()).entitlements.plan).toBe("free");
  });

  it("trusts the gateway inquiry, not the callback body", async () => {
    const { user, invoiceNo } = await startPro();
    gateway.inquiry.set(invoiceNo, {
      invoiceNo,
      status: "failed",
      amountMinor: 29900,
      currency: "PHP",
      providerRef: null,
      channelCode: null,
      code: "4200",
    });
    const res = fakeRes();
    await routes.handleCallback(
      {
        body: { signed: true, invoiceNo },
        headers: {},
        ip: "1.1.1.1",
        get: () => "heyitsme.test",
        protocol: "https",
      } as never,
      res as never
    );
    expect(res.statusCode).toBe(200);
    expect((await callerFor(user).billing.me()).entitlements.plan).toBe("free");
  });

  it("Free user to Pro: checkout, verified callback, Pro entitlement", async () => {
    const { user, invoiceNo } = await startPro();
    gateway.inquiry.set(invoiceNo, {
      invoiceNo,
      status: "succeeded",
      amountMinor: 29900,
      currency: "PHP",
      providerRef: "T9",
      channelCode: "GOOGLEPAY",
      code: "0000",
    });
    const res = fakeRes();
    await routes.handleCallback(
      {
        body: { signed: true, invoiceNo },
        headers: {},
        ip: "1.1.1.1",
        get: () => "heyitsme.test",
        protocol: "https",
      } as never,
      res as never
    );
    expect(res.statusCode).toBe(200);
    const me = await callerFor(user).billing.me();
    expect(me.entitlements.plan).toBe("pro");
    expect(me.subscription).toMatchObject({
      foundingMember: false,
      foundingMemberNumber: null,
      billingCycle: "monthly",
    });
    expect(me.insightRanges).toEqual([7, 30, 90, 365]);
    const status = await callerFor(user).billing.paymentStatus({ invoiceNo });
    expect(status.status).toBe("succeeded");
  });

  it("another user cannot read someone else's payment", async () => {
    const { invoiceNo } = await startPro();
    const other = await makeUser("eve@example.com");
    await expect(
      callerFor(other).billing.paymentStatus({ invoiceNo })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("free plan enforcement", () => {
  async function ownerWithCard(email = "ada@example.com") {
    const owner = await makeUser(email);
    const [card] = await db
      .insert(cards)
      .values({
        ownerUserId: owner.id,
        displayName: "Ada Lane",
        title: "Designer",
        slug: `ada-${owner.id}`,
        published: true,
      })
      .returning();
    return { owner, card };
  }

  it("accepts lead 10, refuses lead 11 before saving it, and closes the public form", async () => {
    const { owner, card } = await ownerWithCard();
    for (let i = 0; i < 10; i += 1)
      await publicCaller().publicCard.exchange({
        cardId: card.id,
        name: `Visitor ${i}`,
      });
    await expect(
      publicCaller().publicCard.exchange({
        cardId: card.id,
        name: "Visitor 11",
        email: "v11@example.com",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [saved] = await db
      .select({ n: count() })
      .from(contacts)
      .where(eq(contacts.ownerUserId, owner.id));
    expect(saved.n).toBe(10);
    const page = await publicCaller().publicCard.bySlug({ slug: card.slug });
    expect(page?.acceptsDetails).toBe(false);
    const me = await callerFor(owner).billing.me();
    expect(me.usage.leads).toMatchObject({
      used: 10,
      limit: 10,
      state: "paused",
    });
  });

  it("leaves lead capture unlimited while plan limits are off", async () => {
    ENV.planLimitsEnabled = false;
    const { card } = await ownerWithCard();
    for (let i = 0; i < 12; i += 1)
      await publicCaller().publicCard.exchange({
        cardId: card.id,
        name: `Visitor ${i}`,
      });
    expect(
      (await publicCaller().publicCard.bySlug({ slug: card.slug }))
        ?.acceptsDetails
    ).toBe(true);
  });

  it("keeps lead capture open for complimentary owners", async () => {
    ENV.complimentaryEmails = ["owner@example.com"];
    const { card } = await ownerWithCard("owner@example.com");
    for (let i = 0; i < 12; i += 1)
      await publicCaller().publicCard.exchange({
        cardId: card.id,
        name: `Visitor ${i}`,
      });
    expect(
      (await publicCaller().publicCard.bySlug({ slug: card.slug }))
        ?.acceptsDetails
    ).toBe(true);
  });

  it("blocks a second Free card but keeps the first", async () => {
    const { owner } = await ownerWithCard();
    await expect(
      callerFor(owner).cards.create({ displayName: "Second", title: "x" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await callerFor(owner).cards.list()).toHaveLength(1);
  });

  it("refuses longer insights ranges on Free and allows 7 days", async () => {
    const { owner } = await ownerWithCard();
    await expect(
      callerFor(owner).insights.summary({ days: 30 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      callerFor(owner).insights.summary({ days: 7 })
    ).resolves.toMatchObject({ days: 7 });
  });

  it("refuses turning on branding removal on Free, but keeps it on a card that already has it", async () => {
    const { owner, card } = await ownerWithCard();
    await expect(
      callerFor(owner).cards.update({
        id: card.id,
        displayName: "Ada Lane",
        title: "Designer",
        page: JSON.stringify({ template: "professional", hideBranding: true }),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db
      .update(cards)
      .set({
        page: JSON.stringify({ template: "professional", hideBranding: true }),
      })
      .where(eq(cards.id, card.id));
    await expect(
      callerFor(owner).cards.update({
        id: card.id,
        displayName: "Ada L.",
        title: "Designer",
        page: JSON.stringify({ template: "professional", hideBranding: true }),
      })
    ).resolves.toBeTruthy();
  });

  it("allows up to 2 portfolio photos on Free and refuses a 3rd photo, but keeps existing photos above limit", async () => {
    const { owner, card } = await ownerWithCard("photo-free@example.com");
    const twoPhotos = JSON.stringify([
      { id: "1", kind: "image", url: "https://example.com/1.jpg" },
      { id: "2", kind: "image", url: "https://example.com/2.jpg" },
    ]);
    const threePhotos = JSON.stringify([
      { id: "1", kind: "image", url: "https://example.com/1.jpg" },
      { id: "2", kind: "image", url: "https://example.com/2.jpg" },
      { id: "3", kind: "image", url: "https://example.com/3.jpg" },
    ]);
    await expect(
      callerFor(owner).cards.update({
        id: card.id,
        displayName: "Ada Lane",
        portfolio: twoPhotos,
      })
    ).resolves.toBeTruthy();

    await expect(
      callerFor(owner).cards.update({
        id: card.id,
        displayName: "Ada Lane",
        portfolio: threePhotos,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Existing cards above limit (e.g. from previous Pro subscription) stay safe
    await db
      .update(cards)
      .set({ portfolio: threePhotos })
      .where(eq(cards.id, card.id));

    await expect(
      callerFor(owner).cards.update({
        id: card.id,
        displayName: "Ada Lane Updated",
        portfolio: threePhotos,
      })
    ).resolves.toBeTruthy();
  });
});

describe("Pro 299 tools", () => {
  async function owner(pro = false) {
    const u = await makeUser();
    if (pro)
      await db
        .insert(entitlementOverrides)
        .values({
          userId: u.id,
          entitlement: "plan",
          valueJson: '"pro"',
          reason: "test",
        });
    return u;
  }
  it("rejects client price injection",async()=>{
    const user=await owner();
    await expect(callerFor(user).billing.createCheckout({planCode:"pro",billingCycle:"monthly",channel:"googlepay",amountMinor:1} as never)).rejects.toMatchObject({code:"BAD_REQUEST"});
    expect(gateway.requests).toHaveLength(0);
  });
  it("checks every premium surface independently",async()=>{
    ENV.proDesignEnabled=true;
    const caller=callerFor(await owner());
    const pages=[{design:designSchema.parse({theme:"aurora"})},{design:designSchema.parse({font:"Inter"})},{design:designSchema.parse({colors:["#FFFFFF","#F8FAFC"],text:"#111111"})},{design:designSchema.parse({backgroundType:"glass"})},{design:designSchema.parse({animation:{preset:"floating-profile",intensity:"subtle"}})},{qr:{rounded:true}},{accent:"#008800"}];
    for(const page of pages)await expect(caller.cards.create({displayName:"Test",title:"Designer",page:JSON.stringify(page)})).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("honors rollout flags without granting premium writes to Free",async()=>{
    ENV.proDesignEnabled=false;
    const caller=callerFor(await owner(true));
    await expect(caller.cards.create({displayName:"Test",title:"Designer",page:JSON.stringify({design:designSchema.parse({font:"Inter"})})})).rejects.toMatchObject({code:"FORBIDDEN"});
    ENV.qrCampaignsEnabled=false;
    const card=await caller.cards.create({displayName:"Basic",title:"Designer"});
    await expect(caller.qrCampaigns.create({cardId:card.id,name:"Event"})).rejects.toMatchObject({code:"PRECONDITION_FAILED"});
  });
  it("gives subscribed Pro unlimited contact exchanges",async()=>{
    const u=await owner(true);const card=await callerFor(u).cards.create({displayName:"Pro",title:"Designer",published:true});
    for(let i=0;i<12;i++)await publicCaller().publicCard.exchange({cardId:card.id,name:`Visitor ${i}`});
    expect((await callerFor(u).billing.me()).usage.leads).toMatchObject({used:12,limit:null});
  });
  it("allows Pro cards 1 through 5 and refuses card 6", async () => {
    const u = await owner(true);
    const caller = callerFor(u);
    for (let i = 1; i <= 5; i++)
      await caller.cards.create({
        displayName: `Card ${i}`,
        title: "Designer",
      });
    expect(await caller.cards.list()).toHaveLength(5);
    await expect(
      caller.cards.create({ displayName: "Sixth", title: "Designer" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects premium design and QR writes on Free, accepts them on Pro", async () => {
    ENV.proDesignEnabled = true;
    const free = callerFor(await owner());
    const pro = callerFor(await owner(true));
    const page = JSON.stringify({
      design: designSchema.parse({
        animation: { preset: "aurora", intensity: "subtle" },
      }),
      qr: { foreground: "#111111", background: "#FFFFFF", rounded: true },
    });
    await expect(
      free.cards.create({ displayName: "Free", title: "Designer", page })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      pro.cards.create({ displayName: "Pro", title: "Designer", page })
    ).resolves.toBeTruthy();
  });
  it("allows Free to save every free palette and refuses unreadable actions", async () => {
    const caller = callerFor(await owner());
    const card = await caller.cards.create({
      displayName: "Free",
      title: "Designer",
    });
    const { COLORS } = await import("@shared/design");
    for (const [, background, text] of COLORS.slice(0, 6))
      await caller.cards.update({
        id: card.id,
        displayName: "Free",
        title: "Designer",
        page: JSON.stringify({
          design: designSchema.parse({ colors: [background], text }),
        }),
      });
    await expect(
      caller.cards.update({
        id: card.id,
        displayName: "Free",
        title: "Designer",
        page: JSON.stringify({
          design: designSchema.parse({ buttonText: "#1D4ED8" }),
        }),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("enforces CRM and CSV permissions and isolates owners", async () => {
    const f = await owner();
    const p = await owner(true);
    const other = await owner(true);
    const [contact] = await db
      .insert(contacts)
      .values({
        ownerUserId: p.id,
        name: "=HYPERLINK(bad)",
        email: "person@example.com",
      })
      .returning();
    await expect(callerFor(f).contacts.export()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      callerFor(f).contacts.update({ id: contact.id, notes: "changed" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      callerFor(other).contacts.update({ id: contact.id, status: "converted" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const updated = await callerFor(p).contacts.update({
      id: contact.id,
      status: "follow-up",
      tags: ["conference"],
      notes: "Call tomorrow",
      followUpOn: "2026-11-01",
    });
    expect(updated).toMatchObject({
      status: "follow-up",
      notes: "Call tomorrow",
    });
    expect(await callerFor(p).contacts.export()).toContain("'=HYPERLINK(bad)");
    expect(await callerFor(other).contacts.export()).not.toContain(
      "person@example.com"
    );
  });
  it("creates and tracks campaigns only for owned cards and valid ids", async () => {
    ENV.qrCampaignsEnabled = true;
    ENV.proAnalyticsEnabled = true;
    const p = await owner(true);
    const f = await owner();
    const other = await owner(true);
    const card = await callerFor(p).cards.create({
      displayName: "Pro",
      title: "Designer",
      published: true,
    });
    await expect(
      callerFor(f).qrCampaigns.create({ cardId: card.id, name: "Free" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      callerFor(other).qrCampaigns.create({ cardId: card.id, name: "Other" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const campaign = await callerFor(p).qrCampaigns.create({
      cardId: card.id,
      name: "Conference",
    });
    expect(
      await publicCaller().qrCampaigns.scan({
        cardId: card.id,
        campaignId: campaign.id,
      })
    ).toEqual({ ok: true });
    expect(
      await publicCaller().qrCampaigns.scan({
        cardId: card.id,
        campaignId: "unknown",
      })
    ).toEqual({ ok: false });
    const exchange = await publicCaller().publicCard.exchange({
      cardId: card.id,
      name: "Visitor",
      campaignId: campaign.id,
    });
    expect(exchange).toMatchObject({ campaignId: campaign.id });
    const summary = await callerFor(p).insights.summary({ days: 365 });
    expect(summary.advanced?.qrScans).toBe(1);
    expect(summary.advanced?.campaigns[0]).toMatchObject({
      name: "Conference",
      scans: 1,
    });
    expect(
      (await callerFor(f).insights.summary({ days: 7 })).advanced
    ).toBeNull();
  });
  it("keeps existing premium cards editable after downgrade and blocks new creation", async () => {
    ENV.proDesignEnabled = true;
    const u = await owner(true);
    const caller = callerFor(u);
    const page = JSON.stringify({
      design: designSchema.parse({ font: "Inter" }),
    });
    const first = await caller.cards.create({
      displayName: "First",
      title: "Designer",
      published: true,
      page,
    });
    await caller.cards.create({
      displayName: "Second",
      title: "Designer",
      published: true,
    });
    await db
      .delete(entitlementOverrides)
      .where(eq(entitlementOverrides.userId, u.id));
    expect(await caller.cards.list()).toHaveLength(2);
    await expect(
      caller.cards.update({
        id: first.id,
        displayName: "Renamed",
        title: "Designer",
        page,
      })
    ).resolves.toMatchObject({ published: true, slug: first.slug });
    await expect(
      caller.cards.create({ displayName: "Third", title: "Designer" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
