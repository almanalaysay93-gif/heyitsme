export type NotificationPayload = {
  title: string;
  content: string;
};

/**
 * Dispatches a project-owner notification.
 * TODO(rebuild): Implement with web-push or OneSignal and set ONESIGNAL_API_KEY.
 */
export async function notifyOwner(
  _payload: NotificationPayload
): Promise<boolean> {
  throw new Error(
    "[stub] Notification not wired since Manus removal. See docs/plans/2026-09-23-remove-manus-design.md - implement with web-push or OneSignal and set ONESIGNAL_API_KEY."
  );
}
