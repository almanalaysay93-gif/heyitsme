// The one place that answers "may this user act in this workspace?". Every Team procedure goes through here.
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { isAdminRole, type WorkspaceRole } from "@shared/teams";
import { workspaceAuditLog, workspaceMembers, workspaces } from "../../drizzle/schema";
import type { Db } from "../billing/service";
import { assertPlanAllowsCall } from "./entitlements";

export type WorkspaceAccess = {
  workspace: typeof workspaces.$inferSelect;
  member: typeof workspaceMembers.$inferSelect & { role: WorkspaceRole };
};

/**
 * The caller's active membership. Invited, suspended and removed people get the same answer as strangers,
 * so nobody can learn that a workspace exists by guessing its number.
 */
export async function requireWorkspaceMember(db: Db, userId: number, workspaceId: number): Promise<WorkspaceAccess> {
  const [row] = await db
    .select({ workspace: workspaces, member: workspaceMembers })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active"),
        isNull(workspaces.deletedAt)
      )
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
  assertPlanAllowsCall(row.workspace);
  return row as WorkspaceAccess;
}

export async function requireWorkspaceAdmin(db: Db, userId: number, workspaceId: number): Promise<WorkspaceAccess> {
  const access = await requireWorkspaceMember(db, userId, workspaceId);
  if (!isAdminRole(access.member.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only team admins can do this." });
  }
  return access;
}

export async function requireWorkspaceOwner(db: Db, userId: number, workspaceId: number): Promise<WorkspaceAccess> {
  const access = await requireWorkspaceMember(db, userId, workspaceId);
  if (access.member.role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the team owner can do this." });
  }
  return access;
}

/**
 * Owners manage everyone but themselves. Admins manage members only: not the owner, not other admins,
 * and not themselves.
 */
export function assertCanManageMember(actor: WorkspaceAccess["member"], target: { id: number; role: string }) {
  const allowed =
    target.id !== actor.id &&
    target.role !== "owner" &&
    (actor.role === "owner" || (actor.role === "admin" && target.role === "member"));
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "You can't change this person." });
}

/**
 * May this person change this company card? Admins and the owner manage every card of their workspace.
 * A member manages only the card assigned to them, and not while an admin has paused or archived it.
 */
export function canManageWorkspaceCard(
  access: WorkspaceAccess,
  card: { workspaceId: number | null; assignedUserId: number | null; teamStatus: string | null; deletedAt: Date | null }
) {
  if (card.workspaceId !== access.workspace.id || card.deletedAt) return false;
  if (isAdminRole(access.member.role)) return true;
  return access.member.userId !== null && card.assignedUserId === access.member.userId && !card.teamStatus;
}

/** May this person see this contact? Admins and the owner see every contact of their workspace, a member their own. */
export function canViewWorkspaceContact(access: WorkspaceAccess, contact: { workspaceId: number | null; assignedUserId: number | null }) {
  if (contact.workspaceId !== access.workspace.id) return false;
  if (isAdminRole(access.member.role)) return true;
  return access.member.userId !== null && contact.assignedUserId === access.member.userId;
}

/** May this person run this event: change it, read its responses, check people in? Admins and the owner of its workspace only. */
export function canManageEvent(access: WorkspaceAccess, event: { workspaceId: number }) {
  return event.workspaceId === access.workspace.id && isAdminRole(access.member.role);
}

export type AuditEntry = {
  workspaceId: number;
  actorUserId: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
};

export async function recordAudit(db: Db, entry: AuditEntry) {
  await db.insert(workspaceAuditLog).values({
    workspaceId: entry.workspaceId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId == null ? null : String(entry.entityId),
    metadata: entry.metadata ?? null,
  });
}
