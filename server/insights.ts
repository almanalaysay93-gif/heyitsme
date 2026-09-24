export type InsightsRow = {
  cardId: number;
  type: string;
  meta: string | null;
  /** UTC day, YYYY-MM-DD. */
  day: string;
  count: number;
};

export type InsightsCardInput = {
  id: number;
  displayName: string;
  slug: string;
  published: boolean;
  deletedAt: Date | null;
};

export type InsightsTotals = {
  views: number;
  /** Visitors who saved the card to their phone contacts (.vcf download). */
  vcard: number;
  /** Visitors who sent their own details through the exchange form. */
  exchanges: number;
  links: number;
  shares: number;
};

export type InsightsSummary = {
  days: number;
  from: string;
  to: string;
  totals: InsightsTotals;
  /** Exchanges per view, 0-1. Null when there are no views yet. */
  exchangeRate: number | null;
  daily: { day: string; views: number }[];
  cards: ({ id: number; displayName: string; slug: string; published: boolean } & InsightsTotals)[];
  topLinks: { label: string; count: number }[];
};

export const INSIGHTS_RANGES = [7, 30, 90] as const;
export type InsightsRange = (typeof INSIGHTS_RANGES)[number];

const emptyTotals = (): InsightsTotals => ({ views: 0, vcard: 0, exchanges: 0, links: 0, shares: 0 });

const toDay = (date: Date) => date.toISOString().slice(0, 10);

/** Start of the first UTC day in a range that ends today (inclusive). */
export function insightsSince(days: number, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

function addToTotals(totals: InsightsTotals, type: string, count: number) {
  if (type === "view") totals.views += count;
  else if (type === "vcard") totals.vcard += count;
  else if (type === "save") totals.exchanges += count;
  else if (type === "link") totals.links += count;
  else if (type === "share") totals.shares += count;
}

export function buildInsights(
  rows: InsightsRow[],
  cards: InsightsCardInput[],
  days: number,
  now = new Date(),
): InsightsSummary {
  const since = insightsSince(days, now);
  const dayKeys: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(since);
    date.setUTCDate(since.getUTCDate() + i);
    dayKeys.push(toDay(date));
  }
  const inRange = new Set(dayKeys);

  const totals = emptyTotals();
  const viewsByDay = new Map<string, number>(dayKeys.map((day) => [day, 0]));
  const byCard = new Map<number, InsightsTotals>();
  const links = new Map<string, number>();

  for (const row of rows) {
    if (!inRange.has(row.day) || row.count <= 0) continue;
    addToTotals(totals, row.type, row.count);
    const cardTotals = byCard.get(row.cardId) ?? emptyTotals();
    addToTotals(cardTotals, row.type, row.count);
    byCard.set(row.cardId, cardTotals);
    if (row.type === "view") viewsByDay.set(row.day, (viewsByDay.get(row.day) ?? 0) + row.count);
    if (row.type === "link") {
      const label = row.meta?.trim() || "Other link";
      links.set(label, (links.get(label) ?? 0) + row.count);
    }
  }

  const cardRows = cards
    .filter((card) => !card.deletedAt || byCard.has(card.id))
    .map((card) => ({
      id: card.id,
      displayName: card.displayName,
      slug: card.slug,
      published: card.published,
      ...(byCard.get(card.id) ?? emptyTotals()),
    }))
    .sort((a, b) => b.views - a.views || b.exchanges - a.exchanges || a.displayName.localeCompare(b.displayName));

  const topLinks = Array.from(links, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 6);

  return {
    days,
    from: dayKeys[0],
    to: dayKeys[dayKeys.length - 1],
    totals,
    exchangeRate: totals.views > 0 ? totals.exchanges / totals.views : null,
    daily: dayKeys.map((day) => ({ day, views: viewsByDay.get(day) ?? 0 })),
    cards: cardRows,
    topLinks,
  };
}
