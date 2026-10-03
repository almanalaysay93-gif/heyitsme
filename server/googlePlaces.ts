import { createHmac, timingSafeEqual } from "node:crypto";
import { recordPlacesRequest, type PlacesCaller } from "./googlePlacesUsage";

// Google Places is for setup and reconnect only. Nothing a customer or a dashboard load touches may call it:
// those read what connectReviewPage stored. Every request here is counted by recordPlacesRequest first.
const base = "https://places.googleapis.com/v1";
const fields = "id,displayName,formattedAddress,location,primaryTypeDisplayName,rating,userRatingCount,googleMapsLinks";

export type Place = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  googleMapsLinks?: { placeUri?: string; writeAReviewUri?: string };
};

function key() {
  const value = process.env.GOOGLE_PLACES_API_KEY;
  if (!value) throw new Error("GOOGLE_PLACES_API_KEY is not configured");
  return value;
}

async function readGoogle(response: Response) {
  if (!response.ok) throw new Error(`Google Places returned ${response.status}`);
  return response.json();
}

export async function searchBusinesses(input: string, sessionToken: string, caller?: PlacesCaller) {
  const apiKey = key();
  if (caller) await recordPlacesRequest("autocomplete", { ...caller, sessionId: sessionToken });
  const response = await fetch(`${base}/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({ input, sessionToken, includeQueryPredictions: false }),
    signal: AbortSignal.timeout(8000),
  });
  const data = await readGoogle(response) as { suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }> };
  return (data.suggestions ?? []).flatMap(({ placePrediction: p }) => p?.placeId ? [{
    id: p.placeId,
    name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "Business",
    address: p.structuredFormat?.secondaryText?.text ?? "",
  }] : []);
}

export async function getPlaceDetails(id: string, sessionToken?: string, caller?: PlacesCaller): Promise<Place> {
  const apiKey = key();
  if (caller) await recordPlacesRequest("place_details", { ...caller, sessionId: sessionToken });
  const url = new URL(`${base}/places/${encodeURIComponent(id)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const response = await fetch(url, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fields },
    signal: AbortSignal.timeout(8000),
  });
  return readGoogle(response) as Promise<Place>;
}

function signingKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
}

type Selection = { placeId: string; ownerId: number; expires: number; place?: Place };

// Pass the fetched place to carry it, signed, to the confirm step. That step then needs no second Place Details call.
export function signSelection(placeId: string, ownerId: number, place?: Place) {
  const payload = Buffer.from(JSON.stringify({ placeId, ownerId, expires: Date.now() + 10 * 60_000, place } satisfies Selection)).toString("base64url");
  const mac = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function readSelection(token: string, ownerId: number) {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = createHmac("sha256", signingKey()).update(payload).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as Selection;
    return value.ownerId === ownerId && value.expires > Date.now() ? value : null;
  } catch {
    return null;
  }
}

export function verifySelection(token: string, ownerId: number) {
  return readSelection(token, ownerId)?.placeId ?? null;
}

export function verifyConfirmedPlace(token: string, ownerId: number) {
  const selection = readSelection(token, ownerId);
  return selection?.place?.id === selection?.placeId ? selection?.place ?? null : null;
}
