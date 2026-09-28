import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cards, offerCounters, payments, subscriptions, users } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import type { PaymentResult } from "./provider";
import { BILLING_SCHEMA_STATEMENTS } from "./schemaSql";
import {
  cancelAtPeriodEnd,
  countOwnedCards,
  createCardWithinLimit,
  foundingPriceEligible,
  getLeadUsage,
  getOrCreateBillingAccount,
  getUserEntitlements,
  PlanLimitError,
  releaseLead,
  reserveLead,
  settlePayment,
  type Db,
} from "./service";
import { createTestDb } from "./testDb";

let db: Db;
let close: () => Promise<void>;
const saved = { ...ENV };

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db as unknown as Db;
  close = () => test.client.close();
  ENV.planLimitsEnabled = true;
  ENV.foundingOfferEnabled = true;
  ENV.complimentaryEmails = [];
});

afterEach(async () => {
  Object.assign(ENV, saved);
  await close();
});

const NOW = new Date("2026-10-05T04:00:00Z");

async function user(email = "ada@example.com") {
  const [row] = await db.insert(users).values({ openId: `g-${Math.random()}`, email }).returning();
  return row;
}

async function pendingPayment(userId: number, overrides: Partial<typeof payments.$inferInsert> = {}) {
  const account = await getOrCreateBillingAccount(db, userId);
  const invoice = `INV${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
  await db.insert(payments).values({
    billingAccountId: account.id,
    userId,
    provider: "2c2p",
    providerTransactionId: invoice,
    purpose: "subscription",
    planCode: "pro",
    billingCycle: "annual",
    amountMinor: 999_00,
    foundingPrice: true,
    status: "pending",
    ...overrides,
  });
  return invoice;
}

const paid = (invoiceNo: string, amountMinor = 999_00, status: PaymentResult["status"] = "succeeded"): PaymentResult => ({
  invoiceNo,
  status,
  amountMinor,
  currency: "PHP",
  providerRef: `T-${invoiceNo}`,
  channelCode: "GOOGLEPAY",
  code: status === "succeeded" ? "0000" : "4200",
});

describe("billing schema", () => {
  it("ensureSchema runs exactly the statements of drizzle/0009_billing.sql", () => {
    const file = readFileSync(path.resolve(__dirname, "../../drizzle/0009_billing.sql"), "utf8");
    const statements = file
      .split("\n")
      .filter((line) => !line.startsWith("--"))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect([...BILLING_SCHEMA_STATEMENTS]).toEqual(statements);
  });

  it("seeds the founding counter at 500", async () => {
    const [row] = await db.select().from(offerCounters);
    expect(row).toMatchObject({ code: "founding_pro", used: 0, maximum: 500 });
  });
});

describe("settlePayment", () => {
  it("activates twelve months of Pro and a founding number on a verified success", async () => {
    const u = await user();
    const invoice = await pendingPayment(u.id);
    const outcome = await settlePayment(db, paid(invoice), NOW);
    expect(outcome).toMatchObject({ outcome: "activated", foundingMemberNumber: 1 });
    const ent = await getUserEntitlements(db, u, NOW);
    expect(ent.plan).toBe("pro");
    expect(ent.foundingMember).toBe(true);
    expect(ent.accessEndsAt?.toISOString()).toBe("2027-10-05T04:00:00.000Z");
  });

  it("is idempotent: a replayed callback changes nothing", async () => {
    const u = await user();
    const invoice = await pendingPayment(u.id);
    await settlePayment(db, paid(invoice), NOW);
    const replay = await settlePayment(db, paid(invoice), new Date("2026-10-06T00:00:00Z"));
    expect(replay.outcome).toBe("already_settled");
    const subs = await db.select().from(subscriptions);
    expect(subs).toHaveLength(1);
    expect(subs[0].currentPeriodEnd.toISOString()).toBe("2027-10-05T04:00:00.000Z");
    const [counter] = await db.select().from(offerCounters);
    expect(counter.used).toBe(1);
  });

  it("does not unlock Pro for a failed payment", async () => {
    const u = await user();
    const invoice = await pendingPayment(u.id);
    const outcome = await settlePayment(db, paid(invoice, 999_00, "failed"), NOW);
    expect(outcome.outcome).toBe("not_paid");
    expect((await getUserEntitlements(db, u, NOW)).plan).toBe("free");
    const [row] = await db.select().from(payments).where(eq(payments.providerTransactionId, invoice));
    expect(row.status).toBe("failed");
  });

  it("rejects a success whose amount differs from the server quote", async () => {
    const u = await user();
    const invoice = await pendingPayment(u.id);
    const outcome = await settlePayment(db, paid(invoice, 1_00), NOW);
    expect(outcome).toMatchObject({ outcome: "rejected", reason: "amount_mismatch" });
    expect((await getUserEntitlements(db, u, NOW)).plan).toBe("free");
  });

  it("ignores an invoice it never issued", async () => {
    expect((await settlePayment(db, paid("NOTOURS1"), NOW)).outcome).toBe("unknown_invoice");
  });

  it("never gives out more founding numbers than the maximum, and a late payer still gets the term", async () => {
    await db.update(offerCounters).set({ maximum: 2 });
    const numbers: (number | null)[] = [];
    for (let i = 0; i < 3; i += 1) {
      const u = await user(`p${i}@example.com`);
      const outcome = await settlePayment(db, paid(await pendingPayment(u.id)), NOW);
      if (outcome.outcome !== "activated") throw new Error("expected activation");
      numbers.push(outcome.foundingMemberNumber);
      expect((await getUserEntitlements(db, u, NOW)).plan).toBe("pro");
    }
    expect(numbers).toEqual([1, 2, null]);
  });

  it("caps founding numbers when payments settle at the same time", async () => {
    await db.update(offerCounters).set({ maximum: 5 });
    const invoices = [];
    for (let i = 0; i < 12; i += 1) invoices.push(await pendingPayment((await user(`c${i}@example.com`)).id));
    // PGlite runs one connection, so this checks the statement logic under interleaved calls, not true parallel sessions.
    const outcomes = await Promise.all(invoices.map((invoice) => settlePayment(db, paid(invoice), NOW)));
    const numbers = outcomes.flatMap((o) => (o.outcome === "activated" && o.foundingMemberNumber !== null ? [o.foundingMemberNumber] : []));
    expect(numbers.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    const [counter] = await db.select().from(offerCounters);
    expect(counter.used).toBe(5);
  });

  it("renewing extends from the current end date and keeps the founding number", async () => {
    const u = await user();
    await settlePayment(db, paid(await pendingPayment(u.id)), NOW);
    const renewal = await pendingPayment(u.id, { purpose: "renewal" });
    const outcome = await settlePayment(db, paid(renewal), new Date("2027-09-20T00:00:00Z"));
    expect(outcome).toMatchObject({ outcome: "activated", foundingMemberNumber: 1 });
    if (outcome.outcome === "activated") expect(outcome.periodEnd.toISOString()).toBe("2028-10-05T04:00:00.000Z");
  });
});

describe("subscription lifecycle", () => {
  it("cancel keeps Pro until the period ends, then returns to Free with cards intact", async () => {
    const u = await user();
    await settlePayment(db, paid(await pendingPayment(u.id)), NOW);
    for (let i = 0; i < 3; i += 1) await db.insert(cards).values({ ownerUserId: u.id, displayName: `Card ${i}`, title: "", slug: `card-${u.id}-${i}` });
    await cancelAtPeriodEnd(db, u.id, NOW);
    expect((await getUserEntitlements(db, u, new Date("2027-10-01T00:00:00Z"))).plan).toBe("pro");
    const after = await getUserEntitlements(db, u, new Date("2027-10-06T00:00:00Z"));
    expect(after.plan).toBe("free");
    expect(await countOwnedCards(db, u.id)).toBe(3);
  });

  it("a lapsed founding member pays the standard price again", async () => {
    const u = await user();
    await settlePayment(db, paid(await pendingPayment(u.id)), NOW);
    expect(await foundingPriceEligible(db, u.id, new Date("2027-01-01T00:00:00Z"))).toBe(true);
    expect(await foundingPriceEligible(db, u.id, new Date("2028-01-01T00:00:00Z"))).toBe(false);
  });

  it("complimentary accounts keep every feature with no subscription", async () => {
    ENV.complimentaryEmails = ["owner@example.com"];
    const u = await user("Owner@Example.com");
    const ent = await getUserEntitlements(db, u, NOW);
    expect(ent).toMatchObject({ plan: "teams", source: "complimentary", canRemoveBranding: true, teamsAccess: true, accessEndsAt: null });
    expect(ent.limits.monthlyLeads).toBeNull();
    expect(ent.limits.analyticsDays).toBe(365);
  });
});

describe("free lead quota", () => {
  it("accepts 10 leads a month and refuses the 11th", async () => {
    const u = await user();
    const results = [];
    for (let i = 0; i < 11; i += 1) results.push(await reserveLead(db, u.id, 10, NOW));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(results[10]).toBe(false);
    expect(await getLeadUsage(db, u.id, 10, NOW)).toEqual({ used: 10, limit: 10, period: "2026-10" });
  });

  it("never passes the limit for interleaved submissions", async () => {
    const u = await user();
    const results = await Promise.all(Array.from({ length: 25 }, () => reserveLead(db, u.id, 10, NOW)));
    expect(results.filter(Boolean)).toHaveLength(10);
  });

  it("starts a new quota at midnight Philippine time on the 1st", async () => {
    const u = await user();
    for (let i = 0; i < 10; i += 1) await reserveLead(db, u.id, 10, new Date("2026-10-31T15:59:00Z"));
    expect(await reserveLead(db, u.id, 10, new Date("2026-10-31T15:59:30Z"))).toBe(false);
    // 2026-11-01 00:00 in Manila is 2026-10-31 16:00 UTC.
    expect(await reserveLead(db, u.id, 10, new Date("2026-10-31T16:00:00Z"))).toBe(true);
  });

  it("gives a lead back when the save fails", async () => {
    const u = await user();
    for (let i = 0; i < 10; i += 1) await reserveLead(db, u.id, 10, NOW);
    await releaseLead(db, u.id, NOW);
    expect(await reserveLead(db, u.id, 10, NOW)).toBe(true);
  });

  it("counts unlimited accounts without refusing", async () => {
    const u = await user();
    for (let i = 0; i < 30; i += 1) expect(await reserveLead(db, u.id, null, NOW)).toBe(true);
    expect((await getLeadUsage(db, u.id, null, NOW)).used).toBe(30);
  });
});

describe("card limit", () => {
  const card = (ownerUserId: number, n: number, creationKey?: string) => ({ ownerUserId, displayName: `Card ${n}`, title: "", slug: `s-${ownerUserId}-${n}-${Math.random()}`, creationKey });

  it("lets Free create one card and refuses the second", async () => {
    const u = await user();
    await createCardWithinLimit(db, card(u.id, 1), 1);
    await expect(createCardWithinLimit(db, card(u.id, 2), 1)).rejects.toBeInstanceOf(PlanLimitError);
    expect(await countOwnedCards(db, u.id)).toBe(1);
  });

  it("returns the existing card for a retried create, even at the limit", async () => {
    const u = await user();
    const first = await createCardWithinLimit(db, card(u.id, 1, "key-1"), 1);
    const retry = await createCardWithinLimit(db, card(u.id, 1, "key-1"), 1);
    expect(retry.id).toBe(first.id);
  });

  it("keeps existing cards above the limit and only blocks new ones", async () => {
    const u = await user();
    for (let i = 0; i < 4; i += 1) await db.insert(cards).values(card(u.id, i));
    await expect(createCardWithinLimit(db, card(u.id, 9), 1)).rejects.toBeInstanceOf(PlanLimitError);
    expect(await countOwnedCards(db, u.id)).toBe(4);
  });

  // PGlite has one connection, so this cannot prove the advisory lock under truly parallel sessions
  // (removing the lock still passes here). It checks the interleaved path; the lock needs a real Postgres to test.
  it("holds the limit for interleaved creates", async () => {
    const u = await user();
    const results = await Promise.allSettled([createCardWithinLimit(db, card(u.id, 1), 1), createCardWithinLimit(db, card(u.id, 2), 1)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(Number((await db.execute(sql`select count(*)::int as n from "cards"`) as unknown as { rows: { n: number }[] }).rows[0].n)).toBe(1);
  });
});
