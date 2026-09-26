import { readFileSync } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, createApp } from "./app";

const vercel = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../vercel.json"), "utf8"));
const vercelHeaders: Record<string, string> = Object.fromEntries(
  vercel.headers.find((block: any) => block.source === "/(.*)").headers.map((h: any) => [h.key, h.value]),
);

describe("security headers", () => {
  it("vercel.json and Express send the same CSP and HSTS", () => {
    expect(vercelHeaders["Content-Security-Policy"]).toBe(CONTENT_SECURITY_POLICY);
    expect(vercelHeaders["Strict-Transport-Security"]).toBe("max-age=63072000");
  });

  it("Express responses carry CSP, HSTS, nosniff and frame denial", async () => {
    const server = createApp().listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(res.headers.get("content-security-policy")).toBe(CONTENT_SECURITY_POLICY);
      expect(res.headers.get("strict-transport-security")).toBe("max-age=63072000");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("x-powered-by")).toBeNull();
    } finally {
      server.close();
    }
  });
});
