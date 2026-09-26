import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "heyitsme.chunk-reload-at";
// One automatic reload per this window; a second failure goes to the error screen instead of looping.
const RELOAD_WINDOW_MS = 30_000;

/** The browser's wording for a route chunk that could not be fetched (a deploy removed it, or the network dropped). */
export function isChunkLoadError(error: unknown): boolean {
  const text = `${(error as Error)?.name ?? ""} ${(error as Error)?.message ?? error ?? ""}`;
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch dynamically|ChunkLoadError|Loading chunk .* failed/i.test(text);
}

/** Reloads once to pick up the new deployment's files. Returns false when a reload was already tried recently. */
export function reloadForNewVersion(now = Date.now()): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
    if (now - last < RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // No session storage: still reload once; the error screen covers a repeat.
  }
  // A full load of the URL the visitor asked for fetches fresh HTML that names the current chunks.
  window.location.reload();
  return true;
}

/**
 * React.lazy for routes, recovering from a tab that outlived a deployment: when the old chunk is gone,
 * reload once to the same URL. Guest drafts live in localStorage and survive; the builder's own
 * unsaved-changes guard still applies because it listens for beforeunload.
 */
export function lazyRoute<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((error) => {
      if (isChunkLoadError(error) && reloadForNewVersion()) {
        // Keep Suspense showing its loader while the page reloads.
        return new Promise<{ default: T }>(() => undefined);
      }
      throw error;
    }),
  );
}
