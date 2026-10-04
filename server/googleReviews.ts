import { and, asc, eq, gt, gte, isNull, ne, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { GOOGLE_SETUPS_PER_WEEK, GOOGLE_SETUP_WINDOW_DAYS, type GoogleSetupTier } from "@shared/plans";
import { cards, googlePlacesUsage, googleReviewEvents, googleReviewPages, users, workspaceMembers, workspaces } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import type { Place } from "./googlePlaces";
import { getUserEntitlements } from "./billing/service";

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

export async function ownerReviewPage(cardId: number, ownerId: number) {
  const db = await database();
  const [page] = await db.select().from(googleReviewPages).where(and(eq(googleReviewPages.cardId, cardId), eq(googleReviewPages.ownerUserId, ownerId))).limit(1);
  return page ?? null;
}

export class ReviewPlanLimitError extends Error {
  constructor(message = "Free accounts can connect one Google business. Disconnect it before adding another, or upgrade to Pro.") { super(message); }
}

/**
 * A finished setup is kept as a row in the Places usage log with a count of 0, so it never adds to the
 * Google request totals and still counts after the review page is deleted.
 */
const SETUP_LOG_TYPE = "business_setup";
const SETUP_WINDOW_MS = GOOGLE_SETUP_WINDOW_DAYS * 86_400_000;

export function setupTier(plan: string, onActiveTeam: boolean): GoogleSetupTier {
  return onActiveTeam ? "teams" : plan === "pro" ? "pro" : "free";
}

export type SetupAllowance = { tier: GoogleSetupTier; used: number; limit: number | null; canSetup: boolean; nextAt: Date | null };

/** `setups` are the times of this account's setups, oldest first. A null limit is unlimited. */
export function setupAllowance(tier: GoogleSetupTier, limit: number | null, setups: Date[], now = new Date()): SetupAllowance {
  const recent = setups.filter(at => at.getTime() > now.getTime() - SETUP_WINDOW_MS);
  const canSetup = limit === null || recent.length < limit;
  // The next setup opens when the oldest one that still counts against the limit turns a week old.
  const nextAt = canSetup || limit === null ? null : new Date(recent[recent.length - limit].getTime() + SETUP_WINDOW_MS);
  return { tier, used: recent.length, limit, canSetup, nextAt };
}

type Database = Awaited<ReturnType<typeof database>>;

// `db` may be a transaction, which reads the same way.
async function setupUsage(db: Pick<Database, "select">, owner: { id: number; email: string | null }, now = new Date()) {
  const entitlements = await getUserEntitlements(db as Database, owner, now);
  const [team] = ENV.teamsEnabled ? await db.select({ id: workspaces.id }).from(workspaceMembers).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, owner.id), eq(workspaceMembers.status, "active"), isNull(workspaces.deletedAt), or(isNull(workspaces.accessUntil), gt(workspaces.accessUntil, now)))).limit(1) : [];
  const tier = setupTier(entitlements.plan, Boolean(team));
  const rows = await db.select({ at: googlePlacesUsage.createdAt }).from(googlePlacesUsage)
    .where(and(eq(googlePlacesUsage.ownerUserId, owner.id), eq(googlePlacesUsage.requestType, SETUP_LOG_TYPE), gte(googlePlacesUsage.createdAt, new Date(now.getTime() - SETUP_WINDOW_MS)))).orderBy(asc(googlePlacesUsage.createdAt));
  // Complimentary accounts have no weekly limit.
  return setupAllowance(tier, entitlements.source === "complimentary" ? null : GOOGLE_SETUPS_PER_WEEK[tier], rows.map(row => row.at), now);
}

const setupLimitMessage = (usage: SetupAllowance) =>
  `You have used ${usage.limit === 1 ? "your Google business setup" : `all ${usage.limit} of your Google business setups`} for this week. Please try again later.`;

/** Stops a setup before any Google request is made for it. */
export async function assertSetupAvailable(ownerId: number) {
  const db = await database();
  const [owner] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, ownerId)).limit(1);
  if (!owner) return;
  const usage = await setupUsage(db, owner);
  if (!usage.canSetup) throw new ReviewPlanLimitError(setupLimitMessage(usage));
}

export function canConnectBusiness(plan: string, hasOtherActiveBusiness: boolean) {
  return plan === "pro" || !hasOtherActiveBusiness;
}

export async function reviewConnectionAllowance(cardId: number, ownerId: number) {
  const db = await database();
  const [owner] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, ownerId)).limit(1);
  const plan = owner ? (await getUserEntitlements(db, owner)).plan : "free";
  const setups = owner ? await setupUsage(db, owner) : setupAllowance("free", GOOGLE_SETUPS_PER_WEEK.free, []);
  const [other] = await db.select({ id: googleReviewPages.id }).from(googleReviewPages).where(and(eq(googleReviewPages.ownerUserId, ownerId), ne(googleReviewPages.cardId, cardId), eq(googleReviewPages.enabled, true))).limit(1);
  return { plan, canConnect: canConnectBusiness(plan, Boolean(other)), setups };
}

const googleUrl = /^https:\/\/(?:[a-z0-9-]+\.)?google\.com\//i;
const googleLink = (value?: string | null) => value && googleUrl.test(value) ? value : null;
export function directReviewLink(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "g.page" && /^\/r\/[^/]+\/review\/?$/.test(url.pathname)) return url.href;
    if (url.hostname === "www.google.com" && url.pathname.startsWith("/maps/place/") && url.pathname.includes("!12e1")) return url.href;
    return null;
  } catch { return null; }
}

// Pages connected before the links were stored have none; a place ID is enough to build both.
export function reviewDestination(page: { placeId: string | null; reviewUrl: string | null; mapsUrl?: string | null; businessName?: string | null }) {
  return directReviewLink(page.reviewUrl) ?? (page.placeId || googleLink(page.mapsUrl) ? mapsDestination(page) : null);
}

export function mapsDestination(page: { placeId: string | null; mapsUrl?: string | null; businessName?: string | null }) {
  return googleLink(page.mapsUrl) ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(page.businessName ?? "Google")}&query_place_id=${encodeURIComponent(page.placeId ?? "")}`;
}

export async function connectReviewPage(cardId: number, ownerId: number, place: Place) {
  const db = await database();
  return db.transaction(async (tx) => {
    const [owner] = await tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, ownerId)).for("update").limit(1);
    if (!owner) return null;
    const plan = (await getUserEntitlements(tx, owner)).plan;
    const [card] = await tx.select().from(cards).where(and(eq(cards.id, cardId), eq(cards.ownerUserId, ownerId), isNull(cards.workspaceId))).limit(1);
    if (!card || card.deletedAt) return null;
    const [other] = await tx.select({ id: googleReviewPages.id }).from(googleReviewPages).where(and(eq(googleReviewPages.ownerUserId, ownerId), ne(googleReviewPages.cardId, cardId), eq(googleReviewPages.enabled, true))).limit(1);
    if (!canConnectBusiness(plan, Boolean(other))) throw new ReviewPlanLimitError();
    // The owner row is locked above, so two setups at once cannot both slip under the weekly limit.
    const usage = await setupUsage(tx, owner);
    if (!usage.canSetup) throw new ReviewPlanLimitError(setupLimitMessage(usage));
    const [previous] = await tx.select({ placeId: googleReviewPages.placeId, reviewUrl: googleReviewPages.reviewUrl }).from(googleReviewPages).where(eq(googleReviewPages.cardId, cardId)).limit(1);
    const data = {
      placeId: place.id,
      businessName: (place.displayName?.text ?? card.company ?? card.displayName).slice(0, 200),
      address: place.formattedAddress ?? null,
      category: place.primaryTypeDisplayName?.text?.slice(0, 120) ?? null,
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
      rating: place.rating != null ? place.rating.toFixed(1) : null,
      reviewCount: place.userRatingCount ?? null,
      mapsUrl: googleLink(place.googleMapsLinks?.placeUri),
      reviewUrl: directReviewLink(place.googleMapsLinks?.writeAReviewUri) ?? (previous?.placeId === place.id ? directReviewLink(previous.reviewUrl) : null),
      enabled: true,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    };
    const [page] = await tx.insert(googleReviewPages).values({ ...data, cardId, ownerUserId: ownerId, slug: nanoid(8), branding: { logoUrl: card.logoUrl ?? card.avatarUrl, theme: card.theme ?? "clean" } }).onConflictDoUpdate({ target: googleReviewPages.cardId, set: data }).returning();
    await tx.insert(googlePlacesUsage).values({ requestType: SETUP_LOG_TYPE, requestCount: 0, cardId, ownerUserId: ownerId });
    return page;
  });
}

export async function publicReviewPage(slug: string) {
  const db = await database();
  const [row] = await db.select({ page: googleReviewPages, card: cards }).from(googleReviewPages).innerJoin(cards, eq(cards.id, googleReviewPages.cardId)).where(and(eq(googleReviewPages.slug, slug), eq(googleReviewPages.enabled, true))).limit(1);
  if (!row || row.card.deletedAt) return null;
  const { page, card } = row;
  return {
    slug: page.slug, businessName: page.businessName, rating: page.rating, reviewCount: page.reviewCount,
    mapsUrl: mapsDestination(page),
    reviewUrl: `/api/google-reviews/${encodeURIComponent(page.slug)}/write`, logoUrl: typeof page.branding.logoUrl === "string" ? page.branding.logoUrl : card.logoUrl,
    hasDirectReviewLink: Boolean(directReviewLink(page.reviewUrl)),
    branding: page.branding, cardSlug: card.slug, showOnCard: page.showOnCard,
  };
}

export async function publicReviewDestination(slug: string) {
  const db = await database();
  const [page] = await db.select({ placeId: googleReviewPages.placeId, reviewUrl: googleReviewPages.reviewUrl, mapsUrl: googleReviewPages.mapsUrl, businessName: googleReviewPages.businessName }).from(googleReviewPages).where(and(eq(googleReviewPages.slug, slug), eq(googleReviewPages.enabled, true))).limit(1);
  return page ? reviewDestination(page) : null;
}

export async function reviewPageForCard(cardId: number) {
  const db = await database();
  const [page] = await db.select({ slug: googleReviewPages.slug, businessName: googleReviewPages.businessName, rating: googleReviewPages.rating, reviewCount: googleReviewPages.reviewCount, reviewUrl: googleReviewPages.reviewUrl }).from(googleReviewPages).innerJoin(cards, eq(cards.id, googleReviewPages.cardId)).where(and(eq(googleReviewPages.cardId, cardId), eq(googleReviewPages.enabled, true), eq(googleReviewPages.showOnCard, true), eq(cards.published, true), sql`${cards.deletedAt} is null`)).limit(1);
  return page ? { slug: page.slug, businessName: page.businessName, rating: page.rating, reviewCount: page.reviewCount, hasDirectReviewLink: Boolean(directReviewLink(page.reviewUrl)) } : null;
}

export type ReviewEventType = "page_view" | "qr_scan" | "nfc_tap" | "google_review_click" | "view_google_maps_click" | "review_completion_acknowledged";

export async function trackReviewEvent(slug: string, type: ReviewEventType, source: string, campaign?: string, device?: string) {
  const db = await database();
  const [page] = await db.select({ id: googleReviewPages.id }).from(googleReviewPages).where(and(eq(googleReviewPages.slug, slug), eq(googleReviewPages.enabled, true))).limit(1);
  if (!page) return false;
  await db.insert(googleReviewEvents).values({ pageId: page.id, type, source, campaign, device });
  return true;
}

export async function reviewSummary(cardId: number, ownerId: number, days: number | null) {
  const page = await ownerReviewPage(cardId, ownerId);
  if (!page) return null;
  const db = await database();
  const since = days == null ? undefined : new Date(Date.now() - days * 86_400_000);
  const rows = await db.select({ type: googleReviewEvents.type, source: googleReviewEvents.source, day: sql<string>`date(${googleReviewEvents.createdAt})::text`, count: sql<number>`count(*)::int` }).from(googleReviewEvents).where(and(eq(googleReviewEvents.pageId, page.id), since ? gte(googleReviewEvents.createdAt, since) : undefined)).groupBy(googleReviewEvents.type, googleReviewEvents.source, sql`date(${googleReviewEvents.createdAt})`);
  return { page, rows };
}

/** Removes the review page and its activity for good. The card itself is left alone. */
export async function deleteReviewPage(cardId: number, ownerId: number) {
  const db = await database();
  const [page] = await db.delete(googleReviewPages).where(and(eq(googleReviewPages.cardId, cardId), eq(googleReviewPages.ownerUserId, ownerId))).returning({ id: googleReviewPages.id });
  return Boolean(page);
}

export async function updateReviewSettings(cardId: number, ownerId: number, patch: { enabled?: boolean; showOnCard?: boolean; reviewUrl?: string | null; branding?: Record<string, unknown> }) {
  const db = await database();
  const [page] = await db.update(googleReviewPages).set({ ...patch, updatedAt: new Date() }).where(and(eq(googleReviewPages.cardId, cardId), eq(googleReviewPages.ownerUserId, ownerId))).returning();
  return page ?? null;
}
