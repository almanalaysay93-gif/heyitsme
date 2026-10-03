import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import {
  addCycle,
  FOUNDING_MEMBER_LIMIT,
  quotaPeriodKey,
  resolveEntitlements,
  subscriptionGrantsAccess,
  type BillingCycle,
  type Entitlements,
  type LeadUsage,
  type PaidPlanCode,
  type SubscriptionSnapshot,
} from "@shared/plans";
import {
  billingAccounts,
  cards,
  entitlementOverrides,
  offerCounters,
  payments,
  subscriptions,
  type InsertCard,
  type Payment,
} from "../../drizzle/schema";
import { ENV } from "../_core/env";
import type { PaymentResult } from "./provider";

// Every rule that decides what an account may do lives here or in shared/plans.ts. Routers call these,
// and components only render what billing.me returns. Functions take the database so tests can pass PGlite.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, any, any>;

export const FOUNDING_OFFER_CODE = "founding_pro";
export const LEAD_METRIC = "leads";

export function isComplimentary(email: string | null | undefined): boolean {
  return (
    Boolean(email) && ENV.complimentaryEmails.includes(email!.trim().toLowerCase()));
}

export async function getOrCreateBillingAccount(db: Db, userId: number) {
  const [existing] = await db.select().from(billingAccounts).where(eq(billingAccounts.ownerUserId, userId)).limit(1);
  if (existing) return existing;
  await db.insert(billingAccounts).values({ ownerType: "user", ownerUserId: userId, provider: ENV.paymentProvider,
    }).onConflictDoNothing();
  const [created] = await db.select().from(billingAccounts).where(eq(billingAccounts.ownerUserId, userId)).limit(1);
  return created;
}

export async function getUserSubscriptions(db: Db, userId: number) {
  return db
    .select({ sub: subscriptions })
    .from(subscriptions)
    .innerJoin(billingAccounts, eq(billingAccounts.id, subscriptions.billingAccountId))
    .where(eq(billingAccounts.ownerUserId, userId))
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .then(rows => rows.map(row => row.sub));
}

const toSnapshot = (sub: typeof subscriptions.$inferSelect): SubscriptionSnapshot => ({
  planCode: "pro",
  status: sub.status as SubscriptionSnapshot["status"],
  currentPeriodEnd: sub.currentPeriodEnd,
  cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  foundingMember: sub.foundingMember,
});

async function getPlanOverride(db: Db, userId: number, now: Date) {
  const rows = await db
    .select()
    .from(entitlementOverrides)
    .where(and(eq(entitlementOverrides.userId, userId), eq(entitlementOverrides.entitlement, "plan")))
    .orderBy(desc(entitlementOverrides.createdAt))
    .limit(5);
  for (const row of rows) {
    if (row.expiresAt && row.expiresAt <= now) continue;
    try {
      const plan = JSON.parse(row.valueJson);
      if (plan === "pro" || plan === "teams") return { plan: "pro" as PaidPlanCode, expiresAt: row.expiresAt };
    } catch {
      // A malformed override grants nothing.
    }
  }
  return null;
}

export async function getUserEntitlements(db: Db, user: { id: number; email: string | null }, now = new Date()): Promise<Entitlements> {
  const complimentary = isComplimentary(user.email);
  if (complimentary) return resolveEntitlements({ limitsEnabled: ENV.planLimitsEnabled, complimentary, subscriptions: [], now,
    });
  const [subs, override] = await Promise.all([getUserSubscriptions(db, user.id), getPlanOverride(db, user.id, now),
  ]);
  return resolveEntitlements({
    limitsEnabled: ENV.planLimitsEnabled,
    complimentary: false,
    override,
    subscriptions: subs.map(toSnapshot),
    now,
  });
}

export async function countOwnedCards(db: Db, ownerUserId: number) {
  const [row] = await db.select({ n: count() }).from(cards).where(and(eq(cards.ownerUserId, ownerUserId), isNull(cards.deletedAt)));
  return Number(row?.n ?? 0);
}

export class PlanLimitError extends Error {
  constructor(readonly reason:
      | "card_limit" | "lead_limit" | "analytics_range" | "branding") {
    super(reason);
  }
}

/**
 * Creates a card unless the owner is at their card limit. A per-owner advisory lock makes the count and the
 * insert one step, so two tabs cannot both slip past the limit. Cards above the limit are never touched.
 */
export async function createCardWithinLimit(db: Db, input: InsertCard, cardLimit: number) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`card-create:${input.ownerUserId}`}))`);
    if (input.creationKey) {
      const [existing] = await tx
        .select()
        .from(cards)
        .where(and(eq(cards.ownerUserId, input.ownerUserId), eq(cards.creationKey, input.creationKey)))
        .limit(1);
      // A retried create returns the card it already made, even at the limit.
      if (existing) return existing;
    }
    const owned = await countOwnedCards(tx as unknown as Db, input.ownerUserId);
    if (owned >= cardLimit) throw new PlanLimitError("card_limit");
    const [created] = await tx.insert(cards).values(input).returning();
    return created;
  });
}

export async function getLeadUsage(db: Db, ownerUserId: number, limit: number | null, now = new Date()): Promise<LeadUsage> {
  const period = quotaPeriodKey(now);
  const [row] = await db.execute<{ count: number;
    }>(
    sql`select "count" from "usageCounters" where "ownerUserId" = ${ownerUserId} and "metric" = ${LEAD_METRIC} and "periodKey" = ${period}`)
    .then(result =>
      Array.isArray(result)
        ? result
        : (result as { rows: { count: number }[] }).rows
    );
  return { used: Number(row?.count ?? 0), limit, period };
}

/**
 * Takes one lead from this month's quota in a single statement. Returns false when the quota is used up.
 * Unlimited accounts still count, so usage shows correctly after a downgrade.
 */
export async function reserveLead(
  db: Db,
  ownerUserId: number,
  limit: number | null,
  now = new Date()
): Promise<boolean> {
  const period = quotaPeriodKey(now);
  const guard =
    limit === null ? sql`` : sql` where "usageCounters"."count" < ${limit}`;
  const result = await db.execute(sql`
    insert into "usageCounters" ("ownerUserId", "metric", "periodKey", "count", "updatedAt")
    values (${ownerUserId}, ${LEAD_METRIC}, ${period}, 1, now())
    on conflict ("ownerUserId", "metric", "periodKey")
    do update set "count" = "usageCounters"."count" + 1, "updatedAt" = now()${guard}
    returning "count"`);
  const rows = Array.isArray(result)
    ? result
    : (result as { rows: unknown[] }).rows;
  return rows.length > 0;
}

/** Gives a reserved lead back when saving the contact failed after the reservation. */
export async function releaseLead(
  db: Db,
  ownerUserId: number,
  now = new Date()
) {
  await db.execute(sql`
    update "usageCounters" set "count" = greatest("count" - 1, 0), "updatedAt" = now()
    where "ownerUserId" = ${ownerUserId} and "metric" = ${LEAD_METRIC} and "periodKey" = ${quotaPeriodKey(now)}`);
}

export async function foundingSlotsRemaining(db: Db) {
  const [row] = await db
    .select()
    .from(offerCounters)
    .where(eq(offerCounters.code, FOUNDING_OFFER_CODE))
    .limit(1);
  if (!row) return FOUNDING_MEMBER_LIMIT;
  return Math.max(row.maximum - row.used, 0);
}

/**
 * Founding price applies to a first Pro subscription, or to renewing one that is still a founding membership.
 * A lapsed founding member pays the standard price again (admin can override).
 */
export async function foundingPriceEligible(
  db: Db,
  userId: number,
  now = new Date()
) {
  if (!ENV.foundingOfferEnabled) return false;
  const subs = await getUserSubscriptions(db, userId);
  const pro = subs.filter(sub => sub.planCode === "pro");
  if (pro.length === 0) return (await foundingSlotsRemaining(db)) > 0;
  return pro.some(
    sub => sub.foundingMember && subscriptionGrantsAccess(toSnapshot(sub), now)
  );
}

export type SettleOutcome =
  | { outcome: "unknown_invoice" }
  | { outcome: "already_settled"; userId: number }
  | { outcome: "not_paid"; userId: number; status: Payment["status"] }
  | { outcome: "rejected"; userId: number; reason: string }
  | {
      outcome: "activated";
      userId: number;
      subscriptionId: number;
      foundingMemberNumber: number | null;
      periodEnd: Date;
    };

/**
 * Applies a gateway result that was already verified (signature, then a direct inquiry). One transaction:
 * the payment row is locked, so a repeated callback finds it settled and changes nothing.
 */
export async function settlePayment(
  db: Db,
  result: PaymentResult,
  now = new Date()
): Promise<SettleOutcome> {
  return db.transaction(async tx => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.providerTransactionId, result.invoiceNo))
      .for("update")
      .limit(1);
    if (!payment) return { outcome: "unknown_invoice" } as const;
    if (payment.status === "succeeded")
      return { outcome: "already_settled", userId: payment.userId } as const;

    if (result.status !== "succeeded") {
      await tx
        .update(payments)
        .set({
          status: result.status === "pending" ? "pending" : "failed",
          failureCode: result.status === "failed" ? result.code : null,
          updatedAt: now,
        })
        .where(eq(payments.id, payment.id));
      return {
        outcome: "not_paid",
        userId: payment.userId,
        status: result.status,
      } as const;
    }

    // Never trust an amount we did not quote.
    if (
      result.amountMinor !== payment.amountMinor ||
      result.currency !== payment.currency
    ) {
      await tx
        .update(payments)
        .set({
          status: "failed",
          failureCode: "amount_mismatch",
          failureMessage: "Paid amount did not match the quote",
          updatedAt: now,
        })
        .where(eq(payments.id, payment.id));
      return {
        outcome: "rejected",
        userId: payment.userId,
        reason: "amount_mismatch",
      } as const;
    }

    await tx
      .update(payments)
      .set({
        status: "succeeded",
        succeededAt: now,
        updatedAt: now,
        providerInvoiceRef: result.providerRef,
        failureCode: null,
        failureMessage: null,
      })
      .where(eq(payments.id, payment.id));

    if (
      (payment.purpose !== "subscription" && payment.purpose !== "renewal") ||
      !payment.billingAccountId ||
      !payment.planCode ||
      !payment.billingCycle
    ) {
      return {
        outcome: "rejected",
        userId: payment.userId,
        reason: "unsupported_purpose",
      } as const;
    }
    const plan = payment.planCode as PaidPlanCode;
    const cycle = payment.billingCycle as BillingCycle;

    const accountSubs = await tx
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.billingAccountId, payment.billingAccountId),
          eq(subscriptions.planCode, plan)
        )
      )
      .orderBy(desc(subscriptions.currentPeriodEnd))
      .for("update");
    const current = accountSubs.find(sub =>
      subscriptionGrantsAccess(toSnapshot(sub), now)
    );

    let foundingNumber = current?.foundingMember
      ? current.foundingMemberNumber
      : null;
    if (payment.foundingPrice && plan === "pro" && foundingNumber === null) {
      // One conditional UPDATE: the row lock serializes concurrent payers and `used < maximum` caps the count.
      const [slot] = await tx
        .update(offerCounters)
        .set({ used: sql`${offerCounters.used} + 1`, updatedAt: now })
        .where(
          and(
            eq(offerCounters.code, FOUNDING_OFFER_CODE),
            sql`${offerCounters.used} < ${offerCounters.maximum}`
          )
        )
        .returning({ used: offerCounters.used });
      // The last slot went to someone else: the buyer keeps the paid term, without founding status.
      foundingNumber = slot ? slot.used : null;
    }
    const founding = foundingNumber !== null;

    if (current) {
      const periodEnd = addCycle(
        current.currentPeriodEnd > now ? current.currentPeriodEnd : now,
        cycle
      );
      await tx
        .update(subscriptions)
        .set({
          status: "active",
          billingCycle: cycle,
          priceMinor: payment.amountMinor,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          foundingMember: founding,
          foundingMemberNumber: foundingNumber,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, current.id));
      return {
        outcome: "activated",
        userId: payment.userId,
        subscriptionId: current.id,
        foundingMemberNumber: foundingNumber,
        periodEnd,
      } as const;
    }

    const periodEnd = addCycle(now, cycle);
    const [created] = await tx
      .insert(subscriptions)
      .values({
        billingAccountId: payment.billingAccountId,
        planCode: plan,
        billingCycle: cycle,
        status: "active",
        currency: payment.currency,
        priceMinor: payment.amountMinor,
        foundingMember: founding,
        foundingMemberNumber: foundingNumber,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning({ id: subscriptions.id });
    return {
      outcome: "activated",
      userId: payment.userId,
      subscriptionId: created.id,
      foundingMemberNumber: foundingNumber,
      periodEnd,
    } as const;
  });
}

/** Stops renewal reminders. Access continues until the period ends; nothing is deleted. */
export async function cancelAtPeriodEnd(
  db: Db,
  userId: number,
  now = new Date()
) {
  const subs = await getUserSubscriptions(db, userId);
  const current = subs.find(
    sub =>
      subscriptionGrantsAccess(toSnapshot(sub), now) && sub.status === "active"
  );
  if (!current) return null;
  const [updated] = await db
    .update(subscriptions)
    .set({
      status: "canceled",
      cancelAtPeriodEnd: true,
      canceledAt: now,
      updatedAt: now,
    })
    .where(eq(subscriptions.id, current.id))
    .returning();
  return updated;
}

/** Undo a cancel before the period ends. */
export async function resumeSubscription(
  db: Db,
  userId: number,
  now = new Date()
) {
  const subs = await getUserSubscriptions(db, userId);
  const current = subs.find(
    sub =>
      sub.status === "canceled" &&
      subscriptionGrantsAccess(toSnapshot(sub), now)
  );
  if (!current) return null;
  const [updated] = await db
    .update(subscriptions)
    .set({
      status: "active",
      cancelAtPeriodEnd: false,
      canceledAt: null,
      updatedAt: now,
    })
    .where(eq(subscriptions.id, current.id))
    .returning();
  return updated;
}

export async function getPaymentHistory(db: Db, userId: number) {
  return db
    .select({
      invoiceNo: payments.providerTransactionId,
      purpose: payments.purpose,
      planCode: payments.planCode,
      billingCycle: payments.billingCycle,
      channel: payments.channel,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      status: payments.status,
      createdAt: payments.createdAt,
      succeededAt: payments.succeededAt,
    })
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt))
    .limit(50);
}

export async function getPaymentForUser(
  db: Db,
  userId: number,
  invoiceNo: string
) {
  const [row] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.userId, userId),
        eq(payments.providerTransactionId, invoiceNo)
      )
    )
    .limit(1);
  return row;
}
