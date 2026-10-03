import { describe, expect, it } from "vitest";
import { canConnectBusiness, mapsDestination, reviewDestination } from "./googleReviews";

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
