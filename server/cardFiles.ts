// Uploaded files a card links to, so deleting a card can also remove the files only it used.

export type CardMedia ={ avatarUrl?: string | null; coverUrl?: string | null; backgroundUrl?: string | null; logoUrl?: string | null; portfolio?: string | null };

const STORAGE_PATH = /\/storage\/([A-Za-z0-9._\/-]+)/g;

/** Keys this owner uploaded (`<ownerId>-portfolio/...`) that the card links to. Anyone else's files are never included. */
export function ownedUploadKeys(card: CardMedia, ownerUserId: number): Set<string> {
  const prefix = `${ownerUserId}-portfolio/`;
  const text = [card.avatarUrl, card.coverUrl, card.backgroundUrl, card.logoUrl, card.portfolio].filter(Boolean).join("\n");
  const keys = new Set<string>();
  for (const match of Array.from(text.matchAll(STORAGE_PATH))) {
    const key = match[1];
    if (key.startsWith(prefix) && !key.includes("..")) keys.add(key);
  }
  return keys;
}

/** Keys of a deleted card that none of the owner's remaining cards still use. */
export function orphanedUploadKeys(deleted: CardMedia, remaining: CardMedia[], ownerUserId: number): string[] {
  const inUse = new Set(remaining.flatMap((card) => Array.from(ownedUploadKeys(card, ownerUserId))));
  return Array.from(ownedUploadKeys(deleted, ownerUserId)).filter((key) => !inUse.has(key));
}

/** Keys in storage under this owner's prefix that are not referenced by any of their cards. */
export function unreferencedUploadKeys(storageKeys: string[], ownerCards: CardMedia[], ownerUserId: number): string[] {
  const prefix = `${ownerUserId}-portfolio/`;
  const inUse = new Set(ownerCards.flatMap((card) => Array.from(ownedUploadKeys(card, ownerUserId))));
  return storageKeys.filter((key) => key.startsWith(prefix) && !key.includes("..") && !inUse.has(key));
}
