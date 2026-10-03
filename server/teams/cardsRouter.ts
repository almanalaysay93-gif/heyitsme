// Company-owned cards and departments. A company card belongs to the workspace, not to the person using it,
// so it stays with the company when that person leaves.
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { serverCardFields, validateCardData } from "@shared/cardValidation";
import { makeCardSlug } from "@shared/routes";
import { FIELD_LABELS, MAX_DEPARTMENTS, MAX_WORKSPACE_CARDS, isAdminRole, type TeamCardStatus } from "@shared/teams";
import { cards, users, workspaceDepartments, workspaceMembers, workspaceTemplates } from "../../drizzle/schema";
import { router } from "../_core/trpc";
import type { Db } from "../billing/service";
import { canManageWorkspaceCard, recordAudit, requireWorkspaceAdmin, requireWorkspaceMember, type WorkspaceAccess } from "./access";
import { changedLockedFields, lockedFields, templateCardValues, templateInWorkspace } from "./cardRules";
import { id, memberInWorkspace, requireDb, teamProcedure } from "./router";

const cardProcedure = teamProcedure("canCreateTeamCards");
const departmentProcedure = teamProcedure("canUseDepartments");

// The details of a company card. Its logo comes from the team's brand and its look from a team template.
export const cardFields = {
  displayName: serverCardFields.displayName,
  title: serverCardFields.title,
  company: serverCardFields.company,
  email: serverCardFields.email,
  phone: serverCardFields.phone,
  location: serverCardFields.location,
  bio: serverCardFields.bio,
};

export function assertValidCard(data: Parameters<typeof validateCardData>[0], prefix = "") {
  const validation = validateCardData(data);
  if (!validation.isValid) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${prefix}${Object.values(validation.errors)[0]}` });
  }
}

const cardStatus = (card: { published: boolean; teamStatus: string | null }): TeamCardStatus =>
  card.teamStatus === "suspended" || card.teamStatus === "archived" ? card.teamStatus : card.published ? "published" : "draft";

/**
 * A card of this workspace that the caller may change. The workspace comes from the caller's own membership,
 * so a card number from another team, or a personal card, is simply not found.
 */
export async function manageableCard(db: Db, access: WorkspaceAccess, cardId: number) {
  const [card] = await db
    .select()
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.workspaceId, access.workspace.id), isNull(cards.deletedAt)))
    .limit(1);
  const mine = card && card.assignedUserId !== null && card.assignedUserId === access.member.userId;
  if (!card || (!isAdminRole(access.member.role) && !mine)) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found." });
  if (!canManageWorkspaceCard(access, card)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This card is paused. Ask your team admin." });
  }
  return card;
}

/** A person who has joined and can hold a card. Invited people have no account yet. */
async function joinedMember(db: Db, workspaceId: number, memberId: number) {
  const member = await memberInWorkspace(db, workspaceId, memberId);
  if (!member.userId || member.status === "invited") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That person has not joined the team yet." });
  }
  return member as typeof member & { userId: number };
}

export const teamCardsRouter = router({
  /** Admins see every company card. Members see the cards assigned to them. */
  list: cardProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const { member: me, workspace } = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    const admin = isAdminRole(me.role);
    const templates = await db
      .select({ id: workspaceTemplates.id, name: workspaceTemplates.name, lockedFields: workspaceTemplates.lockedFields })
      .from(workspaceTemplates)
      .where(eq(workspaceTemplates.workspaceId, input.workspaceId));
    const templateOf = new Map(templates.map(template => [template.id, template]));
    const rows = await db
      .select({
        id: cards.id,
        templateId: cards.templateId,
        displayName: cards.displayName,
        title: cards.title,
        company: cards.company,
        email: cards.email,
        phone: cards.phone,
        location: cards.location,
        bio: cards.bio,
        slug: cards.slug,
        published: cards.published,
        teamStatus: cards.teamStatus,
        updatedAt: cards.updatedAt,
        assignedUserId: cards.assignedUserId,
        assignedMemberId: workspaceMembers.id,
        assigneeName: users.name,
        departmentId: workspaceMembers.departmentId,
      })
      .from(cards)
      .leftJoin(users, eq(users.id, cards.assignedUserId))
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, cards.workspaceId), eq(workspaceMembers.userId, cards.assignedUserId)))
      .where(and(eq(cards.workspaceId, input.workspaceId), isNull(cards.deletedAt), admin ? undefined : eq(cards.assignedUserId, ctx.user.id)))
      .orderBy(desc(cards.updatedAt))
      .limit(MAX_WORKSPACE_CARDS);
    return {
      canManageAll: admin,
      cardLimit: MAX_WORKSPACE_CARDS,
      cards: rows.map(({ published, teamStatus, assignedUserId, ...card }) => ({
        ...card,
        templateName: card.templateId ? templateOf.get(card.templateId)?.name ?? null : null,
        // Admins are never held by locks; they are told which details members cannot change.
        lockedFields: lockedFields(workspace, card.templateId ? templateOf.get(card.templateId) : null),
        status: cardStatus({ published, teamStatus }),
        mine: assignedUserId === ctx.user.id,
        canEdit: admin || (assignedUserId === ctx.user.id && !teamStatus),
      })),
    };
  }),

  create: cardProcedure
    .input(z.object({ workspaceId: id, ...cardFields, assignMemberId: id.optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { workspace } = await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
      const { workspaceId, assignMemberId, ...fields } = input;
      assertValidCard(fields);
      const assignee = assignMemberId ? await joinedMember(db, workspaceId, assignMemberId) : null;
      return db.transaction(async tx => {
        // One workspace's creations run one at a time, so the count below cannot be passed twice.
        await tx.execute(sql`select pg_advisory_xact_lock(${7015}, ${workspaceId})`);
        const [existing] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(cards)
          .where(and(eq(cards.workspaceId, workspaceId), isNull(cards.deletedAt)));
        if ((existing?.total ?? 0) >= MAX_WORKSPACE_CARDS) {
          throw new TRPCError({ code: "FORBIDDEN", message: `A team can have up to ${MAX_WORKSPACE_CARDS} cards for now.` });
        }
        const [owner] = await tx
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner"), eq(workspaceMembers.status, "active")))
          .limit(1);
        if (!owner?.userId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "This team has no owner." });
        const [template] = await tx
          .select()
          .from(workspaceTemplates)
          .where(and(eq(workspaceTemplates.workspaceId, workspaceId), eq(workspaceTemplates.isDefault, true), isNull(workspaceTemplates.archivedAt)))
          .limit(1);
        const [card] = await tx
          .insert(cards)
          .values({
            ...fields,
            company: fields.company || workspace.name,
            logoUrl: workspace.logoUrl,
            // New cards start with the team's default template, when there is one.
            ...(template ? templateCardValues({ page: null }, template) : {}),
            // The team owner is the account of record. Who may open the card is decided by workspaceId and assignedUserId.
            ownerUserId: owner.userId,
            workspaceId,
            assignedUserId: assignee?.userId ?? null,
            slug: makeCardSlug(fields.displayName, nanoid(6)),
            published: false,
            links: "[]",
            portfolio: "[]",
            channels: "[]",
            theme: "midnight",
          })
          .returning({ id: cards.id, slug: cards.slug });
        await recordAudit(tx, { workspaceId, actorUserId: ctx.user.id, action: "card.created", entityType: "card", entityId: card.id, metadata: { name: fields.displayName, assignedMemberId: assignee?.id ?? null } });
        return card;
      });
    }),

  update: cardProcedure.input(z.object({ workspaceId: id, cardId: id, ...cardFields })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const access = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    const card = await manageableCard(db, access, input.cardId);
    const { workspaceId, cardId, ...fields } = input;
    assertValidCard(fields);
    if (!isAdminRole(access.member.role)) {
      const template = card.templateId ? await templateInWorkspace(db, workspaceId, card.templateId) : null;
      const [blocked] = changedLockedFields(lockedFields(access.workspace, template), card, fields);
      if (blocked) {
        throw new TRPCError({ code: "FORBIDDEN", message: `${FIELD_LABELS[blocked]} is set by your team. Send a change request instead.` });
      }
    }
    await db.update(cards).set({ ...fields, updatedAt: new Date() }).where(and(eq(cards.id, card.id), eq(cards.workspaceId, workspaceId)));
    await recordAudit(db, { workspaceId, actorUserId: ctx.user.id, action: "card.updated", entityType: "card", entityId: card.id, metadata: { name: fields.displayName } });
    return { ok: true } as const;
  }),

  publish: cardProcedure.input(z.object({ workspaceId: id, cardId: id, published: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const access = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    const card = await manageableCard(db, access, input.cardId);
    if (card.teamStatus) throw new TRPCError({ code: "BAD_REQUEST", message: "Restore this card before publishing it." });
    if (input.published) assertValidCard(card, "Cannot publish: ");
    await db.update(cards).set({ published: input.published, updatedAt: new Date() }).where(and(eq(cards.id, card.id), eq(cards.workspaceId, input.workspaceId)));
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: input.published ? "card.published" : "card.unpublished", entityType: "card", entityId: card.id, metadata: { name: card.displayName } });
    return { ok: true } as const;
  }),

  /** Gives the card to a person, or to nobody. The card and its link stay the same. */
  assign: cardProcedure.input(z.object({ workspaceId: id, cardId: id, memberId: id.nullable() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const access = await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const card = await manageableCard(db, access, input.cardId);
    const assignee = input.memberId ? await joinedMember(db, input.workspaceId, input.memberId) : null;
    await db.update(cards).set({ assignedUserId: assignee?.userId ?? null, updatedAt: new Date() }).where(and(eq(cards.id, card.id), eq(cards.workspaceId, input.workspaceId)));
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: assignee ? "card.assigned" : "card.unassigned", entityType: "card", entityId: card.id, metadata: { name: card.displayName, memberId: assignee?.id ?? null } });
    return { ok: true } as const;
  }),

  /** Pause, archive or restore. A paused or archived card is not shown to the public, and nothing is deleted. */
  setStatus: cardProcedure
    .input(z.object({ workspaceId: id, cardId: id, status: z.enum(["active", "suspended", "archived"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const access = await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
      const card = await manageableCard(db, access, input.cardId);
      await db
        .update(cards)
        .set({ teamStatus: input.status === "active" ? null : input.status, updatedAt: new Date() })
        .where(and(eq(cards.id, card.id), eq(cards.workspaceId, input.workspaceId)));
      await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: `card.${input.status === "active" ? "restored" : input.status}`, entityType: "card", entityId: card.id, metadata: { name: card.displayName } });
      return { ok: true } as const;
    }),
});

const departmentName = z.string().trim().min(1).max(80);

export async function departmentInWorkspace(db: Db, workspaceId: number, departmentId: number) {
  const [department] = await db
    .select()
    .from(workspaceDepartments)
    .where(and(eq(workspaceDepartments.id, departmentId), eq(workspaceDepartments.workspaceId, workspaceId)))
    .limit(1);
  if (!department) throw new TRPCError({ code: "NOT_FOUND", message: "Department not found." });
  return department;
}

async function assertNameFree(db: Db, workspaceId: number, name: string, exceptId?: number) {
  const [taken] = await db
    .select({ id: workspaceDepartments.id })
    .from(workspaceDepartments)
    .where(
      and(
        eq(workspaceDepartments.workspaceId, workspaceId),
        sql`lower(${workspaceDepartments.name}) = ${name.toLowerCase()}`,
        exceptId ? ne(workspaceDepartments.id, exceptId) : undefined
      )
    )
    .limit(1);
  if (taken) throw new TRPCError({ code: "CONFLICT", message: "A department with that name already exists." });
}

export const teamDepartmentsRouter = router({
  /** Admins also see archived departments. */
  list: departmentProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const { member: me } = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    const admin = isAdminRole(me.role);
    const rows = await db
      .select()
      .from(workspaceDepartments)
      .where(and(eq(workspaceDepartments.workspaceId, input.workspaceId), admin ? undefined : isNull(workspaceDepartments.archivedAt)))
      .orderBy(asc(workspaceDepartments.name));
    const counts = await db
      .select({ departmentId: workspaceMembers.departmentId, total: sql<number>`count(*)::int` })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, input.workspaceId), admin ? ne(workspaceMembers.status, "removed") : eq(workspaceMembers.status, "active")))
      .groupBy(workspaceMembers.departmentId);
    const people = new Map(counts.map(row => [row.departmentId, row.total]));
    return rows.map(row => ({ id: row.id, name: row.name, leadMemberId: row.leadMemberId, archived: row.archivedAt !== null, people: people.get(row.id) ?? 0 }));
  }),

  create: departmentProcedure.input(z.object({ workspaceId: id, name: departmentName })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(${7016}, ${input.workspaceId})`);
      const [existing] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(workspaceDepartments)
        .where(eq(workspaceDepartments.workspaceId, input.workspaceId));
      if ((existing?.total ?? 0) >= MAX_DEPARTMENTS) {
        throw new TRPCError({ code: "FORBIDDEN", message: `A team can have up to ${MAX_DEPARTMENTS} departments.` });
      }
      await assertNameFree(tx, input.workspaceId, input.name);
      const [department] = await tx.insert(workspaceDepartments).values({ workspaceId: input.workspaceId, name: input.name }).returning({ id: workspaceDepartments.id });
      await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "department.created", entityType: "department", entityId: department.id, metadata: { name: input.name } });
      return department;
    });
  }),

  rename: departmentProcedure.input(z.object({ workspaceId: id, departmentId: id, name: departmentName })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const department = await departmentInWorkspace(db, input.workspaceId, input.departmentId);
    await assertNameFree(db, input.workspaceId, input.name, department.id);
    await db.update(workspaceDepartments).set({ name: input.name, updatedAt: new Date() }).where(eq(workspaceDepartments.id, department.id));
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "department.renamed", entityType: "department", entityId: department.id, metadata: { name: input.name, from: department.name } });
    return { ok: true } as const;
  }),

  /** Archiving hides a department from pickers. Its people keep their place and return if it is restored. */
  setArchived: departmentProcedure.input(z.object({ workspaceId: id, departmentId: id, archived: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const department = await departmentInWorkspace(db, input.workspaceId, input.departmentId);
    await db.update(workspaceDepartments).set({ archivedAt: input.archived ? new Date() : null, updatedAt: new Date() }).where(eq(workspaceDepartments.id, department.id));
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: input.archived ? "department.archived" : "department.restored", entityType: "department", entityId: department.id, metadata: { name: department.name } });
    return { ok: true } as const;
  }),

  /** Names the person who leads a department. It is a label: it gives that person no extra permissions. */
  setLead: departmentProcedure.input(z.object({ workspaceId: id, departmentId: id, memberId: id.nullable() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const department = await departmentInWorkspace(db, input.workspaceId, input.departmentId);
    const lead = input.memberId ? await memberInWorkspace(db, input.workspaceId, input.memberId) : null;
    await db.update(workspaceDepartments).set({ leadMemberId: lead?.id ?? null, updatedAt: new Date() }).where(eq(workspaceDepartments.id, department.id));
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "department.lead_changed", entityType: "department", entityId: department.id, metadata: { name: department.name, memberId: lead?.id ?? null } });
    return { ok: true } as const;
  }),

  /** Moves a person into a department, or out of every department. */
  assignMember: departmentProcedure.input(z.object({ workspaceId: id, memberId: id, departmentId: id.nullable() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const member = await memberInWorkspace(db, input.workspaceId, input.memberId);
    const department = input.departmentId ? await departmentInWorkspace(db, input.workspaceId, input.departmentId) : null;
    if (department?.archivedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "That department is archived." });
    await db.update(workspaceMembers).set({ departmentId: department?.id ?? null, updatedAt: new Date() }).where(eq(workspaceMembers.id, member.id));
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "member.department_changed", entityType: "member", entityId: member.id, metadata: { department: department?.name ?? null } });
    return { ok: true } as const;
  }),
});
