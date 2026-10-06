import { AsyncLocalStorage } from "node:async_hooks";
import { TRPCError } from "@trpc/server";
import { TEAM_HOLD_MESSAGE, holdStartsAt } from "@shared/hold";
import { MAX_WORKSPACE_PEOPLE, TEAM_CAPABILITIES, type TeamCapability, type TeamEntitlements } from "@shared/teams";
import { ENV } from "../_core/env";

/** The two plan settings of a workspace. Only heyitsme sets them; a team cannot. */
export type WorkspacePlan = { seatLimit: number | null; accessUntil: Date | null };

export const seatAllowance = (workspace: WorkspacePlan) => workspace.seatLimit ?? MAX_WORKSPACE_PEOPLE;

export const planEnded = (workspace: WorkspacePlan, now = new Date()) =>
  workspace.accessUntil !== null && workspace.accessUntil.getTime() <= now.getTime();

/**
 * Where a team's plan stands. "free" has no end date and nothing to pay. "unpaid" was started while Teams is
 * sold and has not been paid for yet: its plan date is exactly the moment it was made, which no later change produces.
 */
export type TeamPlanState = "free" | "unpaid" | "active" | "ended";

export function teamPlanState(workspace: WorkspacePlan & { createdAt: Date }, now = new Date()): TeamPlanState {
  if (workspace.accessUntil === null) return "free";
  if (!planEnded(workspace, now)) return "active";
  return workspace.accessUntil.getTime() === workspace.createdAt.getTime() ? "unpaid" : "ended";
}

/**
 * A team on hold: its public pages are paused and nobody can open it, until its owner pays. A team that was never
 * paid for is on hold from the start. A plan that ran out is on hold once the days of grace after it are over.
 */
export function teamHeld(workspace: WorkspacePlan & { createdAt: Date }, now = new Date()): boolean {
  const state = teamPlanState(workspace, now);
  if (state === "unpaid") return true;
  return state === "ended" && holdStartsAt(workspace.accessUntil!).getTime() <= now.getTime();
}

// Looking at what a team already has is never taken away, short of a hold.
const READ_ONLY: readonly TeamCapability[] = ["canViewWorkspaceAnalytics"];

// Capabilities with a switch of their own, on top of the plan.
const SWITCHED: Partial<Record<TeamCapability, () => boolean>> = { canStyleEventPages: () => ENV.teamEventStylingEnabled };

/**
 * What Teams allows: for everyone when no workspace is given, and for one workspace when it is. TEAMS_ENABLED
 * switches all of it. A workspace whose plan has ended keeps what it has, to read and download, and loses
 * the capabilities that change or add things. This is decided here and nowhere else.
 */
export function teamEntitlements(workspace?: WorkspacePlan, now = new Date()): TeamEntitlements {
  const open = ENV.teamsEnabled && !(workspace && planEnded(workspace, now));
  return Object.fromEntries(
    TEAM_CAPABILITIES.map(name => [name, (READ_ONLY.includes(name) ? ENV.teamsEnabled : open) && (SWITCHED[name]?.() ?? true)])
  ) as TeamEntitlements;
}

export function assertTeamCapability(capability: TeamCapability) {
  if (!teamEntitlements()[capability]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Teams is not available yet." });
  }
}

// Whether the Team call now running changes something. Set once per call by teamProcedure, read by access.ts.
const teamCall = new AsyncLocalStorage<{ changes: boolean; whileHeld: boolean }>();

export const runTeamCall = <T>(changes: boolean, whileHeld: boolean, call: () => Promise<T>) => teamCall.run({ changes, whileHeld }, call);

/**
 * Stops every Team call for a workspace on hold, except the few marked whileHeld: seeing that it is on hold,
 * its bill, leaving and closing. Before the hold, stops a change to a workspace whose plan has ended.
 * A call made outside a Team procedure (paying, in billing/router.ts) is not stopped here.
 */
export function assertPlanAllowsCall(workspace: WorkspacePlan & { createdAt?: Date }) {
  const call = teamCall.getStore();
  if (call && !call.whileHeld && workspace.createdAt && teamHeld({ ...workspace, createdAt: workspace.createdAt })) {
    throw new TRPCError({ code: "FORBIDDEN", message: TEAM_HOLD_MESSAGE });
  }
  if (call?.changes && planEnded(workspace)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: workspace.createdAt && teamPlanState({ ...workspace, createdAt: workspace.createdAt }) === "unpaid"
        ? "This team is not paid for yet, so it can't be changed. Its owner can pay on the team's Billing tab."
        : "This team's plan has ended, so it can't be changed right now. Renew it on the team's Billing tab.",
    });
  }
}
