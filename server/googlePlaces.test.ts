import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPlaceDetails, searchBusinesses, signSelection, verifyConfirmedPlace, verifySelection } from "./googlePlaces";
import { recordPlacesRequest } from "./googlePlacesUsage";

vi.mock("./googlePlacesUsage", () => ({ recordPlacesRequest: vi.fn() }));

const caller = { ownerId: 42, cardId: 7 };

describe("Google Places selection", () => {
  beforeEach(() => vi.stubEnv("JWT_SECRET", "test-secret"));
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.mocked(recordPlacesRequest).mockReset(); });

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
    const results = await searchBusinesses("Clinic Davao", token, caller);
    const details = await getPlaceDetails(results[0].id, token, caller);
    expect(results[0].name).toBe("Clinic");
    expect(details.id).toBe("place-123");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).sessionToken).toBe(token);
    expect(String(fetchMock.mock.calls[1][0])).toContain(`sessionToken=${token}`);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ "X-Goog-Api-Key": "test-key" });
    expect(vi.mocked(recordPlacesRequest).mock.calls).toEqual([
      ["autocomplete", { ...caller, sessionId: token }],
      ["place_details", { ...caller, sessionId: token }],
    ]);
  });

  it("sends nothing to Google when the request cannot be counted", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    vi.mocked(recordPlacesRequest).mockRejectedValueOnce(new Error("cap reached"));
    await expect(searchBusinesses("Clinic Davao", "00000000-0000-4000-8000-000000000000", caller)).rejects.toThrow("cap reached");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("carries the fetched place to the confirm step, and only a confirmed token has one", () => {
    const place = { id: "place-123", displayName: { text: "Clinic" }, rating: 4.8 };
    expect(verifyConfirmedPlace(signSelection("place-123", 42, place), 42)).toEqual(place);
    expect(verifyConfirmedPlace(signSelection("place-123", 42, place), 43)).toBe(null);
    expect(verifyConfirmedPlace(signSelection("place-123", 42), 42)).toBe(null);
    expect(verifyConfirmedPlace(signSelection("place-999", 42, place), 42)).toBe(null);
  });
});
