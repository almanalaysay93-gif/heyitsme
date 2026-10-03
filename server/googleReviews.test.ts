import { describe, expect, it } from "vitest";
import { canConnectBusiness } from "./googleReviews";

describe("Google business connection limit", () => {
  it("lets a free account connect its first business", () => {
    expect(canConnectBusiness("free", false)).toBe(true);
  });

  it("blocks another active business for a free account", () => {
    expect(canConnectBusiness("free", true)).toBe(false);
  });

  it("allows more than one business for a Pro account", () => {
    expect(canConnectBusiness("pro", true)).toBe(true);
  });

  it("treats unknown plans as Free", () => {
    expect(canConnectBusiness("unknown", true)).toBe(false);
  });
});
