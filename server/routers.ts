import { parsePageConfig } from "@shared/pageConfig";
import { COOKIE_NAME } from "@shared/const";
import { DEMO_CARD_ID } from "@shared/demoCard";
import { makeCardSlug } from "@shared/routes";
import { serverCardFields, validateCardData } from "@shared/cardValidation";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { newContactMail, sendMail } from "./_core/mail";
import { clientIp, hashIdentifier, rateLimit } from "./_core/rateLimit";
import { siteOrigin } from "./_core/seo";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import { tidyOwnerUploads } from "./uploadSweep";
import { buildCardExport } from "./cardExport";
import {
  createReference,
  createContact,
  deleteCard,
  deleteContact,
  deleteReference,
  setReferenceApproved,
  countPendingReviews,
  MAX_PENDING_REVIEWS,
  getCardById,
  getCardByIdForOwner,
  getCardsByOwner,
  getContactsByOwner,
  getInsightsRows,
  getReferencesByCard,
  getReferencesByOwner,
  getPublicCardBySlug,
  getUserById,
  markContactsSeen,
  recordAnalytics,
  updateCard,
  updateContact,
} from "./db";
import { buildInsights, INSIGHTS_RANGES, insightsSince } from "./insights";
import { billingRouter } from "./billing/router";
import { teamsRouter } from "./teams/router";
import { teamCardsRouter, teamDepartmentsRouter } from "./teams/cardsRouter";
import { teamBrandRouter, teamRequestsRouter, teamTemplatesRouter } from "./teams/brandRouter";
import { teamAnalyticsRouter } from "./teams/analyticsRouter";
import { teamContactFields, teamContactsRouter } from "./teams/contactsRouter";
import { publicEventRouter, teamEventsRouter } from "./teams/eventsRouter";
import { cardTeamExtras, teamAssetsRouter, teamBannersRouter, teamKitRouter } from "./teams/kitRouter";
import {
  advancedInsights,
  campaignForCard,
  CONTACT_STATUSES,
  exportContactsForOwner,
  qrCampaignRouter,
} from "./proTools";
import { assertPro } from "./billing/gate";
import { ENV } from "./_core/env";
import {
  assertBrandingAllowed, assertInsightRange, createCardForOwner, leadCaptureOpen, withLeadQuota,
} from "./billing/gate";
import { getPlaceDetails, searchBusinesses, signSelection, verifyConfirmedPlace, verifySelection } from "./googlePlaces";
import { PlacesCapError, placesUsageReport, savePlacesSettings } from "./googlePlacesUsage";
import { assertSetupAvailable, connectManualReviewPage, connectReviewPage, deleteReviewPage, directReviewLink, ownerReviewPage, publicReviewPage, reviewConnectionAllowance, ReviewLinkRequiredError, ReviewPlanLimitError, reviewPageForCard, reviewSummary, trackReviewEvent, updateReviewSettings } from "./googleReviews";

// Rendered as <img src>, so only http(s) or same-origin storage paths — never data:/javascript:.
const imageUrl = z
  .string()
  .max(600)
  .refine(
    value => /^(https?:\/\/|\/(?!\/))/i.test(value), "Image must be an https link or an uploaded file")
  .optional()
  .nullable();

export const MAX_PORTFOLIO_ITEMS = 20;
export const MAX_PORTFOLIO_LENGTH = 12000;

const portfolioSchema = z
  .string()
  .max(MAX_PORTFOLIO_LENGTH, `Portfolio cannot exceed ${MAX_PORTFOLIO_LENGTH} characters`
  )
  .refine(value => {
    if (!value || !value.trim()) return true;
    try {
      const parsed = JSON.parse(value);
      return !Array.isArray(parsed) || parsed.length <= MAX_PORTFOLIO_ITEMS;
    } catch {
      return true;
    }
  }, `Portfolio can have at most ${MAX_PORTFOLIO_ITEMS} items`)
  .optional()
  .nullable();

type ContactNotice = {
  name: string;
  email: string | null;
  phone: string | null;
};

/** Emails the card owner about a new contact. The contact is already saved, so nothing here may throw. */
async function notifyOwnerOfContact(
  card: { ownerUserId: number; displayName: string; contactsPath?: string },
  contact: ContactNotice,
  origin: string
) {
  try {
    const owner = await getUserById(card.ownerUserId);
    if (!owner?.email) return;
    await sendMail(
      newContactMail({
        to: owner.email,
        cardName: card.displayName,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        contactsUrl: `${origin}${card.contactsPath ?? "/app/contacts"}`,
      })
    );
  } catch (error) {
    console.error("[Mail] could not notify card owner:", error);
  }
}

const MINUTE = 60_000;

// Uploads are served back to visitors, so only accept formats a card can show or offer
// for download. Never SVG or HTML, which can carry script.
const UPLOAD_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  zip: "application/zip",
};
const ALLOWED_UPLOAD_TYPES = new Set(
  Object.values(UPLOAD_TYPES).concat("application/x-zip-compressed")
);
// Base64 of the 3 MB client cap; Vercel rejects bodies over ~4.5 MB anyway.
const MAX_UPLOAD_BASE64 = 4_200_000;

export function resolveUploadType(
  fileName: string,
  contentType: string
): string | null {
  const declared = contentType.toLowerCase().split(";")[0].trim();
  if (ALLOWED_UPLOAD_TYPES.has(declared)) return declared;
  // Some systems send an empty or generic type for documents; fall back to the extension.
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension ? (UPLOAD_TYPES[extension] ?? null) : null;
}

const startsWith = (
  bytes: Buffer,
  signature: number[] | string,
  offset = 0
) => {
  const expected =
    typeof signature === "string"
      ? Buffer.from(signature, "latin1")
      : Buffer.from(signature);
  return bytes.subarray(offset, offset + expected.length).equals(expected);
};

// The first bytes of each format an upload may be. Containers cover several types: a .docx is a zip, and MP4, MOV
// and AVIF are all ISO media files. Checked in order, so the loose PDF check goes last.
const FILE_FORMATS: { types: string[]; matches: (bytes: Buffer) => boolean }[] =
  [
    { types: ["image/jpeg"], matches: b => startsWith(b, [0xff, 0xd8, 0xff]) },
    {
      types: ["image/png"],
      matches: b =>
        startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    },
    { types: ["image/gif"], matches: b => startsWith(b, "GIF8") },
    {
      types: ["image/webp"],
      matches: b => startsWith(b, "RIFF") && startsWith(b, "WEBP", 8),
    },
    {
      types: ["image/avif", "video/mp4", "video/quicktime"],
      matches: b => startsWith(b, "ftyp", 4),
    },
    // QuickTime files from older cameras can open with another atom instead of `ftyp`.
    {
      types: ["video/quicktime"],
      matches: b =>
        ["moov", "mdat", "wide", "free", "skip", "pnot"].some(atom =>
          startsWith(b, atom, 4)
        ),
    },
    {
      types: ["video/webm"],
      matches: b => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
    },
    {
      types: ["application/msword"],
      matches: b =>
        startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    },
    {
      types: [
        UPLOAD_TYPES.docx,
        "application/zip",
        "application/x-zip-compressed",
      ],
      matches: b =>
        startsWith(b, [0x50, 0x4b, 0x03, 0x04]) ||
        startsWith(b, [0x50, 0x4b, 0x05, 0x06]),
    },
    {
      types: ["application/pdf"],
      matches: b => b.subarray(0, 1024).includes("%PDF-"),
    },
  ];
const PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

// The declared type and extension are the uploader's say-so; the bytes are what visitors get. Returns the type to store
// the file under, or null when the bytes aren't that kind of file.
export function confirmUploadType(
  bytes: Buffer,
  contentType: string
): string | null {
  const format = FILE_FORMATS.find(({ matches }) => matches(bytes));
  if (!format) return null;
  if (format.types.includes(contentType)) return contentType;
  // A photo saved under the wrong image extension is still a photo: store it under its real type.
  if (PHOTO_TYPES.has(contentType) && PHOTO_TYPES.has(format.types[0]))
    return format.types[0];
  return null;
}

async function enforceRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowMs: number
) {
  const result = await rateLimit(
    `${scope}:${hashIdentifier(identity)}`,
    limit,
    windowMs
  );
  if (!result.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please wait a moment and try again.",
    });
  }
}

// Setup and reconnect are the only callers of Google Places, and only for a card the signed-in owner holds.
async function placesCaller(cardId: number, ownerId: number) {
  const card = await getCardByIdForOwner(cardId, ownerId);
  if (!card || card.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found." });
  // Out of setups for the week: stop here, before Google is asked anything.
  try {
    await assertSetupAvailable(ownerId);
  } catch (error) {
    if (error instanceof ReviewPlanLimitError) throw new TRPCError({ code: "FORBIDDEN", message: error.message });
    throw error;
  }
  return { cardId, ownerId };
}

function placesFailure(scope: string, error: unknown) {
  if (error instanceof TRPCError) return error;
  // The cap is an admin setting; owners only learn that setup is paused.
  if (error instanceof PlacesCapError) return new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Google business setup is paused right now. Please try again later." });
  console.error(`[Google Places] ${scope} failed:`, error);
  return new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Google business search is temporarily unavailable. Please try again." });
}

const percent = z.number().int().min(1).max(100);
const requestLimit = z.number().int().min(1).max(100_000_000);

export const appRouter = router({
  billing: billingRouter,
  teams: teamsRouter,
  teamCards: teamCardsRouter,
  teamDepartments: teamDepartmentsRouter,
  teamBrand: teamBrandRouter,
  teamTemplates: teamTemplatesRouter,
  teamRequests: teamRequestsRouter,
  teamContacts: teamContactsRouter,
  teamAnalytics: teamAnalyticsRouter,
  teamEvents: teamEventsRouter,
  publicEvent: publicEventRouter,
  teamAssets: teamAssetsRouter,
  teamBanners: teamBannersRouter,
  teamKit: teamKitRouter,
  qrCampaigns: qrCampaignRouter,
  system: systemRouter,
  admin: router({
    placesUsage: adminProcedure.query(() => placesUsageReport()),
    placesSettings: adminProcedure.input(z.object({ monthlyFreeLimit: requestLimit, warnPercent: percent, nearLimitPercent: percent, capEnabled: z.boolean(), capLimit: requestLimit })).mutation(({ input }) => savePlacesSettings(input)),
  }),
  googleReviews: router({
    search: protectedProcedure.input(z.object({ cardId: z.number().int().positive(), query: z.string().trim().min(3).max(120), sessionToken: z.string().uuid() })).query(async ({ ctx, input }) => {
      await enforceRateLimit("places-search", `user:${ctx.user.id}`, 30, MINUTE);
      try {
        return (await searchBusinesses(input.query, input.sessionToken, await placesCaller(input.cardId, ctx.user.id))).map(result => ({ ...result, token: signSelection(result.id, ctx.user.id) }));
      } catch (error) {
        throw placesFailure("search", error);
      }
    }),
    select: protectedProcedure.input(z.object({ cardId: z.number().int().positive(), suggestionToken: z.string().max(1000), sessionToken: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      await enforceRateLimit("places-details", `user:${ctx.user.id}`, 20, MINUTE);
      const placeId = verifySelection(input.suggestionToken, ctx.user.id);
      if (!placeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Search for your business again." });
      try {
        const place = await getPlaceDetails(placeId, input.sessionToken, await placesCaller(input.cardId, ctx.user.id));
        if (place.id !== placeId) throw new Error("Place mismatch");
        return {
          place: {
            name: place.displayName?.text,
            address: place.formattedAddress,
            category: place.primaryTypeDisplayName?.text,
            rating: place.rating,
            reviewCount: place.userRatingCount,
            hasDirectReviewLink: Boolean(directReviewLink(place.googleMapsLinks?.writeAReviewUri)),
          },
          selectionToken: signSelection(place.id, ctx.user.id, place),
        };
      } catch (error) {
        throw placesFailure("details", error);
      }
    }),
    connect: protectedProcedure.input(z.object({ cardId: z.number().int().positive(), selectionToken: z.string().max(8000), reviewUrl: z.string().url().max(2048).optional() })).mutation(async ({ ctx, input }) => {
      await enforceRateLimit("places-connect", `user:${ctx.user.id}`, 10, MINUTE);
      if (input.reviewUrl && !directReviewLink(input.reviewUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Paste the review link from your Google Business Profile." });
      // The signed token carries the details fetched in `select`, so confirming costs no Google request.
      const place = verifyConfirmedPlace(input.selectionToken, ctx.user.id);
      if (!place) throw new TRPCError({ code: "BAD_REQUEST", message: "Search for your business again." });
      try {
        const page = await connectReviewPage(input.cardId, ctx.user.id, place, input.reviewUrl);
        if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found." });
        return page;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof ReviewPlanLimitError) throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        if (error instanceof ReviewLinkRequiredError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        console.error("[Google Reviews] connection failed:", error);
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Could not connect your business. Please try again." });
      }
    }),
    connectManual: protectedProcedure.input(z.object({ cardId: z.number().int().positive(), reviewUrl: z.string().url().max(2048) })).mutation(async ({ ctx, input }) => {
      await enforceRateLimit("manual-review-connect", `user:${ctx.user.id}`, 10, MINUTE);
      if (!directReviewLink(input.reviewUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Paste the review link from your Google Business Profile." });
      try {
        const page = await connectManualReviewPage(input.cardId, ctx.user.id, input.reviewUrl);
        if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found." });
        return page;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof ReviewPlanLimitError) throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        if (error instanceof ReviewLinkRequiredError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        console.error("[Google Reviews] manual connection failed:", error);
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Could not save your review link. Please try again." });
      }
    }),
    ownerPage: protectedProcedure.input(z.object({ cardId: z.number().int().positive() })).query(({ ctx, input }) => ownerReviewPage(input.cardId, ctx.user.id)),
    allowance: protectedProcedure.input(z.object({ cardId: z.number().int().positive() })).query(({ ctx, input }) => reviewConnectionAllowance(input.cardId, ctx.user.id)),
    summary: protectedProcedure.input(z.object({ cardId: z.number().int().positive(), days: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90)]).nullable() })).query(({ ctx, input }) => reviewSummary(input.cardId, ctx.user.id, input.days)),
    settings: protectedProcedure.input(z.object({ cardId: z.number().int().positive(), enabled: z.boolean().optional(), showOnCard: z.boolean().optional(), reviewUrl: z.string().url().max(2048).nullable().optional() })).mutation(async ({ ctx, input }) => {
      const { cardId, ...patch } = input;
      if (patch.reviewUrl && !directReviewLink(patch.reviewUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Paste the review link from your Google Business Profile." });
      const page = await updateReviewSettings(cardId, ctx.user.id, patch);
      if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Review page not found." });
      return page;
    }),
    delete: protectedProcedure.input(z.object({ cardId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (!(await deleteReviewPage(input.cardId, ctx.user.id))) throw new TRPCError({ code: "NOT_FOUND", message: "Review page not found." });
      return { ok: true };
    }),
    publicPage: publicProcedure.input(z.object({ slug: z.string().min(1).max(24) })).query(({ input }) => publicReviewPage(input.slug)),
    forCard: publicProcedure.input(z.object({ cardId: z.number().int().positive() })).query(({ input }) => reviewPageForCard(input.cardId)),
    track: publicProcedure.input(z.object({ slug: z.string().min(1).max(24), type: z.enum(["page_view", "qr_scan", "nfc_tap", "google_review_click", "view_google_maps_click", "review_completion_acknowledged"]), source: z.string().regex(/^[a-z0-9_-]{1,32}$/), campaign: z.string().regex(/^[a-z0-9_-]{1,64}$/).optional(), device: z.enum(["mobile", "tablet", "desktop"]).optional() })).mutation(async ({ ctx, input }) => {
      await enforceRateLimit("review-track", clientIp(ctx.req), 60, MINUTE);
      return { ok: await trackReviewEvent(input.slug, input.type, input.source, input.campaign, input.device) };
    }),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  cards: router({
    list: protectedProcedure.query(({ ctx }) => getCardsByOwner(ctx.user.id)),
    /** Owner-only content backup. Scoped by ctx.user.id at every query, never by input. */
    export: protectedProcedure.query(async ({ ctx }) => {
      const owned = await getCardsByOwner(ctx.user.id);
      // ponytail: one reference query per card, fine up to the 500-card owner limit.
      const refs = await Promise.all(
        owned.map(
          async card =>
            [card.id, await getReferencesByOwner(card.id, ctx.user.id)] as const
        )
      );
      return buildCardExport(owned, new Map(refs));
    }),
    get: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ ctx, input }) => getCardByIdForOwner(input.id, ctx.user.id)),
    create: protectedProcedure
      .input(
        z.object({ ...serverCardFields, published: z.boolean().optional() })
      )
      .mutation(async ({ ctx, input }) => {
        const validation = validateCardData(input);
        if (!validation.isValid) {
          const firstError = Object.values(validation.errors)[0];
          throw new TRPCError({ code: "BAD_REQUEST", message: firstError });
        }
        // Set once here. update never touches slug, so shared links and printed QR codes survive renames.
        const slug = makeCardSlug(input.displayName, nanoid(6));
        await assertBrandingAllowed(ctx.user, input.page);
        const created = await createCardForOwner(ctx.user, {
          ...input,
          title: input.title ?? "",
          ownerUserId: ctx.user.id,
          slug,
          published: input.published ?? false,
          links: input.links ?? "[]",
          portfolio: input.portfolio ?? "[]",
          channels: input.channels ?? "[]",
          theme: input.theme ?? "midnight",
        });
        await tidyOwnerUploads(ctx.user.id);
        return created;
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          ...serverCardFields,
          published: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...rest } = input;
        const validation = validateCardData(rest);
        if (!validation.isValid) {
          const firstError = Object.values(validation.errors)[0];
          throw new TRPCError({ code: "BAD_REQUEST", message: firstError });
        }
        const before = await getCardByIdForOwner(id, ctx.user.id);
        if (!before) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Card not found.",
          });
        }
        if (rest.page !== undefined)
          await assertBrandingAllowed(ctx.user, rest.page, before.page);
        const updated = await updateCard(id, ctx.user.id, {
          ...rest,
          title: rest.title ?? "",
        });
        // A replaced or removed photo or file is no longer linked anywhere, so it can go.
        if (before && updated) await tidyOwnerUploads(ctx.user.id, before);
        return updated;
      }),
    publish: protectedProcedure
      .input(
        z.object({ id: z.number().int().positive(), published: z.boolean() })
      )
      .mutation(async ({ ctx, input }) => {
        const card = await getCardByIdForOwner(input.id, ctx.user.id);
        if (!card) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Card not found.",
          });
        }
        if (input.published) {
          const validation = validateCardData(card);
          if (!validation.isValid) {
            const firstError = Object.values(validation.errors)[0];
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Cannot publish: ${firstError}`,
            });
          }
        }
        const updated = await updateCard(input.id, ctx.user.id, {
          published: input.published,
        });
        if (!updated) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Card not found.",
          });
        }
        return updated;
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const card = await deleteCard(input.id, ctx.user.id);
        if (!card) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Card not found.",
          });
        }
        // The card is already gone, so a storage hiccup only leaves unused files behind.
        await tidyOwnerUploads(ctx.user.id, card);
        return true;
      }),
  }),
  contacts: router({
    export: protectedProcedure.query(({ ctx }) =>
      exportContactsForOwner(ctx.user)
    ),
    list: protectedProcedure
      .input(
        z
          .object({
            cursor: z.number().int().positive().nullish(),
            limit: z.number().int().min(1).max(500).optional(),
          })
          .optional()
      )
      .query(({ ctx, input }) =>
        getContactsByOwner(ctx.user.id, {
          cursor: input?.cursor,
          limit: input?.limit,
        })
      ),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(CONTACT_STATUSES).optional(),
          tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
          notes: z.string().max(1000).optional().nullable(),
          followedUp: z.boolean().optional(),
          // A calendar day from <input type="date">, stored as midnight UTC. Null clears it.
          followUpOn: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .refine(
              day => !Number.isNaN(Date.parse(`${day}T00:00:00Z`)),
              "Invalid date"
            )
            .nullable()
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ENV.planLimitsEnabled) await assertPro(ctx.user);
        const updated = await updateContact(input.id, ctx.user.id, {
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.tags
            ? { tags: JSON.stringify(Array.from(new Set(input.tags))) }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
          ...(input.followedUp !== undefined
            ? { followedUp: input.followedUp }
            : {}),
          ...(input.followUpOn !== undefined
            ? {
                followUpOn: input.followUpOn
                  ? new Date(`${input.followUpOn}T00:00:00Z`)
                  : null,
              }
            : {}),
        });
        if (!updated)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Contact not found",
          });
        return updated;
      }),
    markSeen: protectedProcedure.mutation(({ ctx }) =>
      markContactsSeen(ctx.user.id)
    ),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => deleteContact(input.id, ctx.user.id)),
  }),
  insights: router({
    summary: protectedProcedure
      .input(
        z.object({
          days: z
            .union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)])
            .default(INSIGHTS_RANGES[0]),
        })
      )
      .query(async ({ ctx, input }) => {
        await assertInsightRange(ctx.user, input.days);
        const now = new Date();
        const [rows, cards] = await Promise.all([
          getInsightsRows(ctx.user.id, insightsSince(input.days, now)),
          getCardsByOwner(ctx.user.id),
        ]);
        const summary = buildInsights(rows, cards, input.days, now);
        return {
          ...summary,
          advanced: await advancedInsights(ctx.user, rows, summary.daily),
        };
      }),
  }),
  references: router({
    list: protectedProcedure
      .input(z.object({ cardId: z.number().int().positive() }))
      .query(({ ctx, input }) =>
        getReferencesByOwner(input.cardId, ctx.user.id)
      ),
    create: protectedProcedure
      .input(
        z.object({
          cardId: z.number().int().positive(),
          clientName: z.string().min(1).max(160),
          clientRole: z.string().max(160).optional().nullable(),
          company: z.string().max(160).optional().nullable(),
          quote: z.string().min(8).max(1200),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const card = await getCardByIdForOwner(input.cardId, ctx.user.id);
        if (!card)
          throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
        return createReference({
          ...input,
          ownerUserId: ctx.user.id,
          approved: true,
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => deleteReference(input.id, ctx.user.id)),
    /** Approve a visitor's review so it shows on the card, or take it back off. */
    setApproved: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), approved: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const found = await setReferenceApproved(input.id, ctx.user.id, input.approved);
        if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });
        return true;
      }),
  }),
  media: router({
    upload: protectedProcedure
      .input(
        z.object({
          fileName: z.string().min(1).max(180),
          contentType: z.string().min(1).max(120),
          dataBase64: z
            .string()
            .min(1)
            .max(
              MAX_UPLOAD_BASE64,
              "File is larger than 3MB. Upload a smaller file or add it as a link."
            ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await enforceRateLimit(
          "upload",
          `user:${ctx.user.id}`,
          30,
          10 * MINUTE
        );
        const resolvedType = resolveUploadType(
          input.fileName,
          input.contentType
        );
        if (!resolvedType) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "That file type isn't supported. Use JPG, PNG, WebP, GIF, MP4, WebM, MOV, PDF, Word, or ZIP.",
          });
        }
        const bytes = Buffer.from(input.dataBase64, "base64");
        const contentType = confirmUploadType(bytes, resolvedType);
        if (!contentType) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "That file looks damaged, or isn't the type its name says. Try saving or exporting it again.",
          });
        }
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
        // Unique prefix so re-uploading "photo.jpg" never overwrites a file another card still uses.
        try {
          return await storagePut(
            `${ctx.user.id}-portfolio/${nanoid(8)}-${safeName}`,
            bytes,
            contentType
          );
        } catch (error) {
          // Storage errors ("fetch failed", bucket names) mean nothing to the person uploading.
          console.error("[Upload] storage failed:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Could not save that file right now. Please try again in a moment.",
          });
        }
      }),
  }),
  publicCard: router({
    bySlug: publicProcedure
      .input(z.object({ slug: z.string().min(1).max(120) }))
      .query(async ({ ctx, input }) => {
        const ip = clientIp(ctx.req);
        await enforceRateLimit("card-read", ip, 120, MINUTE);
        const card = await getPublicCardBySlug(input.slug);
        if (card && card.id !== DEMO_CARD_ID) {
          // Count a visitor once per half hour, so refreshes and retries do not inflate Insights.
          const firstView = await rateLimit(
            `view:${card.id}:${hashIdentifier(ip)}`,
            1,
            30 * MINUTE
          );
          if (firstView.allowed)
            await recordAnalytics(card.id, "view", "public_card");
        }
        // null, not undefined: a missing slug is an empty result. undefined makes the client treat it as a failed query.
        if (!card) return null;
        const [refs, team, acceptsDetails] = await Promise.all([
          getReferencesByCard(card.id, true),
          cardTeamExtras(card),
          card.id === DEMO_CARD_ID
            ? true
            : leadCaptureOpen(card.ownerUserId).catch(() => true),
        ]);
        // acceptsDetails false: the owner's free lead quota is used up, so the page offers direct contact instead of the form.
        // Which team a card belongs to, and who holds it, is not the public's business.
        const { workspaceId: _team, assignedUserId: _holder, teamStatus: _status, ...shown } = card;
        // team: the banners and company files this card shows, or null. Never the team itself.
        return { ...shown, references: refs, acceptsDetails, team };
      }),
    /**
     * A visitor leaves a review on a Business or Services card. It is stored unapproved:
     * nothing a stranger writes shows on the card until its owner approves it.
     */
    review: publicProcedure
      .input(
        z.object({
          slug: z.string().min(1).max(120),
          name: z.string().trim().min(1).max(80),
          rating: z.number().int().min(1).max(5),
          body: z.string().trim().min(8).max(1200),
          website: z.string().max(200).optional().nullable(), // Honeypot field
        })
      )
      .mutation(async ({ ctx, input }) => {
        await enforceRateLimit("review", clientIp(ctx.req), 3, 60 * MINUTE);
        // A bot that fills the hidden field gets a normal-looking answer and nothing is stored.
        if (input.website) return { received: true };
        const card = await getPublicCardBySlug(input.slug);
        if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
        if (card.id === DEMO_CARD_ID) return { received: true };
        if (parsePageConfig(card.page).template === "professional")
          throw new TRPCError({ code: "BAD_REQUEST", message: "This card does not take reviews." });
        if ((await countPendingReviews(card.id)) >= MAX_PENDING_REVIEWS)
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "This card has many reviews waiting. Please try again later." });
        await createReference({
          cardId: card.id,
          ownerUserId: card.ownerUserId,
          clientName: input.name,
          quote: input.body,
          rating: input.rating,
          fromVisitor: true,
          approved: false,
        });
        return { received: true };
      }),
    exchange: publicProcedure
      .input(
        z.object({
          cardId: z.number().int(),
          campaignId: z.string().max(32).optional(),
          name: z.string().min(1).max(160),
          email: z.string().email().optional().nullable(),
          phone: z.string().max(64).optional().nullable(),
          company: z.string().max(160).optional().nullable(),
          title: z.string().max(160).optional().nullable(),
          notes: z.string().max(1000).optional().nullable(),
          website: z.string().max(200).optional().nullable(), // Honeypot field
        })
      )
      .mutation(async ({ ctx, input }) => {
        await enforceRateLimit("exchange", clientIp(ctx.req), 10, 10 * MINUTE);
        // If honeypot is filled by bot, drop silently
        if (input.website) {
          return { id: 0, name: input.name, source: "exchange_form" };
        }
        if (input.cardId === DEMO_CARD_ID) {
          // Simulated exchange on demo card: no DB write, no owner email, no analytics
          return {
            id: -999,
            cardId: DEMO_CARD_ID,
            ownerUserId: 0,
            name: input.name,
            email: input.email ?? null,
            phone: input.phone ?? null,
            company: input.company ?? null,
            title: input.title ?? null,
            notes: input.notes ?? null,
            tags: "[]",
            source: "exchange_form",
            followedUp: false,
            seenAt: null,
            followUpOn: null,
            createdAt: new Date(),
          };
        }
        const card = await getCardById(input.cardId);
        if (!card || !card.published || card.deletedAt || card.teamStatus)
          throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
        const campaign = await campaignForCard(input.campaignId, card.id);
        // A company card's contact belongs to the team: it is held in the team owner's name, like the card,
        // and assigned to the person holding the card. It never enters anyone's personal contacts.
        const team = card.workspaceId ? await teamContactFields({ workspaceId: card.workspaceId, assignedUserId: card.assignedUserId }) : null;
        const receiverUserId: number = card.assignedUserId ?? card.ownerUserId;
        const contact = await withLeadQuota(card.ownerUserId, () =>
          createContact({
            campaignId: campaign?.id ?? null,
            ownerUserId: card.ownerUserId,
            ...team,
            cardId: input.cardId,
            name: input.name,
            email: input.email ?? null,
            phone: input.phone ?? null,
            company: input.company ?? null,
            title: input.title ?? null,
            notes: input.notes ?? null,
            tags: "[]",
            source: "exchange_form",
          })
        );
        await recordAnalytics(input.cardId, "save", "exchange_form");
        await notifyOwnerOfContact(
          { ownerUserId: receiverUserId, displayName: card.displayName, contactsPath: card.workspaceId ? `/app/team/${card.workspaceId}` : undefined },
          contact,
          siteOrigin(ctx.req)
        );
        return contact;
      }),
    // Fire-and-forget visitor actions for the owner's Insights. Public, like views, so counts are best-effort.
    track: publicProcedure
      .input(
        z.object({
          cardId: z.number().int(),
          type: z.enum(["vcard", "link", "share"]),
          target: z.string().trim().max(80).optional().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (input.cardId === DEMO_CARD_ID) return { ok: true };
        const limit = await rateLimit(
          `track:${hashIdentifier(clientIp(ctx.req))}`,
          60,
          MINUTE
        );
        if (!limit.allowed) return { ok: false };
        const card = await getCardById(input.cardId);
        if (!card || !card.published || card.deletedAt || card.teamStatus) return { ok: false };
        await recordAnalytics(card.id, input.type, input.target || undefined);
        return { ok: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
