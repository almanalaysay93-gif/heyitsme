import { pageConfigField } from "./pageConfig";
import { z } from "zod";

export const MAX_PORTFOLIO_ITEMS = 20;
export const MAX_PORTFOLIO_LENGTH = 12000;

export const UNSAFE_SCHEMES = new Set(["javascript", "vbscript", "data"]);

/**
 * Checks if a URL or scheme contains unsafe/executable protocols or control characters.
 */
export function isUnsafeUrl(raw: string): boolean {
  if (!raw) return false;
  const cleaned = raw.replace(/[\u0000-\u0020]/g, "").trim().toLowerCase();
  const schemeMatch = cleaned.match(/^([a-z][a-z0-9+.-]*):/);
  if (schemeMatch && UNSAFE_SCHEMES.has(schemeMatch[1])) {
    return true;
  }
  return false;
}

/**
 * Checks if a string looks like a plausible bare domain (e.g. "ada.design", "x.com/user").
 */
export function isBareDomain(raw: string): boolean {
  const trimmed = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("/")) return false;
  const domainPart = trimmed.split("/")[0].split("?")[0].split("#")[0];
  // Must have at least one dot, valid domain characters
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(domainPart);
}

/**
 * Normalizes website URLs: upgrades bare domains to https://, rejects unsafe schemes and malformed URLs.
 */
export function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  if (isUnsafeUrl(trimmed)) return null;

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  let candidate = trimmed;
  if (isBareDomain(trimmed)) {
    candidate = `https://${trimmed}`;
  }

  try {
    const url = new URL(candidate);
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".")) {
      return candidate;
    }
  } catch {
    // Malformed URL
  }

  return null;
}

/**
 * Validates email address format. Returns true if empty or valid format.
 */
export function isValidEmail(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 320;
}

const PHONE_CHANNELS = new Set(["whatsapp", "viber", "signal", "telegram"]);

/**
 * Validates a channel's link/handle according to provider rules.
 */
export function isValidChannelUrl(provider: string, raw: string): boolean {
  const trimmed = (raw || "").trim();
  if (!trimmed) return true;
  if (isUnsafeUrl(trimmed)) return false;

  const prov = provider.toLowerCase();
  if (PHONE_CHANNELS.has(prov)) {
    const digits = trimmed.replace(/[\s().-]/g, "");
    if (/^\+?\d{6,15}$/.test(digits)) return true;
    if (
      trimmed.startsWith("viber://") ||
      trimmed.startsWith("https://wa.me/") ||
      trimmed.startsWith("https://signal.me/") ||
      trimmed.startsWith("https://t.me/")
    ) {
      return true;
    }
  }

  if (/^@?[a-zA-Z0-9_.-]+$/.test(trimmed)) return true;

  const normalized = normalizeWebsiteUrl(trimmed);
  return normalized !== null;
}

export interface CardValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Validates card fields before creation, update, or publication.
 */
export function validateCardData(data: {
  displayName?: string | null;
  title?: string | null;
  email?: string | null;
  company?: string | null;
  location?: string | null;
  phone?: string | null;
  bio?: string | null;
  links?: string | null;
  portfolio?: string | null;
  channels?: string | null;
  contactHeading?: string | null;
  galleryHeading?: string | null;
  portfolioHeading?: string | null;
}): CardValidationResult {
  const errors: Record<string, string> = {};

  const name = (data.displayName || "").trim();
  if (!name) {
    errors.displayName = "Please enter your name.";
  } else if (name.length > 160) {
    errors.displayName = "Name cannot exceed 160 characters.";
  }

  if (data.title && data.title.trim().length > 160) {
    errors.title = "Role / title cannot exceed 160 characters.";
  }

  const rawEmail = (data.email || "").trim();
  if (rawEmail) {
    if (!isValidEmail(rawEmail)) {
      errors.email = "Please enter a valid email address.";
    }
  }

  if (data.company && data.company.trim().length > 160) {
    errors.company = "Company cannot exceed 160 characters.";
  }
  if (data.location && data.location.trim().length > 160) {
    errors.location = "Location cannot exceed 160 characters.";
  }
  if (data.phone && data.phone.trim().length > 64) {
    errors.phone = "Phone cannot exceed 64 characters.";
  }
  if (data.bio && data.bio.trim().length > 800) {
    errors.bio = "Bio cannot exceed 800 characters.";
  }
  if (data.contactHeading && data.contactHeading.trim().length > 160) {
    errors.contactHeading = "Contact heading cannot exceed 160 characters.";
  }
  if (data.galleryHeading && data.galleryHeading.trim().length > 160) {
    errors.galleryHeading = "Gallery heading cannot exceed 160 characters.";
  }
  if (data.portfolioHeading && data.portfolioHeading.trim().length > 160) {
    errors.portfolioHeading = "Portfolio heading cannot exceed 160 characters.";
  }

  // Validate links
  if (data.links) {
    try {
      const parsed = typeof data.links === "string" ? JSON.parse(data.links) : data.links;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === "string" && item.trim()) {
            if (isUnsafeUrl(item) || normalizeWebsiteUrl(item) === null) {
              errors.links = `Invalid website link: "${item}".`;
              break;
            }
          }
        }
      }
    } catch {
      // Ignore unparseable here; schema will handle if string exceeds limits
    }
  }

  // Validate portfolio
  if (data.portfolio) {
    try {
      const parsed = typeof data.portfolio === "string" ? JSON.parse(data.portfolio) : data.portfolio;
      if (Array.isArray(parsed)) {
        if (parsed.length > MAX_PORTFOLIO_ITEMS) {
          errors.portfolio = `Portfolio can have at most ${MAX_PORTFOLIO_ITEMS} items.`;
        } else {
          for (const item of parsed) {
            if (item?.kind === "link" && item?.url) {
              if (isUnsafeUrl(item.url) || normalizeWebsiteUrl(item.url) === null) {
                errors.portfolio = `Invalid portfolio link URL: "${item.url}".`;
                break;
              }
            } else if (item?.url && isUnsafeUrl(item.url)) {
              errors.portfolio = `Unsafe URL scheme in portfolio item.`;
              break;
            }
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  // Validate channels
  if (data.channels) {
    try {
      const parsed = typeof data.channels === "string" ? JSON.parse(data.channels) : data.channels;
      if (Array.isArray(parsed)) {
        for (const ch of parsed) {
          if (ch?.url && !isValidChannelUrl(ch.provider || "", ch.url)) {
            errors.channels = `Invalid channel format for ${ch.provider || "channel"}.`;
            break;
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Zod schema for server router validation
const imageUrlSchema = z
  .string()
  .max(600)
  .refine((value) => /^(https?:\/\/|\/(?!\/))/i.test(value), "Image must be an https link or an uploaded file")
  .optional()
  .nullable();

export const serverCardFields = {
  creationKey: z.string().trim().max(64).optional().nullable(),
  displayName: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(160, "Name cannot exceed 160 characters"),
  title: z
    .string()
    .trim()
    .max(160, "Role / title cannot exceed 160 characters")
    .optional()
    .default(""),
  company: z.string().trim().max(160).optional().nullable(),
  email: z
    .string()
    .trim()
    .max(320)
    .refine((val) => !val || isValidEmail(val), "Please enter a valid email address")
    .optional()
    .nullable(),
  phone: z.string().trim().max(64).optional().nullable(),
  location: z.string().trim().max(160).optional().nullable(),
  bio: z.string().trim().max(800).optional().nullable(),
  links: z
    .string()
    .max(3000)
    .refine((val) => {
      if (!val || !val.trim()) return true;
      try {
        const parsed = JSON.parse(val);
        if (!Array.isArray(parsed)) return true;
        return parsed.every((l) => typeof l !== "string" || !l.trim() || normalizeWebsiteUrl(l) !== null);
      } catch {
        return true;
      }
    }, "Links contain an invalid or unsafe URL")
    .optional()
    .nullable(),
  portfolio: z
    .string()
    .max(MAX_PORTFOLIO_LENGTH, `Portfolio cannot exceed ${MAX_PORTFOLIO_LENGTH} characters`)
    .refine(
      (value) => {
        if (!value || !value.trim()) return true;
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) return true;
          if (parsed.length > MAX_PORTFOLIO_ITEMS) return false;
          return parsed.every((item) => {
            if (!item?.url) return true;
            if (isUnsafeUrl(item.url)) return false;
            if (item.kind === "link") return normalizeWebsiteUrl(item.url) !== null;
            return true;
          });
        } catch {
          return true;
        }
      },
      `Portfolio contains invalid items or exceeds ${MAX_PORTFOLIO_ITEMS} items`
    )
    .optional()
    .nullable(),
  channels: z
    .string()
    .max(6000)
    .refine((val) => {
      if (!val || !val.trim()) return true;
      try {
        const parsed = JSON.parse(val);
        if (!Array.isArray(parsed)) return true;
        return parsed.every((ch) => !ch?.url || isValidChannelUrl(ch.provider || "", ch.url));
      } catch {
        return true;
      }
    }, "Channels contain an invalid or unsafe link")
    .optional()
    .nullable(),
  theme: z.string().max(80).optional().nullable(),
  logoUrl: z.string().max(600).optional().nullable(),
  avatarUrl: imageUrlSchema,
  coverUrl: imageUrlSchema,
  backgroundUrl: imageUrlSchema,
  contactHeading: z.string().trim().max(160).optional().nullable(),
  galleryHeading: z.string().trim().max(160).optional().nullable(),
  portfolioHeading: z.string().trim().max(160).optional().nullable(),
  page: pageConfigField,
};
