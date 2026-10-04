import { isContactLink } from "./contactLink";
import { EVENT_FONTS, type EventDesign } from "./events";
import { contrastRatio, readableOn } from "./pageConfig";
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

/** How the page is drawn: frosted glass panels over a moving backdrop, or flat panels with plain outlines. */
export const EVENT_STYLES = ["glass", "flat"] as const;
export type EventStyle = (typeof EVENT_STYLES)[number];
export const EVENT_STYLE_LABELS: Record<EventStyle, string> = { glass: "Glass", flat: "Two-dimensional" };

/** How much the page moves. A visitor who asks their device for less motion always gets the still page. */
export const EVENT_MOTIONS = ["full", "calm", "off"] as const;
export type EventMotion = (typeof EVENT_MOTIONS)[number];
export const EVENT_MOTION_LABELS: Record<EventMotion, string> = { full: "Lively", calm: "Calm", off: "Still" };

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

/** A #rrggbb color, or empty for "not set". */
const color = (what: string) => z.string().trim().regex(/^(#[0-9a-fA-F]{6})?$/, `${what} must be a #rrggbb color`).optional().default("");

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
  /** A photo behind the whole page, under a veil of the theme's paper color. Empty means the theme's own background. */
  backgroundUrl: image,
  style: z.enum(EVENT_STYLES).optional().default("glass"),
  motion: z.enum(EVENT_MOTIONS).optional().default("full"),
  /** The admin's own colors. An empty one follows the theme. Unreadable pairs are not shown as picked (see eventLook). */
  colors: z
    .object({ background: color("Background"), text: color("Text"), button: color("Button"), buttonText: color("Button text") })
    .prefault({}),
  /** The look of the QR code on the Share tab. An empty frame means the team's brand color (see eventQr). */
  qr: z
    .object({ dots: color("QR dots"), background: color("QR background"), frame: color("QR frame"), rounded: z.boolean().optional().default(false) })
    .prefault({}),
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

const READABLE = 4.5;
// Near-black or white, whichever reads better. A mid-tone where neither reaches 4.5:1 gets pure black, which always does.
const inkOn = (hex: string): string => (contrastRatio(readableOn(hex), hex) >= READABLE ? readableOn(hex) : "#000000");

export type EventLook = {
  /** The theme the page is drawn in. An own background that is dark on a light theme (or the reverse) switches it. */
  theme: EventTheme;
  paper: string;
  ink: string;
  accent: string;
  onAccent: string;
  /** The accent when it can be read as text on the page, else the ink. */
  accentText: string;
  button: string;
  onButton: string;
  ownPaper: boolean;
  ownInk: boolean;
  /** What the page changed to stay readable, in words for the admin. Empty when every chosen color is used as picked. */
  notes: string[];
};

/**
 * The colors the page shows. The admin's own colors win where they can be read: text needs 4.5:1 on the background
 * and on the panels over it, and button text needs 4.5:1 on the button. A color that fails is replaced, never shown.
 */
export function eventLook(page: Pick<EventPage, "theme" | "accent" | "colors">, brandColor?: string | null): EventLook {
  const accent = eventAccent(page, brandColor);
  const notes: string[] = [];
  const ownPaper = Boolean(page.colors.background);
  let theme = page.theme;
  let { paper, ink } = EVENT_PALETTES[theme];
  if (ownPaper) {
    paper = page.colors.background;
    const dark = contrastRatio(paper, "#ffffff") >= contrastRatio(paper, "#000000");
    if (dark !== (theme === "midnight")) theme = dark ? "midnight" : "tide";
    ink = EVENT_PALETTES[theme].ink;
    if (contrastRatio(ink, paper) < READABLE) ink = dark ? "#ffffff" : "#000000";
  }
  // Light panels sit between the background and white, so text there has to read on both ends.
  const reads = (value: string) => Math.min(contrastRatio(value, paper), theme === "midnight" ? 21 : contrastRatio(value, "#ffffff")) >= READABLE;
  let ownInk = ink !== EVENT_PALETTES[theme].ink;
  if (page.colors.text) {
    if (reads(page.colors.text)) {
      ink = page.colors.text;
      ownInk = true;
    } else notes.push("That text color is hard to read on this background, so the page uses a readable one.");
  }
  const button = page.colors.button || accent;
  let onButton = inkOn(button);
  if (page.colors.buttonText) {
    if (contrastRatio(page.colors.buttonText, button) >= READABLE) onButton = page.colors.buttonText;
    else notes.push("That button text is hard to read on the button color, so the page uses a readable one.");
  }
  return { theme, paper, ink, accent, onAccent: inkOn(accent), accentText: reads(accent) ? accent : ink, button, onButton, ownPaper, ownInk, notes };
}

/**
 * True when a save picks colors or a QR look the saved page did not have. Leaving them as saved, or going back to
 * the standard ones, is not: a team that loses event styling keeps what it has and can still reset it.
 */
export function eventStylingAdded(saved: Pick<EventPage, "colors" | "qr">, next: Pick<EventPage, "colors" | "qr">): boolean {
  const added = <T extends Record<string, string | boolean>>(before: T, after: T) =>
    Object.keys(after).some(key => Boolean(after[key]) && after[key] !== before[key]);
  return added(saved.colors, next.colors) || added(saved.qr, next.qr);
}

export const EVENT_QR_COLORS = { dots: "#111827", background: "#ffffff", frame: "#234bad" } as const;
export type EventQrStyle = { dots: string; background: string; frame: string; rounded: boolean; note: string | null };

/**
 * The QR code's colors. Phone cameras need dark dots on a light background with strong contrast,
 * so a pair that fails goes back to black on white rather than making a code nobody can scan.
 */
export function eventQr(page: Pick<EventPage, "qr">, brandColor?: string | null): EventQrStyle {
  const dots = page.qr.dots || EVENT_QR_COLORS.dots;
  const background = page.qr.background || EVENT_QR_COLORS.background;
  const frame = page.qr.frame || (brandColor && HEX.test(brandColor) ? brandColor : EVENT_QR_COLORS.frame);
  const scans = contrastRatio(dots, background) >= READABLE && contrastRatio(dots, "#ffffff") > contrastRatio(background, "#ffffff");
  if (scans) return { dots, background, frame, rounded: page.qr.rounded, note: null };
  return { ...EVENT_QR_COLORS, frame, rounded: page.qr.rounded, note: "Phones need dark dots on a light background, so the code uses black on white." };
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
    page.backgroundUrl,
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
