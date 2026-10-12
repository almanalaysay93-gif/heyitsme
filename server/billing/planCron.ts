// The daily plan run (vercel.json "crons"). It tells owners when a plan has ended and its hold is near, and gives
// teams that were free their end date once Teams is sold. Holds themselves need no run: they are worked out
// from the dates on every request (server/billing/hold.ts).
import { timingSafeEqual } from "node:crypto";
import type { Express } from "express";
import { and, eq, gt, isNull, lte, ne, sql } from "drizzle-orm";
import { FREE_TEAM_NOTICE_DAYS, HOLD_GRACE_DAYS, holdStartsAt } from "@shared/hold";
import { appSettings, billingAccounts, subscriptions, users, workspaceMembers, workspaces } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { sendMail } from "../_core/mail";
import { logJson, siteOrigin } from "../_core/seo";
import { getDb } from "../db";
import { teamsCheckoutOpen } from "./checkout";
import { proLapse } from "./hold";
import { proEndedMail, teamFreeEndingMail, teamPlanEndedMail } from "./mail";
import type { Db } from "./service";

const DAY = 86_400_000;

/** True the first time a notice is claimed, false ever after. One row per notice, so two runs cannot both send it. */
async function claimNotice(db: Db, kind: string, subjectId: number, at: Date) {
  const rows = await db
    .insert(appSettings)
    .values({ key: `notice:${kind}:${subjectId}:${Math.floor(at.getTime() / 1000)}`, value: { sentAt: new Date().toISOString() } })
    .onConflictDoNothing()
    .returning({ key: appSettings.key });
  return rows.length > 0;
}

async function teamOwnerEmail(db: Db, workspaceId: number) {
  const [owner] = await db
    .select({ email: workspaceMembers.email })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner"), eq(workspaceMembers.status, "active")))
    .limit(1);
  return owner?.email ?? null;
}

/**
 * Teams made while Teams was free have no end date. Once Teams is sold each gets one, FREE_TEAM_NOTICE_DAYS away,
 * and its owner is told. The update only touches teams without a date, so a second run finds nothing to do.
 */
export async function endFreeTeams(db: Db, origin: string, now = new Date()) {
  if (!teamsCheckoutOpen()) return 0;
  const endsAt = new Date(now.getTime() + FREE_TEAM_NOTICE_DAYS * DAY);
  const teams = await db
    .update(workspaces)
    .set({ accessUntil: endsAt, updatedAt: now })
    .where(and(isNull(workspaces.accessUntil), isNull(workspaces.deletedAt)))
    .returning({ id: workspaces.id, name: workspaces.name });
  for (const team of teams) {
    const to = await teamOwnerEmail(db, team.id);
    if (to) await sendMail(teamFreeEndingMail({ to, teamName: team.name, endsAt, holdFrom: holdStartsAt(endsAt), teamUrl: `${origin}/app/team/${team.id}` }));
  }
  return teams.length;
}

/** One email to the owner of each team whose plan ended in the last days of grace: when the hold starts, and where to pay. */
export async function remindEndedTeams(db: Db, origin: string, now = new Date()) {
  const teams = await db
    .select({ id: workspaces.id, name: workspaces.name, accessUntil: workspaces.accessUntil })
    .from(workspaces)
    .where(
      and(
        isNull(workspaces.deletedAt),
        lte(workspaces.accessUntil, now),
        gt(workspaces.accessUntil, new Date(now.getTime() - HOLD_GRACE_DAYS * DAY)),
        // A team that was never paid for has nothing that ended.
        sql`${workspaces.accessUntil} <> ${workspaces.createdAt}`
      )
    );
  let sent = 0;
  for (const team of teams) {
    if (!team.accessUntil || !(await claimNotice(db, "team-ended", team.id, team.accessUntil))) continue;
    const to = await teamOwnerEmail(db, team.id);
    if (to && (await sendMail(teamPlanEndedMail({ to, teamName: team.name, holdFrom: holdStartsAt(team.accessUntil), teamUrl: `${origin}/app/team/${team.id}` })))) sent += 1;
  }
  return sent;
}

/** One email to each account whose Pro ended in the last days of grace and was not renewed. */
export async function remindEndedPro(db: Db, origin: string, now = new Date()) {
  const owners = await db
    .selectDistinct({ userId: billingAccounts.ownerUserId })
    .from(subscriptions)
    .innerJoin(billingAccounts, eq(billingAccounts.id, subscriptions.billingAccountId))
    .where(and(ne(subscriptions.status, "pending"), lte(subscriptions.currentPeriodEnd, now), gt(subscriptions.currentPeriodEnd, new Date(now.getTime() - HOLD_GRACE_DAYS * DAY))));
  let sent = 0;
  for (const { userId } of owners) {
    if (userId === null) continue;
    const lapse = await proLapse(db, userId, now);
    if (!lapse || lapse.held || !(await claimNotice(db, "pro-ended", userId, lapse.endedAt))) continue;
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (user?.email && (await sendMail(proEndedMail({ to: user.email, holdFrom: lapse.holdFrom, billingUrl: `${origin}/app/billing` })))) sent += 1;
  }
  return sent;
}

export async function runPlanCron(db: Db, origin: string, now = new Date()) {
  const freeTeamsEnded = await endFreeTeams(db, origin, now);
  const teamReminders = await remindEndedTeams(db, origin, now);
  const proReminders = await remindEndedPro(db, origin, now);
  return { freeTeamsEnded, teamReminders, proReminders };
}

const sameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Vercel Cron calls this with "Authorization: Bearer CRON_SECRET". Without the secret set, nobody can run it. */
export function registerPlanCron(app: Express) {
  app.get("/api/cron/plans", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const given = String(req.headers.authorization ?? "");
    if (!ENV.cronSecret || !sameSecret(given, `Bearer ${ENV.cronSecret}`)) return res.status(401).json({ ok: false });
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ ok: false });
      const result = await runPlanCron(db, siteOrigin(req));
      logJson("info", "plan cron ran", result);
      return res.json({ ok: true, ...result });
    } catch (error) {
      logJson("error", "plan cron failed", { error: String(error) });
      return res.status(503).json({ ok: false });
    }
  });
}
