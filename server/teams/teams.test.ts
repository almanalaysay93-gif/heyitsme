import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { INVITATION_TTL_MS, MAX_OWNED_WORKSPACES } from "@shared/teams";
import { cards, users, workspaceAuditLog, workspaceInvitations, workspaceMembers, workspaces } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { createTestDb } from "../billing/testDb";
import { TEAMS_SCHEMA_STATEMENTS } from "./schemaSql";

vi.mock("../_core/rateLimit", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/rateLimit")>()),
  rateLimit: vi.fn(async () => ({ allowed: true, count: 1, resetMs: 0 })),
}));
vi.mock("../_core/mail", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/mail")>()),
  sendMail: vi.fn(async () => true),
}));
vi.mock("../uploadSweep", () => ({ tidyOwnerUploads: vi.fn() }));

const { appRouter } = await import("../routers");
const { setTestDb } = await import("../db");
const { sendMail } = await import("../_core/mail");
const { hashInvitationToken } = await import("./router");

const saved = { ...ENV };
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;

const req = { protocol: "https", headers: {}, ip: "203.0.113.9", get: () => "heyitsme.test", query: {} } as unknown as TrpcContext["req"];
const callerFor = (user: typeof users.$inferSelect | null) => appRouter.createCaller({ user, req, res: {} as TrpcContext["res"] });

let seq = 0;
async function makeUser(email: string, name = email.split("@")[0]) {
  const [row] = await db.insert(users).values({ openId: `g-${++seq}`, email, name }).returning();
  return row;
}
const tokenOf = (inviteUrl: string) => inviteUrl.split("/").pop()!;

/** An owner with a workspace, ready to invite. */
async function makeTeam(name = "Acme") {
  const owner = await makeUser(`owner${++seq}@acme.test`, "Olive Owner");
  const workspace = await callerFor(owner).teams.create({ name });
  return { owner, workspace, asOwner: callerFor(owner) };
}

/** Invites an email and has that user accept. */
async function join(team: Awaited<ReturnType<typeof makeTeam>>, email: string, role: "admin" | "member" = "member") {
  const user = await makeUser(email);
  const invite = await team.asOwner.teams.invite({ workspaceId: team.workspace.id, email, role });
  await callerFor(user).teams.acceptInvite({ token: tokenOf(invite.inviteUrl) });
  return { user, memberId: invite.memberId, as: callerFor(user) };
}

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  closeDb = () => created.client.close();
  setTestDb(db);
});
beforeEach(() => {
  Object.assign(ENV, saved, { teamsEnabled: true, siteUrl: "https://heyitsme.test" });
  vi.mocked(sendMail).mockClear();
});
afterEach(() => Object.assign(ENV, saved));
afterAll(() => closeDb());

describe("teams schema", () => {
  it("ensureSchema runs exactly the statements of drizzle/0013_teams.sql", () => {
    const file = readFileSync(path.resolve(__dirname, "../../drizzle/0013_teams.sql"), "utf8");
    const statements = file
      .split("\n")
      .filter(line => !line.startsWith("--"))
      .join("\n")
      .split(";")
      .map(s => s.trim().replaceAll("\r", ""))
      .filter(Boolean);
    expect([...TEAMS_SCHEMA_STATEMENTS]).toEqual(statements);
  });
});

describe("teams switch", () => {
  it("refuses every Team call while Teams is off, whatever the browser thinks", async () => {
    const user = await makeUser("off@acme.test");
    ENV.teamsEnabled = false;
    const caller = callerFor(user);
    expect((await caller.teams.status()).enabled).toBe(false);
    await expect(caller.teams.create({ name: "Nope" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.teams.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.teams.invitation({ token: "x".repeat(43) })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("needs a signed-in user", async () => {
    await expect(callerFor(null).teams.create({ name: "Nope" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("workspace creation", () => {
  it("makes the creator the owner and lists the workspace for switching", async () => {
    const { owner, workspace, asOwner } = await makeTeam("Acme Studio");
    expect(workspace).toMatchObject({ name: "Acme Studio", createdBy: owner.id, timezone: "Asia/Manila" });
    expect(await asOwner.teams.list()).toEqual([{ id: workspace.id, name: "Acme Studio", logoUrl: null, role: "owner" }]);
    const got = await asOwner.teams.get({ workspaceId: workspace.id });
    expect(got.me.role).toBe("owner");
    const [log] = await db.select().from(workspaceAuditLog).where(eq(workspaceAuditLog.workspaceId, workspace.id));
    expect(log).toMatchObject({ action: "workspace.created", actorUserId: owner.id });
  });

  it("caps how many teams one person can own", async () => {
    const user = await makeUser("many@acme.test");
    const caller = callerFor(user);
    for (let i = 0; i < MAX_OWNED_WORKSPACES; i++) await caller.teams.create({ name: `Team ${i}` });
    await expect(caller.teams.create({ name: "One too many" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("leaves personal cards alone", async () => {
    const { owner, asOwner } = await makeTeam();
    await db.insert(cards).values({ ownerUserId: owner.id, displayName: "Olive", title: "Founder", slug: `olive-${++seq}` });
    const list = await asOwner.cards.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ ownerUserId: owner.id, displayName: "Olive" });
  });

  it("hides a workspace from people who are not in it", async () => {
    const { workspace } = await makeTeam();
    const stranger = callerFor(await makeUser("stranger@else.test"));
    await expect(stranger.teams.get({ workspaceId: workspace.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stranger.teams.members({ workspaceId: workspace.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stranger.teams.invite({ workspaceId: workspace.id, email: "x@else.test" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stranger.teams.activity({ workspaceId: workspace.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await stranger.teams.list()).toEqual([]);
  });
});

describe("invitations", () => {
  it("emails a link, stores only its hash, and activates the membership on accept", async () => {
    const team = await makeTeam();
    const invite = await team.asOwner.teams.invite({ workspaceId: team.workspace.id, email: "  Mia@Acme.Test ", jobTitle: "Designer" });
    const token = tokenOf(invite.inviteUrl);
    expect(invite.inviteUrl).toBe(`https://heyitsme.test/app/team/join/${token}`);
    expect(invite.emailed).toBe(true);
    expect(vi.mocked(sendMail).mock.calls[0][0]).toMatchObject({ to: "mia@acme.test", subject: "Join Acme on heyitsme" });
    expect(vi.mocked(sendMail).mock.calls[0][0].text).toContain(invite.inviteUrl);

    const [stored] = await db.select().from(workspaceInvitations).where(eq(workspaceInvitations.memberId, invite.memberId));
    expect(stored.tokenHash).toBe(hashInvitationToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(INVITATION_TTL_MS - 60_000);
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(INVITATION_TTL_MS);

    // Before sign-in the link names the team and hides the address.
    const preview = await callerFor(null).teams.invitation({ token });
    expect(preview).toMatchObject({ state: "valid", workspaceName: "Acme", role: "member", forMe: false });
    expect(preview.state === "valid" && preview.email).not.toContain("mia@");

    const mia = await makeUser("mia@acme.test");
    expect(await callerFor(mia).teams.list()).toEqual([]);
    expect(await callerFor(mia).teams.acceptInvite({ token })).toEqual({ workspaceId: team.workspace.id, workspaceName: "Acme" });
    expect(await callerFor(mia).teams.list()).toMatchObject([{ id: team.workspace.id, role: "member" }]);

    const [member] = await db.select().from(workspaceMembers).where(eq(workspaceMembers.id, invite.memberId));
    expect(member).toMatchObject({ userId: mia.id, status: "active", jobTitle: "Designer" });

    // A link works once.
    await expect(callerFor(mia).teams.acceptInvite({ token })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await callerFor(null).teams.invitation({ token })).state).toBe("invalid");
  });

  it("only works for the account it was sent to", async () => {
    const team = await makeTeam();
    const invite = await team.asOwner.teams.invite({ workspaceId: team.workspace.id, email: "kai@acme.test" });
    const thief = await makeUser("thief@else.test");
    await expect(callerFor(thief).teams.acceptInvite({ token: tokenOf(invite.inviteUrl) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await callerFor(thief).teams.list()).toEqual([]);
  });

  it("refuses an expired link and a made-up one", async () => {
    const team = await makeTeam();
    const invite = await team.asOwner.teams.invite({ workspaceId: team.workspace.id, email: "late@acme.test" });
    const token = tokenOf(invite.inviteUrl);
    await db.update(workspaceInvitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(workspaceInvitations.memberId, invite.memberId));
    const late = await makeUser("late@acme.test");
    expect((await callerFor(late).teams.invitation({ token })).state).toBe("expired");
    await expect(callerFor(late).teams.acceptInvite({ token })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(callerFor(late).teams.acceptInvite({ token: "A".repeat(43) })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await callerFor(late).teams.list()).toEqual([]);
  });

  it("a resent invitation replaces the old link", async () => {
    const team = await makeTeam();
    const first = await team.asOwner.teams.invite({ workspaceId: team.workspace.id, email: "rae@acme.test" });
    const second = await team.asOwner.teams.resendInvite({ workspaceId: team.workspace.id, memberId: first.memberId });
    expect(second.inviteUrl).not.toBe(first.inviteUrl);
    const rae = await makeUser("rae@acme.test");
    await expect(callerFor(rae).teams.acceptInvite({ token: tokenOf(first.inviteUrl) })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await callerFor(rae).teams.acceptInvite({ token: tokenOf(second.inviteUrl) });
    await expect(team.asOwner.teams.resendInvite({ workspaceId: team.workspace.id, memberId: first.memberId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("a cancelled invitation stops working, and the person can be invited again", async () => {
    const team = await makeTeam();
    const first = await team.asOwner.teams.invite({ workspaceId: team.workspace.id, email: "sam@acme.test" });
    await team.asOwner.teams.removeMember({ workspaceId: team.workspace.id, memberId: first.memberId });
    const sam = await makeUser("sam@acme.test");
    await expect(callerFor(sam).teams.acceptInvite({ token: tokenOf(first.inviteUrl) })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const again = await team.asOwner.teams.invite({ workspaceId: team.workspace.id, email: "sam@acme.test" });
    expect(again.memberId).toBe(first.memberId);
    await callerFor(sam).teams.acceptInvite({ token: tokenOf(again.inviteUrl) });
    await expect(team.asOwner.teams.invite({ workspaceId: team.workspace.id, email: "sam@acme.test" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects a bad email address", async () => {
    const team = await makeTeam();
    await expect(team.asOwner.teams.invite({ workspaceId: team.workspace.id, email: "not-an-email" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("roles", () => {
  it("members cannot invite, manage people, edit the team, or read the activity log", async () => {
    const team = await makeTeam();
    const admin = await join(team, "ann@acme.test", "admin");
    const member = await join(team, "max@acme.test");
    const workspaceId = team.workspace.id;
    await expect(member.as.teams.invite({ workspaceId, email: "pal@acme.test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teams.removeMember({ workspaceId, memberId: admin.memberId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teams.setSuspended({ workspaceId, memberId: admin.memberId, suspended: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teams.changeRole({ workspaceId, memberId: member.memberId, role: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teams.update({ workspaceId, name: "Hacked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teams.activity({ workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teams.close({ workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // A member sees who is on the team, but not other people's addresses or pending invitations.
    await team.asOwner.teams.invite({ workspaceId, email: "pending@acme.test" });
    const seen = await member.as.teams.members({ workspaceId });
    expect(seen.members.map(m => m.status)).toEqual(["active", "active", "active"]);
    expect(seen.members.filter(m => m.email !== null).map(m => m.email)).toEqual(["max@acme.test"]);
  });

  it("admins manage members but not the owner, other admins, roles, or the workspace itself", async () => {
    const team = await makeTeam();
    const admin = await join(team, "ada@acme.test", "admin");
    const other = await join(team, "abe@acme.test", "admin");
    const member = await join(team, "mel@acme.test");
    const workspaceId = team.workspace.id;
    const all = await admin.as.teams.members({ workspaceId });
    const ownerMemberId = all.members.find(m => m.role === "owner")!.id;
    expect(all.members.every(m => m.email !== null)).toBe(true);

    await expect(admin.as.teams.invite({ workspaceId, email: "boss@acme.test", role: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.as.teams.removeMember({ workspaceId, memberId: ownerMemberId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.as.teams.removeMember({ workspaceId, memberId: other.memberId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.as.teams.removeMember({ workspaceId, memberId: admin.memberId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.as.teams.changeRole({ workspaceId, memberId: member.memberId, role: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.as.teams.transferOwnership({ workspaceId, memberId: admin.memberId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.as.teams.close({ workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await admin.as.teams.invite({ workspaceId, email: "new@acme.test" });
    expect((await admin.as.teams.update({ workspaceId, name: "Acme Two", website: "https://acme.test" })).name).toBe("Acme Two");
    await admin.as.teams.removeMember({ workspaceId, memberId: member.memberId });
    await expect(member.as.teams.get({ workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Removing a membership leaves the person's own account in place.
    expect(await db.select().from(users).where(eq(users.id, member.user.id))).toHaveLength(1);
  });

  it("a member id from another team does nothing", async () => {
    const team = await makeTeam();
    const elsewhere = await makeTeam("Other Co");
    const outsider = await join(elsewhere, "out@other.test");
    await expect(team.asOwner.teams.removeMember({ workspaceId: team.workspace.id, memberId: outsider.memberId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(team.asOwner.teams.changeRole({ workspaceId: team.workspace.id, memberId: outsider.memberId, role: "admin" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await outsider.as.teams.get({ workspaceId: elsewhere.workspace.id })).me.role).toBe("member");
  });

  it("the owner changes roles and hands over ownership", async () => {
    const team = await makeTeam();
    const member = await join(team, "ned@acme.test");
    const workspaceId = team.workspace.id;
    await team.asOwner.teams.changeRole({ workspaceId, memberId: member.memberId, role: "admin" });
    expect((await member.as.teams.get({ workspaceId })).me.role).toBe("admin");
    await expect(team.asOwner.teams.leave({ workspaceId })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await team.asOwner.teams.transferOwnership({ workspaceId, memberId: member.memberId });
    expect((await member.as.teams.get({ workspaceId })).me.role).toBe("owner");
    expect((await team.asOwner.teams.get({ workspaceId })).me.role).toBe("admin");
    await expect(team.asOwner.teams.close({ workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await team.asOwner.teams.leave({ workspaceId });
    expect(await team.asOwner.teams.list()).toEqual([]);
  });

  it("a suspended person loses access until reactivated", async () => {
    const team = await makeTeam();
    const member = await join(team, "sue@acme.test");
    const workspaceId = team.workspace.id;
    await team.asOwner.teams.setSuspended({ workspaceId, memberId: member.memberId, suspended: true });
    await expect(member.as.teams.get({ workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await member.as.teams.list()).toEqual([]);
    await team.asOwner.teams.setSuspended({ workspaceId, memberId: member.memberId, suspended: false });
    expect((await member.as.teams.get({ workspaceId })).me.role).toBe("member");
  });

  it("closing a workspace hides it and keeps its rows", async () => {
    const team = await makeTeam();
    const member = await join(team, "cy@acme.test");
    const workspaceId = team.workspace.id;
    await team.asOwner.teams.close({ workspaceId });
    await expect(team.asOwner.teams.get({ workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await member.as.teams.list()).toEqual([]);
    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId))).toHaveLength(2);
  });

  it("records who did what, for admins to read", async () => {
    const team = await makeTeam();
    const member = await join(team, "log@acme.test");
    const workspaceId = team.workspace.id;
    await team.asOwner.teams.changeRole({ workspaceId, memberId: member.memberId, role: "admin" });
    await team.asOwner.teams.changeRole({ workspaceId, memberId: member.memberId, role: "member" });
    await team.asOwner.teams.removeMember({ workspaceId, memberId: member.memberId });
    const log = await team.asOwner.teams.activity({ workspaceId });
    expect(log.map(entry => entry.action)).toEqual([
      "member.removed",
      "member.role_changed",
      "member.role_changed",
      "member.joined",
      "member.invited",
      "workspace.created",
    ]);
    expect(log[0].actorName).toBe("Olive Owner");
    expect(log[3].actorName).toBe("log");
  });
});
