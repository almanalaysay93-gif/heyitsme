import { COOKIE_NAME, ONE_YEAR_MS, decodeOAuthState } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import type {
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtResponse,
} from "./types/googleAuthTypes";

export type {
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtResponse,
} from "./types/googleAuthTypes";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  name: string;
  email?: string | null;
  loginMethod?: string | null;
};

class GoogleOAuthService {
  private decodeState(state: string): string {
    return decodeOAuthState(state).redirectUri;
  }

  async getTokenByCode(
    code: string,
    state: string
  ): Promise<ExchangeTokenResponse> {
    const redirectUri = this.decodeState(state) || ENV.googleRedirectUri;
    const body = new URLSearchParams({
      code,
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Google token exchange failed (${response.status} ${response.statusText}): ${errorText}`
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
      refresh_token?: string;
      scope: string;
      id_token?: string;
    };

    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      refreshToken: data.refresh_token,
      scope: data.scope,
      idToken: data.id_token,
    };
  }

  async getUserInfoByToken(accessToken: string): Promise<GetUserInfoResponse> {
    const response = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Google userinfo request failed (${response.status} ${response.statusText}): ${errorText}`
      );
    }

    const data = (await response.json()) as {
      sub: string;
      name?: string;
      email?: string;
      picture?: string;
    };

    return {
      openId: data.sub,
      name: data.name || "",
      email: data.email ?? null,
      platform: "google",
      loginMethod: "google",
    };
  }
}

class SDKServer {
  private readonly oauthService: GoogleOAuthService;

  constructor() {
    this.oauthService = new GoogleOAuthService();
  }

  async exchangeCodeForToken(
    code: string,
    state: string
  ): Promise<ExchangeTokenResponse> {
    return this.oauthService.getTokenByCode(code, state);
  }

  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    return this.oauthService.getUserInfoByToken(accessToken);
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }

  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string; email?: string } = {}
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        name: options.name || "",
        email: options.email ?? null,
        loginMethod: "google",
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      name: payload.name,
      email: payload.email ?? null,
      loginMethod: payload.loginMethod ?? "google",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<SessionPayload | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, name, email, loginMethod } = payload as Record<
        string,
        unknown
      >;

      if (!isNonEmptyString(openId)) {
        console.warn("[Auth] Session payload missing required openId");
        return null;
      }

      return {
        openId,
        name: typeof name === "string" ? name : "",
        email: typeof email === "string" ? email : null,
        loginMethod: typeof loginMethod === "string" ? loginMethod : "google",
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async getUserInfoWithJwt(
    jwtToken: string
  ): Promise<GetUserInfoWithJwtResponse> {
    const session = await this.verifySession(jwtToken);
    if (!session) {
      throw ForbiddenError("Invalid session token");
    }

    return {
      openId: session.openId,
      name: session.name,
      email: session.email ?? null,
      platform: session.loginMethod ?? "google",
      loginMethod: session.loginMethod ?? "google",
    };
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);

    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }

    const session = await this.verifySession(sessionToken);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const sessionUserId = session.openId;
    const signedInAt = new Date();
    let user = await db.getUserByOpenId(sessionUserId);

    if (!user) {
      try {
        await db.upsertUser({
          openId: session.openId,
          name: session.name || null,
          email: session.email ?? null,
          loginMethod: session.loginMethod ?? "google",
          lastSignedIn: signedInAt,
        });
        user = await db.getUserByOpenId(session.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    });

    return user;
  }
}

export type AuthenticatedUser = User;

export const sdk = new SDKServer();
