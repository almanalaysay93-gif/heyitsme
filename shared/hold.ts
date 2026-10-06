// A hold pauses what the public sees after a paid plan has ended. Nothing is deleted: paying again, or taking
// the paid features off a card, brings it back. The server decides every hold (server/billing/hold.ts).
import { premiumDesign, premiumQr } from "./design";
import { parsePageConfig } from "./pageConfig";
import { PAST_DUE_GRACE_DAYS, PLAN_LIMITS, countPortfolioImages } from "./plans";

/** Days between a plan ending and its hold starting. */
export const HOLD_GRACE_DAYS = PAST_DUE_GRACE_DAYS;

/** Days a team that was free gets before its plan ends, counted from the day it is told. */
export const FREE_TEAM_NOTICE_DAYS = 14;

/** When the hold starts for a plan that ended at this moment. */
export const holdStartsAt = (endedAt: Date) => new Date(endedAt.getTime() + HOLD_GRACE_DAYS * 86_400_000);

/** What a visitor is told. The pages match on it, so it has one spelling. */
export const PAUSED_MESSAGE = "This page is paused.";

/** What someone opening a team on hold is told. */
export const TEAM_HOLD_MESSAGE = "This team is on hold until its plan is paid.";

const hasMessage = (error: unknown, message: string) => {
  const e = error as { message?: string; data?: { code?: string } | null } | null | undefined;
  return e?.data?.code === "FORBIDDEN" && e.message === message;
};

export const isPausedError = (error: unknown) => hasMessage(error, PAUSED_MESSAGE);
export const isTeamHoldError = (error: unknown) => hasMessage(error, TEAM_HOLD_MESSAGE);

/**
 * The paid features a personal card is using, in words its owner can act on. An empty list is a card Free allows.
 * Photo and card counts are part of Free only while plan limits are on.
 */
export function proFeaturesUsed(
  card: { page: string | null; portfolio: string | null },
  options: { limitsEnforced: boolean; extraCard: boolean }
): string[] {
  const page = parsePageConfig(card.page);
  const used: string[] = [];
  if (page.accent) used.push("a custom accent color");
  if (page.design && premiumDesign(page.design)) used.push("a Pro design");
  if (page.qr && premiumQr(page.qr)) used.push("a Pro QR style");
  if (page.hideBranding) used.push("hidden heyitsme branding");
  if (options.limitsEnforced) {
    const free = PLAN_LIMITS.free;
    if (countPortfolioImages(card.portfolio) > free.portfolioImages) used.push(`more than ${free.portfolioImages} photos`);
    if (options.extraCard) used.push(`it is an extra card (Free includes ${free.cards})`);
  }
  return used;
}
