/**
 * Paths the React app renders. Anything else is a real 404 with a 404 status,
 * so crawlers never index "soft 404" pages. Keep in sync with client/src/App.tsx
 * and the index.html rewrites in vercel.json.
 */
export const SPA_ROUTES: readonly RegExp[] = [
  /^\/$/,
  /^\/app\/?$/,
  /^\/app\/cards\/?$/,
  /^\/app\/cards\/new\/?$/,
  /^\/app\/cards\/[^/]+\/edit\/?$/,
  /^\/app\/contacts\/?$/,
  /^\/app\/insights\/?$/,
  /^\/c\/[^/]+\/?$/,
  /^\/privacy\/?$/,
  /^\/terms\/?$/,
];

export function isSpaRoute(pathname: string): boolean {
  return SPA_ROUTES.some((pattern) => pattern.test(pathname));
}

/** Public pages listed in sitemap.xml. Cards stay out until owners can opt in. */
export const SITEMAP_PATHS = ["/", "/privacy", "/terms"] as const;
