export type VCardFields = {
  displayName?: string | null;
  title?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
};

/** vCard 3.0 text for a card. `pageUrl` is the public page, `origin` resolves same-origin photo paths. */
export function buildVCard(card: VCardFields, pageUrl: string, origin: string): string {
  const esc = (v: string) => v.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");
  const avatarUrl = card.avatarUrl ?? "";
  // Only hosted photos — preview data: URLs would bloat the file and many contact apps reject them.
  const photoUrl = /^https?:\/\//i.test(avatarUrl)
    ? avatarUrl
    : avatarUrl.startsWith("/") && !avatarUrl.startsWith("//") ? `${origin}${avatarUrl}` : "";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${esc(card.displayName || "Contact")}`,
    card.title ? `TITLE:${esc(card.title)}` : null,
    card.company ? `ORG:${esc(card.company)}` : null,
    card.email ? `EMAIL;TYPE=INTERNET:${card.email}` : null,
    card.phone ? `TEL;TYPE=CELL:${card.phone}` : null,
    `URL:${pageUrl}`,
    card.bio ? `NOTE:${esc(card.bio)}` : null,
    photoUrl ? `PHOTO;VALUE=URI:${photoUrl}` : null,
    "END:VCARD",
  ].filter(Boolean);
  return lines.join("\r\n");
}
