// Card data shapes and pure helpers shared by the dashboard, the public card page, and the landing demo.
// Kept free of React so every route can import it without pulling in the dashboard bundle.

export type CardDraft = {
  id: number;
  displayName: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  bio: string;
  links: string;
  portfolio: string;
  channels: string;
  theme: string;
  avatarUrl: string;
  coverUrl: string;
  slug: string;
  published: boolean;
  deletedAt?: string | Date | null;
  updatedAt?: string | Date;
};

export type PortfolioItem = { id: string; kind: "image" | "video" | "file" | "link"; title: string; url: string; description?: string; mimeType?: string };
export type ChannelItem = { provider: string; url: string; label?: string };
export type ReferenceRow = { id: number; clientName: string; clientRole?: string | null; company?: string | null; quote: string; approved?: boolean };

export const emptyCard: CardDraft = {
  id: 0,
  displayName: "",
  title: "",
  company: "",
  email: "",
  phone: "",
  location: "",
  bio: "",
  links: "[]",
  portfolio: "[]",
  channels: "[]",
  theme: "midnight",
  avatarUrl: "",
  coverUrl: "",
  slug: "new-card",
  published: false,
  updatedAt: new Date(),
};

export const themeOptions = [
  { id: "midnight", label: "Midnight", colors: ["#11152b", "#6b5cff", "#c2b7ff"] },
  { id: "tide", label: "Tide", colors: ["#062c31", "#28c2b3", "#b9fff5"] },
  { id: "sunset", label: "Sunset", colors: ["#301d34", "#f4816b", "#ffd5a7"] },
];

export const channelOptions = ["linkedin", "instagram", "facebook", "x", "whatsapp", "telegram", "viber", "signal", "calendly"];
export const PREVIEW_CARD_STORAGE_KEY = "heyitsme.preview.card";

export function parseLinks(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : [];
  }
}

export function parsePortfolio(raw: string | null | undefined): PortfolioItem[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item?.url) : [];
  } catch {
    return [];
  }
}

export function parseChannels(raw: string | null | undefined, options?: { keepEmpty?: boolean }): ChannelItem[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => (options?.keepEmpty ? Boolean(item?.provider) : Boolean(item?.url)))
      : [];
  } catch {
    return [];
  }
}

export function readPreviewCard(): CardDraft | null {
  try {
    const raw = window.localStorage.getItem(PREVIEW_CARD_STORAGE_KEY);
    return raw ? JSON.parse(raw) as CardDraft : null;
  } catch {
    return null;
  }
}

export function toDraft(card: any): CardDraft {
  return {
    id: Number(card.id ?? 0),
    displayName: card.displayName ?? "",
    title: card.title ?? "",
    company: card.company ?? "",
    email: card.email ?? "",
    phone: card.phone ?? "",
    location: card.location ?? "",
    bio: card.bio ?? "",
    links: card.links ?? "[]",
    portfolio: card.portfolio ?? "[]",
    channels: card.channels ?? "[]",
    theme: card.theme ?? "midnight",
    avatarUrl: card.avatarUrl ?? "",
    coverUrl: card.coverUrl ?? "",
    slug: card.slug ?? "new-card",
    published: Boolean(card.published),
    deletedAt: card.deletedAt ?? null,
    updatedAt: card.updatedAt,
  };
}

export function toHref(raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "#";
  // Browsers ignore whitespace/control chars inside schemes, so strip them before checking.
  const scheme = v.replace(/[\u0000- ]/g, "").match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme === "javascript" || scheme === "vbscript" || scheme === "data") return "#";
  if (scheme) return v;
  // Same-origin paths such as uploaded files served from /storage/...
  if (v.startsWith("/")) return v;
  return `https://${v}`;
}

/** vCard 3.0 text for a card. `pageUrl` is the public page, `origin` resolves same-origin photo paths. */
export function buildVCard(card: CardDraft, pageUrl: string, origin: string): string {
  const esc = (v: string) => v.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");
  // Only hosted photos — preview data: URLs would bloat the file and many contact apps reject them.
  const photoUrl = /^https?:\/\//i.test(card.avatarUrl)
    ? card.avatarUrl
    : card.avatarUrl.startsWith("/") && !card.avatarUrl.startsWith("//") ? `${origin}${card.avatarUrl}` : "";
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

export function channelLabel(channel: ChannelItem) {
  return channel.label || (channel.provider === "x" ? "X" : channel.provider[0].toUpperCase() + channel.provider.slice(1));
}
