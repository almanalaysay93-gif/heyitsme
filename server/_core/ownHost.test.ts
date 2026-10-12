import { afterEach, describe, expect, it, vi } from "vitest";
import { isOwnHost } from "./seo";

describe("hosts the page template may be fetched from", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the public host, whatever its case", () => {
    expect(isOwnHost("heyitsme.fyi")).toBe(true);
    expect(isOwnHost("HeyItsMe.fyi")).toBe(true);
  });

  it("accepts the names Vercel gives this deployment", () => {
    vi.stubEnv("VERCEL_URL", "heyitsme-abc123.vercel.app");
    vi.stubEnv("VERCEL_BRANCH_URL", "heyitsme-git-preview.vercel.app");
    expect(isOwnHost("heyitsme-abc123.vercel.app")).toBe(true);
    expect(isOwnHost("heyitsme-git-preview.vercel.app")).toBe(true);
  });

  it("refuses a host the caller made up", () => {
    expect(isOwnHost("evil.example")).toBe(false);
    expect(isOwnHost("heyitsme.fyi.evil.example")).toBe(false);
    expect(isOwnHost("169.254.169.254")).toBe(false);
    expect(isOwnHost("someone-else.vercel.app")).toBe(false);
  });

  it("refuses a missing host", () => {
    expect(isOwnHost(undefined)).toBe(false);
    expect(isOwnHost("")).toBe(false);
  });
});
