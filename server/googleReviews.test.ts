import { describe, expect, it } from "vitest";
import { canConnectBusiness, mapsDestination, reviewDestination, setupAllowance, setupTier } from "./googleReviews";

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

describe("Stored Google destinations", () => {
  it("uses the review link saved at setup", () => {
    expect(reviewDestination({ placeId: "abc", reviewUrl: "https://www.google.com/maps/place//data=x" })).toBe("https://www.google.com/maps/place//data=x");
  });

  it("builds the review link from the place ID when none was saved", () => {
    expect(reviewDestination({ placeId: "a b", reviewUrl: null })).toBe("https://search.google.com/local/writereview?placeid=a%20b");
  });

  it("never redirects to a link outside Google", () => {
    expect(reviewDestination({ placeId: "abc", reviewUrl: "https://evil.example/google.com/" })).toBe("https://search.google.com/local/writereview?placeid=abc");
    expect(reviewDestination({ placeId: null, reviewUrl: "https://evil.example/" })).toBe(null);
    expect(mapsDestination({ placeId: "abc", mapsUrl: "javascript:alert(1)", businessName: "Clinic" })).toBe("https://www.google.com/maps/search/?api=1&query=Clinic&query_place_id=abc");
  });
});

describe("Weekly Google business setups", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

  it("puts a team member on the Teams allowance, whatever their own plan", () => {
    expect(setupTier("free", true)).toBe("teams");
    expect(setupTier("pro", true)).toBe("teams");
    expect(setupTier("pro", false)).toBe("pro");
    expect(setupTier("anything", false)).toBe("free");
  });

  it("allows a first setup", () => {
    expect(setupAllowance("free", 1, [], now)).toMatchObject({ used: 0, canSetup: true, nextAt: null });
  });

  it("blocks a second setup on Free until the first is a week old", () => {
    const usage = setupAllowance("free", 1, [daysAgo(2)], now);
    expect(usage.canSetup).toBe(false);
    expect(usage.nextAt).toEqual(new Date(daysAgo(2).getTime() + 7 * 86_400_000));
  });

  it("forgets setups older than a week", () => {
    expect(setupAllowance("free", 1, [daysAgo(8)], now)).toMatchObject({ used: 0, canSetup: true });
  });

  it("opens the next Pro setup when the oldest of the last five expires", () => {
    const usage = setupAllowance("pro", 5, [daysAgo(6), daysAgo(5), daysAgo(4), daysAgo(3), daysAgo(2), daysAgo(1)], now);
    expect(usage).toMatchObject({ used: 6, canSetup: false });
    expect(usage.nextAt).toEqual(new Date(daysAgo(5).getTime() + 7 * 86_400_000));
    expect(setupAllowance("pro", 5, [daysAgo(1), daysAgo(1), daysAgo(1), daysAgo(1)], now).canSetup).toBe(true);
  });

  it("never blocks an account with no limit", () => {
    expect(setupAllowance("pro", null, Array.from({ length: 40 }, () => daysAgo(1)), now)).toMatchObject({ canSetup: true, nextAt: null });
  });
});
