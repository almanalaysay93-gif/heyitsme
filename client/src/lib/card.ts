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
    // Normalized because older previews were saved with null fields.
    return raw ? toDraft(JSON.parse(raw)) : null;
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

/** What the server stores for a card: trimmed text, empty fields as null, and only well-formed JSON lists. */
export function cardPayload(card: CardDraft) {
  const rawEmail = card.email.trim();
  return {
    displayName: card.displayName.trim() || "Untitled card",
    title: card.title.trim() || "Professional",
    company: card.company.trim() || null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : null,
    phone: card.phone.trim() || null,
    location: card.location.trim() || null,
    bio: card.bio.trim() || null,
    links: JSON.stringify(parseLinks(card.links)),
    portfolio: JSON.stringify(parsePortfolio(card.portfolio)),
    channels: JSON.stringify(parseChannels(card.channels)),
    theme: card.theme,
    avatarUrl: card.avatarUrl || null,
    coverUrl: card.coverUrl || null,
  };
}

export type InlineUpload = { fileName: string; contentType: string; dataBase64: string };

/** Preview uploads are inline data: URLs, which the server does not store. Upload each one and use its stored URL. */
export async function uploadInlineMedia(card: CardDraft, upload: (file: InlineUpload) => Promise<string>): Promise<CardDraft> {
  const store = async (value: string, fileName: string) => {
    const match = value.match(/^data:([^;,]*);base64,(.*)$/);
    return match ? upload({ fileName, contentType: match[1] || "application/octet-stream", dataBase64: match[2] }) : value;
  };
  const portfolio: PortfolioItem[] = [];
  for (const item of parsePortfolio(card.portfolio)) {
    portfolio.push({ ...item, url: await store(item.url, item.title || "portfolio-file") });
  }
  return {
    ...card,
    avatarUrl: await store(card.avatarUrl, "profile-photo"),
    coverUrl: await store(card.coverUrl, "cover"),
    portfolio: JSON.stringify(portfolio),
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

const PHONE_CHANNELS = new Set(["whatsapp", "viber", "signal", "telegram"]);
const PROFILE_BASES: Record<string, string> = {
  linkedin: "https://www.linkedin.com/in/",
  instagram: "https://instagram.com/",
  facebook: "https://facebook.com/",
  x: "https://x.com/",
  telegram: "https://t.me/",
  calendly: "https://calendly.com/",
};

/** Hint for the channel input, matching what `channelHref` understands. */
export function channelPlaceholder(provider: string) {
  if (provider === "telegram") return "@username or phone number";
  if (PHONE_CHANNELS.has(provider)) return "Phone number, e.g. +1 415 555 0183";
  if (provider === "x" || provider === "instagram") return `@username or ${provider}.com/you`;
  return `${provider}.com/you`;
}

/** Link for a channel. Bare handles and phone numbers become the provider's own link instead of `https://@you`. */
export function channelHref(channel: ChannelItem): string {
  const value = (channel.url || "").trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return toHref(value);
  const digits = value.replace(/[\s().-]/g, "");
  if (PHONE_CHANNELS.has(channel.provider) && /^\+?\d{6,15}$/.test(digits)) {
    const number = digits.replace(/^\+/, "");
    if (channel.provider === "whatsapp") return `https://wa.me/${number}`;
    if (channel.provider === "viber") return `viber://chat?number=%2B${number}`;
    if (channel.provider === "signal") return `https://signal.me/#p/+${number}`;
    return `https://t.me/+${number}`;
  }
  const handle = value.match(/^@?([A-Za-z0-9_.-]+)$/)?.[1];
  const base = PROFILE_BASES[channel.provider];
  // "ada.design" is a domain, "@ada.lane" is a handle.
  if (handle && base && (value.startsWith("@") || !handle.includes("."))) return base + handle;
  return toHref(value);
}

export function channelLabel(channel: ChannelItem) {
  return channel.label || (channel.provider === "x" ? "X" : channel.provider[0].toUpperCase() + channel.provider.slice(1));
}
