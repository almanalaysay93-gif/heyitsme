import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { appSettings, cards, googlePlacesUsage, googleReviewPages } from "../drizzle/schema";
import { getDb } from "./db";

export type PlacesRequestType = "autocomplete" | "place_details";
export type PlacesCaller = { ownerId: number; cardId: number; sessionId?: string };

export type PlacesSettings = {
  monthlyFreeLimit: number;
  warnPercent: number;
  nearLimitPercent: number;
  capEnabled: boolean;
  capLimit: number;
};

const SETTINGS_KEY = "googlePlaces";

export class PlacesCapError extends Error {
  constructor() { super("Google Places monthly cap reached"); }
}

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

function positive(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

export function defaultPlacesSettings(): PlacesSettings {
  const monthlyFreeLimit = positive(process.env.GOOGLE_PLACES_MONTHLY_FREE_LIMIT, 10_000);
  return { monthlyFreeLimit, warnPercent: 70, nearLimitPercent: 90, capEnabled: false, capLimit: Math.floor(monthlyFreeLimit * 0.95) };
}

export async function getPlacesSettings(): Promise<PlacesSettings> {
  const db = await database();
  const defaults = defaultPlacesSettings();
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, SETTINGS_KEY)).limit(1);
  const saved = row?.value ?? {};
  return {
    monthlyFreeLimit: positive(saved.monthlyFreeLimit, defaults.monthlyFreeLimit),
    warnPercent: positive(saved.warnPercent, defaults.warnPercent),
    nearLimitPercent: positive(saved.nearLimitPercent, defaults.nearLimitPercent),
    capEnabled: saved.capEnabled === true,
    capLimit: positive(saved.capLimit, defaults.capLimit),
  };
}

export async function savePlacesSettings(settings: PlacesSettings) {
  const db = await database();
  await db.insert(appSettings).values({ key: SETTINGS_KEY, value: settings }).onConflictDoUpdate({ target: appSettings.key, set: { value: settings, updatedAt: new Date() } });
  return settings;
}

// Months and days are counted in UTC.
export function monthStart(now = new Date(), offset = 0) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

async function requestsSince(since: Date) {
  const db = await database();
  const [row] = await db.select({ total: sql<number>`coalesce(sum(${googlePlacesUsage.requestCount}), 0)::int` }).from(googlePlacesUsage).where(gte(googlePlacesUsage.createdAt, since));
  return row?.total ?? 0;
}

/**
 * Every Google Places request goes through here first. The row is written before the request is sent,
 * so a request that cannot be counted is never made.
 */
export async function recordPlacesRequest(requestType: PlacesRequestType, caller: PlacesCaller) {
  const settings = await getPlacesSettings();
  if (settings.capEnabled && await requestsSince(monthStart()) >= settings.capLimit) throw new PlacesCapError();
  const db = await database();
  await db.insert(googlePlacesUsage).values({ requestType, cardId: caller.cardId, ownerUserId: caller.ownerId, sessionId: caller.sessionId });
}

export type UsageLevel = "ok" | "warning" | "near_limit" | "over_limit";

export function usageLevel(used: number, settings: Pick<PlacesSettings, "monthlyFreeLimit" | "warnPercent" | "nearLimitPercent">): UsageLevel {
  const percent = used / settings.monthlyFreeLimit * 100;
  if (percent >= 100) return "over_limit";
  if (percent >= settings.nearLimitPercent) return "near_limit";
  if (percent >= settings.warnPercent) return "warning";
  return "ok";
}

export function projectMonthlyUsage(used: number, now = new Date()) {
  const start = monthStart(now).getTime();
  const end = monthStart(now, 1).getTime();
  const elapsed = Math.max(now.getTime() - start, 3_600_000);
  return Math.round(used * (end - start) / elapsed);
}

export async function placesUsageReport(now = new Date()) {
  const db = await database();
  const settings = await getPlacesSettings();
  const month = monthStart(now);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yearAgo = monthStart(now, -11);
  const count = sql<number>`coalesce(sum(${googlePlacesUsage.requestCount}), 0)::int`;
  const countOf = (type: PlacesRequestType) => sql<number>`coalesce(sum(${googlePlacesUsage.requestCount}) filter (where ${googlePlacesUsage.requestType} = ${type}), 0)::int`;

  const [[todayRow], [monthRow], history, businesses, [connected]] = await Promise.all([
    db.select({ total: count }).from(googlePlacesUsage).where(gte(googlePlacesUsage.createdAt, today)),
    db.select({ total: count, autocomplete: countOf("autocomplete"), placeDetails: countOf("place_details") }).from(googlePlacesUsage).where(gte(googlePlacesUsage.createdAt, month)),
    db.select({ month: sql<string>`to_char(${googlePlacesUsage.createdAt}, 'YYYY-MM')`, total: count, autocomplete: countOf("autocomplete"), placeDetails: countOf("place_details") })
      .from(googlePlacesUsage).where(gte(googlePlacesUsage.createdAt, yearAgo)).groupBy(sql`to_char(${googlePlacesUsage.createdAt}, 'YYYY-MM')`),
    db.select({ cardId: googlePlacesUsage.cardId, business: sql<string | null>`max(coalesce(${cards.company}, ${cards.displayName}))`, total: count, autocomplete: countOf("autocomplete"), placeDetails: countOf("place_details") })
      .from(googlePlacesUsage).leftJoin(cards, eq(cards.id, googlePlacesUsage.cardId)).where(gte(googlePlacesUsage.createdAt, month))
      .groupBy(googlePlacesUsage.cardId).orderBy(sql`sum(${googlePlacesUsage.requestCount}) desc`).limit(100),
    db.select({ total: sql<number>`count(*)::int` }).from(googleReviewPages).where(and(isNotNull(googleReviewPages.placeId), gte(googleReviewPages.lastSyncedAt, month))),
  ]);

  const used = monthRow?.total ?? 0;
  const byMonth = new Map(history.map(row => [row.month, row]));
  // Oldest first, with empty months filled in so the last 12 months always show.
  const months = Array.from({ length: 12 }, (_, index) => {
    const key = monthStart(now, index - 11).toISOString().slice(0, 7);
    return byMonth.get(key) ?? { month: key, total: 0, autocomplete: 0, placeDetails: 0 };
  });
  return {
    settings,
    today: todayRow?.total ?? 0,
    month: { total: used, autocomplete: monthRow?.autocomplete ?? 0, placeDetails: monthRow?.placeDetails ?? 0 },
    remainingFree: Math.max(0, settings.monthlyFreeLimit - used),
    percentUsed: Math.round(used / settings.monthlyFreeLimit * 1000) / 10,
    level: usageLevel(used, settings),
    capReached: settings.capEnabled && used >= settings.capLimit,
    projected: projectMonthlyUsage(used, now),
    businessesConnected: connected?.total ?? 0,
    months,
    businesses,
  };
}
