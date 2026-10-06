import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  INVITATION_TTL_MS,
  MAX_OWNED_WORKSPACES,
  MAX_SEAT_ALLOWANCE,
  REMOVAL_CARD_CHOICES,
  REMOVAL_CONTACT_CHOICES,
  isAdminRole,
  type MemberStatus,
  type TeamCapability,
  type WorkspaceRole,
} from "@shared/teams";
import { TEAMS_PLAN } from "@shared/plans";
import { cards, contacts, users, workspaceAuditLog, workspaceInvitations, workspaceMembers, workspaces } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { sendMail, teamInviteMail } from "../_core/mail";
import { clientIp, hashIdentifier, rateLimit } from "../_core/rateLimit";
import { siteOrigin } from "../_core/seo";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { enabledChannels, teamsCheckoutOpen } from "../billing/checkout";
import type { Db } from "../billing/service";
import { getDb } from "../db";
import {
  assertCanManageMember,
  recordAudit,
  requireWorkspaceAdmin,
  requireWorkspaceMember,
  requireWorkspaceOwner,
} from "./access";
import { assertTeamCapability, planEnded, runTeamCall, seatAllowance, teamEntitlements, teamHeld, teamPlanState } from "./entitlements";
import { holdStartsAt } from "@shared/hold";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

export async function limit(scope: string, identity: string, max: number, windowMs: number) {
  const result = await rateLimit(`${scope}:${hashIdentifier(identity)}`, max, windowMs);
  if (!result.allowed) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many requests. Please wait a moment and try again." });
  }
}

/**
 * A procedure that needs a signed-in user and a Team capability, checked on the server on every call.
 * A call that changes something is refused for a workspace whose plan has ended (see access.ts), unless it is
 * one of the few that must keep working then: leaving, removing someone, closing, downloading.
 * Once the workspace is on hold every call is refused, except the ones marked whileHeld.
 */
export const teamProcedure = (capability: TeamCapability, options: { afterPlanEnd?: boolean; whileHeld?: boolean } = {}) =>
  protectedProcedure.use(({ next, type }) => {
    assertTeamCapability(capability);
    return runTeamCall(type === "mutation" && !options.afterPlanEnd, Boolean(options.whileHeld), () => next());
  });
const memberProcedure = teamProcedure("canCreateWorkspace");
const leavingProcedure = teamProcedure("canCreateWorkspace", { afterPlanEnd: true, whileHeld: true });
// What a team on hold still answers: that it is on hold, and its bill for the owner.
const heldProcedure = teamProcedure("canCreateWorkspace", { whileHeld: true });
const inviteProcedure = teamProcedure("canInviteMembers");

/** Only the hash is stored. The link itself exists in the invitation email and nowhere else. */
export const hashInvitationToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newInvitationToken = () => randomBytes(32).toString("base64url");

export const id = z.number().int().positive();
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform(value => value || null);
const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform(value => value || null)
  .refine(value => value === null || /^https?:\/\/[^\s]+$/i.test(value), "Enter a full link that starts with https://");
const emailInput = z.string().trim().toLowerCase().email().max(320);
const tokenInput = z.string().min(20).max(128).regex(/^[A-Za-z0-9_-]+$/);

const workspaceFields = {
  name: z.string().trim().min(2).max(120),
  description: optionalText(600),
  website: optionalUrl,
  email: z.union([z.literal(""), emailInput]).optional().transform(value => value || null),
  phone: optionalText(64),
  address: optionalText(300),
  industry: optionalText(80),
  timezone: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_+\-/]+$/).optional(),
};

function userEmail(user: { email: string | null }): string {
  const email = user.email?.trim().toLowerCase();
  if (!email) throw new TRPCError({ code: "BAD_REQUEST", message: "Your account needs an email address to use Teams." });
  return email;
}

/** People who hold or are holding a place: invited, active and suspended. Removed people free theirs. */
async function countPeople(db: Db, workspaceId: number, exceptMemberId?: number) {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        ne(workspaceMembers.status, "removed"),
        exceptMemberId ? ne(workspaceMembers.id, exceptMemberId) : undefined
      )
    );
  return row?.total ?? 0;
}

/** Seats by who holds them. "used" is what counts against the allowance. */
async function seatUsage(db: Db, workspaceId: number) {
  const rows = await db
    .select({ status: workspaceMembers.status, total: sql<number>`count(*)::int` })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), ne(workspaceMembers.status, "removed")))
    .groupBy(workspaceMembers.status);
  const of = (status: MemberStatus) => rows.find(row => row.status === status)?.total ?? 0;
  const [active, invited, suspended] = [of("active"), of("invited"), of("suspended")];
  return { active, invited, suspended, used: active + invited + suspended };
}

export async function memberInWorkspace(db: Db, workspaceId: number, memberId: number) {
  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.id, memberId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1);
  if (!member || member.status === "removed") throw new TRPCError({ code: "NOT_FOUND", message: "Person not found." });
  return member;
}

const revokeOpenInvitations = (db: Db, memberId: number, now: Date) =>
  db
    .update(workspaceInvitations)
    .set({ revokedAt: now })
    .where(
      and(
        eq(workspaceInvitations.memberId, memberId),
        isNull(workspaceInvitations.acceptedAt),
        isNull(workspaceInvitations.revokedAt)
      )
    );

/** Replaces any open invitation with a fresh one and emails it. Returns the link so an admin can also copy it. */
async function issueInvitation(
  db: Db,
  origin: string,
  input: { workspaceId: number; workspaceName: string; memberId: number; email: string; role: WorkspaceRole; inviter: { id: number; name: string | null } }
) {
  const now = new Date();
  const token = newInvitationToken();
  await db.transaction(async tx => {
    await revokeOpenInvitations(tx, input.memberId, now);
    await tx.insert(workspaceInvitations).values({
      workspaceId: input.workspaceId,
      memberId: input.memberId,
      tokenHash: hashInvitationToken(token),
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      createdBy: input.inviter.id,
    });
  });
  const inviteUrl = `${origin}/app/team/join/${token}`;
  const emailed = await sendMail(
    teamInviteMail({ to: input.email, workspaceName: input.workspaceName, inviterName: input.inviter.name, role: input.role, inviteUrl })
  );
  return { inviteUrl, emailed };
}

/** The invitation behind a link, with the membership and workspace it points at. */
async function findInvitation(db: Db, token: string) {
  const [row] = await db
    .select({ invitation: workspaceInvitations, member: workspaceMembers, workspace: workspaces })
    .from(workspaceInvitations)
    .innerJoin(workspaceMembers, eq(workspaceMembers.id, workspaceInvitations.memberId))
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvitations.workspaceId))
    .where(eq(workspaceInvitations.tokenHash, hashInvitationToken(token)))
    .limit(1);
  if (!row || row.invitation.revokedAt || row.workspace.deletedAt || row.member.status !== "invited") return null;
  return row;
}

type InvitationState = "valid" | "expired" | "used" | "invalid";
const invitationState = (row: Awaited<ReturnType<typeof findInvitation>>, now: Date): InvitationState =>
  !row ? "invalid" : row.invitation.acceptedAt ? "used" : row.invitation.expiresAt <= now ? "expired" : "valid";

const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}`;
};

export const teamsRouter = router({
  /** Whether Teams is switched on. The client uses it to show or hide Team screens; the server checks again. */
  status: publicProcedure.query(() => ({ enabled: ENV.teamsEnabled, entitlements: teamEntitlements() })),

  /** The workspaces the caller can switch to. */
  list: memberProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        logoUrl: workspaces.logoUrl,
        role: sql<WorkspaceRole>`${workspaceMembers.role}`,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.userId, ctx.user.id), eq(workspaceMembers.status, "active"), isNull(workspaces.deletedAt)))
      .orderBy(asc(workspaces.name));
  }),

  create: memberProcedure.input(z.object(workspaceFields)).mutation(async ({ ctx, input }) => {
    await limit("team-create", `user:${ctx.user.id}`, 5, HOUR);
    const db = await requireDb();
    const email = userEmail(ctx.user);
    return db.transaction(async tx => {
      // One user's creations run one at a time, so two fast clicks cannot both pass the count.
      await tx.execute(sql`select pg_advisory_xact_lock(${7013}, ${ctx.user.id})`);
      const [owned] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(and(eq(workspaceMembers.userId, ctx.user.id), eq(workspaceMembers.role, "owner"), eq(workspaceMembers.status, "active"), isNull(workspaces.deletedAt)));
      if ((owned?.total ?? 0) >= MAX_OWNED_WORKSPACES) {
        throw new TRPCError({ code: "FORBIDDEN", message: `You can own up to ${MAX_OWNED_WORKSPACES} teams.` });
      }
      // While Teams is sold, a new team starts unpaid: it is there to look at, and opens for changes once paid.
      const now = new Date();
      const plan = teamsCheckoutOpen() ? { seatLimit: TEAMS_PLAN.seats, accessUntil: now, createdAt: now } : {};
      const [workspace] = await tx
        .insert(workspaces)
        .values({ ...input, ...plan, timezone: input.timezone ?? "Asia/Manila", createdBy: ctx.user.id })
        .returning();
      await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: ctx.user.id, email, role: "owner", status: "active", joinedAt: new Date() });
      await recordAudit(tx, { workspaceId: workspace.id, actorUserId: ctx.user.id, action: "workspace.created", entityType: "workspace", entityId: workspace.id });
      return workspace;
    });
  }),

  get: heldProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const { workspace, member } = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    const ended = planEnded(workspace);
    return {
      workspace,
      me: { memberId: member.id, role: member.role, jobTitle: member.jobTitle },
      entitlements: teamEntitlements(workspace),
      planEnded: ended,
      planState: teamPlanState(workspace),
      // On hold: the client shows the hold screen and nothing else. Every other call is refused on the server.
      held: teamHeld(workspace),
      holdFrom: ended && workspace.accessUntil ? holdStartsAt(workspace.accessUntil) : null,
    };
  }),

  update: memberProcedure.input(z.object({ workspaceId: id, ...workspaceFields })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const { workspaceId, timezone, ...fields } = input;
    const [workspace] = await db
      .update(workspaces)
      .set({ ...fields, ...(timezone ? { timezone } : {}), updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning();
    await recordAudit(db, { workspaceId, actorUserId: ctx.user.id, action: "workspace.updated", entityType: "workspace", entityId: workspaceId });
    return workspace;
  }),

  /** Closes the workspace. Nothing is deleted: the rows stay, and personal accounts are untouched. */
  close: leavingProcedure.input(z.object({ workspaceId: id })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceOwner(db, ctx.user.id, input.workspaceId);
    const now = new Date();
    await db.transaction(async tx => {
      await tx.update(workspaces).set({ deletedAt: now, updatedAt: now }).where(eq(workspaces.id, input.workspaceId));
      // A closed team's cards stop being shown to the public. They are kept, not deleted.
      await tx.update(cards).set({ teamStatus: "archived", updatedAt: now }).where(and(eq(cards.workspaceId, input.workspaceId), isNull(cards.teamStatus)));
      await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "workspace.closed", entityType: "workspace", entityId: input.workspaceId });
    });
    return { ok: true } as const;
  }),

  /** Admins see everyone, with emails and invitations. Members see who is on the team, without emails. */
  members: memberProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const { member: me, workspace } = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    const admin = isAdminRole(me.role);
    const rows = await db
      .select({
        id: workspaceMembers.id,
        userId: workspaceMembers.userId,
        email: workspaceMembers.email,
        role: sql<WorkspaceRole>`${workspaceMembers.role}`,
        status: sql<MemberStatus>`${workspaceMembers.status}`,
        jobTitle: workspaceMembers.jobTitle,
        departmentId: workspaceMembers.departmentId,
        joinedAt: workspaceMembers.joinedAt,
        createdAt: workspaceMembers.createdAt,
        name: users.name,
        lastActiveAt: users.lastSignedIn,
      })
      .from(workspaceMembers)
      .leftJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.workspaceId),
          admin ? ne(workspaceMembers.status, "removed") : eq(workspaceMembers.status, "active")
        )
      )
      .orderBy(asc(workspaceMembers.createdAt));
    const open = admin
      ? await db
          .select({ memberId: workspaceInvitations.memberId, expiresAt: workspaceInvitations.expiresAt })
          .from(workspaceInvitations)
          .where(and(eq(workspaceInvitations.workspaceId, input.workspaceId), isNull(workspaceInvitations.acceptedAt), isNull(workspaceInvitations.revokedAt)))
      : [];
    const expiry = new Map(open.map(row => [row.memberId, row.expiresAt]));
    const held = admin
      ? await db
          .select({ userId: cards.assignedUserId, total: sql<number>`count(*)::int` })
          .from(cards)
          .where(and(eq(cards.workspaceId, input.workspaceId), isNull(cards.deletedAt), sql`${cards.assignedUserId} is not null`))
          .groupBy(cards.assignedUserId)
      : [];
    const cardCounts = new Map(held.map(row => [row.userId, row.total]));
    const collected = admin
      ? await db
          .select({ userId: contacts.assignedUserId, total: sql<number>`count(*)::int` })
          .from(contacts)
          .where(and(eq(contacts.workspaceId, input.workspaceId), sql`${contacts.assignedUserId} is not null`))
          .groupBy(contacts.assignedUserId)
      : [];
    const contactCounts = new Map(collected.map(row => [row.userId, row.total]));
    return {
      myRole: me.role,
      myMemberId: me.id,
      peopleLimit: seatAllowance(workspace),
      members: rows.map(row => ({
        ...row,
        email: admin || row.id === me.id ? row.email : null,
        lastActiveAt: admin ? row.lastActiveAt : null,
        invitationExpiresAt: expiry.get(row.id) ?? null,
        cardCount: admin && row.userId !== null ? (cardCounts.get(row.userId) ?? 0) : null,
        contactCount: admin && row.userId !== null ? (contactCounts.get(row.userId) ?? 0) : null,
      })),
    };
  }),

  invite: inviteProcedure
    .input(z.object({ workspaceId: id, email: emailInput, role: z.enum(["admin", "member"]).default("member"), jobTitle: optionalText(160) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { workspace, member: me } = await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
      if (input.role === "admin" && me.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the team owner can add admins." });
      }
      await limit("team-invite", `workspace:${workspace.id}`, 60, HOUR);
      await limit("team-invite-user", `user:${ctx.user.id}`, 20, MINUTE);

      const memberId = await db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(${7014}, ${workspace.id})`);
        const [existing] = await tx
          .select()
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.email, input.email)))
          .limit(1);
        if (existing && (existing.status === "active" || existing.status === "suspended")) {
          throw new TRPCError({ code: "CONFLICT", message: "That person is already on the team." });
        }
        // The allowance is read again inside the lock, so a change made a moment ago is the one that counts.
        const [plan] = await tx.select({ seatLimit: workspaces.seatLimit, accessUntil: workspaces.accessUntil }).from(workspaces).where(eq(workspaces.id, workspace.id)).limit(1);
        const seats = seatAllowance(plan ?? workspace);
        if ((await countPeople(tx, workspace.id, existing?.id)) >= seats) {
          throw new TRPCError({ code: "FORBIDDEN", message: `All ${seats} seats on this team are in use. Remove someone or cancel an invitation to free one.` });
        }
        const values = { role: input.role, status: "invited", jobTitle: input.jobTitle, invitedBy: ctx.user.id, userId: null, joinedAt: null, removedAt: null, updatedAt: new Date() };
        const [row] = existing
          ? await tx.update(workspaceMembers).set(values).where(eq(workspaceMembers.id, existing.id)).returning({ id: workspaceMembers.id })
          : await tx.insert(workspaceMembers).values({ ...values, workspaceId: workspace.id, email: input.email }).returning({ id: workspaceMembers.id });
        await recordAudit(tx, { workspaceId: workspace.id, actorUserId: ctx.user.id, action: "member.invited", entityType: "member", entityId: row.id, metadata: { email: input.email, role: input.role } });
        return row.id;
      });

      const sent = await issueInvitation(db, siteOrigin(ctx.req), {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        memberId,
        email: input.email,
        role: input.role,
        inviter: ctx.user,
      });
      return { memberId, ...sent };
    }),

  resendInvite: inviteProcedure.input(z.object({ workspaceId: id, memberId: id })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const { workspace, member: me } = await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const target = await memberInWorkspace(db, workspace.id, input.memberId);
    assertCanManageMember(me, target);
    if (target.status !== "invited") throw new TRPCError({ code: "BAD_REQUEST", message: "That person has already joined." });
    await limit("team-invite", `workspace:${workspace.id}`, 60, HOUR);
    await limit("team-resend", `member:${target.id}`, 5, HOUR);
    const sent = await issueInvitation(db, siteOrigin(ctx.req), {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      memberId: target.id,
      email: target.email,
      role: target.role as WorkspaceRole,
      inviter: ctx.user,
    });
    await recordAudit(db, { workspaceId: workspace.id, actorUserId: ctx.user.id, action: "member.invite_resent", entityType: "member", entityId: target.id });
    return sent;
  }),

  /** What an invitation link shows before sign-in. It names the team, never its people or data. */
  invitation: publicProcedure.input(z.object({ token: tokenInput })).query(async ({ ctx, input }) => {
    assertTeamCapability("canInviteMembers");
    await limit("team-invitation", clientIp(ctx.req), 30, MINUTE);
    const db = await requireDb();
    const row = await findInvitation(db, input.token);
    const state = invitationState(row, new Date());
    if (!row || state === "invalid") return { state: "invalid" as const };
    return {
      state,
      workspaceName: row.workspace.name,
      role: row.member.role as WorkspaceRole,
      email: maskEmail(row.member.email),
      forMe: Boolean(ctx.user?.email && ctx.user.email.trim().toLowerCase() === row.member.email),
    };
  }),

  acceptInvite: inviteProcedure.input(z.object({ token: tokenInput })).mutation(async ({ ctx, input }) => {
    await limit("team-accept", `user:${ctx.user.id}`, 20, MINUTE);
    const db = await requireDb();
    const now = new Date();
    const row = await findInvitation(db, input.token);
    const state = invitationState(row, now);
    if (!row || state === "invalid") throw new TRPCError({ code: "NOT_FOUND", message: "This invitation link is not valid." });
    if (state === "used") throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation was already used." });
    if (state === "expired") throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has expired. Ask your team admin to send a new one." });
    // The link alone is not enough: it only works for the account it was sent to.
    if (userEmail(ctx.user) !== row.member.email) {
      throw new TRPCError({ code: "FORBIDDEN", message: "This invitation was sent to a different email address. Sign in with that account to accept it." });
    }
    if (planEnded(row.workspace, now)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "This team isn't taking new people right now. Ask your team admin." });
    }
    await db.transaction(async tx => {
      // Same lock as inviting, so the seats are counted one change at a time.
      await tx.execute(sql`select pg_advisory_xact_lock(${7014}, ${row.workspace.id})`);
      const [plan] = await tx.select({ seatLimit: workspaces.seatLimit, accessUntil: workspaces.accessUntil }).from(workspaces).where(eq(workspaces.id, row.workspace.id)).limit(1);
      const usage = await seatUsage(tx, row.workspace.id);
      // An invitation holds a seat, but if the allowance was lowered since, the people already in come first.
      if (usage.active + usage.suspended >= seatAllowance(plan ?? row.workspace)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This team has no free seat right now. Ask your team admin." });
      }
      const claimed = await tx
        .update(workspaceInvitations)
        .set({ acceptedAt: now })
        .where(and(eq(workspaceInvitations.id, row.invitation.id), isNull(workspaceInvitations.acceptedAt), isNull(workspaceInvitations.revokedAt)))
        .returning({ id: workspaceInvitations.id });
      if (claimed.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation was already used." });
      const joined = await tx
        .update(workspaceMembers)
        .set({ userId: ctx.user.id, status: "active", joinedAt: now, updatedAt: now })
        .where(and(eq(workspaceMembers.id, row.member.id), eq(workspaceMembers.status, "invited")))
        .returning({ id: workspaceMembers.id });
      if (joined.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation is no longer open." });
      await recordAudit(tx, { workspaceId: row.workspace.id, actorUserId: ctx.user.id, action: "member.joined", entityType: "member", entityId: row.member.id });
    });
    return { workspaceId: row.workspace.id, workspaceName: row.workspace.name };
  }),

  /** Admin and member only. Ownership moves through transferOwnership. */
  changeRole: memberProcedure.input(z.object({ workspaceId: id, memberId: id, role: z.enum(["admin", "member"]) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const { member: me } = await requireWorkspaceOwner(db, ctx.user.id, input.workspaceId);
    const target = await memberInWorkspace(db, input.workspaceId, input.memberId);
    assertCanManageMember(me, target);
    if (target.role !== input.role) {
      await db.update(workspaceMembers).set({ role: input.role, updatedAt: new Date() }).where(eq(workspaceMembers.id, target.id));
      await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "member.role_changed", entityType: "member", entityId: target.id, metadata: { from: target.role, to: input.role } });
    }
    return { ok: true } as const;
  }),

  transferOwnership: memberProcedure.input(z.object({ workspaceId: id, memberId: id })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const { member: me } = await requireWorkspaceOwner(db, ctx.user.id, input.workspaceId);
    const target = await memberInWorkspace(db, input.workspaceId, input.memberId);
    if (target.id === me.id || target.status !== "active") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active person on the team." });
    }
    const now = new Date();
    await db.transaction(async tx => {
      await tx.update(workspaceMembers).set({ role: "admin", updatedAt: now }).where(eq(workspaceMembers.id, me.id));
      await tx.update(workspaceMembers).set({ role: "owner", updatedAt: now }).where(eq(workspaceMembers.id, target.id));
      // Company cards and team contacts are held in the owner's name, so they follow the ownership.
      if (target.userId) {
        await tx.update(cards).set({ ownerUserId: target.userId }).where(eq(cards.workspaceId, input.workspaceId));
        await tx.update(contacts).set({ ownerUserId: target.userId }).where(eq(contacts.workspaceId, input.workspaceId));
      }
      await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "workspace.ownership_transferred", entityType: "member", entityId: target.id, metadata: { fromMemberId: me.id } });
    });
    return { ok: true } as const;
  }),

  setSuspended: memberProcedure.input(z.object({ workspaceId: id, memberId: id, suspended: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const { member: me } = await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const target = await memberInWorkspace(db, input.workspaceId, input.memberId);
    assertCanManageMember(me, target);
    const from = input.suspended ? "active" : "suspended";
    if (target.status !== from) throw new TRPCError({ code: "BAD_REQUEST", message: input.suspended ? "Only active people can be suspended." : "That person is not suspended." });
    await db.update(workspaceMembers).set({ status: input.suspended ? "suspended" : "active", updatedAt: new Date() }).where(eq(workspaceMembers.id, target.id));
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: input.suspended ? "member.suspended" : "member.reactivated", entityType: "member", entityId: target.id });
    return { ok: true } as const;
  }),

  /**
   * Ends a membership or cancels an invitation. The person's account, personal cards and personal contacts are
   * untouched. The company's cards and contacts stay with the company: they are left with nobody assigned,
   * archived, or handed to someone else. Nothing is deleted.
   */
  removeMember: leavingProcedure
    .input(
      z.object({
        workspaceId: id,
        memberId: id,
        cards: z.enum(REMOVAL_CARD_CHOICES).default("unassign"),
        transferToMemberId: id.optional(),
        contacts: z.enum(REMOVAL_CONTACT_CHOICES).default("keep"),
        contactsToMemberId: id.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { member: me } = await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
      const target = await memberInWorkspace(db, input.workspaceId, input.memberId);
      assertCanManageMember(me, target);
      const heir = async (memberId: number | undefined, what: string) => {
        const next = memberId ? await memberInWorkspace(db, input.workspaceId, memberId) : null;
        if (!next || next.id === target.id || next.status !== "active" || !next.userId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Choose an active person to take over the ${what}.` });
        }
        return { id: next.id, userId: next.userId };
      };
      const receiver = input.cards === "transfer" ? await heir(input.transferToMemberId, "cards") : null;
      const contactReceiver = input.contacts === "transfer" ? await heir(input.contactsToMemberId, "contacts") : null;
      const now = new Date();
      await db.transaction(async tx => {
        await tx.update(workspaceMembers).set({ status: "removed", removedAt: now, updatedAt: now }).where(eq(workspaceMembers.id, target.id));
        await revokeOpenInvitations(tx, target.id, now);
        const moved = target.userId
          ? await tx
              .update(cards)
              .set(
                input.cards === "transfer" && receiver
                  ? { assignedUserId: receiver.userId, updatedAt: now }
                  : input.cards === "archive"
                    ? { assignedUserId: null, teamStatus: "archived", updatedAt: now }
                    : { assignedUserId: null, updatedAt: now }
              )
              .where(and(eq(cards.workspaceId, input.workspaceId), eq(cards.assignedUserId, target.userId)))
              .returning({ id: cards.id })
          : [];
        const passed = target.userId
          ? await tx
              .update(contacts)
              .set(
                contactReceiver
                  ? { assignedUserId: contactReceiver.userId }
                  : input.contacts === "archive"
                    ? { assignedUserId: null, status: "archived" }
                    : { assignedUserId: null }
              )
              .where(and(eq(contacts.workspaceId, input.workspaceId), eq(contacts.assignedUserId, target.userId)))
              .returning({ id: contacts.id })
          : [];
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: ctx.user.id,
          action: target.status === "invited" ? "member.invite_cancelled" : "member.removed",
          entityType: "member",
          entityId: target.id,
          metadata: {
            email: target.email,
            cards: moved.length,
            cardChoice: moved.length ? input.cards : null,
            transferToMemberId: moved.length ? (receiver?.id ?? null) : null,
            contacts: passed.length,
            contactChoice: passed.length ? input.contacts : null,
            contactsToMemberId: passed.length ? (contactReceiver?.id ?? null) : null,
          },
        });
      });
      return { ok: true } as const;
    }),

  leave: leavingProcedure.input(z.object({ workspaceId: id })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const { member: me } = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    if (me.role === "owner") throw new TRPCError({ code: "BAD_REQUEST", message: "Make someone else the owner before you leave." });
    const now = new Date();
    await db.transaction(async tx => {
      await tx.update(workspaceMembers).set({ status: "removed", removedAt: now, updatedAt: now }).where(eq(workspaceMembers.id, me.id));
      // The company keeps its cards. They wait, unassigned, for an admin to hand them on.
      const freed = await tx
        .update(cards)
        .set({ assignedUserId: null, updatedAt: now })
        .where(and(eq(cards.workspaceId, input.workspaceId), eq(cards.assignedUserId, ctx.user.id)))
        .returning({ id: cards.id });
      // The same goes for the contacts they collected for the team.
      const kept = await tx
        .update(contacts)
        .set({ assignedUserId: null })
        .where(and(eq(contacts.workspaceId, input.workspaceId), eq(contacts.assignedUserId, ctx.user.id)))
        .returning({ id: contacts.id });
      await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "member.left", entityType: "member", entityId: me.id, metadata: { cards: freed.length, contacts: kept.length } });
    });
    return { ok: true } as const;
  }),

  /** Seats, plan dates and what the plan costs, for the owner. Paying starts in billing.createTeamCheckout. */
  billing: heldProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const { workspace } = await requireWorkspaceOwner(db, ctx.user.id, input.workspaceId);
    const usage = await seatUsage(db, workspace.id);
    const allowed = seatAllowance(workspace);
    return {
      seats: { ...usage, allowed, free: Math.max(0, allowed - usage.used) },
      accessUntil: workspace.accessUntil,
      ended: planEnded(workspace),
      state: teamPlanState(workspace),
      held: teamHeld(workspace),
      plan: { checkoutOpen: teamsCheckoutOpen(), channels: teamsCheckoutOpen() ? enabledChannels() : [], priceMinor: TEAMS_PLAN.priceMinor, seats: TEAMS_PLAN.seats },
    };
  }),

  /** For heyitsme staff: every team with its seats and plan date. */
  adminList: adminProcedure.query(async () => {
    const db = await requireDb();
    const teams = await db
      .select({ id: workspaces.id, name: workspaces.name, seatLimit: workspaces.seatLimit, accessUntil: workspaces.accessUntil, createdAt: workspaces.createdAt, closedAt: workspaces.deletedAt })
      .from(workspaces)
      .orderBy(desc(workspaces.id))
      .limit(500);
    const ids = teams.map(team => team.id);
    if (ids.length === 0) return [];
    const people = await db
      .select({ workspaceId: workspaceMembers.workspaceId, total: sql<number>`count(*)::int` })
      .from(workspaceMembers)
      .where(and(inArray(workspaceMembers.workspaceId, ids), ne(workspaceMembers.status, "removed")))
      .groupBy(workspaceMembers.workspaceId);
    const owners = await db
      .select({ workspaceId: workspaceMembers.workspaceId, email: workspaceMembers.email })
      .from(workspaceMembers)
      .where(and(inArray(workspaceMembers.workspaceId, ids), eq(workspaceMembers.role, "owner"), eq(workspaceMembers.status, "active")));
    const used = new Map(people.map(row => [row.workspaceId, row.total]));
    const owner = new Map(owners.map(row => [row.workspaceId, row.email]));
    return teams.map(team => ({
      ...team,
      seatsUsed: used.get(team.id) ?? 0,
      seatsAllowed: seatAllowance(team),
      ended: planEnded(team),
      ownerEmail: owner.get(team.id) ?? null,
    }));
  }),

  /**
   * For heyitsme staff: sets a team's seats and plan date. Lowering seats below the people already there removes
   * nobody; it only stops new invitations. A past date stops changes; nothing is deleted.
   */
  adminSetPlan: adminProcedure
    .input(z.object({ workspaceId: id, seatLimit: z.number().int().min(1).max(MAX_SEAT_ALLOWANCE).nullable(), accessUntil: z.date().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [workspace] = await db
        .update(workspaces)
        .set({ seatLimit: input.seatLimit, accessUntil: input.accessUntil, updatedAt: new Date() })
        .where(eq(workspaces.id, input.workspaceId))
        .returning({ id: workspaces.id, seatLimit: workspaces.seatLimit, accessUntil: workspaces.accessUntil });
      if (!workspace) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
      await recordAudit(db, {
        workspaceId: workspace.id,
        actorUserId: ctx.user.id,
        action: "plan.updated",
        entityType: "workspace",
        entityId: workspace.id,
        metadata: { seatLimit: input.seatLimit, accessUntil: input.accessUntil?.toISOString() ?? null },
      });
      return workspace;
    }),

  activity: memberProcedure.input(z.object({ workspaceId: id, limit: z.number().int().min(1).max(100).default(50) })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const rows = await db
      .select({
        id: workspaceAuditLog.id,
        action: workspaceAuditLog.action,
        entityType: workspaceAuditLog.entityType,
        entityId: workspaceAuditLog.entityId,
        metadata: workspaceAuditLog.metadata,
        createdAt: workspaceAuditLog.createdAt,
        actorUserId: workspaceAuditLog.actorUserId,
      })
      .from(workspaceAuditLog)
      .where(eq(workspaceAuditLog.workspaceId, input.workspaceId))
      .orderBy(desc(workspaceAuditLog.id))
      .limit(input.limit);
    const actorIds = Array.from(new Set(rows.map(row => row.actorUserId).filter((value): value is number => value !== null)));
    const actors = actorIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds)) : [];
    const names = new Map(actors.map(actor => [actor.id, actor.name]));
    return rows.map(({ actorUserId, ...row }) => ({ ...row, actorName: actorUserId === null ? null : (names.get(actorUserId) ?? null) }));
  }),
});
