import { z } from "zod";

/**
 * Owner-editable landing-page settings for a public card, stored as JSON in cards.page.
 * One column on purpose: template, section layout and the template-specific content travel together,
 * and a missing or corrupt value always falls back to a working page (see parsePageConfig).
 */

export const TEMPLATE_IDS = ["professional", "business", "services"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const SECTION_IDS = ["stats", "services", "visit", "portfolio", "references", "contact"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const TEMPLATES: Record<TemplateId, { label: string; blurb: string; sections: SectionId[] }> = {
  professional: {
    label: "Professional",
    blurb: "Your name up front, your work and references close behind.",
    sections: ["stats", "portfolio", "references", "services", "contact", "visit"],
  },
  business: {
    label: "Business",
    blurb: "Company first, with hours, address and what you offer.",
    sections: ["stats", "services", "visit", "portfolio", "references", "contact"],
  },
  services: {
    label: "Services",
    blurb: "A priced menu of what you do and one clear way to book.",
    sections: ["services", "stats", "references", "portfolio", "visit", "contact"],
  },
};

export const SECTION_LABELS: Record<SectionId, string> = {
  stats: "Highlights",
  services: "Services & prices",
  visit: "Hours & address",
  portfolio: "Work & gallery",
  references: "Client references",
  contact: "Contact & links",
};

export const PAGE_LIMITS = { services: 12, stats: 4, hours: 7, pageJson: 8000 } as const;

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().default("");
const safeUrl = z
  .string()
  .trim()
  .max(600)
  .refine((value) => !value || /^(https?:\/\/|mailto:|tel:)/i.test(value), "Links must start with https://, mailto: or tel:")
  .optional()
  .default("");

export const pageConfigSchema = z.object({
  template: z.enum(TEMPLATE_IDS).default("professional"),
  /** Owner accent as #rrggbb; empty means the theme's own accent. */
  accent: z
    .string()
    .trim()
    .regex(/^(#[0-9a-fA-F]{6})?$/, "Accent must be a #rrggbb color")
    .optional()
    .default(""),
  /** Display order. Hidden sections stay in the list so their position survives being turned back on. */
  sections: z
    .array(z.object({ id: z.enum(SECTION_IDS), hidden: z.boolean().optional().default(false) }))
    .max(SECTION_IDS.length)
    .optional(),
  /** The offer in a few words; the Services template uses it as the page title. */
  headline: optionalText(80),
  cta: z.object({ label: optionalText(40), url: safeUrl }).optional(),
  stats: z.array(z.object({ value: text(16).min(1), label: text(48).min(1) })).max(PAGE_LIMITS.stats).optional().default([]),
  services: z
    .array(
      z.object({
        name: text(80).min(1),
        description: optionalText(240),
        price: optionalText(32),
        url: safeUrl,
      }),
    )
    .max(PAGE_LIMITS.services)
    .optional()
    .default([]),
  hours: z.array(z.object({ days: text(32).min(1), time: text(40).min(1) })).max(PAGE_LIMITS.hours).optional().default([]),
  address: optionalText(240),
});

export type PageConfig = z.infer<typeof pageConfigSchema>;
export type PageSection = { id: SectionId; hidden: boolean };

export function defaultPageConfig(template: TemplateId = "professional"): PageConfig {
  return pageConfigSchema.parse({ template, sections: TEMPLATES[template].sections.map((id) => ({ id })) });
}

/** Reads cards.page. Anything missing, corrupt or out of range becomes the Professional default, never an error. */
export function parsePageConfig(raw: string | null | undefined): PageConfig {
  if (!raw) return defaultPageConfig();
  try {
    const parsed = pageConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : defaultPageConfig();
  } catch {
    return defaultPageConfig();
  }
}

/**
 * Section order for rendering: the owner's saved order, then any section they have never placed, in the template's
 * order. Duplicates are dropped so a hand-edited payload cannot render a section twice.
 */
export function resolveSections(config: PageConfig): PageSection[] {
  const seen = new Set<SectionId>();
  const out: PageSection[] = [];
  for (const section of config.sections ?? []) {
    if (seen.has(section.id)) continue;
    seen.add(section.id);
    out.push({ id: section.id, hidden: Boolean(section.hidden) });
  }
  for (const id of TEMPLATES[config.template].sections) {
    if (!seen.has(id)) out.push({ id, hidden: false });
  }
  return out;
}

/** Switching templates adopts the new template's order but keeps every piece of content and hidden choice. */
export function switchTemplate(config: PageConfig, template: TemplateId): PageConfig {
  const hidden = new Set(resolveSections(config).filter((s) => s.hidden).map((s) => s.id));
  return { ...config, template, sections: TEMPLATES[template].sections.map((id) => ({ id, hidden: hidden.has(id) })) };
}

/** Server-side validator for the stored string: valid JSON matching the schema, within the size cap. */
export const pageConfigField = z
  .string()
  .max(PAGE_LIMITS.pageJson, "Page settings are too large")
  .refine((value) => {
    if (!value.trim()) return true;
    try {
      return pageConfigSchema.safeParse(JSON.parse(value)).success;
    } catch {
      return false;
    }
  }, "Page settings are invalid")
  .optional()
  .nullable();

/** Google Maps search link for a street address. */
export function mapLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colors. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white text, whichever reads better on the given #rrggbb background. */
export function readableOn(hex: string): "#111111" | "#ffffff" {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#111111") ? "#ffffff" : "#111111";
}
