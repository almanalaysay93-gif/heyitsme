import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPlaceDetails, searchBusinesses, signSelection, verifySelection } from "./googlePlaces";

describe("Google Places selection", () => {
  beforeEach(() => vi.stubEnv("JWT_SECRET", "test-secret"));
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("binds a confirmed place to one owner and rejects tampering", () => {
    const token = signSelection("place-123", 42);
    expect(verifySelection(token, 42)).toBe("place-123");
    expect(verifySelection(token, 43)).toBe(null);
    expect(verifySelection(`${token}x`, 42)).toBe(null);
  });

  it("uses one autocomplete session token for search and details", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ suggestions: [{ placePrediction: { placeId: "place-123", structuredFormat: { mainText: { text: "Clinic" }, secondaryText: { text: "Davao" } } } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "place-123", displayName: { text: "Clinic" } }), { status: 200 }));
    const token = "00000000-0000-4000-8000-000000000000";
    const results = await searchBusinesses("Clinic Davao", token);
    const details = await getPlaceDetails(results[0].id, token);
    expect(results[0].name).toBe("Clinic");
    expect(details.id).toBe("place-123");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).sessionToken).toBe(token);
    expect(String(fetchMock.mock.calls[1][0])).toContain(`sessionToken=${token}`);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ "X-Goog-Api-Key": "test-key" });
  });
});
