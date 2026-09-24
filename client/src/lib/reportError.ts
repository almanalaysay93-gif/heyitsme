const MAX_REPORTS_PER_PAGE = 5;
let sent = 0;

type ErrorReport = {
  message: string;
  stack?: string;
  source: "boundary" | "window" | "promise";
  componentStack?: string;
};

/** Best-effort crash report to /api/client-error. Never throws, never retries. */
export function reportError(error: unknown, source: ErrorReport["source"], componentStack?: string) {
  if (typeof window === "undefined" || sent >= MAX_REPORTS_PER_PAGE) return;
  sent += 1;

  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const body = JSON.stringify({
    message: err.message.slice(0, 500),
    stack: err.stack?.slice(0, 4000),
    componentStack: componentStack?.slice(0, 4000),
    source,
    path: window.location.pathname,
    userAgent: navigator.userAgent.slice(0, 300),
    release: import.meta.env.MODE,
  });

  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/client-error", blob)) return;
    void fetch("/api/client-error", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    // Reporting must never take the page down with it.
  }
}

export function installGlobalErrorReporting() {
  window.addEventListener("error", (event) => reportError(event.error ?? event.message, "window"));
  window.addEventListener("unhandledrejection", (event) => reportError(event.reason, "promise"));
}
