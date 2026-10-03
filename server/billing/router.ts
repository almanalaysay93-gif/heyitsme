import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  BILLING_CYCLES,
  PAYMENT_CHANNELS,
  PRICES_MINOR,
  allowedInsightRanges,
  leadUsageState,
  subscriptionGrantsAccess,
  type PaidPlanCode,
} from "@shared/plans";
import { ENV } from "../_core/env";
import { clientIp, hashIdentifier, rateLimit } from "../_core/rateLimit";
import { siteOrigin } from "../_core/seo";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { CheckoutClosedError, enabledChannels, enabledCycles, reconcileInvoice, startCheckout,
} from "./checkout";
import { notifyActivation } from "./paymentRoutes";
import { PaymentProviderError } from "./provider";
import {
  cancelAtPeriodEnd,
  countOwnedCards,
  getLeadUsage,
  getPaymentForUser,
  getPaymentHistory,
  getUserEntitlements,
  getUserSubscriptions,
  resumeSubscription,
} from "./service";

export async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable",
    });
  return db;
}

async function limitOrThrow(key: string, max: number, windowMs: number) {
  const result = await rateLimit(key, max, windowMs);
  if (!result.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many requests. Please wait a moment and try again.",
    });
}

const CLOSED_MESSAGES: Record<CheckoutClosedError["reason"], string> = {
  payments_off: "Checkout is not open yet.",
  channel_off: "That payment method is not available yet.",
  cycle_off: "Only monthly billing is available.",
  plan_off: "That plan is not available yet.",
};

/** Public, non-secret offer data for the pricing page. */
function offerFlags() {
  const channels = enabledChannels();
  return {
    checkoutOpen: channels.length > 0,
    channels,
    cycles: enabledCycles(),
    proDesignEnabled: ENV.proDesignEnabled,
    qrCampaignsEnabled: ENV.qrCampaignsEnabled,
    proAnalyticsEnabled: ENV.proAnalyticsEnabled,
    nfcStoreEnabled: ENV.nfcStoreEnabled,
    limitsEnforced: ENV.planLimitsEnabled,
  };
}

export const billingRouter = router({
  offer: publicProcedure.query(() => ({
      ...offerFlags(),
      prices: PRICES_MINOR,
  })),

  me: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const now = new Date();
    const ent = await getUserEntitlements(db, ctx.user, now);
    const [cardsUsed, leads, subs] = await Promise.all([
      countOwnedCards(db, ctx.user.id),
      getLeadUsage(db, ctx.user.id, ent.limits.monthlyLeads, now),
      getUserSubscriptions(db, ctx.user.id),
    ]);
    const current = subs.find(sub =>
      subscriptionGrantsAccess(
        { planCode: sub.planCode as PaidPlanCode, status: sub.status as never, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, foundingMember: sub.foundingMember,
        },
        now
      )
    );
    return {
      entitlements: ent,
      insightRanges: allowedInsightRanges(ent),
      usage: {
        cards: { used: cardsUsed, limit: ent.limits.cards },
        leads: { ...leads, state: leadUsageState(leads) },
      },
      subscription: current
        ? {
            planCode: current.planCode,
            billingCycle: current.billingCycle,
            status: current.status,
            currentPeriodEnd: current.currentPeriodEnd,
            cancelAtPeriodEnd: current.cancelAtPeriodEnd,
            foundingMember: current.foundingMember,
            foundingMemberNumber: current.foundingMemberNumber,
            priceMinor: current.priceMinor,
          }
        : null,
      ...offerFlags(),
    };
  }),

  createCheckout: protectedProcedure
    .input(z.object({ planCode: z.literal("pro"), billingCycle: z.enum(BILLING_CYCLES), channel: z.enum(PAYMENT_CHANNELS),
        })
        .strict())
    .mutation(async ({ ctx, input }) => {
      await limitOrThrow(`checkout:${hashIdentifier(String(ctx.user.id))}`,
        5,
        10 * 60_000
      );
      await limitOrThrow(
        `checkout-ip:${hashIdentifier(clientIp(ctx.req))}`,
        20,
        10 * 60_000
      );
      const db = await requireDb();
      try {
        const session = await startCheckout(
          db,
          ctx.user,
          input,
          siteOrigin(ctx.req)
        );
        return {
          invoiceNo: session.invoiceNo,
          redirectUrl: session.redirectUrl,
        };
      } catch (error) {
        if (error instanceof CheckoutClosedError)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: CLOSED_MESSAGES[error.reason],
          });
        if (error instanceof PaymentProviderError) {
          // Gateway wording can carry merchant details. Visitors get a plain message; the log keeps the code.
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Checkout could not open. Nothing was charged. Please try again in a few minutes.",
          });
        }
        throw error;
      }
    }),

  /** Status of one of the caller's own payments. While pending, asks the gateway directly (server to server). */
  paymentStatus: protectedProcedure
    .input(z.object({ invoiceNo: z.string().regex(/^[A-Za-z0-9]{1,50}$/) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      let payment = await getPaymentForUser(db, ctx.user.id, input.invoiceNo);
      if (!payment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found.",
        });
      if (
        (payment.status === "pending" || payment.status === "created") &&
        ENV.paymentsEnabled
      ) {
        const limit = await rateLimit(
          `payment-status:${hashIdentifier(String(ctx.user.id))}`,
          30,
          60_000
        );
        if (limit.allowed) {
          try {
            const outcome = await reconcileInvoice(db, input.invoiceNo);
            await notifyActivation(outcome, siteOrigin(ctx.req));
            payment =
              (await getPaymentForUser(db, ctx.user.id, input.invoiceNo)) ??
              payment;
          } catch (error) {
            console.warn(
              "[Billing] inquiry failed, showing stored status:",
              String(error)
            );
          }
        }
      }
      return {
        invoiceNo: payment.providerTransactionId,
        status: payment.status,
        amountMinor: payment.amountMinor,
        planCode: payment.planCode,
      };
    }),

  paymentHistory: protectedProcedure.query(async ({ ctx }) =>
    getPaymentHistory(await requireDb(), ctx.user.id)
  ),

  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const updated = await cancelAtPeriodEnd(await requireDb(), ctx.user.id);
    if (!updated)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No active plan to cancel.",
      });
    return { currentPeriodEnd: updated.currentPeriodEnd };
  }),

  resumeSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const updated = await resumeSubscription(await requireDb(), ctx.user.id);
    if (!updated)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No canceled plan to resume.",
      });
    return { currentPeriodEnd: updated.currentPeriodEnd };
  }),
});
