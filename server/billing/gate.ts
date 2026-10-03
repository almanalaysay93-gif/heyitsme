import { TRPCError } from "@trpc/server";
import type { Entitlements } from "@shared/plans";
import { parsePageConfig } from "@shared/pageConfig";
import { designReadable, premiumDesign, premiumQr } from "@shared/design";
import type { InsertCard } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { createCard, getDb, getUserById } from "../db";
import { createCardWithinLimit, getLeadUsage, getUserEntitlements, PlanLimitError, releaseLead, reserveLead,
} from "./service";

// Server-side plan checks used by the card, contact and insights procedures. The UI hides or marks locked
// features, but these checks are what actually decide.

export const UPGRADE_MESSAGES = {
  card_limit:
    "Your plan's card limit is reached. Upgrade to Pro for up to 5 cards. Your existing cards are safe.",
  lead_limit: "Lead capture is paused for this month.",
  analytics_range: "That insights range is part of Pro.",
  branding: "Removing heyitsme branding is part of Pro.",
} as const;

export function upgradeError(reason: keyof typeof UPGRADE_MESSAGES) {
  return new TRPCError({ code: "FORBIDDEN", message: UPGRADE_MESSAGES[reason],
  });
}

export async function entitlementsFor(user: { id: number; email: string | null;
}): Promise<Entitlements> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable",
    });
  return getUserEntitlements(db, user);
}

/** Creates a card, enforcing the card limit when plan limits are on. Off, it is the original path. */
export async function createCardForOwner(user: { id: number; email: string | null }, input: InsertCard) {
  if (!ENV.planLimitsEnabled) return createCard(input);
  const ent = await entitlementsFor(user);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable",
    });
  try {
    return await createCardWithinLimit(db, input, ent.limits.cards);
  } catch (error) {
    if (error instanceof PlanLimitError) throw upgradeError("card_limit");
    throw error;
  }
}

/**
 * Branding removal is a paid feature. Only turning it on is checked: a card that already has it keeps it after a
 * downgrade, and turning it off is always allowed.
 */
export async function assertBrandingAllowed(user: { id: number; email: string | null }, nextPage: string | null | undefined, previousPage?: string | null) {
  const next = parsePageConfig(nextPage);
  const previous = parsePageConfig(previousPage);
  const changedDesign =
    JSON.stringify(next.design) !== JSON.stringify(previous.design);
  if (changedDesign && next.design && !designReadable(next.design))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose readable text and button colors.",
    });
  const changedQr = JSON.stringify(next.qr) !== JSON.stringify(previous.qr);
  if (next.accent && next.accent !== previous.accent) {
    const ent = await entitlementsFor(user);
    if (!ENV.proDesignEnabled || !ent.features.premiumColors)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Custom accent colors require Pro.",
      });
  }
  if (changedDesign && next.design && premiumDesign(next.design)) {
    const ent = await entitlementsFor(user);
    if (!ENV.proDesignEnabled || !ent.canRemoveBranding)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Unlock Pro customization — ₱299/month.",
      });
  }
  if (changedQr && next.qr && premiumQr(next.qr)) {
    const ent = await entitlementsFor(user);
    if (!ENV.proDesignEnabled || !ent.canRemoveBranding)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Advanced QR customization requires Pro.",
      });
  }
  const wants = parsePageConfig(nextPage).hideBranding;
  if (!wants) return;
  if (previousPage !== undefined && parsePageConfig(previousPage).hideBranding) return;
  const ent = await entitlementsFor(user);
  if (!ent.canRemoveBranding) throw upgradeError("branding");
}

export async function assertPro(user: { id: number; email: string | null }) {
  if (!(await entitlementsFor(user)).canRemoveBranding)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Upgrade to Pro — ₱299/month.",
    });
}

async function ownerEntitlements(ownerUserId: number) {
  const owner = await getUserById(ownerUserId);
  return getUserEntitlements((await getDb())!, { id: ownerUserId, email: owner?.email ?? null,
  });
}

/** Whether a public card may show its exchange form. Visitors never type details into a form that would drop them. */
export async function leadCaptureOpen(ownerUserId: number): Promise<boolean> {
  if (!ENV.planLimitsEnabled) return true;
  const db = await getDb();
  if (!db) return true;
  const ent = await ownerEntitlements(ownerUserId);
  if (ent.limits.monthlyLeads === null) return true;
  const usage = await getLeadUsage(db, ownerUserId, ent.limits.monthlyLeads);
  return usage.used < ent.limits.monthlyLeads;
}

/**
 * Takes a lead from the owner's quota, then saves it. The quota is reserved first in one atomic statement,
 * so lead 11 is refused before any visitor detail is written. A failed save gives the lead back.
 */
export async function withLeadQuota<T>(ownerUserId: number, save: () => Promise<T>): Promise<T> {
  if (!ENV.planLimitsEnabled) return save();
  const db = await getDb();
  if (!db) return save();
  const ent = await ownerEntitlements(ownerUserId);
  const reserved = await reserveLead(db, ownerUserId, ent.limits.monthlyLeads);
  if (!reserved) throw new TRPCError({ code: "FORBIDDEN", message: "This card is not taking new details right now. Use the contact options on the page instead.",
    });
  try {
    return await save();
  } catch (error) {
    await releaseLead(db, ownerUserId).catch(() => undefined);
    throw error;
  }
}

/** Rejects insight ranges longer than the plan allows. */
export async function assertInsightRange(user: { id: number; email: string | null }, days: number) {
  // Ranges everyone already had skip the lookup: 7 days always, up to 90 while limits are off.
  if (days <= 7 || (!ENV.planLimitsEnabled && days <= 90)) return;
  const ent = await entitlementsFor(user);
  if (days > ent.limits.analyticsDays) throw upgradeError("analytics_range");
}
