import { describe, expect, it } from "vitest";
import {
  addCycle,
  allowedInsightRanges,
  formatPeso,
  leadUsageState,
  planPriceMinor,
  quotaPeriodKey,
  resolveEntitlements,
  type SubscriptionSnapshot,
} from "@shared/plans";

const NOW = new Date("2026-10-05T00:00:00Z");
const sub = (overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  planCode: "pro",
  status: "active",
  currentPeriodEnd: new Date("2027-10-05T00:00:00Z"),
  cancelAtPeriodEnd: false,
  foundingMember: false,
  ...overrides,
});

describe("plan resolution", () => {
  it("gives Free its limits when plan limits are on", () => {
    const ent = resolveEntitlements({ limitsEnabled: true, complimentary: false, subscriptions: [], now: NOW,
    });
    expect(ent.plan).toBe("free");
    expect(ent.limits).toEqual({ cards: 1, monthlyLeads: 10, analyticsDays: 7, portfolioImages: 2 });
    expect(ent.canRemoveBranding).toBe(false);
  });

  it("keeps everyone at pre-launch limits while plan limits are off, paying or not", () => {
    const free = resolveEntitlements({ limitsEnabled: false, complimentary: false, subscriptions: [], now: NOW,
    });
    const pro = resolveEntitlements({ limitsEnabled: false, complimentary: false, subscriptions: [sub()], now: NOW,
    });
    expect(free.limits).toEqual({ cards: 500, monthlyLeads: null, analyticsDays: 90, portfolioImages: 20 });
    expect(pro.limits.cards).toBe(500);
    expect(pro.limits.analyticsDays).toBe(365);
    expect(pro.limits.portfolioImages).toBe(20);
  });

  it("gives Pro unlimited leads and a year of insights", () => {
    const ent = resolveEntitlements({ limitsEnabled: true, complimentary: false, subscriptions: [sub()], now: NOW,
    });
    expect(ent.plan).toBe("pro");
    expect(ent.limits).toEqual({ cards: 5, monthlyLeads: null, analyticsDays: 365, portfolioImages: 20 });
    expect(ent.canRemoveBranding).toBe(true);
  });

  it("returns an expired Pro to Free", () => {
    const ent = resolveEntitlements({ limitsEnabled: true, complimentary: false, subscriptions: [sub({ currentPeriodEnd: new Date("2026-10-01T00:00:00Z") }),
      ], now: NOW,
    });
    expect(ent.plan).toBe("free");
  });

  it("keeps a canceled plan until the period ends", () => {
    const canceled = sub({ status: "canceled", cancelAtPeriodEnd: true });
    expect(resolveEntitlements({ limitsEnabled: true, complimentary: false, subscriptions: [canceled], now: NOW,
      }).plan).toBe("pro");
    expect(resolveEntitlements({ limitsEnabled: true, complimentary: false, subscriptions: [canceled], now: new Date("2027-10-06T00:00:00Z"),
      }).plan).toBe("free");
  });

  it("gives past-due plans a three-day grace period", () => {
    const pastDue = sub({ status: "past_due", currentPeriodEnd: new Date("2026-10-03T00:00:00Z"),
    });
    expect(resolveEntitlements({ limitsEnabled: true, complimentary: false, subscriptions: [pastDue], now: NOW,
      }).plan).toBe("pro");
    expect(resolveEntitlements({ limitsEnabled: true, complimentary: false, subscriptions: [pastDue], now: new Date("2026-10-06T01:00:00Z"),
      }).plan).toBe("free");
  });

  it("ignores pending subscriptions", () => {
    expect(resolveEntitlements({ limitsEnabled: true, complimentary: false, subscriptions: [sub({ status: "pending" })], now: NOW,
      }).plan).toBe("free");
  });

  it("applies an unexpired admin override", () => {
    const ent = resolveEntitlements({ limitsEnabled: true, complimentary: false, override: { plan: "pro", expiresAt: null }, subscriptions: [], now: NOW,
    });
    expect(ent).toMatchObject({ plan: "pro", source: "override" });
    const expired = resolveEntitlements({ limitsEnabled: true, complimentary: false, override: { plan: "pro", expiresAt: new Date("2026-01-01") }, subscriptions: [], now: NOW,
    });
    expect(expired.plan).toBe("free");
  });

  it("gives complimentary accounts Pro and Teams with no end", () => {
    const ent = resolveEntitlements({ limitsEnabled: true, complimentary: true, subscriptions: [], now: NOW,
    });
    expect(ent).toMatchObject({ plan: "pro", teamsAccess: false, canRemoveBranding: true, accessEndsAt: null,
    });
    expect(ent.limits.monthlyLeads).toBeNull();
    expect(allowedInsightRanges(ent)).toEqual([7, 30, 90, 365]);
  });

  it("offers Free only the 7-day insights range", () => {
    const ent = resolveEntitlements({ limitsEnabled: true, complimentary: false, subscriptions: [], now: NOW,
    });
    expect(allowedInsightRanges(ent)).toEqual([7]);
  });
});

describe("prices", () => {
  it("sells only Pro monthly at 29900 centavos", () => {
    expect(planPriceMinor("pro", "monthly", false)).toBe(29900);
    expect(planPriceMinor("pro", "monthly", true)).toBe(29900);
    expect(() => planPriceMinor("pro", "annual", false)).toThrow();
    expect(() => planPriceMinor("teams" as never, "monthly", false)).toThrow();
  });

  it("formats pesos", () => {
    expect(formatPeso(129000)).toBe("₱1,290");
    expect(formatPeso(9950)).toBe("₱99.50");
  });
});

describe("dates", () => {
  it("adds a year for annual and clamps month ends", () => {
    expect(addCycle(new Date("2026-10-05T04:00:00Z"), "annual").toISOString()).toBe("2027-10-05T04:00:00.000Z");
    expect(addCycle(new Date("2027-01-31T00:00:00Z"), "monthly").toISOString()).toBe("2027-02-28T00:00:00.000Z");
    expect(addCycle(new Date("2028-02-29T00:00:00Z"), "annual").toISOString()).toBe("2029-02-28T00:00:00.000Z");
  });

  it("keys the lead quota by Philippine month", () => {
    expect(quotaPeriodKey(new Date("2026-10-31T15:59:59Z"))).toBe("2026-10");
    expect(quotaPeriodKey(new Date("2026-10-31T16:00:00Z"))).toBe("2026-11");
  });
});

describe("lead usage state", () => {
  it("warns from lead 8 and pauses at 10", () => {
    expect(leadUsageState({ used: 7, limit: 10, period: "x" })).toBe("ok");
    expect(leadUsageState({ used: 8, limit: 10, period: "x" })).toBe("warning");
    expect(leadUsageState({ used: 10, limit: 10, period: "x" })).toBe("paused");
    expect(leadUsageState({ used: 999, limit: null, period: "x" })).toBe("unlimited");
  });
});

describe("billing route", () => {
  it("serves /app/billing as an app page, not a 404 (the payment return lands there)", async () => {
    const { isSpaRoute } = await import("@shared/routes");
    expect(isSpaRoute("/app/billing")).toBe(true);
  });
});
