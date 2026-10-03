// Contacts collected through company cards. They belong to the workspace, so they stay with the company when
// the person who collected them leaves. A member sees the contacts assigned to them; admins see every one.
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { isAdminRole } from "@shared/teams";
import { cards, contacts, users, workspaceDepartments, workspaceMembers } from "../../drizzle/schema";
import { router } from "../_core/trpc";
import type { Db } from "../billing/service";
import { CONTACT_STATUSES, csvCell } from "../proTools";
import { canViewWorkspaceContact, recordAudit, requireWorkspaceAdmin, requireWorkspaceMember, type WorkspaceAccess } from "./access";
import { id, limit, memberInWorkspace, requireDb, teamProcedure } from "./router";

const contactProcedure = teamProcedure("canManageWorkspaceContacts");
const MINUTE = 60_000;

type ContactRow = typeof contacts.$inferSelect;

/** What a company card's new contact records about the team: who holds the card now, and their department. */
export async function teamContactFields(card: { workspaceId: number; assignedUserId: number | null }) {
  const db = await requireDb();
  const [holder] = card.assignedUserId
    ? await db
        .select({ departmentId: workspaceMembers.departmentId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, card.workspaceId), eq(workspaceMembers.userId, card.assignedUserId)))
        .limit(1)
    : [];
  return {
    workspaceId: card.workspaceId,
    capturedByUserId: card.assignedUserId,
    assignedUserId: card.assignedUserId,
    departmentId: holder?.departmentId ?? null,
  };
}

/** The contacts this person may see: all of the workspace for admins, their own for members. */
const visible = (access: WorkspaceAccess, userId: number) =>
  isAdminRole(access.member.role)
    ? eq(contacts.workspaceId, access.workspace.id)
    : and(eq(contacts.workspaceId, access.workspace.id), eq(contacts.assignedUserId, userId));

/** A contact of this workspace the caller may see. Anything else is simply not found. */
async function visibleContact(db: Db, access: WorkspaceAccess, contactId: number) {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, access.workspace.id)))
    .limit(1);
  if (!contact || !canViewWorkspaceContact(access, contact)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found." });
  }
  return contact;
}

const emailKey = sql<string>`lower(trim(${contacts.email}))`;
const phoneKey = sql<string>`regexp_replace(${contacts.phone}, '[^0-9]', '', 'g')`;
const digits = (phone: string | null) => (phone ?? "").replace(/\D/g, "");
const mail = (email: string | null) => (email ?? "").trim().toLowerCase();

/**
 * Emails and phone numbers that appear on more than one contact in view. A match is only a hint for a person
 * to look at: nothing is ever merged on its own.
 */
async function repeatedKeys(db: Db, scope: ReturnType<typeof visible>) {
  const open = and(scope, ne(contacts.status, "archived"));
  const [emails, phones] = await Promise.all([
    db
      .select({ key: emailKey })
      .from(contacts)
      .where(and(open, sql`trim(coalesce(${contacts.email}, '')) <> ''`))
      .groupBy(emailKey)
      .having(sql`count(*) > 1`)
      .limit(500),
    db
      .select({ key: phoneKey })
      .from(contacts)
      .where(and(open, sql`length(${phoneKey}) >= 7`))
      .groupBy(phoneKey)
      .having(sql`count(*) > 1`)
      .limit(500),
  ]);
  return { emails: new Set(emails.map(row => row.key)), phones: new Set(phones.map(row => row.key)) };
}

function parseTags(tags: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(tags || "[]");
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

/** Names for the people, cards and departments a page of contacts points at. */
async function labelsFor(db: Db, workspaceId: number, rows: ContactRow[]) {
  const userIds = Array.from(new Set(rows.flatMap(row => [row.assignedUserId, row.capturedByUserId]).filter((value): value is number => value !== null)));
  const cardIds = Array.from(new Set(rows.map(row => row.cardId).filter((value): value is number => value !== null)));
  const [people, cardRows, departments] = await Promise.all([
    userIds.length ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, userIds)) : [],
    cardIds.length
      ? db.select({ id: cards.id, name: cards.displayName }).from(cards).where(and(inArray(cards.id, cardIds), eq(cards.workspaceId, workspaceId)))
      : [],
    db.select({ id: workspaceDepartments.id, name: workspaceDepartments.name }).from(workspaceDepartments).where(eq(workspaceDepartments.workspaceId, workspaceId)),
  ]);
  return {
    person: new Map(people.map(row => [row.id, row.name || row.email || "Team member"])),
    card: new Map(cardRows.map(row => [row.id, row.name])),
    department: new Map(departments.map(row => [row.id, row.name])),
  };
}

const shown = (row: ContactRow, labels: Awaited<ReturnType<typeof labelsFor>>) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  company: row.company,
  title: row.title,
  notes: row.notes,
  tags: parseTags(row.tags),
  status: row.status,
  followedUp: row.followedUp,
  followUpOn: row.followUpOn,
  createdAt: row.createdAt,
  cardName: row.cardId === null ? null : (labels.card.get(row.cardId) ?? null),
  assignedUserId: row.assignedUserId,
  assignedName: row.assignedUserId === null ? null : (labels.person.get(row.assignedUserId) ?? "Former member"),
  capturedByName: row.capturedByUserId === null ? null : (labels.person.get(row.capturedByUserId) ?? "Former member"),
  departmentName: row.departmentId === null ? null : (labels.department.get(row.departmentId) ?? null),
});

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Invalid date");

const EXPORT_COLUMNS = ["Name", "Email", "Phone", "Company", "Title", "Status", "Tags", "Notes", "Follow up on", "Followed up", "Card", "Assigned to", "Collected by", "Department", "Added"];

export const teamContactsRouter = router({
  list: contactProcedure
    .input(
      z.object({
        workspaceId: id,
        cursor: id.nullish(),
        limit: z.number().int().min(1).max(200).default(100),
        search: z.string().trim().max(80).optional(),
        view: z.enum(["open", "archived"]).default("open"),
        // Admin filters. A member only ever sees their own contacts, so these are ignored for them.
        holder: z.union([id, z.literal("unassigned")]).optional(),
        departmentId: id.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const access = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
      const admin = isAdminRole(access.member.role);
      const scope = visible(access, ctx.user.id);
      const term = input.search ? `%${input.search.replace(/[\\%_]/g, "\\$&")}%` : null;
      let holderUserId: number | null | undefined;
      if (admin && input.holder === "unassigned") holderUserId = null;
      else if (admin && typeof input.holder === "number") holderUserId = (await memberInWorkspace(db, input.workspaceId, input.holder)).userId ?? -1;
      const rows = await db
        .select()
        .from(contacts)
        .where(
          and(
            scope,
            input.view === "archived" ? eq(contacts.status, "archived") : ne(contacts.status, "archived"),
            input.cursor ? lt(contacts.id, input.cursor) : undefined,
            term
              ? or(
                  sql`${contacts.name} ilike ${term}`,
                  sql`${contacts.email} ilike ${term}`,
                  sql`${contacts.company} ilike ${term}`,
                  sql`${contacts.phone} ilike ${term}`
                )
              : undefined,
            holderUserId === undefined ? undefined : holderUserId === null ? isNull(contacts.assignedUserId) : eq(contacts.assignedUserId, holderUserId),
            admin && input.departmentId ? eq(contacts.departmentId, input.departmentId) : undefined
          )
        )
        .orderBy(desc(contacts.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      const [labels, repeated] = await Promise.all([labelsFor(db, input.workspaceId, page), repeatedKeys(db, scope)]);
      return {
        canManageAll: admin,
        items: page.map(row => ({
          ...shown(row, labels),
          possibleDuplicate: row.status !== "archived" && (repeated.emails.has(mail(row.email)) || repeated.phones.has(digits(row.phone))),
        })),
        nextCursor: rows.length > input.limit ? page[page.length - 1].id : null,
      };
    }),

  update: contactProcedure
    .input(
      z.object({
        workspaceId: id,
        contactId: id,
        status: z.enum(CONTACT_STATUSES).optional(),
        tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
        notes: z.string().max(1000).nullable().optional(),
        followedUp: z.boolean().optional(),
        followUpOn: day.nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const access = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
      const contact = await visibleContact(db, access, input.contactId);
      await db
        .update(contacts)
        .set({
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.tags ? { tags: JSON.stringify(Array.from(new Set(input.tags))) } : {}),
          ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
          ...(input.followedUp !== undefined ? { followedUp: input.followedUp } : {}),
          ...(input.followUpOn !== undefined ? { followUpOn: input.followUpOn ? new Date(`${input.followUpOn}T00:00:00Z`) : null } : {}),
          // A no-op keeps the statement valid when nothing was sent.
          name: contact.name,
        })
        .where(and(eq(contacts.id, contact.id), eq(contacts.workspaceId, access.workspace.id)));
      if (input.status !== undefined && (input.status === "archived") !== (contact.status === "archived")) {
        await recordAudit(db, { workspaceId: access.workspace.id, actorUserId: ctx.user.id, action: input.status === "archived" ? "contact.archived" : "contact.restored", entityType: "contact", entityId: contact.id });
      }
      return { ok: true } as const;
    }),

  /** Hands contacts to another person, or leaves them with nobody. The contacts themselves do not change. */
  reassign: contactProcedure
    .input(z.object({ workspaceId: id, contactIds: z.array(id).min(1).max(200), memberId: id.nullable() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const access = await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
      let userId: number | null = null;
      if (input.memberId !== null) {
        const next = await memberInWorkspace(db, input.workspaceId, input.memberId);
        if (next.status !== "active" || !next.userId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active person on the team." });
        userId = next.userId;
      }
      const moved = await db
        .update(contacts)
        .set({ assignedUserId: userId })
        .where(and(eq(contacts.workspaceId, access.workspace.id), inArray(contacts.id, input.contactIds)))
        .returning({ id: contacts.id });
      if (moved.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found." });
      await recordAudit(db, { workspaceId: access.workspace.id, actorUserId: ctx.user.id, action: "contact.reassigned", entityType: "contact", entityId: moved.length === 1 ? moved[0].id : null, metadata: { contacts: moved.length, toMemberId: input.memberId } });
      return { moved: moved.length };
    }),

  /** Deletes one contact for good, for when the person asks to be forgotten. Archiving is the everyday choice. */
  remove: contactProcedure.input(z.object({ workspaceId: id, contactId: id })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const access = await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const gone = await db
      .delete(contacts)
      .where(and(eq(contacts.id, input.contactId), eq(contacts.workspaceId, access.workspace.id)))
      .returning({ id: contacts.id });
    if (gone.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found." });
    await recordAudit(db, { workspaceId: access.workspace.id, actorUserId: ctx.user.id, action: "contact.deleted", entityType: "contact", entityId: input.contactId });
    return { ok: true } as const;
  }),

  /** A spreadsheet of the contacts the caller may see. */
  exportCsv: teamProcedure("canManageWorkspaceContacts", { afterPlanEnd: true }).input(z.object({ workspaceId: id })).mutation(async ({ ctx, input }) => {
    await limit("team-contacts-export", `user:${ctx.user.id}`, 10, 10 * MINUTE);
    const db = await requireDb();
    const access = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    const rows = await db.select().from(contacts).where(visible(access, ctx.user.id)).orderBy(desc(contacts.id)).limit(10_000);
    const labels = await labelsFor(db, input.workspaceId, rows);
    const lines = rows.map(row => {
      const item = shown(row, labels);
      return [
        item.name, item.email, item.phone, item.company, item.title, item.status, item.tags.join(", "), item.notes,
        item.followUpOn?.toISOString().slice(0, 10), item.followedUp ? "yes" : "no", item.cardName, item.assignedName,
        item.capturedByName, item.departmentName, item.createdAt.toISOString(),
      ].map(csvCell).join(",");
    });
    await recordAudit(db, { workspaceId: access.workspace.id, actorUserId: ctx.user.id, action: "contact.exported", entityType: "contact", metadata: { contacts: rows.length } });
    return { csv: [EXPORT_COLUMNS.map(csvCell).join(","), ...lines].join("\r\n"), count: rows.length };
  }),

  /** Groups of contacts that share an email or phone number, for an admin to look over. */
  duplicates: contactProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const access = await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const scope = visible(access, ctx.user.id);
    const repeated = await repeatedKeys(db, scope);
    const emails = Array.from(repeated.emails).slice(0, 50);
    const phones = Array.from(repeated.phones).slice(0, 50);
    if (emails.length === 0 && phones.length === 0) return { groups: [] };
    const rows = await db
      .select()
      .from(contacts)
      .where(
        and(
          scope,
          ne(contacts.status, "archived"),
          or(emails.length ? inArray(emailKey, emails) : undefined, phones.length ? inArray(phoneKey, phones) : undefined)
        )
      )
      .orderBy(desc(contacts.id))
      .limit(500);
    const labels = await labelsFor(db, input.workspaceId, rows);
    const groups = new Map<string, { reason: "email" | "phone"; value: string; contacts: ReturnType<typeof shown>[] }>();
    for (const row of rows) {
      const email = mail(row.email);
      const phone = digits(row.phone);
      const match = repeated.emails.has(email)
        ? ({ reason: "email", value: email } as const)
        : repeated.phones.has(phone)
          ? ({ reason: "phone", value: phone } as const)
          : null;
      if (!match) continue;
      const key = `${match.reason}:${match.value}`;
      const group = groups.get(key) ?? { ...match, contacts: [] };
      group.contacts.push(shown(row, labels));
      groups.set(key, group);
    }
    return { groups: Array.from(groups.values()).filter(group => group.contacts.length > 1).slice(0, 50) };
  }),

  /**
   * Folds one contact into another, by an admin's choice only. The kept contact gains whatever it was missing,
   * and the other is archived, not deleted, so the merge can be undone by hand.
   */
  merge: contactProcedure.input(z.object({ workspaceId: id, keepId: id, mergeId: id })).mutation(async ({ ctx, input }) => {
    if (input.keepId === input.mergeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose two different contacts." });
    const db = await requireDb();
    const access = await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const keep = await visibleContact(db, access, input.keepId);
    const other = await visibleContact(db, access, input.mergeId);
    const notes = [keep.notes, other.notes].filter(Boolean).join("\n\n").slice(0, 2000) || null;
    await db.transaction(async tx => {
      await tx
        .update(contacts)
        .set({
          email: keep.email || other.email,
          phone: keep.phone || other.phone,
          company: keep.company || other.company,
          title: keep.title || other.title,
          followUpOn: keep.followUpOn ?? other.followUpOn,
          assignedUserId: keep.assignedUserId ?? other.assignedUserId,
          tags: JSON.stringify(Array.from(new Set([...parseTags(keep.tags), ...parseTags(other.tags)])).slice(0, 12)),
          notes,
        })
        .where(eq(contacts.id, keep.id));
      await tx.update(contacts).set({ status: "archived" }).where(eq(contacts.id, other.id));
      await recordAudit(tx, { workspaceId: access.workspace.id, actorUserId: ctx.user.id, action: "contact.merged", entityType: "contact", entityId: keep.id, metadata: { mergedContactId: other.id } });
    });
    return { ok: true } as const;
  }),
});
