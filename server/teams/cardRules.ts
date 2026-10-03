// What a team's brand and templates decide about a company card: which details are locked, and how a template's
// look and company details are written onto a card.
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { designSchema } from "@shared/design";
import { parsePageConfig } from "@shared/pageConfig";
import { LOCKABLE_FIELDS, type LockableField } from "@shared/teams";
import { workspaceTemplates } from "../../drizzle/schema";
import type { Db } from "../billing/service";

export const lockList = z.array(z.enum(LOCKABLE_FIELDS)).max(LOCKABLE_FIELDS.length);

const asLocks = (value: unknown): LockableField[] =>
  Array.isArray(value) ? LOCKABLE_FIELDS.filter(field => value.includes(field)) : [];

/** The details a member may not change on a card: the team-wide locks plus the locks of the card's template. */
export function lockedFields(workspace: { lockedFields: unknown }, template?: { lockedFields: unknown } | null): LockableField[] {
  const locked = new Set([...asLocks(workspace.lockedFields), ...asLocks(template?.lockedFields)]);
  return LOCKABLE_FIELDS.filter(field => locked.has(field));
}

/** A template of this workspace. A template number from another team is simply not found. */
export async function templateInWorkspace(db: Db, workspaceId: number, templateId: number) {
  const [template] = await db
    .select()
    .from(workspaceTemplates)
    .where(and(eq(workspaceTemplates.id, templateId), eq(workspaceTemplates.workspaceId, workspaceId)))
    .limit(1);
  if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found." });
  return template;
}

/** The card columns a template sets: its look, and the company details it fills in. Other card content is kept. */
export function templateCardValues(
  card: { page: string | null },
  template: { id: number; design: unknown; company: string | null; location: string | null }
) {
  return {
    templateId: template.id,
    page: JSON.stringify({ ...parsePageConfig(card.page), design: designSchema.parse(template.design) }),
    ...(template.company ? { company: template.company } : {}),
    ...(template.location ? { location: template.location } : {}),
  };
}

/** The locked details whose value differs between the card as saved and the card as proposed. */
export function changedLockedFields(
  locked: LockableField[],
  current: Partial<Record<LockableField, string | null>>,
  proposed: Partial<Record<LockableField, string | null | undefined>>
) {
  return locked.filter(field => (proposed[field] ?? "") !== (current[field] ?? ""));
}
