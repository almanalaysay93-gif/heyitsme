import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";

export { COOKIE_NAME, SESSION_MAX_AGE_MS, STORAGE_PREFIX } from "@shared/const";

// Public support address for the legal pages and footers. Set VITE_SUPPORT_EMAIL at build time.
export const SUPPORT_EMAIL = ((import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) ?? "").trim();

// Start OAuth login. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// It has SIDE EFFECTS - it mints a one-time nonce, writes the __Host- state
// cookie, and navigates immediately - so the cookie nonce always matches the
// `state` it sends. Do NOT call it during render (no `href={startLogin()}` /
// `loginUrl={...}`).
export const startLogin = (returnTo?: string | unknown) => {
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const safeReturn = typeof returnTo === "string" ? returnTo : undefined;

  const nonce = crypto.randomUUID();
  // Lax still rides along on Google's top-level redirect back to /api/oauth/callback.
  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=Lax; Secure`;
  const state = encodeOAuthState({ redirectUri, nonce, returnTo: safeReturn });

  window.location.href = `/api/oauth/login?state=${encodeURIComponent(state)}`;
};

export const startGoogleLogin = (returnTo?: string | unknown) => startLogin(returnTo);
