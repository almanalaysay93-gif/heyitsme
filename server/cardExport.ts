import type { Card, Reference } from "../drizzle/schema";
import { parsePageConfig } from "@shared/pageConfig";

export const CARD_EXPORT_FORMAT = "heyitsme.card-export";
export const CARD_EXPORT_VERSION = 1;

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Owner's card content as a versioned JSON document.
 * Media is referenced by URL only: the file is a content backup, not a copy of uploaded images or files.
 * Internal ids, owner ids and idempotency keys stay out; contacts have their own CSV export.
 */
export function buildCardExport(cards: Card[], referencesByCard: Map<number, Reference[]>, exportedAt = new Date()) {
  return {
    format: CARD_EXPORT_FORMAT,
    version: CARD_EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    mediaScope: "urls-only" as const,
    note: "Images, videos and files are listed by URL. Download any you want to keep; links to removed or deleted cards stop working.",
    cards: cards
      .filter((card) => !card.deletedAt)
      .map((card) => ({
        slug: card.slug,
        publicUrlPath: `/c/${card.slug}`,
        published: card.published,
        displayName: card.displayName,
        title: card.title,
        company: card.company,
        email: card.email,
        phone: card.phone,
        location: card.location,
        bio: card.bio,
        theme: card.theme,
        headings: {
          contact: card.contactHeading,
          gallery: card.galleryHeading,
          portfolio: card.portfolioHeading,
        },
        media: {
          avatarUrl: card.avatarUrl,
          coverUrl: card.coverUrl,
          logoUrl: card.logoUrl,
          backgroundUrl: card.backgroundUrl,
        },
        page: parsePageConfig(card.page),
        links: parseJsonArray(card.links),
        channels: parseJsonArray(card.channels),
        portfolio: parseJsonArray(card.portfolio),
        references: (referencesByCard.get(card.id) ?? []).map((ref) => ({
          clientName: ref.clientName,
          clientRole: ref.clientRole,
          company: ref.company,
          quote: ref.quote,
          avatarUrl: ref.avatarUrl,
          approved: ref.approved,
          createdAt: ref.createdAt.toISOString(),
        })),
        createdAt: card.createdAt.toISOString(),
        updatedAt: card.updatedAt.toISOString(),
      })),
  };
}

export type CardExport = ReturnType<typeof buildCardExport>;
