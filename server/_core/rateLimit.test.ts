import { describe, expect, it } from "vitest";
import { clientIp, hashIdentifier, MemoryRateLimiter } from "./rateLimit";

describe("MemoryRateLimiter", () => {
  it("allows up to the limit inside one window", () => {
    let now = 1_000;
    const limiter = new MemoryRateLimiter(() => now);
    expect(limiter.hit("k", 2, 60_000).allowed).toBe(true);
    expect(limiter.hit("k", 2, 60_000).allowed).toBe(true);
    expect(limiter.hit("k", 2, 60_000)).toEqual({ allowed: false, count: 3, resetMs: 60_000 });
    now += 30_000;
    expect(limiter.hit("k", 2, 60_000).resetMs).toBe(30_000);
  });

  it("starts a fresh window once the old one expires", () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(() => now);
    limiter.hit("k", 1, 1_000);
    expect(limiter.hit("k", 1, 1_000).allowed).toBe(false);
    now = 1_000;
    expect(limiter.hit("k", 1, 1_000)).toEqual({ allowed: true, count: 1, resetMs: 1_000 });
  });

  it("counts keys independently", () => {
    const limiter = new MemoryRateLimiter(() => 0);
    limiter.hit("a", 1, 1_000);
    expect(limiter.hit("b", 1, 1_000).allowed).toBe(true);
  });
});

describe("hashIdentifier", () => {
  it("is stable, short, and never contains the raw value", () => {
    const hashed = hashIdentifier("203.0.113.7");
    expect(hashed).toBe(hashIdentifier("203.0.113.7"));
    expect(hashed).not.toBe(hashIdentifier("203.0.113.8"));
    expect(hashed).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(hashed).not.toContain("203.0");
  });
});

describe("clientIp", () => {
  it("falls back to the socket address, then a constant", () => {
    expect(clientIp({ ip: "198.51.100.1", socket: {} } as never)).toBe("198.51.100.1");
    expect(clientIp({ ip: undefined, socket: { remoteAddress: "::1" } } as never)).toBe("::1");
    expect(clientIp(undefined)).toBe("unknown");
  });
});
