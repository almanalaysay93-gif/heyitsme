// Team events: a simple event page with an RSVP form. Shared so the form the browser shows and the checks the
// server runs can never drift apart. The server's answer is the one that counts.

export const EVENT_STATUSES = ["draft", "published", "closed", "ended", "archived"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "RSVPs closed",
  ended: "Ended",
  archived: "Archived",
};
/** Statuses whose page the public can open. Drafts and archived events are hidden. */
export const PUBLIC_EVENT_STATUSES: readonly EventStatus[] = ["published", "closed", "ended"];

export const RSVP_STATUSES = ["attending", "maybe", "not_attending"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];
export const RSVP_STATUS_LABELS: Record<RsvpStatus, string> = { attending: "Attending", maybe: "Maybe", not_attending: "Not attending" };

export const EVENT_FIELD_TYPES = ["short_text", "long_text", "email", "phone", "number", "single_select", "multi_select", "radio", "checkbox", "yes_no", "date"] as const;
export type EventFieldType = (typeof EVENT_FIELD_TYPES)[number];
export const EVENT_FIELD_TYPE_LABELS: Record<EventFieldType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  email: "Email",
  phone: "Phone",
  number: "Number",
  single_select: "Pick one from a list",
  multi_select: "Pick several",
  radio: "Pick one (buttons)",
  checkbox: "Tick box",
  yes_no: "Yes or no",
  date: "Date",
};
export const CHOICE_FIELD_TYPES: readonly EventFieldType[] = ["single_select", "multi_select", "radio"];

/** How a question appears on the form. */
export const EVENT_FIELD_MODES = ["required", "optional", "hidden"] as const;
export type EventFieldMode = (typeof EVENT_FIELD_MODES)[number];

/** The ready-made questions every event starts with. The name is always asked: a response needs a person. */
export const STANDARD_EVENT_FIELDS = [
  { key: "fullName", label: "Full name", fieldType: "short_text", mode: "required" },
  { key: "email", label: "Email", fieldType: "email", mode: "required" },
  { key: "mobile", label: "Mobile number", fieldType: "phone", mode: "optional" },
  { key: "company", label: "Company", fieldType: "short_text", mode: "hidden" },
  { key: "organization", label: "Organization", fieldType: "short_text", mode: "hidden" },
  { key: "jobTitle", label: "Job title", fieldType: "short_text", mode: "hidden" },
  { key: "guests", label: "Number of guests", fieldType: "number", mode: "hidden" },
  { key: "guestNames", label: "Guest names", fieldType: "long_text", mode: "hidden" },
  { key: "dietary", label: "Dietary restrictions", fieldType: "long_text", mode: "hidden" },
  { key: "address", label: "Address", fieldType: "long_text", mode: "hidden" },
  { key: "attendanceType", label: "Attendance type", fieldType: "single_select", mode: "hidden", options: ["In person", "Online"] },
] as const satisfies readonly { key: string; label: string; fieldType: EventFieldType; mode: EventFieldMode; options?: readonly string[] }[];

export const EVENT_FONTS = ["modern", "classic", "friendly"] as const;
export type EventFont = (typeof EVENT_FONTS)[number];
export const EVENT_FONT_LABELS: Record<EventFont, string> = { modern: "Modern", classic: "Classic", friendly: "Friendly" };
export type EventDesign = { background?: string; button?: string; font?: EventFont };

export const MAX_EVENTS = 100;
export const MAX_EVENT_FIELDS = 40;
export const MAX_FIELD_OPTIONS = 30;
export const MAX_EVENT_RSVPS = 5000;
export const MAX_RSVP_GUESTS = 20;
export const SHORT_ANSWER_MAX = 200;
export const LONG_ANSWER_MAX = 2000;

export type EventFieldShape = { label: string; fieldType: string; required: boolean; options: string[] | null; standardKey?: string | null };
export type AnswerValue = string | number | boolean | string[];

// Control characters have no place in an answer. Tabs and line breaks stay.
const clean = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+()\-.\s]{5,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks one answer against its question. `value: null` means "left empty". With `enforceRequired` off an empty
 * answer is always accepted, which is what a team admin editing a response gets.
 */
export function readAnswer(field: EventFieldShape, raw: unknown, enforceRequired = true): { ok: true; value: AnswerValue | null } | { ok: false; message: string } {
  const bad = (message: string) => ({ ok: false as const, message });
  const empty = raw === undefined || raw === null || raw === "" || raw === false || (Array.isArray(raw) && raw.length === 0) || (typeof raw === "string" && clean(raw) === "");
  if (empty) return field.required && enforceRequired ? bad(`${field.label} is required.`) : { ok: true, value: null };
  const options = field.options ?? [];
  const text = typeof raw === "string" ? clean(raw) : null;
  switch (field.fieldType as EventFieldType) {
    case "short_text":
      if (text === null || text.length > SHORT_ANSWER_MAX) return bad(`${field.label} is too long.`);
      return { ok: true, value: text };
    case "long_text":
      if (text === null || text.length > LONG_ANSWER_MAX) return bad(`${field.label} is too long.`);
      return { ok: true, value: text };
    case "email":
      if (text === null || text.length > 320 || !EMAIL.test(text)) return bad(`${field.label} needs a valid email address.`);
      return { ok: true, value: text.toLowerCase() };
    case "phone":
      if (text === null || !PHONE.test(text)) return bad(`${field.label} needs a valid phone number.`);
      return { ok: true, value: text };
    case "number": {
      const value = typeof raw === "number" ? raw : text !== null && text !== "" ? Number(text) : NaN;
      if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000) return bad(`${field.label} needs a number.`);
      if (field.standardKey === "guests" && (!Number.isInteger(value) || value < 0 || value > MAX_RSVP_GUESTS)) {
        return bad(`${field.label} must be between 0 and ${MAX_RSVP_GUESTS}.`);
      }
      return { ok: true, value };
    }
    case "single_select":
    case "radio":
      if (text === null || !options.includes(text)) return bad(`Choose one of the options for ${field.label}.`);
      return { ok: true, value: text };
    case "multi_select": {
      if (!Array.isArray(raw) || raw.some(item => typeof item !== "string" || !options.includes(item))) return bad(`Choose from the options for ${field.label}.`);
      return { ok: true, value: Array.from(new Set(raw as string[])) };
    }
    case "checkbox":
      if (raw !== true) return bad(`${field.label} needs a tick or no tick.`);
      return { ok: true, value: true };
    case "yes_no":
      if (text !== "yes" && text !== "no") return bad(`Answer yes or no for ${field.label}.`);
      return { ok: true, value: text };
    case "date":
      if (text === null || !DAY.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) return bad(`${field.label} needs a date.`);
      return { ok: true, value: text };
    default:
      return bad(`${field.label} cannot be answered.`);
  }
}

/** An answer as plain text, for tables and spreadsheets. */
export function answerText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (value === true) return "Yes";
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  return String(value);
}

// Event times are typed and shown as clock time at the venue: the team's time zone, not the reader's.
const safeZone = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
};

function zoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date);
  const part = (type: string) => Number(parts.find(candidate => candidate.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")) - Math.floor(date.getTime() / 1000) * 1000;
}

export const WALL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** "2026-10-25T18:00" on the clock in `timeZone`, as a moment in time. */
export function wallToInstant(wall: string, timeZone: string): Date {
  const zone = safeZone(timeZone);
  const guess = new Date(`${wall}:00Z`);
  const first = new Date(guess.getTime() - zoneOffsetMs(guess, zone));
  return new Date(guess.getTime() - zoneOffsetMs(first, zone));
}

/** A moment in time as "YYYY-MM-DDTHH:mm" on the clock in `timeZone`. */
export function instantToWall(date: Date | string, timeZone: string): string {
  const moment = new Date(date);
  return new Date(moment.getTime() + zoneOffsetMs(moment, safeZone(timeZone))).toISOString().slice(0, 16);
}

export function formatEventTime(date: Date | string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: safeZone(timeZone) }).format(new Date(date));
}
