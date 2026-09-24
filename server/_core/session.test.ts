import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import type { Request, Response } from "express";
import { COOKIE_NAME, SESSION_MAX_AGE_MS } from "@shared/const";

vi.hoisted(() => {
  process.env.JWT_SECRET = "session-test-secret";
});

const user = {
  id: 1,
  openId: "sample-user",
  email: "sample@example.com",
  name: "Sample User",
  loginMethod: "google",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

vi.mock("../db", () => ({
  getUserByOpenId: vi.fn(async () => user),
  upsertUser: vi.fn(async () => undefined),
}));

const { sdk } = await import("./sdk");

const DAY_S = 60 * 60 * 24;
const secret = new TextEncoder().encode("session-test-secret");

// A token as the app signed them before sessions slid: a year long with no `iat`.
function legacyToken() {
  return new SignJWT({ openId: user.openId, name: user.name, email: user.email, loginMethod: "google" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + 365 * DAY_S)
    .sign(secret);
}

function tokenIssuedDaysAgo(days: number) {
  const iat = Math.floor(Date.now() / 1000) - days * DAY_S;
  return new SignJWT({ openId: user.openId, name: user.name, email: user.email, loginMethod: "google" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(iat)
    .setExpirationTime(iat + 30 * DAY_S)
    .sign(secret);
}

function request(headers: Record<string, string>) {
  return { protocol: "https", headers } as unknown as Request;
}

let cookies: { name: string; value: string; options: Record<string, unknown> }[];
const res = {
  cookie: (name: string, value: string, options: Record<string, unknown>) => {
    cookies.push({ name, value, options });
  },
} as unknown as Response;

beforeEach(() => {
  cookies = [];
});

describe("session tokens", () => {
  it("records when a token was issued and expires it after 30 days", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await sdk.createSessionToken(user.openId, { name: user.name });
    const session = await sdk.verifySession(token);
    expect(session?.issuedAt).toBeGreaterThanOrEqual(before);

    const { exp } = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(exp - (session?.issuedAt ?? 0)).toBe(SESSION_MAX_AGE_MS / 1000);
  });

  it("leaves a cookie issued within the last day alone", async () => {
    const token = await sdk.createSessionToken(user.openId, { name: user.name });
    await sdk.authenticateRequest(request({ cookie: `${COOKIE_NAME}=${token}` }), res);
    expect(cookies).toEqual([]);
  });

  it("reissues an older cookie for another 30 days", async () => {
    const token = await tokenIssuedDaysAgo(3);
    await sdk.authenticateRequest(request({ cookie: `${COOKIE_NAME}=${token}` }), res);

    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({ name: COOKIE_NAME, options: { httpOnly: true, secure: true, maxAge: SESSION_MAX_AGE_MS } });
    const session = await sdk.verifySession(cookies[0].value);
    expect(session?.openId).toBe(user.openId);
    expect(session?.issuedAt).toBeGreaterThan(Math.floor(Date.now() / 1000) - 60);
  });

  it("moves a year-long cookie from before the change onto a 30-day one", async () => {
    await sdk.authenticateRequest(request({ cookie: `${COOKIE_NAME}=${await legacyToken()}` }), res);
    expect(cookies).toHaveLength(1);
    expect(cookies[0].options.maxAge).toBe(SESSION_MAX_AGE_MS);
  });

  it("does not set a cookie for a bearer token", async () => {
    const token = await tokenIssuedDaysAgo(3);
    await sdk.authenticateRequest(request({ authorization: `Bearer ${token}` }), res);
    expect(cookies).toEqual([]);
  });

  it("rejects a token past its 30 days", async () => {
    const token = await tokenIssuedDaysAgo(31);
    await expect(sdk.authenticateRequest(request({ cookie: `${COOKIE_NAME}=${token}` }), res)).rejects.toThrow();
    expect(cookies).toEqual([]);
  });
});
