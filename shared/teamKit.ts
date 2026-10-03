// Teams: company files, banners, the email signature and the meeting background. The names, limits and the two
// generators both the server and the client need. Who may change what is decided on the server.

export const ASSET_KINDS = ["file", "link"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

// Safety caps, not plan limits.
export const MAX_ASSETS = 200;
export const MAX_CARD_ASSETS = 12;
export const MAX_BANNERS = 50;
/** How many banners one card shows at a time. */
export const MAX_SHOWN_BANNERS = 3;

export const BANNER_TARGETS = ["all", "department", "cards"] as const;
export type BannerTarget = (typeof BANNER_TARGETS)[number];
export const BANNER_TARGET_LABELS: Record<BannerTarget, string> = { all: "All company cards", department: "One department", cards: "Chosen cards" };

/** What a public company card shows from its team. Never who is in the team. */
export type CardTeamExtras = {
  banners: { id: number; title: string; description: string | null; ctaLabel: string | null; ctaUrl: string | null }[];
  files: { id: number; title: string; kind: AssetKind; url: string }[];
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const hexOr = (value: unknown, fallback: string | null) => (typeof value === "string" && HEX.test(value) ? value : fallback);
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: readonly T[]): T[] =>
  Array.isArray(value) ? allowed.filter(item => value.includes(item)) : [...fallback];
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

/** Whether text on this color should be light. */
export const isDarkColor = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 150;
};

// ---- Email signature ----

/** The parts a team can show or leave out. The person's name is always shown. */
export const SIGNATURE_PARTS = ["logo", "title", "company", "email", "phone", "website", "profileLink", "qr"] as const;
export type SignaturePart = (typeof SIGNATURE_PARTS)[number];
export const SIGNATURE_PART_LABELS: Record<SignaturePart, string> = {
  logo: "Company logo",
  title: "Job title",
  company: "Company",
  email: "Email",
  phone: "Phone",
  website: "Website",
  profileLink: "Link to their card",
  qr: "QR code",
};
export const SIGNATURE_NOTE_MAX = 300;
export type SignatureSettings = { parts: SignaturePart[]; color: string | null; note: string };

/** Makes stored or typed settings safe to use. Unknown parts are dropped; a missing value means the default. */
export function readSignatureSettings(raw: unknown): SignatureSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { parts: pick(value.parts, SIGNATURE_PARTS, SIGNATURE_PARTS), color: hexOr(value.color, null), note: clean(value.note, SIGNATURE_NOTE_MAX) };
}

export type SignaturePerson = { name: string; title: string | null; company: string | null; email: string | null; phone: string | null; cardUrl: string; qrUrl: string };
export type SignatureCompany = { name: string; website: string | null; logoUrl: string | null; color: string | null };

const escapeHtml = (value: string) => value.replace(/[<>&"']/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[character]!);
const webUrl = (value: string | null) => (value && /^https?:\/\/[^\s"'<>]+$/i.test(value) ? value : null);
const withScheme = (value: string | null) => (value && !/^[a-z][a-z0-9+.-]*:/i.test(value) ? `https://${value}` : value);

function signatureLines(settings: SignatureSettings, person: SignaturePerson, company: SignatureCompany) {
  const has = (part: SignaturePart) => settings.parts.includes(part);
  const role = [has("title") ? person.title : null, has("company") ? person.company || company.name : null].filter(Boolean).join(" · ");
  const email = has("email") && person.email && /^[^\s@<>"']+@[^\s@<>"']+$/.test(person.email) ? person.email : null;
  const phone = has("phone") && person.phone ? person.phone : null;
  const website = has("website") ? webUrl(withScheme(company.website)) : null;
  const cardUrl = has("profileLink") ? webUrl(person.cardUrl) : null;
  return { role, email, phone, website, cardUrl };
}

/**
 * The signature as HTML for Gmail and Outlook: one table, every style written on the element, no scripts, no
 * style sheets. Every value is escaped, and only http, https, mailto and tel links are written.
 */
export function signatureHtml(settings: SignatureSettings, person: SignaturePerson, company: SignatureCompany) {
  const has = (part: SignaturePart) => settings.parts.includes(part);
  const color = hexOr(settings.color, hexOr(company.color, "#234bad"))!;
  const { role, email, phone, website, cardUrl } = signatureLines(settings, person, company);
  const logo = has("logo") ? webUrl(company.logoUrl) : null;
  const qr = has("qr") ? webUrl(person.qrUrl) : null;
  const link = (href: string, text: string) => `<a href="${escapeHtml(href)}" style="color:${color};text-decoration:none">${escapeHtml(text)}</a>`;
  const line = (inner: string, style = "") => `<div style="margin:0;${style}">${inner}</div>`;
  const body = [
    line(escapeHtml(person.name), "font-size:16px;font-weight:bold;color:#111827"),
    role ? line(escapeHtml(role), "color:#4b5563") : "",
    email || phone ? line([email ? link(`mailto:${email}`, email) : "", phone ? link(`tel:${phone.replace(/[^\d+]/g, "")}`, phone) : ""].filter(Boolean).join(" &nbsp;|&nbsp; "), "padding-top:6px") : "",
    website ? line(link(website, website.replace(/^https?:\/\//i, "").replace(/\/$/, ""))) : "",
    cardUrl ? line(link(cardUrl, "View my digital card"), "padding-top:6px;font-weight:bold") : "",
    settings.note ? line(escapeHtml(settings.note), "padding-top:8px;font-size:11px;color:#6b7280;max-width:420px") : "",
  ].join("");
  return [
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#1f2937"><tr>`,
    logo ? `<td valign="top" style="padding:0 14px 0 0"><img src="${escapeHtml(logo)}" width="64" alt="${escapeHtml(company.name)} logo" style="display:block;border:0;width:64px;height:auto"></td>` : "",
    `<td valign="top" style="padding:0 0 0 14px;border-left:3px solid ${color}">${body}</td>`,
    qr ? `<td valign="top" style="padding:0 0 0 18px"><img src="${escapeHtml(qr)}" width="84" height="84" alt="QR code for my digital card" style="display:block;border:0;width:84px;height:84px"></td>` : "",
    `</tr></table>`,
  ].join("");
}

/** The same signature as plain text, for mail apps that do not accept formatting. */
export function signatureText(settings: SignatureSettings, person: SignaturePerson, company: SignatureCompany) {
  const { role, email, phone, website, cardUrl } = signatureLines(settings, person, company);
  return [person.name, role, email, phone, website, cardUrl, settings.note].filter(Boolean).join("\n");
}

// ---- Meeting background ----

export const BACKGROUND_PARTS = ["logo", "name", "title", "qr"] as const;
export type BackgroundPart = (typeof BACKGROUND_PARTS)[number];
export const BACKGROUND_PART_LABELS: Record<BackgroundPart, string> = { logo: "Company logo", name: "Name", title: "Job title", qr: "QR code" };
export const BACKGROUND_SIDES = ["left", "right"] as const;
export type BackgroundSide = (typeof BACKGROUND_SIDES)[number];
export const BACKGROUND_CTA_MAX = 40;
export type BackgroundSettings = { parts: BackgroundPart[]; color: string | null; side: BackgroundSide; cta: string };

export function readBackgroundSettings(raw: unknown): BackgroundSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    parts: pick(value.parts, BACKGROUND_PARTS, BACKGROUND_PARTS),
    color: hexOr(value.color, null),
    side: value.side === "left" ? "left" : "right",
    cta: typeof value.cta === "string" ? clean(value.cta, BACKGROUND_CTA_MAX) : "Scan to connect",
  };
}

/** Zoom, Google Meet and Microsoft Teams all take a 16:9 picture. Full HD suits all three. */
export const BACKGROUND_SIZES = [
  { id: "1920x1080", label: "Full HD, 1920 × 1080 (Zoom, Google Meet, Microsoft Teams)", width: 1920, height: 1080 },
  { id: "1280x720", label: "HD, 1280 × 720 (smaller file, for slow connections)", width: 1280, height: 720 },
] as const;
