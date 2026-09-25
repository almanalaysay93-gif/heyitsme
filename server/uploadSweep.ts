// Removes uploaded files no saved card links to: ones a save or delete just dropped, and uploads never saved at all.
import { rateLimit } from "./_core/rateLimit";
import { type CardMedia, orphanedUploadKeys, unreferencedUploadKeys } from "./cardFiles";
import { getCardsByOwner, OWNER_CARD_LIMIT } from "./db";
import { storageDelete, storageList, type StoredFile } from "./storage";

// An upload this new may belong to a card still open in the builder that has not been saved yet.
export const SWEEP_GRACE_MS = 24 * 60 * 60 * 1000;
// Listing a whole folder is the costly part, so each owner's is checked at most this often.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** Stored keys old enough to sweep. A file whose age the backend did not report is kept. */
export function sweepableKeys(files: StoredFile[], now: number): string[] {
  return files.filter((file) => file.createdAt && now - file.createdAt.getTime() > SWEEP_GRACE_MS).map((file) => file.key);
}

/** Deletes this owner's uploads that none of their cards link to and that are past the grace period. Returns the deleted keys. */
export async function sweepUnusedUploads(ownerUserId: number, now = Date.now()): Promise<string[]> {
  const ownerCards = await getCardsByOwner(ownerUserId);
  // At the cap, some cards were left out of the list, so a file only they link to would look unused.
  if (ownerCards.length >= OWNER_CARD_LIMIT) return [];
  const stored = await storageList(`${ownerUserId}-portfolio`);
  const unused = unreferencedUploadKeys(sweepableKeys(stored, now), ownerCards, ownerUserId);
  await storageDelete(unused);
  return unused;
}

/**
 * Run after a card is saved or deleted, with the card as it was before. Deletes the files that version linked to and
 * no card links to now, then sweeps never-saved uploads when this owner is due. The card change has already
 * happened, so storage errors are logged and never thrown.
 */
export async function tidyOwnerUploads(ownerUserId: number, previous?: CardMedia): Promise<void> {
  try {
    if (previous) {
      const ownerCards = await getCardsByOwner(ownerUserId);
      if (ownerCards.length < OWNER_CARD_LIMIT) await storageDelete(orphanedUploadKeys(previous, ownerCards, ownerUserId));
    }
    const due = await rateLimit(`upload-sweep:${ownerUserId}`, 1, SWEEP_INTERVAL_MS);
    if (due.allowed) await sweepUnusedUploads(ownerUserId);
  } catch (error) {
    console.error("[Uploads] could not remove unused files:", error);
  }
}
