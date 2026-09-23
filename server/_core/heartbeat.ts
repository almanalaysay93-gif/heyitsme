export type HeartbeatJob = {
  name: string;
  cron: string;
  path: string;
  method?: "POST" | "PUT";
  payload?: unknown;
  description?: string;
};

export type HeartbeatJobUpdate = Partial<Omit<HeartbeatJob, "name">> & {
  enable?: boolean;
};

export type HeartbeatJobInfo = {
  taskUid: string;
  name: string;
  userId: string;
  description: string;
  cronExpression: string;
  callbackPath: string;
  callbackMethod: string;
  callbackPayload: string;
  isEnable: boolean;
  createdAt?: string | null;
  lastExecutedAt?: string | null;
  nextExecutionAt?: string | null;
};

/**
 * TODO(rebuild): Implement with node-cron in-process or platform cron (Vercel Cron / systemd timer) hitting /api/scheduled/* paths.
 */
export async function createHeartbeatJob(
  _job: HeartbeatJob,
  _userSession: string
): Promise<{ taskUid: string; nextExecutionAt?: string | null }> {
  throw new Error(
    "[stub] Heartbeat not wired since Manus removal. See docs/plans/2026-09-23-remove-manus-design.md - implement with node-cron or platform cron."
  );
}

export async function updateHeartbeatJob(
  _taskUid: string,
  _patch: HeartbeatJobUpdate,
  _userSession: string
): Promise<{ nextExecutionAt?: string | null }> {
  throw new Error(
    "[stub] Heartbeat not wired since Manus removal. See docs/plans/2026-09-23-remove-manus-design.md - implement with node-cron or platform cron."
  );
}

export async function deleteHeartbeatJob(
  _taskUid: string,
  _userSession: string
): Promise<void> {
  throw new Error(
    "[stub] Heartbeat not wired since Manus removal. See docs/plans/2026-09-23-remove-manus-design.md - implement with node-cron or platform cron."
  );
}

export async function listHeartbeatJobs(
  _userSession: string,
  _pagination?: { page?: number; pageSize?: number }
): Promise<{ total: number; actorUserId: string; jobs: HeartbeatJobInfo[] }> {
  throw new Error(
    "[stub] Heartbeat not wired since Manus removal. See docs/plans/2026-09-23-remove-manus-design.md - implement with node-cron or platform cron."
  );
}
