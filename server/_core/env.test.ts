import { describe, expect, it } from "vitest";
import { assertSessionSecret } from "./env";

describe("session secret check", () => {
  it("stops production from starting with a short secret", () => {
    expect(() => assertSessionSecret("a".repeat(31), true)).toThrow("JWT_SECRET must be at least 32 bytes");
  });

  it("accepts 32 bytes or more in production", () => {
    expect(() => assertSessionSecret("a".repeat(32), true)).not.toThrow();
  });

  it("leaves development and tests alone", () => {
    expect(() => assertSessionSecret("short", false)).not.toThrow();
  });

  it("leaves a missing secret to the session code, which refuses to sign with it", () => {
    expect(() => assertSessionSecret("", true)).not.toThrow();
  });
});
