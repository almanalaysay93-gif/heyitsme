import { and, eq, gte, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cards, googleReviewEvents, googleReviewPages, users } from "../drizzle/schema";
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
  constructor() { super("Free accounts can connect one Google business. Disconnect it before adding another, or upgrade to Pro."); }
}

export function canConnectBusiness(plan: string, hasOtherActiveBusiness: boolean) {
  return plan === "pro" || !hasOtherActiveBusiness;
}

export async function reviewConnectionAllowance(cardId: number, ownerId: number) {
  const db = await database();
  const [owner] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, ownerId)).limit(1);
  const plan = owner ? (await getUserEntitlements(db, owner)).plan : "free";
  const [other] = await db.select({ id: googleReviewPages.id }).from(googleReviewPages).where(and(eq(googleReviewPages.ownerUserId, ownerId), ne(googleReviewPages.cardId, cardId), eq(googleReviewPages.enabled, true))).limit(1);
  return { plan, canConnect: canConnectBusiness(plan, Boolean(other)) };
}

const googleUrl = /^https:\/\/(?:[a-z0-9-]+\.)?google\.com\//i;
const googleLink = (value?: string | null) => value && googleUrl.test(value) ? value : null;

// Pages connected before the links were stored have none; a place ID is enough to build both.
export function reviewDestination(page: { placeId: string | null; reviewUrl: string | null }) {
  return googleLink(page.reviewUrl) ?? (page.placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(page.placeId)}` : null);
}

export function mapsDestination(page: { placeId: string | null; mapsUrl: string | null; businessName: string | null }) {
  return googleLink(page.mapsUrl) ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(page.businessName ?? "Google")}&query_place_id=${encodeURIComponent(page.placeId ?? "")}`;
}

export async function connectReviewPage(cardId: number, ownerId: number, place: Place) {
  const db = await database();
  return db.transaction(async (tx) => {
    const [owner] = await tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, ownerId)).for("update").limit(1);
    if (!owner) return null;
    const plan = (await getUserEntitlements(tx, owner)).plan;
    const [card] = await tx.select().from(cards).where(and(eq(cards.id, cardId), eq(cards.ownerUserId, ownerId))).limit(1);
    if (!card || card.deletedAt) return null;
    const [other] = await tx.select({ id: googleReviewPages.id }).from(googleReviewPages).where(and(eq(googleReviewPages.ownerUserId, ownerId), ne(googleReviewPages.cardId, cardId), eq(googleReviewPages.enabled, true))).limit(1);
    if (!canConnectBusiness(plan, Boolean(other))) throw new ReviewPlanLimitError();
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
      reviewUrl: googleLink(place.googleMapsLinks?.writeAReviewUri),
      enabled: true,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    };
    const [page] = await tx.insert(googleReviewPages).values({ ...data, cardId, ownerUserId: ownerId, slug: nanoid(8), branding: { logoUrl: card.logoUrl ?? card.avatarUrl, theme: card.theme ?? "clean" } }).onConflictDoUpdate({ target: googleReviewPages.cardId, set: data }).returning();
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
    branding: page.branding, cardSlug: card.slug, showOnCard: page.showOnCard,
  };
}

export async function publicReviewDestination(slug: string) {
  const db = await database();
  const [page] = await db.select({ placeId: googleReviewPages.placeId, reviewUrl: googleReviewPages.reviewUrl }).from(googleReviewPages).where(and(eq(googleReviewPages.slug, slug), eq(googleReviewPages.enabled, true))).limit(1);
  return page ? reviewDestination(page) : null;
}

export async function reviewPageForCard(cardId: number) {
  const db = await database();
  const [page] = await db.select({ slug: googleReviewPages.slug, businessName: googleReviewPages.businessName, rating: googleReviewPages.rating, reviewCount: googleReviewPages.reviewCount }).from(googleReviewPages).innerJoin(cards, eq(cards.id, googleReviewPages.cardId)).where(and(eq(googleReviewPages.cardId, cardId), eq(googleReviewPages.enabled, true), eq(googleReviewPages.showOnCard, true), eq(cards.published, true), sql`${cards.deletedAt} is null`)).limit(1);
  return page ?? null;
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

export async function updateReviewSettings(cardId: number, ownerId: number, patch: { enabled?: boolean; showOnCard?: boolean; branding?: Record<string, unknown> }) {
  const db = await database();
  const [page] = await db.update(googleReviewPages).set({ ...patch, updatedAt: new Date() }).where(and(eq(googleReviewPages.cardId, cardId), eq(googleReviewPages.ownerUserId, ownerId))).returning();
  return page ?? null;
}
