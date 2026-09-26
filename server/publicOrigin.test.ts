import { describe, expect, it } from "vitest";
import { isLegacyHost, PRODUCTION_ORIGIN, resolvePublicOrigin } from "@shared/publicOrigin";

describe("resolvePublicOrigin", () => {
  it.each([
    [undefined, PRODUCTION_ORIGIN],
    ["", PRODUCTION_ORIGIN],
    ["   ", PRODUCTION_ORIGIN],
    ["https://heyitsme.fyi", PRODUCTION_ORIGIN],
    ["  https://heyitsme.fyi/  ", PRODUCTION_ORIGIN],
    ["https://heyitsme-ecru.vercel.app", PRODUCTION_ORIGIN],
    ["https://heyitsme-git-branch-owner.vercel.app/", PRODUCTION_ORIGIN],
    ["not a url", PRODUCTION_ORIGIN],
    ["javascript:alert(1)", PRODUCTION_ORIGIN],
    ["http://localhost:3000", "http://localhost:3000"],
    ["https://staging.heyitsme.fyi/path", "https://staging.heyitsme.fyi"],
    // Lookalike hosts are not treated as Vercel just because they contain the text.
    ["https://vercel.app.example.com", "https://vercel.app.example.com"],
  ])("%j -> %s", (raw, expected) => {
    expect(resolvePublicOrigin(raw as string | undefined)).toBe(expected);
  });
});

describe("isLegacyHost", () => {
  it("matches only the retired hostname", () => {
    expect(isLegacyHost("heyitsme-ecru.vercel.app")).toBe(true);
    expect(isLegacyHost("HEYITSME-ECRU.vercel.app:443")).toBe(true);
    expect(isLegacyHost("heyitsme-ecru.vercel.app.evil.com")).toBe(false);
    expect(isLegacyHost("heyitsme.fyi")).toBe(false);
  });
});
