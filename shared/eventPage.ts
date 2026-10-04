import { isContactLink } from "./contactLink";
import { EVENT_FONTS, type EventDesign } from "./events";
import { z } from "zod";

/**
 * Admin-editable landing-page content for a team event, stored as JSON in workspaceEvents.page.
 * One column on purpose, like cards.page: the look, the section layout and the section content travel together,
 * and a missing or corrupt value always falls back to a working page (see parseEventPage).
 * The RSVP form is not a section here: it is always the last block on the page and cannot be hidden or moved.
 */

export const EVENT_THEMES = ["tide", "sunset", "midnight"] as const;
export type EventTheme = (typeof EVENT_THEMES)[number];
export const EVENT_THEME_LABELS: Record<EventTheme, string> = { tide: "Tide (light, green)", sunset: "Sunset (light, warm)", midnight: "Midnight (dark)" };

// Paper, ink and default accent per theme. Same values as the card landing page; each accent passes 4.5:1 on its paper.
export const EVENT_PALETTES: Record<EventTheme, { paper: string; ink: string; accent: string }> = {
  midnight: { paper: "#0b0c18", ink: "#f2f1fb", accent: "#5446e6" },
  tide: { paper: "#eef5f3", ink: "#0b2a2d", accent: "#0e7469" },
  sunset: { paper: "#f9f1ee", ink: "#2b1b22", accent: "#a8432f" },
};

export const EVENT_SECTION_IDS = ["details", "schedule", "speakers", "gallery", "sponsors", "faq", "links"] as const;
export type EventSectionId = (typeof EVENT_SECTION_IDS)[number];
export const EVENT_SECTION_LABELS: Record<EventSectionId, string> = {
  details: "Details",
  schedule: "Schedule",
  speakers: "Speakers",
  gallery: "Gallery",
  sponsors: "Sponsors",
  faq: "Questions and answers",
  links: "Resource links",
};

export const EVENT_PAGE_LIMITS = { agenda: 30, agendaDays: 7, rowSpeakers: 6, speakers: 12, featured: 3, gallery: 12, sponsors: 12, sponsorTiers: 5, faq: 20, links: 12, pageJson: 40000 } as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().default("");
const safeUrl = z
  .string()
  .trim()
  .max(600)
  .refine((value) => isContactLink(value), "Use a full link, such as https://example.com")
  .optional()
  .default("");
// Only files this app stored. The server also checks each one belongs to this event (see eventsRouter.savePage).
// ".." is refused so a path can never climb out of the event's own folder prefix.
const image = z
  .string()
  .trim()
  .max(600)
  .regex(/^(\/storage\/(?!.*\.\.)[A-Za-z0-9._/-]+)?$/, "Upload the image again.")
  .optional()
  .default("");

/** Day and tier labels, in display order. A row points at one by its position in the list. */
const labels = (max: number, what: string) => z.array(text(40).min(1)).max(max, `Up to ${max} ${what}.`).optional().default([]);
const position = (max: number) => z.number().int().min(0).max(max - 1).optional().default(0);
const speakerId = z.string().max(16).regex(/^[a-z0-9]*$/);

export const eventSpeakerSchema = z.object({
  /** Lets a schedule row name this speaker. Set by normalizeEventPage; empty on pages saved before rows had speakers. */
  id: speakerId.optional().default(""),
  name: text(80).min(1),
  role: optionalText(80),
  bio: optionalText(400),
  photoUrl: image,
  /** A team card this speaker links to. Copied details, not a live link: editing the card does not change the event. */
  cardSlug: z.string().trim().max(120).regex(/^[a-z0-9-]*$/).optional().default(""),
  /** Featured speakers get a large block with their bio. The rest sit in a grid. */
  featured: z.boolean().optional().default(false),
});
export type EventSpeaker = z.infer<typeof eventSpeakerSchema>;

export const eventPageSchema = z.object({
  theme: z.enum(EVENT_THEMES).optional().default("tide"),
  /** Accent as #rrggbb; empty means the team's brand color, or the theme's own accent. */
  accent: z.string().trim().regex(/^(#[0-9a-fA-F]{6})?$/, "Accent must be a #rrggbb color").optional().default(""),
  font: z.enum(EVENT_FONTS).optional().default("modern"),
  /** Display order. Hidden sections stay in the list so their position survives being turned back on. */
  sections: z
    .array(z.object({ id: z.enum(EVENT_SECTION_IDS), hidden: z.boolean().optional().default(false) }))
    .max(EVENT_SECTION_IDS.length)
    .optional(),
  /** Empty for a one-day event: the schedule is then one list with no day headings. */
  agendaDays: labels(EVENT_PAGE_LIMITS.agendaDays, "days"),
  agenda: z
    .array(
      z.object({
        time: optionalText(40),
        title: text(120).min(1),
        note: optionalText(300),
        day: position(EVENT_PAGE_LIMITS.agendaDays),
        speakerIds: z.array(speakerId).max(EVENT_PAGE_LIMITS.rowSpeakers, `Up to ${EVENT_PAGE_LIMITS.rowSpeakers} speakers on one row.`).optional().default([]),
      }),
    )
    .max(EVENT_PAGE_LIMITS.agenda)
    .optional()
    .default([]),
  speakers: z
    .array(eventSpeakerSchema)
    .max(EVENT_PAGE_LIMITS.speakers, `Up to ${EVENT_PAGE_LIMITS.speakers} speakers.`)
    .refine(
      (speakers) => speakers.filter((speaker) => speaker.featured).length <= EVENT_PAGE_LIMITS.featured,
      `Up to ${EVENT_PAGE_LIMITS.featured} featured speakers. Unfeature one first.`,
    )
    .optional()
    .default([]),
  gallery: z
    .array(z.object({ url: image.pipe(z.string().min(1)), alt: optionalText(120) }))
    .max(EVENT_PAGE_LIMITS.gallery, `Up to ${EVENT_PAGE_LIMITS.gallery} photos.`)
    .optional()
    .default([]),
  /** Empty means one flat list of sponsors. The first tier is shown largest. */
  sponsorTiers: labels(EVENT_PAGE_LIMITS.sponsorTiers, "sponsor tiers"),
  sponsors: z
    .array(z.object({ name: text(80).min(1), logoUrl: image, url: safeUrl, tier: position(EVENT_PAGE_LIMITS.sponsorTiers) }))
    .max(EVENT_PAGE_LIMITS.sponsors, `Up to ${EVENT_PAGE_LIMITS.sponsors} sponsors.`)
    .optional()
    .default([]),
  faq: z
    .array(z.object({ question: text(160).min(1), answer: text(800).min(1) }))
    .max(EVENT_PAGE_LIMITS.faq)
    .optional()
    .default([]),
  links: z
    .array(z.object({ title: text(80).min(1), url: safeUrl, description: optionalText(160) }))
    .max(EVENT_PAGE_LIMITS.links)
    .optional()
    .default([]),
});
export type EventPage = z.infer<typeof eventPageSchema>;
export type EventPageSection = { id: EventSectionId; hidden: boolean };

/**
 * The page for an event that has none saved yet. An event made before the landing page keeps its font and its
 * button color (now the accent). Its old page background is not used; the theme sets the background.
 */
export function defaultEventPage(legacy?: EventDesign | null): EventPage {
  return eventPageSchema.parse({
    accent: legacy?.button && HEX.test(legacy.button) ? legacy.button : "",
    font: legacy?.font && EVENT_FONTS.includes(legacy.font) ? legacy.font : "modern",
  });
}

/** Reads workspaceEvents.page. Anything missing, corrupt or out of range becomes the default page, never an error. */
export function parseEventPage(raw: unknown, legacy?: EventDesign | null): EventPage {
  if (!raw || typeof raw !== "object") return defaultEventPage(legacy);
  const parsed = eventPageSchema.safeParse(raw);
  return parsed.success ? parsed.data : defaultEventPage(legacy);
}

/** Section order for rendering: the saved order, then any section never placed. Duplicates are dropped. */
export function resolveEventSections(page: Pick<EventPage, "sections">): EventPageSection[] {
  const seen = new Set<EventSectionId>();
  const out: EventPageSection[] = [];
  for (const section of page.sections ?? []) {
    if (seen.has(section.id)) continue;
    seen.add(section.id);
    out.push({ id: section.id, hidden: Boolean(section.hidden) });
  }
  for (const id of EVENT_SECTION_IDS) if (!seen.has(id)) out.push({ id, hidden: false });
  return out;
}

/** The accent the page shows: the event's own, else the team's main brand color, else the theme's. */
export function eventAccent(page: Pick<EventPage, "theme" | "accent">, brandColor?: string | null): string {
  if (page.accent) return page.accent;
  if (brandColor && HEX.test(brandColor)) return brandColor;
  return EVENT_PALETTES[page.theme].accent;
}

/** Featured speakers first, each group in the order the admin set. */
export function orderSpeakers(speakers: EventSpeaker[]): { featured: EventSpeaker[]; rest: EventSpeaker[] } {
  return { featured: speakers.filter((speaker) => speaker.featured), rest: speakers.filter((speaker) => !speaker.featured) };
}

export const newSpeakerId = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

/**
 * Makes the cross-references inside a page hold: every speaker has its own id, a schedule row only names speakers
 * that exist, and a row or sponsor never points past the last day or tier. Run on every save and when the editor opens.
 */
export function normalizeEventPage(page: EventPage, makeId: () => string = newSpeakerId): EventPage {
  const ids = new Set<string>();
  const speakers = page.speakers.map((speaker) => {
    let id = speaker.id;
    while (!id || ids.has(id)) id = makeId();
    ids.add(id);
    return id === speaker.id ? speaker : { ...speaker, id };
  });
  const within = (at: number, count: number) => (at > 0 && at < count ? at : 0);
  const agenda = page.agenda.map((row) => ({
    ...row,
    day: within(row.day, page.agendaDays.length),
    speakerIds: Array.from(new Set(row.speakerIds)).filter((id) => ids.has(id)),
  }));
  const sponsors = page.sponsors.map((sponsor) => ({ ...sponsor, tier: within(sponsor.tier, page.sponsorTiers.length) }));
  return { ...page, speakers, agenda, sponsors };
}

/** `top` marks the first name in the admin's list (the first day, the highest tier), even when later groups are empty. */
type Grouped<T> = { label: string; top: boolean; items: T[] };
function grouped<T>(items: T[], names: string[], at: (item: T) => number): Grouped<T>[] {
  if (names.length === 0) return items.length > 0 ? [{ label: "", top: false, items }] : [];
  return names
    .map((label, index) => ({ label, top: index === 0, items: items.filter((item) => (at(item) < names.length ? at(item) : 0) === index) }))
    .filter((group) => group.items.length > 0);
}

/** The schedule split by day, in day order. One group with no label when the event has no days. Empty days are left out. */
export function agendaByDay(page: Pick<EventPage, "agenda" | "agendaDays">): Grouped<EventPage["agenda"][number]>[] {
  return grouped(page.agenda, page.agendaDays, (row) => row.day);
}

/** Sponsors split by tier, in tier order. One group with no label when the event has no tiers. */
export function sponsorsByTier(page: Pick<EventPage, "sponsors" | "sponsorTiers">): Grouped<EventPage["sponsors"][number]>[] {
  return grouped(page.sponsors, page.sponsorTiers, (sponsor) => sponsor.tier);
}

/** The speakers a schedule row names, in the order the row lists them. */
export function rowSpeakers(page: Pick<EventPage, "speakers">, row: Pick<EventPage["agenda"][number], "speakerIds">): EventSpeaker[] {
  return row.speakerIds.flatMap((id) => page.speakers.filter((speaker) => speaker.id === id).slice(0, 1));
}

/** Every stored file the page shows, so the server can tell which ones a save dropped. */
export function eventPageImages(page: EventPage): string[] {
  return [
    ...page.speakers.map((speaker) => speaker.photoUrl),
    ...page.gallery.map((photo) => photo.url),
    ...page.sponsors.map((sponsor) => sponsor.logoUrl),
  ].filter(Boolean);
}

const pad = (value: number) => String(value).padStart(2, "0");
const stamp = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
// RFC 5545: backslash, semicolon and comma are escaped; a line break becomes \n.
const icsText = (value: string) => value.replace(/\\/g, "\\\\").replace(/[;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

export type CalendarEvent = { title: string; startAt: Date | string; endAt?: Date | string | null; location?: string; details?: string; url: string; uid: string };

/** An event with no end time is shown as one hour long, the usual calendar default. */
function calendarSpan(event: CalendarEvent) {
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end };
}

/** A one-event .ics file. Times are written in UTC, so every calendar shows the right local hour. */
export function eventIcs(event: CalendarEvent, now = new Date()): string {
  const { start, end } = calendarSpan(event);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//heyitsme//Event//EN",
    "BEGIN:VEVENT",
    `UID:${event.uid}@heyitsme.fyi`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${icsText(event.title)}`,
    event.location ? `LOCATION:${icsText(event.location)}` : "",
    `DESCRIPTION:${icsText([event.details, event.url].filter(Boolean).join("\n\n"))}`,
    `URL:${event.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

export function googleCalendarLink(event: CalendarEvent): string {
  const { start, end } = calendarSpan(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: [event.details, event.url].filter(Boolean).join("\n\n").slice(0, 1200),
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export type Countdown = { state: "before"; days: number; hours: number; minutes: number; seconds: number } | { state: "live" } | { state: "over" };

/** Time left before the start. "live" between start and end (or for 3 hours when no end is set), then "over". */
export function eventCountdown(startAt: Date | string | null | undefined, endAt: Date | string | null | undefined, now: number): Countdown | null {
  if (!startAt) return null;
  const start = new Date(startAt).getTime();
  const end = endAt ? new Date(endAt).getTime() : start + 3 * 60 * 60 * 1000;
  if (Number.isNaN(start)) return null;
  if (now >= end) return { state: "over" };
  if (now >= start) return { state: "live" };
  const left = Math.floor((start - now) / 1000);
  return { state: "before", days: Math.floor(left / 86400), hours: Math.floor((left % 86400) / 3600), minutes: Math.floor((left % 3600) / 60), seconds: left % 60 };
}
