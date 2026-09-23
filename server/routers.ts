import { COOKIE_NAME } from "@shared/const";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
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
  getReferencesByCard,
  getReferencesByOwner,
  getPublicCardBySlug,
  recordAnalytics,
  restoreCard,
  updateCard,
} from "./db";

const cardFields = {
  displayName: z.string().min(1).max(160),
  title: z.string().min(1).max(160),
  company: z.string().max(160).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  location: z.string().max(160).optional().nullable(),
  bio: z.string().max(800).optional().nullable(),
  links: z.string().max(3000).optional().nullable(),
  portfolio: z.string().max(12000).optional().nullable(),
  channels: z.string().max(6000).optional().nullable(),
  theme: z.string().max(80).optional().nullable(),
  logoUrl: z.string().max(600).optional().nullable(),
};

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
    create: protectedProcedure.input(z.object(cardFields)).mutation(({ ctx, input }) => {
      const slug = `${input.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "card"}-${nanoid(6).toLowerCase()}`;
      return createCard({
        ...input,
        ownerUserId: ctx.user.id,
        slug,
        published: false,
        links: input.links ?? "[]",
        portfolio: input.portfolio ?? "[]",
        channels: input.channels ?? "[]",
        theme: input.theme ?? "midnight",
      });
    }),
    update: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), ...cardFields, published: z.boolean().optional() }))
      .mutation(({ ctx, input }) => {
        const { id, ...rest } = input;
        return updateCard(id, ctx.user.id, rest);
      }),
    publish: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), published: z.boolean() }))
      .mutation(({ ctx, input }) => updateCard(input.id, ctx.user.id, { published: input.published })),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => deleteCard(input.id, ctx.user.id)),
    restore: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => restoreCard(input.id, ctx.user.id)),
  }),
  contacts: router({
    list: protectedProcedure.query(({ ctx }) => getContactsByOwner(ctx.user.id)),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => deleteContact(input.id, ctx.user.id)),
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
      if (!card) throw new Error("Card not found");
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
      dataBase64: z.string().min(1).max(20_000_000),
    })).mutation(async ({ ctx, input }) => {
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const result = await storagePut(`${ctx.user.id}-portfolio/${safeName}`, Buffer.from(input.dataBase64, "base64"), input.contentType);
      return result;
    }),
  }),
  publicCard: router({
    bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(120) })).query(async ({ input }) => {
      const card = await getPublicCardBySlug(input.slug);
      if (card) await recordAnalytics(card.id, "view", "public_card");
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
      .mutation(async ({ input }) => {
        // If honeypot is filled by bot, drop silently
        if (input.website) {
          return { id: 0, name: input.name, source: "exchange_form" };
        }
        const card = await getCardById(input.cardId);
        if (!card || !card.published) throw new Error("Card not found");
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
  }),
});

export type AppRouter = typeof appRouter;
