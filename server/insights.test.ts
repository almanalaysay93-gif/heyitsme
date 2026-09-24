import { describe, expect, it } from "vitest";
import { buildInsights, insightsSince, type InsightsCardInput, type InsightsRow } from "./insights";

const now = new Date("2026-09-24T15:30:00Z");

const cards: InsightsCardInput[] = [
  { id: 1, displayName: "Ada Lane", slug: "ada", published: true, deletedAt: null },
  { id: 2, displayName: "Ben Ortiz", slug: "ben", published: false, deletedAt: null },
  { id: 3, displayName: "Old card", slug: "old", published: false, deletedAt: new Date("2026-01-01") },
];

describe("insightsSince", () => {
  it("starts at UTC midnight so the range includes today", () => {
    expect(insightsSince(7, now).toISOString()).toBe("2026-09-18T00:00:00.000Z");
    expect(insightsSince(1, now).toISOString()).toBe("2026-09-24T00:00:00.000Z");
  });
});

describe("buildInsights", () => {
  it("fills every day with zeros when there is no activity", () => {
    const summary = buildInsights([], cards, 7, now);
    expect(summary.daily).toHaveLength(7);
    expect(summary.daily.every((d) => d.views === 0)).toBe(true);
    expect(summary.from).toBe("2026-09-18");
    expect(summary.to).toBe("2026-09-24");
    expect(summary.exchangeRate).toBeNull();
    // Deleted cards with no activity are hidden.
    expect(summary.cards.map((c) => c.id)).toEqual([1, 2]);
  });

  it("totals by type, per card, per day, and ranks links", () => {
    const rows: InsightsRow[] = [
      { cardId: 1, type: "view", meta: "public_card", day: "2026-09-24", count: 6 },
      { cardId: 1, type: "view", meta: "public_card", day: "2026-09-20", count: 2 },
      { cardId: 2, type: "view", meta: "public_card", day: "2026-09-24", count: 2 },
      { cardId: 1, type: "save", meta: "exchange_form", day: "2026-09-24", count: 1 },
      { cardId: 1, type: "vcard", meta: null, day: "2026-09-22", count: 3 },
      { cardId: 1, type: "link", meta: "LinkedIn", day: "2026-09-22", count: 2 },
      { cardId: 2, type: "link", meta: "LinkedIn", day: "2026-09-23", count: 1 },
      { cardId: 2, type: "link", meta: "Email", day: "2026-09-23", count: 4 },
      { cardId: 1, type: "share", meta: "copy", day: "2026-09-21", count: 1 },
      // Outside the 7-day window: ignored.
      { cardId: 1, type: "view", meta: "public_card", day: "2026-09-10", count: 50 },
    ];
    const summary = buildInsights(rows, cards, 7, now);

    expect(summary.totals).toEqual({ views: 10, vcard: 3, exchanges: 1, links: 7, shares: 1 });
    expect(summary.exchangeRate).toBeCloseTo(0.1);
    expect(summary.daily.find((d) => d.day === "2026-09-24")?.views).toBe(8);
    expect(summary.daily.find((d) => d.day === "2026-09-20")?.views).toBe(2);
    expect(summary.cards[0]).toMatchObject({ id: 1, views: 8, exchanges: 1, vcard: 3, links: 2, shares: 1 });
    expect(summary.cards[1]).toMatchObject({ id: 2, views: 2, links: 5 });
    expect(summary.topLinks).toEqual([
      { label: "Email", count: 4 },
      { label: "LinkedIn", count: 3 },
    ]);
  });

  it("keeps a deleted card that still had activity in range", () => {
    const rows: InsightsRow[] = [{ cardId: 3, type: "view", meta: null, day: "2026-09-24", count: 1 }];
    const summary = buildInsights(rows, cards, 30, now);
    expect(summary.cards.map((c) => c.id)).toContain(3);
    expect(summary.daily).toHaveLength(30);
  });
});
