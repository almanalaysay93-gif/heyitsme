// Numbers for company cards: views, saves, exchanges, scans and clicks. Admins see the whole workspace and can
// narrow it down. A member sees only the cards assigned to them. The leaderboard is off until an admin turns it on.
import { and, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { isAdminRole, TEAM_ANALYTICS_RANGES } from "@shared/teams";
import { analyticsEvents, cards, users, workspaceDepartments, workspaceMembers, workspaces, workspaceTemplates } from "../../drizzle/schema";
import { router } from "../_core/trpc";
import { insightsSince } from "../insights";
import { recordAudit, requireWorkspaceAdmin, requireWorkspaceMember } from "./access";
import { id, requireDb, teamProcedure } from "./router";

const analyticsProcedure = teamProcedure("canViewWorkspaceAnalytics");
const LEADERBOARD_SIZE = 10;

export type TeamTotals = { views: number; saves: number; exchanges: number; qrScans: number; linkClicks: number; shares: number };
const emptyTotals = (): TeamTotals => ({ views: 0, saves: 0, exchanges: 0, qrScans: 0, linkClicks: 0, shares: 0 });
const TOTAL_OF: Record<string, keyof TeamTotals> = { view: "views", vcard: "saves", save: "exchanges", qr: "qrScans", link: "linkClicks", share: "shares" };

const TOTAL_KEYS = Object.keys(emptyTotals()) as (keyof TeamTotals)[];

function add(into: TeamTotals, from: TeamTotals) {
  for (const key of TOTAL_KEYS) into[key] += from[key];
}
const busy = (totals: TeamTotals) => TOTAL_KEYS.some(key => totals[key] > 0);
const byViews = (a: TeamTotals, b: TeamTotals) => b.views - a.views || b.exchanges - a.exchanges || b.qrScans - a.qrScans;
const toDay = (date: Date) => date.toISOString().slice(0, 10);

const days = z.number().int().refine(value => (TEAM_ANALYTICS_RANGES as readonly number[]).includes(value), "Choose a listed time range.");

export const teamAnalyticsRouter = router({
  summary: analyticsProcedure
    .input(
      z.object({
        workspaceId: id,
        days: days.default(30),
        // Filters are for admins. A member's view is always their own cards, whatever is sent.
        memberId: z.union([id, z.literal("unassigned")]).optional(),
        departmentId: id.optional(),
        cardId: id.optional(),
        templateId: id.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const { workspace, member: me } = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
      const admin = isAdminRole(me.role);
      const now = new Date();
      const since = insightsSince(input.days, now);

      const all = await db
        .select({
          id: cards.id,
          displayName: cards.displayName,
          slug: cards.slug,
          published: cards.published,
          teamStatus: cards.teamStatus,
          templateId: cards.templateId,
          assignedUserId: cards.assignedUserId,
          memberId: workspaceMembers.id,
          holderName: users.name,
          holderEmail: workspaceMembers.email,
          departmentId: workspaceMembers.departmentId,
        })
        .from(cards)
        .leftJoin(users, eq(users.id, cards.assignedUserId))
        .leftJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, cards.workspaceId), eq(workspaceMembers.userId, cards.assignedUserId)))
        .where(and(eq(cards.workspaceId, input.workspaceId), isNull(cards.deletedAt)));

      const scope = admin
        ? all.filter(
            card =>
              (input.cardId === undefined || card.id === input.cardId) &&
              (input.templateId === undefined || card.templateId === input.templateId) &&
              (input.departmentId === undefined || card.departmentId === input.departmentId) &&
              (input.memberId === undefined || (input.memberId === "unassigned" ? card.assignedUserId === null : card.memberId === input.memberId))
          )
        : all.filter(card => card.assignedUserId === ctx.user.id);

      // Members only need their own cards counted, unless the leaderboard is on and shows the whole team.
      const counted = admin || workspace.leaderboardEnabled ? all : scope;
      const countedIds = counted.map(card => card.id);
      const scopeIds = scope.map(card => card.id);
      const day = sql<string>`to_char(date_trunc('day', ${analyticsEvents.createdAt}), 'YYYY-MM-DD')`;
      const [events, viewsByDay] = await Promise.all([
        countedIds.length
          ? db
              .select({ cardId: analyticsEvents.cardId, type: analyticsEvents.type, count: sql<number>`count(*)::int` })
              .from(analyticsEvents)
              .where(and(inArray(analyticsEvents.cardId, countedIds), gte(analyticsEvents.createdAt, since)))
              .groupBy(analyticsEvents.cardId, analyticsEvents.type)
          : [],
        scopeIds.length
          ? db
              .select({ day, count: sql<number>`count(*)::int` })
              .from(analyticsEvents)
              .where(and(inArray(analyticsEvents.cardId, scopeIds), eq(analyticsEvents.type, "view"), gte(analyticsEvents.createdAt, since)))
              .groupBy(day)
          : [],
      ]);

      const ofCard = new Map<number, TeamTotals>();
      for (const row of events) {
        const key = TOTAL_OF[row.type];
        if (!key) continue;
        const totals = ofCard.get(row.cardId) ?? emptyTotals();
        totals[key] += Number(row.count);
        ofCard.set(row.cardId, totals);
      }
      const totalsOf = (cardId: number) => ofCard.get(cardId) ?? emptyTotals();

      const totals = emptyTotals();
      for (const card of scope) add(totals, totalsOf(card.id));

      const viewsOn = new Map(viewsByDay.map(row => [row.day, Number(row.count)]));
      const daily = Array.from({ length: input.days }, (_, index) => {
        const date = new Date(since);
        date.setUTCDate(since.getUTCDate() + index);
        return { day: toDay(date), views: viewsOn.get(toDay(date)) ?? 0 };
      });

      const live = (card: (typeof all)[number]) => card.published && !card.teamStatus;
      const cardRows = scope
        .map(card => ({
          id: card.id,
          displayName: card.displayName,
          slug: card.slug,
          published: live(card),
          holderName: admin ? card.holderName ?? card.holderEmail ?? null : null,
          ...totalsOf(card.id),
        }))
        .sort((a, b) => byViews(a, b) || a.displayName.localeCompare(b.displayName));

      // One row per person holding a card. Kept in name order for admins: ranking people is the leaderboard's job.
      type PersonRow = { memberId: number; name: string; cards: number } & TeamTotals;
      const people = (source: typeof all) => {
        const rows = new Map<number, PersonRow>();
        for (const card of source) {
          if (card.memberId === null) continue;
          const row = rows.get(card.memberId) ?? { memberId: card.memberId, name: card.holderName ?? (admin ? card.holderEmail : null) ?? "Team member", cards: 0, ...emptyTotals() };
          row.cards += 1;
          add(row, totalsOf(card.id));
          rows.set(card.memberId, row);
        }
        return Array.from(rows.values());
      };

      let byDepartment: ({ departmentId: number | null; name: string; cards: number } & TeamTotals)[] = [];
      if (admin) {
        const departments = await db
          .select({ id: workspaceDepartments.id, name: workspaceDepartments.name })
          .from(workspaceDepartments)
          .where(eq(workspaceDepartments.workspaceId, input.workspaceId));
        const nameOf = new Map(departments.map(department => [department.id, department.name]));
        const rows = new Map<number | null, (typeof byDepartment)[number]>();
        for (const card of scope) {
          const key = card.departmentId !== null && nameOf.has(card.departmentId) ? card.departmentId : null;
          const row = rows.get(key) ?? { departmentId: key, name: key === null ? "No department" : nameOf.get(key)!, cards: 0, ...emptyTotals() };
          row.cards += 1;
          add(row, totalsOf(card.id));
          rows.set(key, row);
        }
        byDepartment = Array.from(rows.values()).sort((a, b) => byViews(a, b) || a.name.localeCompare(b.name));
      }

      return {
        canViewAll: admin,
        days: input.days,
        from: daily[0].day,
        to: daily[daily.length - 1].day,
        totals,
        /** Exchanges per view, 0-1. Null when there are no views yet. */
        conversionRate: totals.views > 0 ? totals.exchanges / totals.views : null,
        daily,
        cardCounts: { total: scope.length, published: scope.filter(live).length, active: scope.filter(card => busy(totalsOf(card.id))).length },
        activePeople: admin ? people(scope).filter(busy).length : null,
        cards: cardRows,
        people: admin ? people(scope).sort((a, b) => a.name.localeCompare(b.name)) : [],
        departments: byDepartment,
        leaderboardEnabled: workspace.leaderboardEnabled,
        // The whole team, not the filtered view, and only the three numbers the team agreed to compare.
        leaderboard: workspace.leaderboardEnabled
          ? people(all)
              .filter(busy)
              .sort((a, b) => byViews(a, b) || a.name.localeCompare(b.name))
              .slice(0, LEADERBOARD_SIZE)
              .map(row => ({ memberId: row.memberId, name: row.name, views: row.views, exchanges: row.exchanges, qrScans: row.qrScans, you: row.memberId === me.id }))
          : null,
      };
    }),

  /** The choices an admin can narrow the numbers by. */
  filters: analyticsProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const [people, departments, templates, cardRows] = await Promise.all([
      db
        .select({ id: workspaceMembers.id, name: users.name, email: workspaceMembers.email })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(and(eq(workspaceMembers.workspaceId, input.workspaceId), ne(workspaceMembers.status, "removed"), ne(workspaceMembers.status, "invited"))),
      db.select({ id: workspaceDepartments.id, name: workspaceDepartments.name }).from(workspaceDepartments).where(eq(workspaceDepartments.workspaceId, input.workspaceId)),
      db.select({ id: workspaceTemplates.id, name: workspaceTemplates.name }).from(workspaceTemplates).where(eq(workspaceTemplates.workspaceId, input.workspaceId)),
      db.select({ id: cards.id, name: cards.displayName }).from(cards).where(and(eq(cards.workspaceId, input.workspaceId), isNull(cards.deletedAt))),
    ]);
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    return {
      people: people.map(person => ({ id: person.id, name: person.name ?? person.email })).sort(byName),
      departments: departments.sort(byName),
      templates: templates.sort(byName),
      cards: cardRows.sort(byName),
    };
  }),

  /** How far the team has taken up its cards. Sharing is counted for whoever holds the card today. */
  adoption: analyticsProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const inWorkspace = and(eq(cards.workspaceId, input.workspaceId), isNull(cards.deletedAt));
    const [members, cardRows, sharers] = await Promise.all([
      db
        .select({ userId: workspaceMembers.userId, status: workspaceMembers.status })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, input.workspaceId), ne(workspaceMembers.status, "removed"))),
      db.select({ published: cards.published, teamStatus: cards.teamStatus }).from(cards).where(inWorkspace),
      db
        .select({ userId: cards.assignedUserId, last: sql<Date | string>`max(${analyticsEvents.createdAt})` })
        .from(analyticsEvents)
        .innerJoin(cards, eq(cards.id, analyticsEvents.cardId))
        .where(and(inWorkspace, eq(analyticsEvents.type, "share")))
        .groupBy(cards.assignedUserId),
    ]);
    const lastShare = new Map(sharers.filter(row => row.userId !== null).map(row => [row.userId!, new Date(row.last)]));
    const active = members.filter(member => member.status === "active" && member.userId !== null);
    const published = cardRows.filter(card => card.published && !card.teamStatus).length;
    return {
      totalMembers: members.length,
      activeMembers: active.length,
      cardsPublished: published,
      cardsNotPublished: cardRows.length - published,
      sharedThisMonth: active.filter(member => (lastShare.get(member.userId!)?.getTime() ?? 0) >= monthStart.getTime()).length,
      neverShared: active.filter(member => !lastShare.has(member.userId!)).length,
    };
  }),

  /** Ranking people is a choice for each team. It stays off until an admin turns it on. */
  setLeaderboard: analyticsProcedure.input(z.object({ workspaceId: id, enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    await db.update(workspaces).set({ leaderboardEnabled: input.enabled, updatedAt: new Date() }).where(eq(workspaces.id, input.workspaceId));
    await recordAudit(db, {
      workspaceId: input.workspaceId,
      actorUserId: ctx.user.id,
      action: input.enabled ? "analytics.leaderboard_on" : "analytics.leaderboard_off",
      entityType: "workspace",
      entityId: input.workspaceId,
    });
    return { enabled: input.enabled };
  }),
});
