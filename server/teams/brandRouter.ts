// Brand, card templates and change requests. Admins set the company look and lock details; a member who needs a
// locked detail changed asks, and an admin approves or declines.
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { designReadable, designSchema } from "@shared/design";
import { FIELD_LABELS, LOCKABLE_FIELDS, MAX_TEMPLATES, isAdminRole, type LockableField } from "@shared/teams";
import { cards, users, workspaceChangeRequests, workspaceTemplates, workspaces } from "../../drizzle/schema";
import { router } from "../_core/trpc";
import { storagePut } from "../storage";
import { recordAudit, requireWorkspaceAdmin, requireWorkspaceMember } from "./access";
import { changedLockedFields, lockList, lockedFields, templateCardValues, templateInWorkspace } from "./cardRules";
import { assertValidCard, cardFields, manageableCard } from "./cardsRouter";
import { id, limit, requireDb, teamProcedure } from "./router";

const brandProcedure = teamProcedure("canManageBrand");
const templateProcedure = teamProcedure("canCreateTemplates");
const requestProcedure = teamProcedure("canCreateTeamCards");

const MINUTE = 60 * 1000;
const MAX_LOGO_BASE64 = 4_200_000;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a color");
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(value => value || null);

const companyCards = (workspaceId: number) => and(eq(cards.workspaceId, workspaceId), isNull(cards.deletedAt));

export const teamBrandRouter = router({
  /** Every member may see the brand. Only admins change it. */
  get: brandProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const { workspace } = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    return {
      logoUrl: workspace.logoUrl,
      primary: workspace.brandColors?.primary ?? null,
      accent: workspace.brandColors?.accent ?? null,
      lockedFields: lockedFields(workspace),
    };
  }),

  save: brandProcedure
    .input(z.object({ workspaceId: id, primary: hex.nullable(), accent: hex.nullable(), lockedFields: lockList }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
      const brandColors = { ...(input.primary ? { primary: input.primary } : {}), ...(input.accent ? { accent: input.accent } : {}) };
      const locked = lockedFields({ lockedFields: input.lockedFields });
      await db.update(workspaces).set({ brandColors, lockedFields: locked, updatedAt: new Date() }).where(eq(workspaces.id, input.workspaceId));
      await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "brand.updated", entityType: "workspace", entityId: input.workspaceId, metadata: { lockedFields: locked } });
      return { ok: true } as const;
    }),

  /** The company logo. It is shown on every company card, so saving it updates them all. */
  uploadLogo: brandProcedure
    .input(
      z.object({
        workspaceId: id,
        fileName: z.string().min(1).max(180),
        contentType: z.string().min(1).max(120),
        dataBase64: z.string().min(1).max(MAX_LOGO_BASE64, "Logo is larger than 3MB. Upload a smaller image."),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await limit("team-logo", `user:${ctx.user.id}`, 10, 10 * MINUTE);
      const db = await requireDb();
      await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
      // Loaded on use: the upload checks live beside the personal upload route, which itself mounts this router.
      const { confirmUploadType, resolveUploadType } = await import("../routers");
      const declared = resolveUploadType(input.fileName, input.contentType);
      const bytes = Buffer.from(input.dataBase64, "base64");
      const contentType = declared ? confirmUploadType(bytes, declared) : null;
      if (!contentType || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Use a JPG, PNG or WebP image for the logo." });
      }
      let stored: { url: string };
      try {
        // Kept in the team's own folder, apart from personal uploads, so the personal clean-up never removes it.
        stored = await storagePut(`team-${input.workspaceId}/logo-${nanoid(8)}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-")}`, bytes, contentType);
      } catch (error) {
        console.error("[Teams] logo upload failed:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not save the logo right now. Please try again in a moment." });
      }
      await db.transaction(async tx => {
        await tx.update(workspaces).set({ logoUrl: stored.url, updatedAt: new Date() }).where(eq(workspaces.id, input.workspaceId));
        await tx.update(cards).set({ logoUrl: stored.url, updatedAt: new Date() }).where(companyCards(input.workspaceId));
        await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "brand.logo_changed", entityType: "workspace", entityId: input.workspaceId });
      });
      return { logoUrl: stored.url };
    }),

  removeLogo: brandProcedure.input(z.object({ workspaceId: id })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    await db.transaction(async tx => {
      await tx.update(workspaces).set({ logoUrl: null, updatedAt: new Date() }).where(eq(workspaces.id, input.workspaceId));
      await tx.update(cards).set({ logoUrl: null, updatedAt: new Date() }).where(companyCards(input.workspaceId));
      await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "brand.logo_removed", entityType: "workspace", entityId: input.workspaceId });
    });
    return { ok: true } as const;
  }),
});

const templateFields = {
  name: z.string().trim().min(1).max(80),
  design: designSchema,
  company: optionalText(160),
  location: optionalText(160),
  lockedFields: lockList,
};

function assertReadable(design: z.infer<typeof designSchema>) {
  if (!designReadable(design)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "These colors are hard to read together. Choose a different look or brand color." });
  }
}

export const teamTemplatesRouter = router({
  list: templateProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const rows = await db.select().from(workspaceTemplates).where(eq(workspaceTemplates.workspaceId, input.workspaceId)).orderBy(asc(workspaceTemplates.name));
    const counts = await db
      .select({ templateId: cards.templateId, total: sql<number>`count(*)::int` })
      .from(cards)
      .where(companyCards(input.workspaceId))
      .groupBy(cards.templateId);
    const used = new Map(counts.map(row => [row.templateId, row.total]));
    return {
      templateLimit: MAX_TEMPLATES,
      templates: rows.map(row => ({
        id: row.id,
        name: row.name,
        design: designSchema.parse(row.design),
        company: row.company,
        location: row.location,
        lockedFields: lockedFields({ lockedFields: null }, row),
        isDefault: row.isDefault,
        archived: row.archivedAt !== null,
        cards: used.get(row.id) ?? 0,
      })),
    };
  }),

  create: templateProcedure.input(z.object({ workspaceId: id, ...templateFields })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const { workspaceId, ...fields } = input;
    assertReadable(fields.design);
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(${7017}, ${workspaceId})`);
      const [existing] = await tx.select({ total: sql<number>`count(*)::int` }).from(workspaceTemplates).where(eq(workspaceTemplates.workspaceId, workspaceId));
      if ((existing?.total ?? 0) >= MAX_TEMPLATES) {
        throw new TRPCError({ code: "FORBIDDEN", message: `A team can have up to ${MAX_TEMPLATES} templates.` });
      }
      const [template] = await tx
        .insert(workspaceTemplates)
        .values({ ...fields, workspaceId, createdBy: ctx.user.id })
        .returning({ id: workspaceTemplates.id });
      await recordAudit(tx, { workspaceId, actorUserId: ctx.user.id, action: "template.created", entityType: "template", entityId: template.id, metadata: { name: fields.name } });
      return template;
    });
  }),

  /** Saving a template updates every card that uses it. */
  update: templateProcedure.input(z.object({ workspaceId: id, templateId: id, ...templateFields })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const { workspaceId, templateId, ...fields } = input;
    assertReadable(fields.design);
    const template = await templateInWorkspace(db, workspaceId, templateId);
    return db.transaction(async tx => {
      await tx.update(workspaceTemplates).set({ ...fields, updatedAt: new Date() }).where(eq(workspaceTemplates.id, template.id));
      const using = await tx.select({ id: cards.id, page: cards.page }).from(cards).where(and(companyCards(workspaceId), eq(cards.templateId, template.id)));
      for (const card of using) {
        await tx.update(cards).set({ ...templateCardValues(card, { ...fields, id: template.id }), updatedAt: new Date() }).where(eq(cards.id, card.id));
      }
      await recordAudit(tx, { workspaceId, actorUserId: ctx.user.id, action: "template.updated", entityType: "template", entityId: template.id, metadata: { name: fields.name, cards: using.length } });
      return { cards: using.length };
    });
  }),

  /** An archived template can no longer be chosen. Cards already using it keep their look. */
  setArchived: templateProcedure.input(z.object({ workspaceId: id, templateId: id, archived: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const template = await templateInWorkspace(db, input.workspaceId, input.templateId);
    await db
      .update(workspaceTemplates)
      .set({ archivedAt: input.archived ? new Date() : null, ...(input.archived ? { isDefault: false } : {}), updatedAt: new Date() })
      .where(eq(workspaceTemplates.id, template.id));
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: input.archived ? "template.archived" : "template.restored", entityType: "template", entityId: template.id, metadata: { name: template.name } });
    return { ok: true } as const;
  }),

  /** The template new company cards start with. Pass no template to start new cards plain. */
  setDefault: templateProcedure.input(z.object({ workspaceId: id, templateId: id.nullable() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const template = input.templateId ? await templateInWorkspace(db, input.workspaceId, input.templateId) : null;
    if (template?.archivedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Restore this template first." });
    await db.transaction(async tx => {
      await tx.update(workspaceTemplates).set({ isDefault: false }).where(eq(workspaceTemplates.workspaceId, input.workspaceId));
      if (template) await tx.update(workspaceTemplates).set({ isDefault: true, updatedAt: new Date() }).where(eq(workspaceTemplates.id, template.id));
      await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "template.default_changed", entityType: "template", entityId: template?.id ?? null, metadata: { name: template?.name ?? null } });
    });
    return { ok: true } as const;
  }),

  /** Puts a template on one card, or on every company card when no card is named. */
  applyTo: templateProcedure.input(z.object({ workspaceId: id, templateId: id, cardId: id.optional() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const template = await templateInWorkspace(db, input.workspaceId, input.templateId);
    if (template.archivedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Restore this template first." });
    return db.transaction(async tx => {
      const targets = await tx
        .select({ id: cards.id, page: cards.page })
        .from(cards)
        .where(and(companyCards(input.workspaceId), input.cardId ? eq(cards.id, input.cardId) : undefined));
      if (input.cardId && targets.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found." });
      for (const card of targets) {
        await tx.update(cards).set({ ...templateCardValues(card, template), updatedAt: new Date() }).where(eq(cards.id, card.id));
      }
      await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "template.applied", entityType: "template", entityId: template.id, metadata: { name: template.name, cards: targets.length } });
      return { cards: targets.length };
    });
  }),
});

type Changes = Partial<Record<LockableField, string | null>>;

export const teamRequestsRouter = router({
  /** Admins see every request of the team. A member sees the ones they sent. */
  list: requestProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const { member } = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    const admin = isAdminRole(member.role);
    const rows = await db
      .select({ request: workspaceChangeRequests, card: cards, requesterName: users.name, requesterEmail: users.email })
      .from(workspaceChangeRequests)
      .innerJoin(cards, eq(cards.id, workspaceChangeRequests.cardId))
      .leftJoin(users, eq(users.id, workspaceChangeRequests.requestedBy))
      .where(and(eq(workspaceChangeRequests.workspaceId, input.workspaceId), eq(cards.workspaceId, input.workspaceId), admin ? undefined : eq(workspaceChangeRequests.requestedBy, ctx.user.id)))
      .orderBy(sql`(${workspaceChangeRequests.status} = 'pending') desc`, desc(workspaceChangeRequests.createdAt))
      .limit(100);
    return {
      canDecide: admin,
      requests: rows.map(({ request, card, requesterName, requesterEmail }) => {
        const changes = (request.changes ?? {}) as Changes;
        return {
          id: request.id,
          cardId: card.id,
          cardName: card.displayName,
          requester: requesterName || requesterEmail || "Team member",
          mine: request.requestedBy === ctx.user.id,
          changes: LOCKABLE_FIELDS.filter(field => field in changes).map(field => ({ field, label: FIELD_LABELS[field], from: card[field] ?? "", to: changes[field] ?? "" })),
          note: request.note,
          status: request.status as "pending" | "approved" | "rejected" | "cancelled",
          decisionNote: request.decisionNote,
          createdAt: request.createdAt,
          decidedAt: request.decidedAt,
        };
      }),
    };
  }),

  /**
   * Asks an admin to change locked details of the caller's own card. The whole card form is sent; only the locked
   * details that differ from the saved card are kept. A newer request for the same card replaces an older one.
   */
  create: requestProcedure
    .input(z.object({ workspaceId: id, cardId: id, ...cardFields, note: optionalText(500) }))
    .mutation(async ({ ctx, input }) => {
      await limit("team-request", `user:${ctx.user.id}`, 20, 10 * MINUTE);
      const db = await requireDb();
      const access = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
      const card = await manageableCard(db, access, input.cardId);
      const { workspaceId, cardId, note, ...proposed } = input;
      const template = card.templateId ? await templateInWorkspace(db, workspaceId, card.templateId) : null;
      const fields = changedLockedFields(lockedFields(access.workspace, template), card, proposed);
      if (fields.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "There is no locked detail to change." });
      const changes: Changes = Object.fromEntries(fields.map(field => [field, proposed[field] ?? null]));
      assertValidCard({ ...card, ...changes });
      return db.transaction(async tx => {
        await tx
          .update(workspaceChangeRequests)
          .set({ status: "cancelled", decidedAt: new Date() })
          .where(and(eq(workspaceChangeRequests.cardId, card.id), eq(workspaceChangeRequests.requestedBy, ctx.user.id), eq(workspaceChangeRequests.status, "pending")));
        const [request] = await tx
          .insert(workspaceChangeRequests)
          .values({ workspaceId, cardId: card.id, requestedBy: ctx.user.id, changes, note })
          .returning({ id: workspaceChangeRequests.id });
        await recordAudit(tx, { workspaceId, actorUserId: ctx.user.id, action: "request.created", entityType: "request", entityId: request.id, metadata: { name: card.displayName, fields } });
        return request;
      });
    }),

  cancel: requestProcedure.input(z.object({ workspaceId: id, requestId: id })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    const cancelled = await db
      .update(workspaceChangeRequests)
      .set({ status: "cancelled", decidedAt: new Date() })
      .where(and(eq(workspaceChangeRequests.id, input.requestId), eq(workspaceChangeRequests.workspaceId, input.workspaceId), eq(workspaceChangeRequests.requestedBy, ctx.user.id), eq(workspaceChangeRequests.status, "pending")))
      .returning({ id: workspaceChangeRequests.id });
    if (cancelled.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "request.cancelled", entityType: "request", entityId: input.requestId });
    return { ok: true } as const;
  }),

  /** Approving writes the requested details onto the card. Declining changes nothing. */
  decide: requestProcedure
    .input(z.object({ workspaceId: id, requestId: id, approve: z.boolean(), note: optionalText(500) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
      return db.transaction(async tx => {
        // Claiming the request first means two admins deciding at once cannot both act on it.
        const [request] = await tx
          .update(workspaceChangeRequests)
          .set({ status: input.approve ? "approved" : "rejected", decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: input.note })
          .where(and(eq(workspaceChangeRequests.id, input.requestId), eq(workspaceChangeRequests.workspaceId, input.workspaceId), eq(workspaceChangeRequests.status, "pending")))
          .returning();
        if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found, or already decided." });
        const [card] = await tx.select().from(cards).where(and(eq(cards.id, request.cardId), companyCards(input.workspaceId))).limit(1);
        if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "The card for this request no longer exists." });
        if (input.approve) {
          // Only lockable details are ever written, whatever the stored request holds.
          const stored = (request.changes ?? {}) as Changes;
          const changes: Changes = Object.fromEntries(LOCKABLE_FIELDS.filter(field => field in stored).map(field => [field, stored[field] ?? null]));
          assertValidCard({ ...card, ...changes });
          await tx.update(cards).set({ ...changes, displayName: changes.displayName ?? card.displayName, title: changes.title ?? card.title, updatedAt: new Date() }).where(eq(cards.id, card.id));
        }
        await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: input.approve ? "request.approved" : "request.rejected", entityType: "request", entityId: request.id, metadata: { name: card.displayName } });
        return { ok: true } as const;
      });
    }),
});
