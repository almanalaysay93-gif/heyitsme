// The one place that answers "is this on hold?". A hold starts HOLD_GRACE_DAYS after a paid plan ends and
// pauses what the public sees. Nothing is deleted, and paying again lifts it at once.
import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { PAUSED_MESSAGE, holdStartsAt, proFeaturesUsed } from "@shared/hold";
import { cards, entitlementOverrides, users, workspaces } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { getDb, getPublicCardBySlug } from "../db";
import { teamHeld } from "../teams/entitlements";
import { getUserEntitlements, getUserSubscriptions, type Db } from "./service";

export type CardHold = "pro" | "team" | null;

type HeldCard = Pick<typeof cards.$inferSelect, "id" | "ownerUserId" | "workspaceId" | "page" | "portfolio">;

/**
 * Where an account's paid plan stands once it is over: when it ended and when its hold starts. null for an
 * account that has paid access now, and for one that never had any. Someone who never paid is never put on hold.
 */
export async function proLapse(db: Db, userId: number, now = new Date()): Promise<{ endedAt: Date; holdFrom: Date; held: boolean } | null> {
  const [subs, overrides] = await Promise.all([
    getUserSubscriptions(db, userId),
    db
      .select({ expiresAt: entitlementOverrides.expiresAt })
      .from(entitlementOverrides)
      .where(and(eq(entitlementOverrides.userId, userId), eq(entitlementOverrides.entitlement, "plan"), isNotNull(entitlementOverrides.expiresAt), lte(entitlementOverrides.expiresAt, now))),
  ]);
  // A checkout that was opened and never paid is not a plan.
  const ends = [...subs.filter(sub => sub.status !== "pending").map(sub => sub.currentPeriodEnd), ...overrides.map(row => row.expiresAt!)];
  if (ends.length === 0) return null;
  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const ent = await getUserEntitlements(db, { id: userId, email: owner?.email ?? null }, now);
  if (ent.plan !== "free") return null;
  const endedAt = new Date(Math.max(...ends.map(end => end.getTime())));
  const holdFrom = holdStartsAt(endedAt);
  return { endedAt, holdFrom, held: holdFrom.getTime() <= now.getTime() };
}

/** The card Free includes: the owner's oldest personal card. Every other one is a paid extra while limits are on. */
async function firstCardId(db: Db, ownerUserId: number) {
  const [first] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.ownerUserId, ownerUserId), isNull(cards.workspaceId), isNull(cards.deletedAt)))
    .orderBy(asc(cards.id))
    .limit(1);
  return first?.id ?? null;
}

/** Whether the public may see this card. "team": its team is on hold. "pro": its owner's Pro ended and the card still uses Pro. */
export async function cardHold(card: HeldCard, now = new Date()): Promise<CardHold> {
  // The demo card and guest previews are not rows.
  if (card.id <= 0) return null;
  const db = await getDb();
  if (!db) return null;
  if (card.workspaceId) {
    const [workspace] = await db
      .select({ seatLimit: workspaces.seatLimit, accessUntil: workspaces.accessUntil, createdAt: workspaces.createdAt })
      .from(workspaces)
      .where(eq(workspaces.id, card.workspaceId))
      .limit(1);
    return workspace && teamHeld(workspace, now) ? "team" : null;
  }
  const limitsEnforced = ENV.planLimitsEnabled;
  // Most cards use nothing paid, and with limits off that settles it without a lookup.
  if (!limitsEnforced && proFeaturesUsed(card, { limitsEnforced, extraCard: false }).length === 0) return null;
  const lapse = await proLapse(db, card.ownerUserId, now);
  if (!lapse?.held) return null;
  const extraCard = limitsEnforced && (await firstCardId(db, card.ownerUserId)) !== card.id;
  return proFeaturesUsed(card, { limitsEnforced, extraCard }).length > 0 ? "pro" : null;
}

/** A published card by its link, with whether it is on hold. Every public route reads cards through here. */
export async function publicCardBySlug(slug: string, now = new Date()) {
  const card = await getPublicCardBySlug(slug);
  if (!card) return undefined;
  return { card, hold: await cardHold(card, now) };
}

export const pausedError = () => new TRPCError({ code: "FORBIDDEN", message: PAUSED_MESSAGE });

/**
 * For the owner: the published personal cards that are paused, or will be, and what each must drop to come back.
 * null while the account has paid access or never had any.
 */
export async function ownerCardHolds(db: Db, userId: number, now = new Date()) {
  const lapse = await proLapse(db, userId, now);
  if (!lapse) return null;
  const limitsEnforced = ENV.planLimitsEnabled;
  const rows = await db
    .select({ id: cards.id, displayName: cards.displayName, published: cards.published, page: cards.page, portfolio: cards.portfolio })
    .from(cards)
    .where(and(eq(cards.ownerUserId, userId), isNull(cards.workspaceId), isNull(cards.deletedAt)))
    .orderBy(asc(cards.id));
  const affected = rows
    .map((row, index) => ({ id: row.id, displayName: row.displayName, published: row.published, uses: proFeaturesUsed(row, { limitsEnforced, extraCard: limitsEnforced && index > 0 }) }))
    .filter(row => row.published && row.uses.length > 0)
    .map(({ published: _published, ...row }) => row);
  return { endedAt: lapse.endedAt, holdFrom: lapse.holdFrom, held: lapse.held, cards: affected };
}
