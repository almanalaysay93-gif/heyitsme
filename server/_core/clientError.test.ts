import { describe, expect, it } from "vitest";
import { redactClientText } from "./seo";

describe("redactClientText", () => {
  it("removes emails, phone numbers, JWTs, query strings and long tokens", () => {
    const out = redactClientText(
      'Failed for jo.lee+work@example.com at +63 917 555 0100 with eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl ' +
        "GET https://heyitsme.fyi/api/x?code=abc&state=xyz key=0123456789abcdef0123456789abcdef",
    );
    expect(out).not.toMatch(/jo\.lee|917|eyJ|code=abc|0123456789abcdef/);
    expect(out).toContain("[email]");
    expect(out).toContain("[number]");
    expect(out).toContain("[token]");
    expect(out).toContain("?[redacted]");
  });

  it("keeps stack frames readable", () => {
    const frame = "at CardVisual (https://heyitsme.fyi/assets/index-DKKbNpH2.js:12:345)";
    expect(redactClientText(frame)).toBe(frame);
  });
});
