import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_WORKSPACE_PEOPLE } from "@shared/teams";
import { users, workspaceAuditLog, workspaceMembers, workspaces } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { createTestDb } from "../billing/testDb";
import { planEnded, seatAllowance, teamEntitlements } from "./entitlements";
import { TEAM_SEATS_SCHEMA_STATEMENTS } from "./schemaSql";

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

const saved = { ...ENV };
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;

const req = { protocol: "https", headers: {}, ip: "203.0.113.9", get: () => "heyitsme.test", query: {} } as unknown as TrpcContext["req"];
const callerFor = (user: typeof users.$inferSelect | null) => appRouter.createCaller({ user, req, res: {} as TrpcContext["res"] });

let seq = 0;
async function makeUser(email: string, role = "user") {
  const [row] = await db.insert(users).values({ openId: `s-${++seq}`, email, name: email.split("@")[0], role }).returning();
  return row;
}
async function makeTeam(name = "Acme") {
  const owner = await makeUser(`owner${++seq}@seats.test`);
  const workspace = await callerFor(owner).teams.create({ name });
  return { owner, workspaceId: workspace.id, asOwner: callerFor(owner) };
}
type Team = Awaited<ReturnType<typeof makeTeam>>;
const tokenOf = (inviteUrl: string) => inviteUrl.split("/").pop()!;
async function invite(team: Team, role: "admin" | "member" = "member") {
  const email = `person${++seq}@seats.test`;
  const user = await makeUser(email);
  const sent = await team.asOwner.teams.invite({ workspaceId: team.workspaceId, email, role });
  return { user, memberId: sent.memberId, token: tokenOf(sent.inviteUrl), as: callerFor(user) };
}
async function join(team: Team, role: "admin" | "member" = "member") {
  const person = await invite(team, role);
  await person.as.teams.acceptInvite({ token: person.token });
  return person;
}
const staff = async () => callerFor(await makeUser(`staff${++seq}@heyitsme.test`, "admin"));
const DAY = 86_400_000;
const peopleIn = async (workspaceId: number) => (await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId))).filter(row => row.status !== "removed").length;

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  closeDb = () => created.client.close();
  setTestDb(db);
});
beforeEach(() => Object.assign(ENV, saved, { teamsEnabled: true, siteUrl: "https://heyitsme.test" }));
afterEach(() => Object.assign(ENV, saved));
afterAll(() => closeDb());

describe("team seats schema", () => {
  it("ensureSchema runs exactly the statements of drizzle/0020_team_seats.sql", () => {
    const file = readFileSync(path.resolve(__dirname, "../../drizzle/0020_team_seats.sql"), "utf8");
    const statements = file
      .split("\n")
      .filter(line => !line.startsWith("--"))
      .join("\n")
      .split(";")
      .map(s => s.trim().replaceAll("\r", ""))
      .filter(Boolean);
    expect([...TEAM_SEATS_SCHEMA_STATEMENTS]).toEqual(statements);
  });
});

describe("team entitlements", () => {
  it("are decided per workspace from its plan date", () => {
    const now = new Date();
    const open = { seatLimit: null, accessUntil: null };
    const ended = { seatLimit: 5, accessUntil: new Date(now.getTime() - DAY) };
    expect(seatAllowance(open)).toBe(MAX_WORKSPACE_PEOPLE);
    expect(seatAllowance(ended)).toBe(5);
    expect(planEnded(open, now)).toBe(false);
    expect(planEnded({ seatLimit: null, accessUntil: new Date(now.getTime() + DAY) }, now)).toBe(false);
    expect(planEnded(ended, now)).toBe(true);
    expect(Object.values(teamEntitlements(open, now)).every(Boolean)).toBe(true);
    const after = teamEntitlements(ended, now);
    expect(after.canInviteMembers).toBe(false);
    expect(after.canCreateTeamCards).toBe(false);
    expect(after.canViewWorkspaceAnalytics).toBe(true);
    ENV.teamsEnabled = false;
    expect(Object.values(teamEntitlements(open, now)).some(Boolean)).toBe(false);
  });
});

describe("team seats", () => {
  it("gives a new team the standard allowance and shows the owner what is used", async () => {
    const team = await makeTeam();
    await join(team);
    await invite(team);
    const billing = await team.asOwner.teams.billing({ workspaceId: team.workspaceId });
    expect(billing.seats).toEqual({ active: 2, invited: 1, suspended: 0, used: 3, allowed: MAX_WORKSPACE_PEOPLE, free: MAX_WORKSPACE_PEOPLE - 3 });
    expect(billing.accessUntil).toBeNull();
    expect(billing.ended).toBe(false);
  });

  it("shows billing to the owner only", async () => {
    const team = await makeTeam();
    const admin = await join(team, "admin");
    const stranger = callerFor(await makeUser(`stranger${++seq}@seats.test`));
    await expect(admin.as.teams.billing({ workspaceId: team.workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(stranger.teams.billing({ workspaceId: team.workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets only heyitsme staff set seats and plan dates", async () => {
    const team = await makeTeam();
    const change = { workspaceId: team.workspaceId, seatLimit: 500, accessUntil: null };
    await expect(team.asOwner.teams.adminSetPlan(change)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(team.asOwner.teams.adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(null).teams.adminSetPlan(change)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId));
    expect(row.seatLimit).toBeNull();

    const asStaff = await staff();
    await asStaff.teams.adminSetPlan({ ...change, seatLimit: 4 });
    await expect(asStaff.teams.adminSetPlan({ ...change, seatLimit: 0 })).rejects.toThrow();
    await expect(asStaff.teams.adminSetPlan({ ...change, workspaceId: 999_999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const listed = (await asStaff.teams.adminList()).find(item => item.id === team.workspaceId)!;
    expect(listed).toMatchObject({ seatLimit: 4, seatsAllowed: 4, seatsUsed: 1, ended: false, ownerEmail: team.owner.email });
    const log = await db.select().from(workspaceAuditLog).where(eq(workspaceAuditLog.workspaceId, team.workspaceId));
    expect(log.find(entry => entry.action === "plan.updated")?.metadata).toEqual({ seatLimit: 4, accessUntil: null });
  });

  it("stops invitations when every seat is taken, and frees a seat when someone is removed", async () => {
    const team = await makeTeam();
    await (await staff()).teams.adminSetPlan({ workspaceId: team.workspaceId, seatLimit: 2, accessUntil: null });
    const first = await join(team);
    await expect(team.asOwner.teams.invite({ workspaceId: team.workspaceId, email: `late${++seq}@seats.test`, role: "member" })).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("All 2 seats") });
    expect((await team.asOwner.teams.members({ workspaceId: team.workspaceId })).peopleLimit).toBe(2);
    await team.asOwner.teams.removeMember({ workspaceId: team.workspaceId, memberId: first.memberId });
    await join(team);
    expect((await team.asOwner.teams.billing({ workspaceId: team.workspaceId })).seats).toMatchObject({ used: 2, allowed: 2, free: 0 });
  });

  it("removes nobody when seats are lowered, and holds back an open invitation", async () => {
    const team = await makeTeam();
    const asStaff = await staff();
    await join(team);
    await join(team);
    const waiting = await invite(team);
    await asStaff.teams.adminSetPlan({ workspaceId: team.workspaceId, seatLimit: 2, accessUntil: null });
    expect(await peopleIn(team.workspaceId)).toBe(4);
    await expect(waiting.as.teams.acceptInvite({ token: waiting.token })).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("no free seat") });
    // The refused attempt did not use up the invitation.
    await asStaff.teams.adminSetPlan({ workspaceId: team.workspaceId, seatLimit: 4, accessUntil: null });
    await waiting.as.teams.acceptInvite({ token: waiting.token });
    expect((await team.asOwner.teams.billing({ workspaceId: team.workspaceId })).seats).toMatchObject({ active: 4, invited: 0, used: 4, free: 0 });
  });
});

describe("a team whose plan has ended", () => {
  it("can be read, downloaded, left and closed, but not changed, and keeps everything", async () => {
    const team = await makeTeam("Lapsed Ltd");
    const asStaff = await staff();
    const admin = await join(team, "admin");
    const member = await join(team);
    const leaver = await join(team);
    const waiting = await invite(team);
    const card = await team.asOwner.teamCards.create({ workspaceId: team.workspaceId, displayName: "Sam Seller", title: "Sales", assignMemberId: member.memberId });
    await asStaff.teams.adminSetPlan({ workspaceId: team.workspaceId, seatLimit: null, accessUntil: new Date(Date.now() - DAY) });

    const seen = await member.as.teams.get({ workspaceId: team.workspaceId });
    expect(seen.planEnded).toBe(true);
    expect(seen.entitlements.canInviteMembers).toBe(false);
    expect((await team.asOwner.teams.billing({ workspaceId: team.workspaceId })).ended).toBe(true);
    expect((await team.asOwner.teams.members({ workspaceId: team.workspaceId })).members).toHaveLength(5);
    expect((await team.asOwner.teamCards.list({ workspaceId: team.workspaceId })).cards.map(item => item.id)).toContain(card.id);
    await team.asOwner.teamContacts.exportCsv({ workspaceId: team.workspaceId });

    const ended = { code: "FORBIDDEN", message: expect.stringContaining("plan has ended") };
    await expect(team.asOwner.teams.update({ workspaceId: team.workspaceId, name: "Renamed" })).rejects.toMatchObject(ended);
    await expect(admin.as.teams.invite({ workspaceId: team.workspaceId, email: `new${++seq}@seats.test`, role: "member" })).rejects.toMatchObject(ended);
    await expect(team.asOwner.teamCards.create({ workspaceId: team.workspaceId, displayName: "New Card", title: "Sales" })).rejects.toMatchObject(ended);
    await expect(waiting.as.teams.acceptInvite({ token: waiting.token })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Someone outside the team still learns nothing about it.
    await expect(callerFor(await makeUser(`out${++seq}@seats.test`)).teams.update({ workspaceId: team.workspaceId, name: "Outsider" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    await leaver.as.teams.leave({ workspaceId: team.workspaceId });
    await team.asOwner.teams.removeMember({ workspaceId: team.workspaceId, memberId: admin.memberId });
    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, team.workspaceId));
    expect(row.name).toBe("Lapsed Ltd");
    expect((await team.asOwner.teamCards.list({ workspaceId: team.workspaceId })).cards).toHaveLength(1);

    await asStaff.teams.adminSetPlan({ workspaceId: team.workspaceId, seatLimit: null, accessUntil: new Date(Date.now() + DAY) });
    await team.asOwner.teams.update({ workspaceId: team.workspaceId, name: "Renewed Ltd" });
    await waiting.as.teams.acceptInvite({ token: waiting.token });
    expect((await member.as.teams.get({ workspaceId: team.workspaceId })).planEnded).toBe(false);

    await asStaff.teams.adminSetPlan({ workspaceId: team.workspaceId, seatLimit: null, accessUntil: new Date(Date.now() - DAY) });
    await team.asOwner.teams.close({ workspaceId: team.workspaceId });
  });
});
