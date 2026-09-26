import { PAGE_LIMITS, pageConfigSchema, resolveSections, type PageConfig, type PageSection } from "@shared/pageConfig";

/** Turns what people naturally type into a link the schema accepts; anything unrecognisable becomes "". */
export function normalizeLink(raw: string): string {
  const link = toLink(raw.trim());
  // The prefix can push a long entry past the schema's 600; drop just that link rather than fail the whole page.
  return link.length <= 600 ? link : "";
}

function toLink(value: string): string {
  if (!value) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  if (/^\+?[\d\s().-]{6,}$/.test(value)) return `tel:${value.replace(/[^\d+]/g, "")}`;
  if (/^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(value)) return `https://${value}`;
  return "";
}

/** True when a typed link will be dropped on save, so the editor can say so. */
export function isUnusableLink(raw: string): boolean {
  return Boolean(raw.trim()) && !normalizeLink(raw);
}

/**
 * The storable version of the working config: incomplete rows dropped, links normalised, the full section order
 * written out. Returns null only if the result still fails the schema or the size cap, so callers never save it.
 */
export function toEmittable(config: PageConfig): PageConfig | null {
  const candidate = {
    template: config.template,
    accent: /^#[0-9a-fA-F]{6}$/.test(config.accent.trim()) ? config.accent.trim() : "",
    sections: resolveSections(config),
    headline: config.headline.trim(),
    cta: { label: (config.cta?.label ?? "").trim(), url: normalizeLink(config.cta?.url ?? "") },
    stats: config.stats
      .map((s) => ({ value: s.value.trim(), label: s.label.trim() }))
      .filter((s) => s.value && s.label)
      .slice(0, PAGE_LIMITS.stats),
    services: config.services
      .map((s) => ({ name: s.name.trim(), description: s.description.trim(), price: s.price.trim(), url: normalizeLink(s.url) }))
      .filter((s) => s.name)
      .slice(0, PAGE_LIMITS.services),
    hours: config.hours
      .map((h) => ({ days: h.days.trim(), time: h.time.trim() }))
      .filter((h) => h.days && h.time)
      .slice(0, PAGE_LIMITS.hours),
    address: config.address.trim(),
  };
  const parsed = pageConfigSchema.safeParse(candidate);
  if (!parsed.success) return null;
  if (JSON.stringify(parsed.data).length > PAGE_LIMITS.pageJson) return null;
  return parsed.data;
}

/** True while some typed row or link can't be saved yet, so the builder can treat the page as having unsaved edits. */
export function hasPendingEdits(config: PageConfig): boolean {
  const half = (a: string, b: string) => Boolean(a.trim()) !== Boolean(b.trim());
  return (
    config.stats.some((s) => half(s.value, s.label)) ||
    config.hours.some((h) => half(h.days, h.time)) ||
    config.services.some((s) => !s.name.trim() && Boolean(s.price.trim() || s.description.trim() || s.url.trim())) ||
    isUnusableLink(config.cta?.url ?? "") ||
    config.services.some((s) => isUnusableLink(s.url)) ||
    toEmittable(config) === null
  );
}

/** Swaps a section with its neighbour. Out-of-range moves return the list unchanged. */
export function moveSection(sections: PageSection[], index: number, direction: -1 | 1): PageSection[] {
  const target = index + direction;
  if (index < 0 || index >= sections.length || target < 0 || target >= sections.length) return sections;
  const next = sections.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function toggleSection(sections: PageSection[], index: number): PageSection[] {
  return sections.map((section, i) => (i === index ? { ...section, hidden: !section.hidden } : section));
}
