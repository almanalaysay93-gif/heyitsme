// Plan definitions and the entitlement resolver. The server owns every price and limit: the client only
// sends plan and cycle codes, and reads what the server resolves. Amounts are integer centavos (PHP minor units).

export const CURRENCY = "PHP" as const;

export const PLAN_CODES = ["free", "pro"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export type PaidPlanCode = Exclude<PlanCode, "free">;

export const BILLING_CYCLES = ["monthly"] as const;
// Historical annual invoices remain readable and settle at their original terms.
export type BillingCycle = "monthly" | "annual";

export const PAYMENT_CHANNELS = ["googlepay", "gcash"] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

/** Insight ranges in days. Free sees the first one when plan limits are on. */
export const INSIGHT_RANGES = [7, 30, 90, 365] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];

/** Technical ceiling on cards per owner (see OWNER_CARD_LIMIT in server/db.ts). */
export const TECHNICAL_CARD_LIMIT = 500;

export const FOUNDING_MEMBER_LIMIT = 500;

/** Days a past-due subscription keeps its entitlements. */
export const PAST_DUE_GRACE_DAYS = 3;

/** Free monthly lead quota runs on Philippine time, so a month starts at local midnight. */
export const QUOTA_TIME_ZONE = "Asia/Manila";

export type PlanLimits = {
  /** Cards an owner may have before creating another is blocked. Existing cards above it stay. */
  cards: number;
  /** Leads accepted per quota month. null is unlimited. */
  monthlyLeads: number | null;
  /** Longest insights range, in days. */
  analyticsDays: number;
  /** Maximum portfolio photos allowed per card. */
  portfolioImages: number;
};

export const PLAN_LIMITS: Record<PlanCode, PlanLimits> = {
  free: { cards: 1, monthlyLeads: 10, analyticsDays: 7, portfolioImages: 2 },
  pro: { cards: 5, monthlyLeads: null, analyticsDays: 365, portfolioImages: 20 },
};

export const PLAN_FEATURES = {
  free: {
    brandingRemoval: false,
    premiumThemes: false,
    premiumColors: false,
    animations: false,
    advancedQr: false,
    qrCampaignTracking: false,
    advancedCrm: false,
    csvExport: false,
    advancedAnalytics: false,
  },
  pro: {
    brandingRemoval: true,
    premiumThemes: true,
    premiumColors: true,
    animations: true,
    advancedQr: true,
    qrCampaignTracking: true,
    advancedCrm: true,
    csvExport: true,
    advancedAnalytics: true,
  },
} as const;

/** Google business setups (connect or reconnect) an account may make in any 7 days. Teams is for members of an active team. */
export const GOOGLE_SETUPS_PER_WEEK = { free: 1, pro: 5, teams: 10 } as const;
export type GoogleSetupTier = keyof typeof GOOGLE_SETUPS_PER_WEEK;
export const GOOGLE_SETUP_WINDOW_DAYS = 7;

/** What every account had before paid plans. Applies while PLAN_LIMITS_ENABLED is off. */
export const LEGACY_LIMITS: PlanLimits = { cards: TECHNICAL_CARD_LIMIT, monthlyLeads: null, analyticsDays: 90, portfolioImages: 20,
};

/** Complimentary accounts: every feature, no expiry, technical ceilings only. */
export const COMPLIMENTARY_LIMITS: PlanLimits = { cards: TECHNICAL_CARD_LIMIT, monthlyLeads: null, analyticsDays: 365, portfolioImages: 20,
};

export const PRICES_MINOR = {
  pro: { monthly: 29900 },
} as const;

export function planPriceMinor(plan: PaidPlanCode, cycle: BillingCycle,
  _founding = false
): number {
  if (plan !== "pro" || cycle !== "monthly")
    throw new Error("Only Pro monthly checkout is available");
  return PRICES_MINOR.pro.monthly;
}

export function formatPeso(minor: number): string {
  const pesos = minor / 100;
  return `₱${pesos.toLocaleString("en-PH", { minimumFractionDigits: pesos % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Adds one billing cycle to a date. Month ends clamp, so Jan 31 + 1 month is Feb 28/29. */
export function addCycle(from: Date, cycle: BillingCycle): Date {
  const next = new Date(from);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + (cycle === "annual" ? 12 : 1));
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

/** Quota month key, e.g. "2026-09", in Philippine time. */
export function quotaPeriodKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: QUOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find(p => p.type === "year")!.value;
  const month = parts.find(p => p.type === "month")!.value;
  return `${year}-${month}`;
}

export type SubscriptionStatus =
  | "pending"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export type SubscriptionSnapshot = {
  planCode: PaidPlanCode;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  foundingMember: boolean;
};

/** True while a subscription still grants its plan. Canceled-at-period-end keeps access until the period ends. */
export function subscriptionGrantsAccess(
  sub: SubscriptionSnapshot,
  now = new Date()
): boolean {
  const end = sub.currentPeriodEnd.getTime();
  if (sub.status === "active") return now.getTime() < end;
  if (sub.status === "canceled")
    return sub.cancelAtPeriodEnd && now.getTime() < end;
  if (sub.status === "past_due")
    return now.getTime() < end + PAST_DUE_GRACE_DAYS * 86_400_000;
  return false;
}

export type Entitlements = {
  features: { [K in keyof typeof PLAN_FEATURES.pro]: boolean };
  plan: PlanCode;
  /** Why the plan applies. */
  source: "free" | "subscription" | "complimentary" | "override";
  limits: PlanLimits;
  limitsEnforced: boolean;
  canRemoveBranding: boolean;
  teamsAccess: boolean;
  foundingMember: boolean;
  /** When paid access ends. null for Free and complimentary. */
  accessEndsAt: Date | null;
};

export type EntitlementInput = {
  limitsEnabled: boolean;
  complimentary: boolean;
  /** Admin override: a plan granted until expiresAt (null = no expiry). */
  override?: { plan: PaidPlanCode; expiresAt: Date | null } | null;
  subscriptions: SubscriptionSnapshot[];
  now?: Date;
};

const planRank: Record<PlanCode, number> = { free: 0, pro: 1 };

// While limits are off nobody gets less than they had before paid plans, paying or not.
const widest = (a: PlanLimits, b: PlanLimits): PlanLimits => ({
  cards: Math.max(a.cards, b.cards),
  monthlyLeads:
    a.monthlyLeads === null || b.monthlyLeads === null
      ? null
      : Math.max(a.monthlyLeads, b.monthlyLeads),
  analyticsDays: Math.max(a.analyticsDays, b.analyticsDays),
  portfolioImages: Math.max(a.portfolioImages, b.portfolioImages),
});

/** Counts portfolio photo items in raw JSON. */
export function countPortfolioImages(raw: string | null | undefined): number {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return 0;
    return parsed.filter(
      (item) => item && typeof item === "object" && item.url && (!item.kind || item.kind === "image")
    ).length;
  } catch {
    return 0;
  }
}

/** Resolves one account's entitlements. Pure, so the same rules run in tests and on the server. */
export function resolveEntitlements(input: EntitlementInput): Entitlements {
  const now = input.now ?? new Date();
  if (input.complimentary) {
    return {
      features: PLAN_FEATURES.pro,
      plan: "pro",
      source: "complimentary",
      limits: COMPLIMENTARY_LIMITS,
      limitsEnforced: input.limitsEnabled,
      canRemoveBranding: true,
      teamsAccess: false,
      foundingMember: false,
      accessEndsAt: null,
    };
  }

  let best: {
    plan: PlanCode;
    source: Entitlements["source"];
    endsAt: Date | null;
    founding: boolean;
  } = {
    plan: "free",
    source: "free",
    endsAt: null,
    founding: false,
  };
  for (const sub of input.subscriptions) {
    if (!subscriptionGrantsAccess(sub, now)) continue;
    if (
      planRank[sub.planCode] > planRank[best.plan] ||
      (sub.planCode === best.plan &&
        best.endsAt &&
        sub.currentPeriodEnd > best.endsAt)
    ) {
      best = {
        plan: sub.planCode,
        source: "subscription",
        endsAt: sub.currentPeriodEnd,
        founding: sub.foundingMember,
      };
    }
  }
  const override = input.override;
  if (
    override &&
    (!override.expiresAt || override.expiresAt > now) &&
    planRank[override.plan] > planRank[best.plan]
  ) {
    best = {
      plan: override.plan,
      source: "override",
      endsAt: override.expiresAt,
      founding: false,
    };
  }

  const paid = best.plan !== "free";
  return {
    features: PLAN_FEATURES[best.plan],
    plan: best.plan,
    source: best.source,
    limits: input.limitsEnabled
      ? PLAN_LIMITS[best.plan]
      : widest(PLAN_LIMITS[best.plan], LEGACY_LIMITS),
    limitsEnforced: input.limitsEnabled,
    canRemoveBranding: paid,
    teamsAccess: false,
    foundingMember: false,
    accessEndsAt: best.endsAt,
  };
}

/** Insight ranges an account may open. Longer ranges show with a Pro marker in the UI. */
export function allowedInsightRanges(
  ent: Pick<Entitlements, "limits">
): InsightRange[] {
  return INSIGHT_RANGES.filter(days => days <= ent.limits.analyticsDays);
}

export type LeadUsage = { used: number; limit: number | null; period: string };

/** Owner-facing lead state: "ok", "warning" from lead 8 of 10, "paused" at the limit. */
export function leadUsageState(
  usage: LeadUsage
): "unlimited" | "ok" | "warning" | "paused" {
  if (usage.limit === null) return "unlimited";
  if (usage.used >= usage.limit) return "paused";
  if (usage.used >= usage.limit - 2) return "warning";
  return "ok";
}
