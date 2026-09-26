import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME, OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";

const sdk = vi.hoisted(() => ({
  exchangeCodeForToken: vi.fn(),
  getUserInfo: vi.fn(),
  createSessionToken: vi.fn(),
}));
const db = vi.hoisted(() => ({ upsertUser: vi.fn() }));
vi.mock("./sdk", () => ({ sdk }));
vi.mock("../db", async (importOriginal) => ({ ...(await importOriginal<typeof import("../db")>()), ...db }));

const { registerOAuthRoutes } = await import("./oauth");

let base = "";
let server: ReturnType<ReturnType<typeof express>["listen"]>;

beforeAll(async () => {
  const app = express();
  registerOAuthRoutes(app);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const state = encodeOAuthState({ redirectUri: "https://heyitsme.test/api/oauth/callback", nonce: "n1" });
const callback = (cookie?: string) =>
  fetch(`${base}/api/oauth/callback?code=c1&state=${encodeURIComponent(state)}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });

describe("GET /api/oauth/callback", () => {
  it("sends a repeated callback with a spent code to the app", async () => {
    sdk.exchangeCodeForToken.mockRejectedValue(
      new Error('Google token exchange failed (400 Bad Request): { "error": "invalid_grant" }'),
    );
    const response = await callback(`${OAUTH_STATE_COOKIE}=n1`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/app");
    expect(db.upsertUser).not.toHaveBeenCalled();
  });

  it("sends a reload without the state cookie to the app and signs no one in", async () => {
    const response = await callback();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/app");
    expect(response.headers.get("set-cookie") ?? "").not.toContain(COOKIE_NAME);
    expect(sdk.exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("still reports other failures", async () => {
    sdk.exchangeCodeForToken.mockRejectedValue(new Error("Google token exchange failed (401): invalid_client"));
    const response = await callback(`${OAUTH_STATE_COOKIE}=n1`);
    expect(response.status).toBe(500);
  });

  it("redirects to allowed returnTo on success", async () => {
    sdk.exchangeCodeForToken.mockResolvedValue({ accessToken: "tok1" });
    sdk.getUserInfo.mockResolvedValue({ openId: "usr1", name: "Alice", email: "alice@test.com" });
    sdk.createSessionToken.mockResolvedValue("sess1");

    const customState = encodeOAuthState({
      redirectUri: "https://heyitsme.test/api/oauth/callback",
      nonce: "n2",
      returnTo: "/app/cards/new",
    });
    const response = await fetch(`${base}/api/oauth/callback?code=c2&state=${encodeURIComponent(customState)}`, {
      redirect: "manual",
      headers: { cookie: `${OAUTH_STATE_COOKIE}=n2` },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/app/cards/new");
  });

  it("sanitizes unsafe open-redirect returnTo to /app", async () => {
    sdk.exchangeCodeForToken.mockResolvedValue({ accessToken: "tok2" });
    sdk.getUserInfo.mockResolvedValue({ openId: "usr2", name: "Bob", email: "bob@test.com" });
    sdk.createSessionToken.mockResolvedValue("sess2");

    const evilState = encodeOAuthState({
      redirectUri: "https://heyitsme.test/api/oauth/callback",
      nonce: "n3",
      returnTo: "//evil.com/phish",
    });
    const response = await fetch(`${base}/api/oauth/callback?code=c3&state=${encodeURIComponent(evilState)}`, {
      redirect: "manual",
      headers: { cookie: `${OAUTH_STATE_COOKIE}=n3` },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/app");
  });
});
