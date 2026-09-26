/** The public production origin. Canonical links, share images, sitemap and vCards always point here. */
export const PRODUCTION_ORIGIN = "https://heyitsme.fyi";

/**
 * One origin policy for build-time HTML (vite.config.ts) and runtime responses (server/_core/env.ts).
 * A missing, malformed, non-http(s) or *.vercel.app value (the legacy heyitsme-ecru host, or a preview
 * deployment) resolves to production: previews are noindex, so their canonical links belong to production.
 * Hostnames are compared after URL parsing, never by substring, so lookalike domains are not misread.
 */
export function resolvePublicOrigin(raw: string | undefined | null): string {
  const value = (raw ?? "").trim();
  if (!value) return PRODUCTION_ORIGIN;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return PRODUCTION_ORIGIN;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return PRODUCTION_ORIGIN;
  const host = url.hostname.toLowerCase();
  if (host === "vercel.app" || host.endsWith(".vercel.app")) return PRODUCTION_ORIGIN;
  return url.origin;
}

/** True for the retired Vercel hostname that must never be advertised. Exact match on the parsed hostname. */
export function isLegacyHost(host: string | undefined | null): boolean {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "") === "heyitsme-ecru.vercel.app";
}
