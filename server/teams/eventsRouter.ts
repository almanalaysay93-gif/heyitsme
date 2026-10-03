// Team events: an event page, an RSVP form the team builds, and the responses. Admins run events; the public
// sees the event and the form, never who answered.
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { customAlphabet, nanoid } from "nanoid";
import { z } from "zod";
import {
  CHOICE_FIELD_TYPES,
  EVENT_FIELD_MODES,
  EVENT_FIELD_TYPES,
  EVENT_FONTS,
  EVENT_STATUSES,
  LONG_ANSWER_MAX,
  MAX_EVENTS,
  MAX_EVENT_FIELDS,
  MAX_EVENT_RSVPS,
  MAX_FIELD_OPTIONS,
  PUBLIC_EVENT_STATUSES,
  RSVP_STATUSES,
  RSVP_STATUS_LABELS,
  STANDARD_EVENT_FIELDS,
  WALL_TIME,
  answerText,
  readAnswer,
  wallToInstant,
  type AnswerValue,
  type EventFieldType,
  type EventStatus,
  type RsvpStatus,
} from "@shared/events";
import { isAdminRole } from "@shared/teams";
import { workspaceEventFields, workspaceEventRsvpAnswers, workspaceEventRsvps, workspaceEvents, workspaces } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { clientIp } from "../_core/rateLimit";
import { publicProcedure, router } from "../_core/trpc";
import type { Db } from "../billing/service";
import { csvCell } from "../proTools";
import { storagePut } from "../storage";
import { canManageEvent, recordAudit, requireWorkspaceMember } from "./access";
import { id, limit, requireDb, teamProcedure } from "./router";

const eventProcedure = teamProcedure("canCreateEvents");

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const MAX_COVER_BASE64 = 4_200_000;
const EVENT_LOCK = 7018;
const newSlug = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 10);

type EventRow = typeof workspaceEvents.$inferSelect;
type FieldRow = typeof workspaceEventFields.$inferSelect;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a color");
const text = (max: number) => z.string().trim().max(max).optional().nullable().transform(value => value || null);
const wall = z
  .string()
  .regex(WALL_TIME, "Choose a date and time.")
  .optional()
  .nullable()
  .transform(value => value || null);
const link = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform(value => value || null)
  .refine(value => value === null || /^https?:\/\/[^\s<>"']+$/i.test(value), "Enter a full link that starts with https://");

const eventFields = {
  title: z.string().trim().min(1, "Give the event a title.").max(160),
  description: text(5000),
  startAt: wall,
  endAt: wall,
  rsvpDeadline: wall,
  venue: text(200),
  address: text(300),
  mapUrl: link,
  organizerName: text(160),
  organizerContact: text(200),
  capacity: z.number().int().min(1).max(100_000).optional().nullable().transform(value => value ?? null),
  allowMaybe: z.boolean().default(true),
  design: z.object({ background: hex.optional(), button: hex.optional(), font: z.enum(EVENT_FONTS).optional() }).default({}),
};
const eventInput = z.object(eventFields);

// What a browser may send as one answer. The real check, against the question itself, is readAnswer.
const answerValue = z.union([z.string().max(LONG_ANSWER_MAX), z.number(), z.boolean(), z.array(z.string().max(200)).max(MAX_FIELD_OPTIONS), z.null()]);
const answersInput = z
  .record(z.string().regex(/^\d{1,9}$/), answerValue)
  .refine(value => Object.keys(value).length <= MAX_EVENT_FIELDS, "Too many answers.");

const bad = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Event not found." });

/** Clock times typed by the admin, turned into moments using the team's time zone. */
function eventValues(input: z.infer<typeof eventInput>, timeZone: string) {
  const moment = (value: string | null) => {
    if (!value) return null;
    const date = wallToInstant(value, timeZone);
    if (Number.isNaN(date.getTime())) throw bad("Choose a real date and time.");
    return date;
  };
  const startAt = moment(input.startAt);
  const endAt = moment(input.endAt);
  if (startAt && endAt && endAt < startAt) throw bad("The event cannot end before it starts.");
  return { ...input, startAt, endAt, rsvpDeadline: moment(input.rsvpDeadline) };
}

/** The event, for a team admin of the workspace it belongs to. Everyone else is turned away. */
async function managedEvent(db: Db, userId: number, workspaceId: number, eventId: number) {
  const access = await requireWorkspaceMember(db, userId, workspaceId);
  if (!isAdminRole(access.member.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Only team admins can do this." });
  const [event] = await db.select().from(workspaceEvents).where(eq(workspaceEvents.id, eventId)).limit(1);
  if (!event || !canManageEvent(access, event)) throw notFound();
  return { access, event };
}

const emptyStats = () => ({ responses: 0, attending: 0, maybe: 0, notAttending: 0, guests: 0, checkedIn: 0 });
type EventStats = ReturnType<typeof emptyStats>;

async function eventStats(db: Db, eventIds: number[]) {
  const stats = new Map<number, EventStats>();
  if (eventIds.length === 0) return stats;
  const rows = await db
    .select({
      eventId: workspaceEventRsvps.eventId,
      responses: sql<number>`count(*)::int`,
      attending: sql<number>`(count(*) filter (where ${workspaceEventRsvps.status} = 'attending'))::int`,
      maybe: sql<number>`(count(*) filter (where ${workspaceEventRsvps.status} = 'maybe'))::int`,
      notAttending: sql<number>`(count(*) filter (where ${workspaceEventRsvps.status} = 'not_attending'))::int`,
      guests: sql<number>`(coalesce(sum(${workspaceEventRsvps.guests}) filter (where ${workspaceEventRsvps.status} = 'attending'), 0))::int`,
      checkedIn: sql<number>`count(${workspaceEventRsvps.checkedInAt})::int`,
    })
    .from(workspaceEventRsvps)
    .where(inArray(workspaceEventRsvps.eventId, eventIds))
    .groupBy(workspaceEventRsvps.eventId);
  for (const { eventId, ...row } of rows) stats.set(eventId, row);
  return stats;
}

/** Places taken: everyone attending, plus the guests they bring. */
const seatsTaken = (stats: EventStats | undefined) => (stats ? stats.attending + stats.guests : 0);

/** Whether the form takes responses right now. "full" still takes "maybe" and "not attending". */
function rsvpState(event: EventRow, seats: number, now = new Date()): "open" | "full" | "closed" | "ended" {
  if (event.status === "ended" || (event.endAt && event.endAt < now)) return "ended";
  if (event.status !== "published") return "closed";
  if (event.rsvpDeadline && event.rsvpDeadline < now) return "closed";
  if (event.capacity !== null && seats >= event.capacity) return "full";
  return "open";
}

const fieldsOf = (db: Db, eventId: number) =>
  db.select().from(workspaceEventFields).where(eq(workspaceEventFields.eventId, eventId)).orderBy(asc(workspaceEventFields.sortOrder), asc(workspaceEventFields.id));

/**
 * Checks a set of answers against the questions the server holds for this event. The browser only names
 * questions by number; a number that is not one of this event's questions is refused, never looked up.
 */
function collectAnswers(fields: FieldRow[], answers: Record<string, unknown>, enforceRequired: boolean) {
  const known = new Set(fields.map(field => String(field.id)));
  if (Object.keys(answers).some(key => !known.has(key))) throw bad("This form has changed. Reload the page and try again.");
  const values: { fieldId: number; value: AnswerValue }[] = [];
  let guests = 0;
  for (const field of fields) {
    const result = readAnswer(field, answers[String(field.id)], enforceRequired);
    if (!result.ok) throw bad(result.message);
    if (result.value === null) continue;
    values.push({ fieldId: field.id, value: result.value });
    if (field.standardKey === "guests" && typeof result.value === "number") guests = result.value;
  }
  return { values, guests };
}

async function responsesOf(db: Db, eventId: number) {
  const [rsvps, answers] = await Promise.all([
    db.select().from(workspaceEventRsvps).where(eq(workspaceEventRsvps.eventId, eventId)).orderBy(desc(workspaceEventRsvps.id)),
    db
      .select({ rsvpId: workspaceEventRsvpAnswers.rsvpId, fieldId: workspaceEventRsvpAnswers.fieldId, value: workspaceEventRsvpAnswers.value })
      .from(workspaceEventRsvpAnswers)
      .innerJoin(workspaceEventRsvps, eq(workspaceEventRsvps.id, workspaceEventRsvpAnswers.rsvpId))
      .where(eq(workspaceEventRsvps.eventId, eventId)),
  ]);
  const byRsvp = new Map<number, Record<string, unknown>>();
  for (const answer of answers) {
    const row = byRsvp.get(answer.rsvpId) ?? {};
    row[String(answer.fieldId)] = answer.value;
    byRsvp.set(answer.rsvpId, row);
  }
  return rsvps.map(rsvp => ({ ...rsvp, status: rsvp.status as RsvpStatus, answers: byRsvp.get(rsvp.id) ?? {} }));
}

const rsvpTarget = { workspaceId: id, eventId: id, rsvpId: id };
async function managedRsvp(db: Db, eventId: number, rsvpId: number) {
  const [rsvp] = await db
    .select()
    .from(workspaceEventRsvps)
    .where(and(eq(workspaceEventRsvps.id, rsvpId), eq(workspaceEventRsvps.eventId, eventId)))
    .limit(1);
  if (!rsvp) throw new TRPCError({ code: "NOT_FOUND", message: "Response not found." });
  return rsvp;
}

export const teamEventsRouter = router({
  /** Admins see every event with its numbers. Members see the events that are public anyway. */
  list: eventProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const access = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    const admin = isAdminRole(access.member.role);
    const rows = await db
      .select()
      .from(workspaceEvents)
      .where(
        admin
          ? eq(workspaceEvents.workspaceId, input.workspaceId)
          : and(eq(workspaceEvents.workspaceId, input.workspaceId), inArray(workspaceEvents.status, [...PUBLIC_EVENT_STATUSES]))
      )
      .orderBy(desc(workspaceEvents.id));
    const stats = admin ? await eventStats(db, rows.map(row => row.id)) : new Map<number, EventStats>();
    return {
      canManage: admin,
      timezone: access.workspace.timezone,
      events: rows.map(row => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        status: row.status as EventStatus,
        startAt: row.startAt,
        venue: row.venue,
        stats: admin ? (stats.get(row.id) ?? emptyStats()) : null,
      })),
    };
  }),

  get: eventProcedure.input(z.object({ workspaceId: id, eventId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const { access, event } = await managedEvent(db, ctx.user.id, input.workspaceId, input.eventId);
    const [fields, stats] = await Promise.all([fieldsOf(db, event.id), eventStats(db, [event.id])]);
    const numbers = stats.get(event.id) ?? emptyStats();
    return {
      event: { ...event, status: event.status as EventStatus },
      timezone: access.workspace.timezone,
      fields,
      stats: numbers,
      rsvpState: rsvpState(event, seatsTaken(numbers)),
    };
  }),

  create: eventProcedure.input(z.object({ workspaceId: id, ...eventFields })).mutation(async ({ ctx, input }) => {
    await limit("team-event-create", `user:${ctx.user.id}`, 20, HOUR);
    const db = await requireDb();
    const access = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    if (!isAdminRole(access.member.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Only team admins can do this." });
    const { workspaceId, ...rest } = input;
    const values = eventValues(rest, access.workspace.timezone);
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(${EVENT_LOCK}, ${workspaceId})`);
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(workspaceEvents).where(eq(workspaceEvents.workspaceId, workspaceId));
      if (count >= MAX_EVENTS) throw bad(`A team can have up to ${MAX_EVENTS} events.`);
      const [event] = await tx.insert(workspaceEvents).values({ ...values, workspaceId, createdBy: ctx.user.id, slug: newSlug() }).returning();
      await tx.insert(workspaceEventFields).values(
        STANDARD_EVENT_FIELDS.map((field, index) => ({
          eventId: event.id,
          standardKey: field.key,
          label: field.label,
          fieldType: field.fieldType,
          required: field.mode === "required",
          enabled: field.mode !== "hidden",
          sortOrder: index,
          options: "options" in field ? [...field.options] : null,
        }))
      );
      await recordAudit(tx, { workspaceId, actorUserId: ctx.user.id, action: "event.created", entityType: "event", entityId: event.id, metadata: { title: event.title } });
      return { id: event.id, slug: event.slug };
    });
  }),

  update: eventProcedure.input(z.object({ workspaceId: id, eventId: id, ...eventFields })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const { access, event } = await managedEvent(db, ctx.user.id, input.workspaceId, input.eventId);
    const { workspaceId, eventId, ...rest } = input;
    const values = eventValues(rest, access.workspace.timezone);
    await db.transaction(async tx => {
      await tx.update(workspaceEvents).set({ ...values, updatedAt: new Date() }).where(eq(workspaceEvents.id, event.id));
      await recordAudit(tx, { workspaceId, actorUserId: ctx.user.id, action: "event.updated", entityType: "event", entityId: eventId, metadata: { title: values.title } });
    });
    return { ok: true };
  }),

  setStatus: eventProcedure.input(z.object({ workspaceId: id, eventId: id, status: z.enum(EVENT_STATUSES) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const { event } = await managedEvent(db, ctx.user.id, input.workspaceId, input.eventId);
    if (input.status === "published" && !event.startAt) throw bad("Add a start date and time before you publish.");
    await db.transaction(async tx => {
      await tx.update(workspaceEvents).set({ status: input.status, updatedAt: new Date() }).where(eq(workspaceEvents.id, event.id));
      await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: `event.${input.status}`, entityType: "event", entityId: event.id, metadata: { title: event.title } });
    });
    return { status: input.status };
  }),

  /**
   * The whole RSVP form, in order. Ready-made questions can be required, optional or hidden. Own questions can
   * also be renamed and removed; one that already has answers is hidden instead, so no answer is lost.
   */
  saveFields: eventProcedure
    .input(
      z.object({
        workspaceId: id,
        eventId: id,
        fields: z
          .array(
            z.object({
              id: id.optional(),
              label: z.string().trim().min(1, "Every question needs a name.").max(160),
              fieldType: z.enum(EVENT_FIELD_TYPES),
              mode: z.enum(EVENT_FIELD_MODES),
              options: z.array(z.string().trim().min(1).max(100)).max(MAX_FIELD_OPTIONS).optional(),
            })
          )
          .max(MAX_EVENT_FIELDS),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { event } = await managedEvent(db, ctx.user.id, input.workspaceId, input.eventId);
      const choices = (type: string, options: string[] | undefined, label: string) => {
        if (!CHOICE_FIELD_TYPES.includes(type as EventFieldType)) return null;
        const unique = Array.from(new Set(options ?? []));
        if (unique.length < 2) throw bad(`Add at least two options to "${label}".`);
        return unique;
      };
      await db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(${EVENT_LOCK}, ${event.workspaceId})`);
        const existing = await fieldsOf(tx, event.id);
        const byId = new Map(existing.map(field => [field.id, field]));
        const sent = new Set<number>();
        for (const field of input.fields) {
          if (field.id === undefined) continue;
          // A question number from the browser counts only if it is one of this event's questions.
          if (!byId.has(field.id) || sent.has(field.id)) throw bad("That question does not belong to this event.");
          sent.add(field.id);
        }
        const dropped = existing.filter(field => !field.standardKey && !sent.has(field.id));
        if (existing.length - dropped.length + input.fields.filter(field => field.id === undefined).length > MAX_EVENT_FIELDS) {
          throw bad(`A form can have up to ${MAX_EVENT_FIELDS} questions.`);
        }
        for (let index = 0; index < input.fields.length; index++) {
          const field = input.fields[index];
          const current = field.id === undefined ? null : byId.get(field.id)!;
          const mode = current?.standardKey === "fullName" ? "required" : field.mode;
          const shared = { required: mode === "required", enabled: mode !== "hidden", sortOrder: index };
          if (!current) {
            await tx.insert(workspaceEventFields).values({ ...shared, eventId: event.id, label: field.label, fieldType: field.fieldType, options: choices(field.fieldType, field.options, field.label) });
          } else if (current.standardKey) {
            // Ready-made questions keep their name and kind. Only a list of choices can be changed.
            const options = current.options ? choices(current.fieldType, field.options ?? current.options, current.label) : null;
            await tx.update(workspaceEventFields).set({ ...shared, options }).where(eq(workspaceEventFields.id, current.id));
          } else {
            await tx
              .update(workspaceEventFields)
              .set({ ...shared, label: field.label, options: choices(current.fieldType, field.options, field.label) })
              .where(eq(workspaceEventFields.id, current.id));
          }
        }
        if (dropped.length) {
          const ids = dropped.map(field => field.id);
          const answered = await tx.selectDistinct({ fieldId: workspaceEventRsvpAnswers.fieldId }).from(workspaceEventRsvpAnswers).where(inArray(workspaceEventRsvpAnswers.fieldId, ids));
          const keep = new Set(answered.map(row => row.fieldId));
          const hide = ids.filter(fieldId => keep.has(fieldId));
          const remove = ids.filter(fieldId => !keep.has(fieldId));
          if (hide.length) await tx.update(workspaceEventFields).set({ enabled: false, required: false, sortOrder: 1000 }).where(inArray(workspaceEventFields.id, hide));
          if (remove.length) await tx.delete(workspaceEventFields).where(inArray(workspaceEventFields.id, remove));
        }
        await tx.update(workspaceEvents).set({ updatedAt: new Date() }).where(eq(workspaceEvents.id, event.id));
        await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "event.form_changed", entityType: "event", entityId: event.id, metadata: { title: event.title } });
      });
      return { fields: await fieldsOf(db, event.id) };
    }),

  uploadCover: eventProcedure
    .input(
      z.object({
        workspaceId: id,
        eventId: id,
        fileName: z.string().min(1).max(180),
        contentType: z.string().min(1).max(120),
        dataBase64: z.string().min(1).max(MAX_COVER_BASE64, "Image is larger than 3MB. Upload a smaller one."),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await limit("team-event-cover", `user:${ctx.user.id}`, 20, 10 * MINUTE);
      const db = await requireDb();
      const { event } = await managedEvent(db, ctx.user.id, input.workspaceId, input.eventId);
      // Loaded on use: the upload checks live beside the personal upload route, which itself mounts this router.
      const { confirmUploadType, resolveUploadType } = await import("../routers");
      const declared = resolveUploadType(input.fileName, input.contentType);
      const bytes = Buffer.from(input.dataBase64, "base64");
      const contentType = declared ? confirmUploadType(bytes, declared) : null;
      if (!contentType || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
        throw bad("Use a JPG, PNG or WebP image for the banner.");
      }
      let stored: { url: string };
      try {
        stored = await storagePut(`team-${input.workspaceId}/event-${event.id}-${nanoid(8)}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-")}`, bytes, contentType);
      } catch (error) {
        console.error("[Teams] event banner upload failed:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not save the image right now. Please try again in a moment." });
      }
      await db.update(workspaceEvents).set({ coverImageUrl: stored.url, updatedAt: new Date() }).where(eq(workspaceEvents.id, event.id));
      return { coverImageUrl: stored.url };
    }),

  removeCover: eventProcedure.input(z.object({ workspaceId: id, eventId: id })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const { event } = await managedEvent(db, ctx.user.id, input.workspaceId, input.eventId);
    await db.update(workspaceEvents).set({ coverImageUrl: null, updatedAt: new Date() }).where(eq(workspaceEvents.id, event.id));
    return { ok: true };
  }),

  /** The responses, with every question as a column. Admins only. */
  rsvps: eventProcedure
    .input(
      z.object({
        workspaceId: id,
        eventId: id,
        search: z.string().trim().max(100).optional(),
        status: z.enum(RSVP_STATUSES).optional(),
        checkedIn: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const { event } = await managedEvent(db, ctx.user.id, input.workspaceId, input.eventId);
      const [fields, all] = await Promise.all([fieldsOf(db, event.id), responsesOf(db, event.id)]);
      const needle = input.search?.toLowerCase();
      const rows = all.filter(
        row =>
          (!input.status || row.status === input.status) &&
          (input.checkedIn === undefined || Boolean(row.checkedInAt) === input.checkedIn) &&
          (!needle || Object.values(row.answers).some(value => answerText(value).toLowerCase().includes(needle)))
      );
      const answeredFields = new Set(all.flatMap(row => Object.keys(row.answers)));
      return {
        // Hidden questions stay as columns while they still hold answers.
        fields: fields.filter(field => field.enabled || answeredFields.has(String(field.id))),
        total: all.length,
        rows,
      };
    }),

  updateRsvp: eventProcedure
    .input(z.object({ ...rsvpTarget, status: z.enum(RSVP_STATUSES), answers: answersInput }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { event } = await managedEvent(db, ctx.user.id, input.workspaceId, input.eventId);
      const rsvp = await managedRsvp(db, event.id, input.rsvpId);
      const { values, guests } = collectAnswers(await fieldsOf(db, event.id), input.answers, false);
      await db.transaction(async tx => {
        await tx.delete(workspaceEventRsvpAnswers).where(eq(workspaceEventRsvpAnswers.rsvpId, rsvp.id));
        if (values.length) await tx.insert(workspaceEventRsvpAnswers).values(values.map(value => ({ ...value, rsvpId: rsvp.id })));
        await tx.update(workspaceEventRsvps).set({ status: input.status, guests, updatedAt: new Date() }).where(eq(workspaceEventRsvps.id, rsvp.id));
        await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "event.rsvp_edited", entityType: "event", entityId: event.id, metadata: { title: event.title } });
      });
      return { ok: true };
    }),

  deleteRsvp: eventProcedure.input(z.object(rsvpTarget)).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const { event } = await managedEvent(db, ctx.user.id, input.workspaceId, input.eventId);
    const rsvp = await managedRsvp(db, event.id, input.rsvpId);
    await db.transaction(async tx => {
      await tx.delete(workspaceEventRsvpAnswers).where(eq(workspaceEventRsvpAnswers.rsvpId, rsvp.id));
      await tx.delete(workspaceEventRsvps).where(eq(workspaceEventRsvps.id, rsvp.id));
      await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "event.rsvp_deleted", entityType: "event", entityId: event.id, metadata: { title: event.title } });
    });
    return { ok: true };
  }),

  checkIn: eventProcedure.input(z.object({ ...rsvpTarget, checkedIn: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const { event } = await managedEvent(db, ctx.user.id, input.workspaceId, input.eventId);
    const rsvp = await managedRsvp(db, event.id, input.rsvpId);
    const checkedInAt = input.checkedIn ? (rsvp.checkedInAt ?? new Date()) : null;
    await db
      .update(workspaceEventRsvps)
      .set({ checkedInAt, checkedInBy: input.checkedIn ? (rsvp.checkedInBy ?? ctx.user.id) : null })
      .where(eq(workspaceEventRsvps.id, rsvp.id));
    return { checkedInAt };
  }),

  exportCsv: teamProcedure("canCreateEvents", { afterPlanEnd: true }).input(z.object({ workspaceId: id, eventId: id })).mutation(async ({ ctx, input }) => {
    await limit("team-event-export", `user:${ctx.user.id}`, 20, HOUR);
    const db = await requireDb();
    const { event } = await managedEvent(db, ctx.user.id, input.workspaceId, input.eventId);
    const [fields, rows] = await Promise.all([fieldsOf(db, event.id), responsesOf(db, event.id)]);
    const header = ["Response", "Sent", "Checked in", ...fields.map(field => field.label)];
    const lines = rows.map(row =>
      [
        RSVP_STATUS_LABELS[row.status] ?? row.status,
        row.submittedAt.toISOString(),
        row.checkedInAt ? row.checkedInAt.toISOString() : "",
        ...fields.map(field => answerText(row.answers[String(field.id)])),
      ]
        .map(csvCell)
        .join(",")
    );
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "event.exported", entityType: "event", entityId: event.id, metadata: { title: event.title, count: rows.length } });
    return { csv: [header.map(csvCell).join(","), ...lines].join("\r\n"), count: rows.length };
  }),
});

/** The published event behind a link, or nothing. Drafts, archived events and deleted teams all look the same. */
async function publicEvent(db: Db, slug: string) {
  if (!ENV.teamsEnabled) throw notFound();
  const [row] = await db
    .select({ event: workspaceEvents, workspace: workspaces })
    .from(workspaceEvents)
    .innerJoin(workspaces, eq(workspaces.id, workspaceEvents.workspaceId))
    .where(and(eq(workspaceEvents.slug, slug), inArray(workspaceEvents.status, [...PUBLIC_EVENT_STATUSES]), isNull(workspaces.deletedAt)))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

const slugInput = z.string().regex(/^[a-z0-9]{6,40}$/);

export const publicEventRouter = router({
  /** What a visitor sees: the event and the form. Never the people who answered, nor how many. */
  get: publicProcedure.input(z.object({ slug: slugInput })).query(async ({ ctx, input }) => {
    await limit("event-view", clientIp(ctx.req), 120, MINUTE);
    const db = await requireDb();
    const { event, workspace } = await publicEvent(db, input.slug);
    const [fields, stats] = await Promise.all([fieldsOf(db, event.id), eventStats(db, [event.id])]);
    return {
      slug: event.slug,
      title: event.title,
      description: event.description,
      coverImageUrl: event.coverImageUrl,
      startAt: event.startAt,
      endAt: event.endAt,
      rsvpDeadline: event.rsvpDeadline,
      venue: event.venue,
      address: event.address,
      mapUrl: event.mapUrl,
      organizerName: event.organizerName,
      organizerContact: event.organizerContact,
      allowMaybe: event.allowMaybe,
      design: event.design ?? {},
      timezone: workspace.timezone,
      company: { name: workspace.name, logoUrl: workspace.logoUrl, colors: workspace.brandColors ?? null },
      rsvpState: rsvpState(event, seatsTaken(stats.get(event.id))),
      fields: fields
        .filter(field => field.enabled)
        .map(field => ({ id: field.id, label: field.label, fieldType: field.fieldType as EventFieldType, required: field.required, options: field.options, standardKey: field.standardKey })),
    };
  }),

  rsvp: publicProcedure
    .input(
      z.object({
        slug: slugInput,
        status: z.enum(RSVP_STATUSES),
        answers: answersInput,
        // Honeypot: real visitors never see or fill this.
        website: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await limit("event-rsvp", clientIp(ctx.req), 10, 10 * MINUTE);
      if (input.website) return { ok: true };
      await limit("event-rsvp-total", `event:${input.slug}`, 600, HOUR);
      const db = await requireDb();
      const { event } = await publicEvent(db, input.slug);
      const state = rsvpState(event, 0);
      if (state === "ended") throw bad("This event has ended.");
      if (state === "closed") throw bad("RSVP registration has closed.");
      if (input.status === "maybe" && !event.allowMaybe) throw bad("Choose attending or not attending.");
      // Only the questions this event shows count. Anything else the browser names is refused.
      const fields = (await fieldsOf(db, event.id)).filter(field => field.enabled);
      const { values, guests } = collectAnswers(fields, input.answers, true);
      await db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(${EVENT_LOCK}, ${event.id})`);
        const numbers = (await eventStats(tx, [event.id])).get(event.id) ?? emptyStats();
        if (numbers.responses >= MAX_EVENT_RSVPS) throw bad("RSVP registration has closed.");
        if (input.status === "attending" && event.capacity !== null) {
          const left = event.capacity - seatsTaken(numbers);
          if (left <= 0) throw bad("Registration is full.");
          if (1 + guests > left) throw bad(left === 1 ? "Only 1 place is left." : `Only ${left} places are left.`);
        }
        const [rsvp] = await tx.insert(workspaceEventRsvps).values({ eventId: event.id, status: input.status, guests }).returning({ id: workspaceEventRsvps.id });
        if (values.length) await tx.insert(workspaceEventRsvpAnswers).values(values.map(value => ({ ...value, rsvpId: rsvp.id })));
      });
      return { ok: true };
    }),
});
