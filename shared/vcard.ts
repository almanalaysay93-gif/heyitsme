export type ChannelItem = {
  provider: string;
  url: string;
  label?: string;
};

export type VCardFields = {
  displayName?: string | null;
  title?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  links?: string | string[] | null;
  channels?: string | ChannelItem[] | null;
};

const PHONE_CHANNELS = new Set(["whatsapp", "viber", "signal", "telegram"]);

const PROFILE_BASES: Record<string, string> = {
  linkedin: "https://www.linkedin.com/in/",
  instagram: "https://instagram.com/",
  facebook: "https://facebook.com/",
  x: "https://x.com/",
  twitter: "https://x.com/",
  telegram: "https://t.me/",
  calendly: "https://calendly.com/",
  github: "https://github.com/",
  youtube: "https://youtube.com/@",
  tiktok: "https://tiktok.com/@",
};

const SOCIAL_PROFILE_TYPES: Record<string, string> = {
  linkedin: "linkedin",
  x: "twitter",
  twitter: "twitter",
  facebook: "facebook",
  instagram: "instagram",
  telegram: "telegram",
  whatsapp: "whatsapp",
  signal: "signal",
  viber: "viber",
  calendly: "calendly",
  youtube: "youtube",
  github: "github",
  tiktok: "tiktok",
};

export function toHref(raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "#";
  const scheme = v.replace(/[\u0000- ]/g, "").match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme === "javascript" || scheme === "vbscript" || scheme === "data") return "#";
  if (scheme) return v;
  if (v.startsWith("/")) return v;
  return `https://${v}`;
}

export function channelHref(channel: ChannelItem): string {
  const value = (channel.url || "").trim();
  if (!value) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return toHref(value);
  const digits = value.replace(/[\s().-]/g, "");
  const provider = (channel.provider || "").toLowerCase();
  if (PHONE_CHANNELS.has(provider) && /^\+?\d{6,15}$/.test(digits)) {
    const number = digits.replace(/^\+/, "");
    if (provider === "whatsapp") return `https://wa.me/${number}`;
    if (provider === "viber") return `viber://chat?number=%2B${number}`;
    if (provider === "signal") return `https://signal.me/#p/+${number}`;
    return `https://t.me/+${number}`;
  }
  const handle = value.match(/^@?([A-Za-z0-9_.-]+)$/)?.[1];
  const base = PROFILE_BASES[provider];
  if (handle && base && (value.startsWith("@") || !handle.includes("."))) return base + handle;
  return toHref(value);
}

export function channelLabel(channel: ChannelItem): string {
  if (channel.label && channel.label.trim()) return channel.label.trim();
  const p = (channel.provider || "").toLowerCase();
  if (p === "x") return "X";
  if (p === "linkedin") return "LinkedIn";
  if (p === "whatsapp") return "WhatsApp";
  if (p === "youtube") return "YouTube";
  if (p === "github") return "GitHub";
  if (p === "tiktok") return "TikTok";
  return p ? p[0].toUpperCase() + p.slice(1) : "Channel";
}

function extractHandle(raw: string, href: string, provider: string): string | null {
  const trimmed = raw.trim();
  const isPhone = PHONE_CHANNELS.has(provider.toLowerCase());
  const digitsOnly = trimmed.replace(/[\s().+-]/g, "");
  if (isPhone && /^\d+$/.test(digitsOnly)) {
    return null;
  }
  const directMatch = trimmed.match(/^@?([A-Za-z0-9_.-]+)$/)?.[1];
  if (directMatch && !directMatch.includes(".")) return directMatch;
  try {
    const url = new URL(href);
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1]?.replace(/^@/, "");
    if (last && /^[A-Za-z0-9_.-]+$/.test(last)) {
      if (isPhone && /^\d+$/.test(last)) return null;
      return last;
    }
  } catch {
    // ignore malformed URLs
  }
  return null;
}

export function parseLinksSafe(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((l) => typeof l === "string" && l.trim().length > 0);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l === "string" && l.trim().length > 0) : [];
  } catch {
    return raw.split(",").map((l) => l.trim()).filter(Boolean);
  }
}

export function parseChannelsSafe(raw: string | ChannelItem[] | null | undefined): ChannelItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((c) => c && typeof c === "object" && Boolean(c.url || c.provider));
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c === "object" && Boolean(c.url || c.provider)) : [];
  } catch {
    return [];
  }
}

export function structuredName(displayName: string | null | undefined): {
  familyName: string;
  givenName: string;
  additionalNames: string;
} {
  const raw = (displayName || "").trim();
  if (!raw) {
    return { familyName: "", givenName: "Contact", additionalNames: "" };
  }

  // Handle "LastName, FirstName MiddleName"
  if (raw.includes(",")) {
    const [last, firstAndMiddle = ""] = raw.split(",").map((s) => s.trim());
    const rest = firstAndMiddle.split(/\s+/).filter(Boolean);
    const given = rest[0] || "";
    const additional = rest.slice(1).join(" ");
    return { familyName: last || "", givenName: given, additionalNames: additional };
  }

  // Handle "FirstName MiddleName... LastName"
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    return { familyName: "", givenName: tokens[0], additionalNames: "" };
  }
  if (tokens.length === 2) {
    return { familyName: tokens[1], givenName: tokens[0], additionalNames: "" };
  }

  const given = tokens[0];
  const family = tokens[tokens.length - 1];
  const additional = tokens.slice(1, -1).join(" ");
  return { familyName: family, givenName: given, additionalNames: additional };
}

/** vCard 3.0 text for a card. `pageUrl` is the public page, `origin` resolves same-origin photo paths. */
export function buildVCard(card: VCardFields, pageUrl: string, origin: string): string {
  const esc = (v: string) => v.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");
  const avatarUrl = card.avatarUrl ?? "";
  // Only hosted photos — preview data: URLs would bloat the file and many contact apps reject them.
  const photoUrl = /^https?:\/\//i.test(avatarUrl)
    ? avatarUrl
    : avatarUrl.startsWith("/") && !avatarUrl.startsWith("//") ? `${origin}${avatarUrl}` : "";

  const name = structuredName(card.displayName);
  const lines: (string | null)[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(name.familyName)};${esc(name.givenName)};${esc(name.additionalNames)};;`,
    `FN:${esc(card.displayName || "Contact")}`,
    card.title ? `TITLE:${esc(card.title)}` : null,
    card.company ? `ORG:${esc(card.company)}` : null,
    card.email ? `EMAIL;TYPE=INTERNET:${card.email}` : null,
    card.phone ? `TEL;TYPE=CELL:${card.phone}` : null,
    card.location ? `ADR;TYPE=WORK:;;;${esc(card.location)};;;` : null,
    `URL:${pageUrl}`,
  ];

  const channels = parseChannelsSafe(card.channels);
  const links = parseLinksSafe(card.links);

  const noteLines: string[] = [];
  let itemIndex = 1;

  for (const ch of channels) {
    const href = channelHref(ch);
    if (!href || href === "#") continue;
    const label = channelLabel(ch);
    const provider = (ch.provider || "").toLowerCase();
    const socialType = SOCIAL_PROFILE_TYPES[provider] || provider;
    const handle = extractHandle(ch.url || "", href, provider);

    // 1. Apple Contacts X-SOCIALPROFILE extension
    if (handle) {
      lines.push(`X-SOCIALPROFILE;TYPE=${socialType};x-user=${esc(handle)}:${href}`);
    } else {
      lines.push(`X-SOCIALPROFILE;TYPE=${socialType}:${href}`);
    }

    // 2. Grouped URL with label for iOS and Google Contacts
    lines.push(`item${itemIndex}.URL:${href}`);
    lines.push(`item${itemIndex}.X-ABLabel:${esc(label)}`);
    itemIndex++;

    noteLines.push(`• ${label}: ${href}`);
  }

  for (const link of links) {
    const href = toHref(link);
    if (!href || href === "#") continue;

    let label = "Website";
    try {
      const hostname = new URL(href).hostname.replace(/^www\./, "");
      const domainName = hostname.split(".")[0];
      if (domainName) {
        label = domainName.charAt(0).toUpperCase() + domainName.slice(1);
      }
    } catch {
      // keep "Website"
    }

    lines.push(`item${itemIndex}.URL:${href}`);
    lines.push(`item${itemIndex}.X-ABLabel:${esc(label)}`);
    itemIndex++;

    noteLines.push(`• ${label}: ${href}`);
  }

  const bio = card.bio ? card.bio.trim() : "";
  const noteParts: string[] = [];
  if (bio) {
    noteParts.push(bio);
  }
  if (noteLines.length > 0) {
    noteParts.push("Contact & Social Links:\n" + noteLines.join("\n"));
  }

  if (noteParts.length > 0) {
    lines.push(`NOTE:${esc(noteParts.join("\n\n"))}`);
  }

  if (photoUrl) {
    lines.push(`PHOTO;VALUE=URI:${photoUrl}`);
  }

  lines.push("END:VCARD");

  return lines.filter(Boolean).join("\r\n");
}
