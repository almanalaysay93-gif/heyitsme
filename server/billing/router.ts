import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  BILLING_CYCLES,
  PAYMENT_CHANNELS,
  PRICES_MINOR,
  TEAMS_PLAN,
  allowedInsightRanges,
  leadUsageState,
  subscriptionGrantsAccess,
  type PaidPlanCode,
} from "@shared/plans";
import { and, asc, eq, isNull } from "drizzle-orm";
import { workspaceMembers, workspaces } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { clientIp, hashIdentifier, rateLimit } from "../_core/rateLimit";
import { siteOrigin } from "../_core/seo";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { requireWorkspaceOwner } from "../teams/access";
import { assertTeamCapability, teamPlanState } from "../teams/entitlements";
import { CheckoutClosedError, enabledChannels, enabledCycles, reconcileInvoice, startCheckout, startTeamCheckout, teamsCheckoutOpen,
} from "./checkout";
import { ownerCardHolds } from "./hold";
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
  teamOfPayment,
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
  team_free: "This team has no end date, so there is nothing to pay.",
};

/** Turns a checkout failure into a message a buyer can read. Gateway wording stays in the log. */
function checkoutError(error: unknown): never {
  if (error instanceof CheckoutClosedError) throw new TRPCError({ code: "PRECONDITION_FAILED", message: CLOSED_MESSAGES[error.reason] });
  if (error instanceof PaymentProviderError) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Checkout could not open. Nothing was charged. Please try again in a few minutes." });
  }
  throw error;
}

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
    prices: PRICES_MINOR,
    // Teams is listed while Teams is on. It is sold only while its checkout is open; until then a team is free.
    teams: { enabled: ENV.teamsEnabled, checkoutOpen: teamsCheckoutOpen(), priceMinor: TEAMS_PLAN.priceMinor, seats: TEAMS_PLAN.seats },
  };
}

export const billingRouter = router({
  offer: publicProcedure.query(() => offerFlags()),

  me: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const now = new Date();
    const ent = await getUserEntitlements(db, ctx.user, now);
    const [cardsUsed, leads, subs, cardHolds] = await Promise.all([
      countOwnedCards(db, ctx.user.id),
      getLeadUsage(db, ctx.user.id, ent.limits.monthlyLeads, now),
      getUserSubscriptions(db, ctx.user.id),
      ownerCardHolds(db, ctx.user.id, now),
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
      // After Pro ends: the cards that are paused, or will be, and what each one must drop. null otherwise.
      cardHolds,
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
        checkoutError(error);
      }
    }),

  /** The teams the caller owns, with where each plan stands. The Billing page lists them next to the Teams plan. */
  teamPlans: protectedProcedure.query(async ({ ctx }) => {
    if (!ENV.teamsEnabled) return [];
    const db = await requireDb();
    const rows = await db
      .select({ id: workspaces.id, name: workspaces.name, seatLimit: workspaces.seatLimit, accessUntil: workspaces.accessUntil, createdAt: workspaces.createdAt })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.userId, ctx.user.id), eq(workspaceMembers.role, "owner"), eq(workspaceMembers.status, "active"), isNull(workspaces.deletedAt)))
      .orderBy(asc(workspaces.name));
    return rows.map(row => ({ id: row.id, name: row.name, accessUntil: row.accessUntil, state: teamPlanState(row) }));
  }),

  /** Opens checkout for one team's plan. Only its owner can pay, and the price is the server's. */
  createTeamCheckout: protectedProcedure
    .input(z.object({ workspaceId: z.number().int().positive(), channel: z.enum(PAYMENT_CHANNELS) }).strict())
    .mutation(async ({ ctx, input }) => {
      assertTeamCapability("canCreateWorkspace");
      await limitOrThrow(`checkout:${hashIdentifier(String(ctx.user.id))}`, 5, 10 * 60_000);
      await limitOrThrow(`checkout-ip:${hashIdentifier(clientIp(ctx.req))}`, 20, 10 * 60_000);
      const db = await requireDb();
      const { workspace } = await requireWorkspaceOwner(db, ctx.user.id, input.workspaceId);
      try {
        const session = await startTeamCheckout(db, ctx.user, workspace, input.channel, siteOrigin(ctx.req));
        return { invoiceNo: session.invoiceNo, redirectUrl: session.redirectUrl };
      } catch (error) {
        checkoutError(error);
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
        workspaceId: teamOfPayment(payment),
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
