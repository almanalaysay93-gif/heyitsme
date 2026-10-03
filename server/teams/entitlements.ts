import { AsyncLocalStorage } from "node:async_hooks";
import { TRPCError } from "@trpc/server";
import { MAX_WORKSPACE_PEOPLE, TEAM_CAPABILITIES, type TeamCapability, type TeamEntitlements } from "@shared/teams";
import { ENV } from "../_core/env";

/** The two plan settings of a workspace. Only heyitsme sets them; a team cannot. */
export type WorkspacePlan = { seatLimit: number | null; accessUntil: Date | null };

export const seatAllowance = (workspace: WorkspacePlan) => workspace.seatLimit ?? MAX_WORKSPACE_PEOPLE;

export const planEnded = (workspace: WorkspacePlan, now = new Date()) =>
  workspace.accessUntil !== null && workspace.accessUntil.getTime() <= now.getTime();

// Looking at what a team already has is never taken away.
const READ_ONLY: readonly TeamCapability[] = ["canViewWorkspaceAnalytics"];

/**
 * What Teams allows: for everyone when no workspace is given, and for one workspace when it is. TEAMS_ENABLED
 * switches all of it. A workspace whose plan has ended keeps what it has, to read and download, and loses
 * the capabilities that change or add things. This is decided here and nowhere else.
 */
export function teamEntitlements(workspace?: WorkspacePlan, now = new Date()): TeamEntitlements {
  const open = ENV.teamsEnabled && !(workspace && planEnded(workspace, now));
  return Object.fromEntries(
    TEAM_CAPABILITIES.map(name => [name, READ_ONLY.includes(name) ? ENV.teamsEnabled : open])
  ) as TeamEntitlements;
}

export function assertTeamCapability(capability: TeamCapability) {
  if (!teamEntitlements()[capability]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Teams is not available yet." });
  }
}

// Whether the Team call now running changes something. Set once per call by teamProcedure, read by access.ts.
const teamCall = new AsyncLocalStorage<{ changes: boolean }>();

export const runTeamCall = <T>(changes: boolean, call: () => Promise<T>) => teamCall.run({ changes }, call);

/** Stops a change to a workspace whose plan has ended. Reading it, leaving it and closing it still work. */
export function assertPlanAllowsCall(workspace: WorkspacePlan) {
  if (teamCall.getStore()?.changes && planEnded(workspace)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This team's plan has ended, so it can't be changed right now. Everything is still here to view and download.",
    });
  }
}
