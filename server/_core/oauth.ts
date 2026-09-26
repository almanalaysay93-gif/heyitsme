import { COOKIE_NAME, SESSION_MAX_AGE_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/login", (req: Request, res: Response) => {
    const state = getQueryParam(req, "state");
    if (!state) {
      res.status(400).json({ error: "state is required" });
      return;
    }

    const redirectUri =
      ENV.googleRedirectUri ||
      `${req.protocol}://${req.get("host")}/api/oauth/callback`;

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", ENV.googleClientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "select_account");

    res.redirect(302, authUrl.toString());
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. A mismatch signs no
    // one in; it is usually a reload of a finished callback, so go to the app.
    const { nonce, returnTo } = decodeOAuthState(state);
    const returnTarget =
      returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\")
        ? returnTo
        : "/app";
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.redirect(302, returnTarget);
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "lax" });

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? "google",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        email: userInfo.email ?? undefined,
        expiresInMs: SESSION_MAX_AGE_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS });

      res.redirect(302, returnTarget);
    } catch (error) {
      // Phone browsers sometimes send the callback twice. Google's code works
      // once, so the repeat gets invalid_grant after the first request already
      // signed the user in. Land it on the app (signed-out visitors see Sign in there).
      if (error instanceof Error && error.message.includes("invalid_grant")) {
        console.warn("[OAuth] Spent code, likely a repeated callback");
        res.redirect(302, returnTarget);
        return;
      }
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
