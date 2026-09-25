import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { clientIp, hashIdentifier, rateLimit } from "./_core/rateLimit";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import { tidyOwnerUploads } from "./uploadSweep";
import {
  createReference,
  createCard,
  createContact,
  deleteCard,
  deleteContact,
  deleteReference,
  getCardById,
  getCardByIdForOwner,
  getCardsByOwner,
  getContactsByOwner,
  getInsightsRows,
  getReferencesByCard,
  getReferencesByOwner,
  getPublicCardBySlug,
  markContactsSeen,
  recordAnalytics,
  updateCard,
  updateContact,
} from "./db";
import { buildInsights, INSIGHTS_RANGES, insightsSince } from "./insights";

// Rendered as <img src>, so only http(s) or same-origin storage paths — never data:/javascript:.
const imageUrl = z
  .string()
  .max(600)
  .refine((value) => /^(https?:\/\/|\/(?!\/))/i.test(value), "Image must be an https link or an uploaded file")
  .optional()
  .nullable();

export const MAX_PORTFOLIO_ITEMS = 20;
export const MAX_PORTFOLIO_LENGTH = 12000;

const portfolioSchema = z
  .string()
  .max(MAX_PORTFOLIO_LENGTH, `Portfolio cannot exceed ${MAX_PORTFOLIO_LENGTH} characters`)
  .refine(
    (value) => {
      if (!value || !value.trim()) return true;
      try {
        const parsed = JSON.parse(value);
        return !Array.isArray(parsed) || parsed.length <= MAX_PORTFOLIO_ITEMS;
      } catch {
        return true;
      }
    },
    `Portfolio can have at most ${MAX_PORTFOLIO_ITEMS} items`
  )
  .optional()
  .nullable();

const cardFields = {
  displayName: z.string().min(1).max(160),
  title: z.string().min(1).max(160),
  company: z.string().max(160).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  location: z.string().max(160).optional().nullable(),
  bio: z.string().max(800).optional().nullable(),
  links: z.string().max(3000).optional().nullable(),
  portfolio: portfolioSchema,
  channels: z.string().max(6000).optional().nullable(),
  theme: z.string().max(80).optional().nullable(),
  logoUrl: z.string().max(600).optional().nullable(),
  avatarUrl: imageUrl,
  coverUrl: imageUrl,
  backgroundUrl: imageUrl,
};

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
const ALLOWED_UPLOAD_TYPES = new Set(Object.values(UPLOAD_TYPES).concat("application/x-zip-compressed"));
// Base64 of the 3 MB client cap; Vercel rejects bodies over ~4.5 MB anyway.
const MAX_UPLOAD_BASE64 = 4_200_000;

export function resolveUploadType(fileName: string, contentType: string): string | null {
  const declared = contentType.toLowerCase().split(";")[0].trim();
  if (ALLOWED_UPLOAD_TYPES.has(declared)) return declared;
  // Some systems send an empty or generic type for documents; fall back to the extension.
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension ? UPLOAD_TYPES[extension] ?? null : null;
}

const startsWith = (bytes: Buffer, signature: number[] | string, offset = 0) => {
  const expected = typeof signature === "string" ? Buffer.from(signature, "latin1") : Buffer.from(signature);
  return bytes.subarray(offset, offset + expected.length).equals(expected);
};

// The first bytes of each format an upload may be. Containers cover several types: a .docx is a zip, and MP4, MOV
// and AVIF are all ISO media files. Checked in order, so the loose PDF check goes last.
const FILE_FORMATS: { types: string[]; matches: (bytes: Buffer) => boolean }[] = [
  { types: ["image/jpeg"], matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { types: ["image/png"], matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { types: ["image/gif"], matches: (b) => startsWith(b, "GIF8") },
  { types: ["image/webp"], matches: (b) => startsWith(b, "RIFF") && startsWith(b, "WEBP", 8) },
  { types: ["image/avif", "video/mp4", "video/quicktime"], matches: (b) => startsWith(b, "ftyp", 4) },
  // QuickTime files from older cameras can open with another atom instead of `ftyp`.
  { types: ["video/quicktime"], matches: (b) => ["moov", "mdat", "wide", "free", "skip", "pnot"].some((atom) => startsWith(b, atom, 4)) },
  { types: ["video/webm"], matches: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]) },
  { types: ["application/msword"], matches: (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
  {
    types: [UPLOAD_TYPES.docx, "application/zip", "application/x-zip-compressed"],
    matches: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]),
  },
  { types: ["application/pdf"], matches: (b) => b.subarray(0, 1024).includes("%PDF-") },
];
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

// The declared type and extension are the uploader's say-so; the bytes are what visitors get. Returns the type to store
// the file under, or null when the bytes aren't that kind of file.
export function confirmUploadType(bytes: Buffer, contentType: string): string | null {
  const format = FILE_FORMATS.find(({ matches }) => matches(bytes));
  if (!format) return null;
  if (format.types.includes(contentType)) return contentType;
  // A photo saved under the wrong image extension is still a photo: store it under its real type.
  if (PHOTO_TYPES.has(contentType) && PHOTO_TYPES.has(format.types[0])) return format.types[0];
  return null;
}

async function enforceRateLimit(scope: string, identity: string, limit: number, windowMs: number) {
  const result = await rateLimit(`${scope}:${hashIdentifier(identity)}`, limit, windowMs);
  if (!result.allowed) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many requests. Please wait a moment and try again." });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  cards: router({
    list: protectedProcedure.query(({ ctx }) => getCardsByOwner(ctx.user.id)),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) =>
      getCardByIdForOwner(input.id, ctx.user.id),
    ),
    create: protectedProcedure
      .input(z.object({ ...cardFields, published: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const slug = `${input.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "card"}-${nanoid(6).toLowerCase()}`;
        const created = await createCard({
          ...input,
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
      .input(z.object({ id: z.number().int().positive(), ...cardFields, published: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...rest } = input;
        const before = await getCardByIdForOwner(id, ctx.user.id);
        const updated = await updateCard(id, ctx.user.id, rest);
        // A replaced or removed photo or file is no longer linked anywhere, so it can go.
        if (before && updated) await tidyOwnerUploads(ctx.user.id, before);
        return updated;
      }),
    publish: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), published: z.boolean() }))
      .mutation(({ ctx, input }) => updateCard(input.id, ctx.user.id, { published: input.published })),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const card = await deleteCard(input.id, ctx.user.id);
        if (!card) return false;
        // The card is already gone, so a storage hiccup only leaves unused files behind.
        await tidyOwnerUploads(ctx.user.id, card);
        return true;
      }),
  }),
  contacts: router({
    list: protectedProcedure
      .input(z.object({
        cursor: z.number().int().positive().nullish(),
        limit: z.number().int().min(1).max(500).optional(),
      }).optional())
      .query(({ ctx, input }) => getContactsByOwner(ctx.user.id, { cursor: input?.cursor, limit: input?.limit })),
    update: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
        notes: z.string().max(1000).optional().nullable(),
        followedUp: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const updated = await updateContact(input.id, ctx.user.id, {
          ...(input.tags ? { tags: JSON.stringify(Array.from(new Set(input.tags))) } : {}),
          ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
          ...(input.followedUp !== undefined ? { followedUp: input.followedUp } : {}),
        });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
        return updated;
      }),
    markSeen: protectedProcedure.mutation(({ ctx }) => markContactsSeen(ctx.user.id)),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => deleteContact(input.id, ctx.user.id)),
  }),
  insights: router({
    summary: protectedProcedure
      .input(z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(INSIGHTS_RANGES[0]) }))
      .query(async ({ ctx, input }) => {
        const now = new Date();
        const [rows, cards] = await Promise.all([
          getInsightsRows(ctx.user.id, insightsSince(input.days, now)),
          getCardsByOwner(ctx.user.id),
        ]);
        return buildInsights(rows, cards, input.days, now);
      }),
  }),
  references: router({
    list: protectedProcedure.input(z.object({ cardId: z.number().int().positive() })).query(({ ctx, input }) => getReferencesByOwner(input.cardId, ctx.user.id)),
    create: protectedProcedure.input(z.object({
      cardId: z.number().int().positive(),
      clientName: z.string().min(1).max(160),
      clientRole: z.string().max(160).optional().nullable(),
      company: z.string().max(160).optional().nullable(),
      quote: z.string().min(8).max(1200),
    })).mutation(async ({ ctx, input }) => {
      const card = await getCardByIdForOwner(input.cardId, ctx.user.id);
      if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
      return createReference({ ...input, ownerUserId: ctx.user.id, approved: true });
    }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => deleteReference(input.id, ctx.user.id)),
  }),
  media: router({
    upload: protectedProcedure.input(z.object({
      fileName: z.string().min(1).max(180),
      contentType: z.string().min(1).max(120),
      dataBase64: z.string().min(1).max(MAX_UPLOAD_BASE64, "File is larger than 3MB. Upload a smaller file or add it as a link."),
    })).mutation(async ({ ctx, input }) => {
      await enforceRateLimit("upload", `user:${ctx.user.id}`, 30, 10 * MINUTE);
      const resolvedType = resolveUploadType(input.fileName, input.contentType);
      if (!resolvedType) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That file type isn't supported. Use JPG, PNG, WebP, GIF, MP4, WebM, MOV, PDF, Word, or ZIP." });
      }
      const bytes = Buffer.from(input.dataBase64, "base64");
      const contentType = confirmUploadType(bytes, resolvedType);
      if (!contentType) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That file looks damaged, or isn't the type its name says. Try saving or exporting it again." });
      }
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
      // Unique prefix so re-uploading "photo.jpg" never overwrites a file another card still uses.
      try {
        return await storagePut(`${ctx.user.id}-portfolio/${nanoid(8)}-${safeName}`, bytes, contentType);
      } catch (error) {
        // Storage errors ("fetch failed", bucket names) mean nothing to the person uploading.
        console.error("[Upload] storage failed:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not save that file right now. Please try again in a moment." });
      }
    }),
  }),
  publicCard: router({
    bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(120) })).query(async ({ ctx, input }) => {
      const ip = clientIp(ctx.req);
      await enforceRateLimit("card-read", ip, 120, MINUTE);
      const card = await getPublicCardBySlug(input.slug);
      if (card) {
        // Count a visitor once per half hour, so refreshes and retries do not inflate Insights.
        const firstView = await rateLimit(`view:${card.id}:${hashIdentifier(ip)}`, 1, 30 * MINUTE);
        if (firstView.allowed) await recordAnalytics(card.id, "view", "public_card");
      }
      return card ? { ...card, references: await getReferencesByCard(card.id, true) } : card;
    }),
    exchange: publicProcedure
      .input(z.object({
        cardId: z.number().int().positive(),
        name: z.string().min(1).max(160),
        email: z.string().email().optional().nullable(),
        phone: z.string().max(64).optional().nullable(),
        company: z.string().max(160).optional().nullable(),
        title: z.string().max(160).optional().nullable(),
        notes: z.string().max(1000).optional().nullable(),
        website: z.string().max(200).optional().nullable(), // Honeypot field
      }))
      .mutation(async ({ ctx, input }) => {
        await enforceRateLimit("exchange", clientIp(ctx.req), 10, 10 * MINUTE);
        // If honeypot is filled by bot, drop silently
        if (input.website) {
          return { id: 0, name: input.name, source: "exchange_form" };
        }
        const card = await getCardById(input.cardId);
        if (!card || !card.published || card.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
        await recordAnalytics(input.cardId, "save", "exchange_form");
        return createContact({
          ownerUserId: card.ownerUserId,
          cardId: input.cardId,
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          company: input.company ?? null,
          title: input.title ?? null,
          notes: input.notes ?? null,
          tags: "[]",
          source: "exchange_form",
        });
      }),
    // Fire-and-forget visitor actions for the owner's Insights. Public, like views, so counts are best-effort.
    track: publicProcedure
      .input(z.object({
        cardId: z.number().int().positive(),
        type: z.enum(["vcard", "link", "share"]),
        target: z.string().trim().max(80).optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const limit = await rateLimit(`track:${hashIdentifier(clientIp(ctx.req))}`, 60, MINUTE);
        if (!limit.allowed) return { ok: false };
        const card = await getCardById(input.cardId);
        if (!card || !card.published || card.deletedAt) return { ok: false };
        await recordAnalytics(card.id, input.type, input.target || undefined);
        return { ok: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
