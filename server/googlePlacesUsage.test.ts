import { describe, expect, it } from "vitest";
import { monthStart, projectMonthlyUsage, usageLevel } from "./googlePlacesUsage";

const settings = { monthlyFreeLimit: 10_000, warnPercent: 70, nearLimitPercent: 90 };

describe("Google Places usage meter", () => {
  it("raises each warning at its threshold", () => {
    expect(usageLevel(6_999, settings)).toBe("ok");
    expect(usageLevel(7_000, settings)).toBe("warning");
    expect(usageLevel(9_000, settings)).toBe("near_limit");
    expect(usageLevel(10_000, settings)).toBe("over_limit");
  });

  it("projects the month from the pace so far", () => {
    expect(projectMonthlyUsage(1_600, new Date(Date.UTC(2026, 8, 11)))).toBe(4_800);
  });

  it("starts months in UTC and crosses year ends", () => {
    expect(monthStart(new Date(Date.UTC(2026, 0, 15)), -1).toISOString()).toBe("2025-12-01T00:00:00.000Z");
  });
});
