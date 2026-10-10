import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { instantToWall, wallToInstant } from "@shared/events";
import { users, workspaceAuditLog, workspaceEventRsvps, workspaceEvents } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { createTestDb } from "../billing/testDb";
import { TEAM_EVENTS_SCHEMA_STATEMENTS } from "./schemaSql";

vi.mock("../_core/rateLimit", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/rateLimit")>()),
  rateLimit: vi.fn(async () => ({ allowed: true, count: 1, resetMs: 0 })),
}));
vi.mock("../_core/mail", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/mail")>()),
  sendMail: vi.fn(async () => true),
}));
vi.mock("../uploadSweep", () => ({ tidyOwnerUploads: vi.fn() }));

const { appRouter } = await import("../routers");
const { setTestDb } = await import("../db");

const saved = { ...ENV };
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;

const req = { protocol: "https", headers: {}, ip: "203.0.113.9", get: () => "heyitsme.test", query: {} } as unknown as TrpcContext["req"];
const callerFor = (user: typeof users.$inferSelect | null) => appRouter.createCaller({ user, req, res: {} as TrpcContext["res"] });
const visitor = () => callerFor(null);

let seq = 0;
async function makeUser(email: string, name = email.split("@")[0]) {
  const [row] = await db.insert(users).values({ openId: `e-${++seq}`, email, name }).returning();
  return row;
}

async function makeTeam(name = "Acme") {
  const owner = await makeUser(`owner${++seq}@events.test`, "Olive Owner");
  const workspace = await callerFor(owner).teams.create({ name });
  return { owner, workspace, workspaceId: workspace.id, asOwner: callerFor(owner) };
}
type Team = Awaited<ReturnType<typeof makeTeam>>;

async function join(team: Team, name: string, role: "admin" | "member" = "member") {
  const email = `person${++seq}@events.test`;
  const user = await makeUser(email, name);
  const invite = await team.asOwner.teams.invite({ workspaceId: team.workspaceId, email, role });
  await callerFor(user).teams.acceptInvite({ token: invite.inviteUrl.split("/").pop()! });
  return { user, memberId: invite.memberId, as: callerFor(user) };
}

type EventExtra = { capacity?: number; allowMaybe?: boolean; rsvpDeadline?: string };
/** A published event, with its form. */
async function liveEvent(team: Team, extra: EventExtra = {}) {
  const created = await team.asOwner.teamEvents.create({ workspaceId: team.workspaceId, title: "Launch night", startAt: "2030-01-10T18:00", venue: "The Loft", ...extra });
  await team.asOwner.teamEvents.setStatus({ workspaceId: team.workspaceId, eventId: created.id, status: "published" });
  return { ...created, target: { workspaceId: team.workspaceId, eventId: created.id } };
}
type LiveEvent = Awaited<ReturnType<typeof liveEvent>>;

/** Changes how ready-made questions appear, the way the form builder does. */
async function setModes(team: Team, event: LiveEvent, modes: Record<string, "required" | "optional" | "hidden">) {
  const { fields } = await team.asOwner.teamEvents.get(event.target);
  await team.asOwner.teamEvents.saveFields({
    ...event.target,
    fields: fields.map(field => ({
      id: field.id,
      label: field.label,
      fieldType: field.fieldType as "short_text",
      mode: modes[field.standardKey ?? ""] ?? (!field.enabled ? "hidden" : field.required ? "required" : "optional"),
      options: field.options ?? undefined,
    })),
  });
}

/** Answers keyed the way the browser sends them: by question number. */
async function answers(event: LiveEvent, byKey: Record<string, string | number | boolean | string[]>) {
  const page = await visitor().publicEvent.get({ slug: event.slug });
  return Object.fromEntries(
    Object.entries(byKey).map(([key, value]) => {
      const field = page.fields.find(candidate => candidate.standardKey === key || candidate.label === key);
      if (!field) throw new Error(`No question ${key}`);
      return [String(field.id), value];
    })
  );
}

async function respond(event: LiveEvent, name: string, status: "attending" | "maybe" | "not_attending" = "attending", more: Record<string, string | number> = {}) {
  return visitor().publicEvent.rsvp({ slug: event.slug, status, answers: await answers(event, { fullName: name, email: `${name.toLowerCase().replace(/\W/g, "")}@guest.test`, ...more }) });
}

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  closeDb = () => created.client.close();
  setTestDb(db);
});
beforeEach(() => Object.assign(ENV, saved, { teamsEnabled: true, siteUrl: "https://heyitsme.test" }));
afterEach(() => Object.assign(ENV, saved));
afterAll(() => closeDb());

describe("team events schema", () => {
  it("ensureSchema runs exactly the statements of drizzle/0018_team_events.sql", () => {
    const file = readFileSync(path.resolve(__dirname, "../../drizzle/0018_team_events.sql"), "utf8");
    const statements = file
      .split("\n")
      .filter(line => !line.startsWith("--"))
      .join("\n")
      .split(";")
      .map(s => s.trim().replaceAll("\r", ""))
      .filter(Boolean);
    expect([...TEAM_EVENTS_SCHEMA_STATEMENTS]).toEqual(statements);
  });

  it("turns venue clock time into a moment and back", () => {
    expect(wallToInstant("2030-01-10T18:00", "Asia/Manila").toISOString()).toBe("2030-01-10T10:00:00.000Z");
    expect(instantToWall("2030-01-10T10:00:00.000Z", "Asia/Manila")).toBe("2030-01-10T18:00");
    expect(wallToInstant("2030-07-01T09:30", "America/New_York").toISOString()).toBe("2030-07-01T13:30:00.000Z");
    expect(instantToWall(wallToInstant("2030-07-01T09:30", "Nowhere/Invalid"), "Nowhere/Invalid")).toBe("2030-07-01T09:30");
  });
});

describe("team events", () => {
  it("lets the owner create an event with the ready-made form, in the team's time zone", async () => {
    const team = await makeTeam();
    const created = await team.asOwner.teamEvents.create({ workspaceId: team.workspaceId, title: "  Launch night ", startAt: "2030-01-10T18:00", endAt: "2030-01-10T21:00" });
    const { event, fields, stats } = await team.asOwner.teamEvents.get({ workspaceId: team.workspaceId, eventId: created.id });
    expect(event).toMatchObject({ title: "Launch night", status: "draft", slug: created.slug, createdBy: team.owner.id });
    expect(event.startAt?.toISOString()).toBe("2030-01-10T10:00:00.000Z");
    expect(fields.map(field => field.standardKey)).toEqual(["fullName", "email", "mobile", "company", "organization", "jobTitle", "guests", "guestNames", "dietary", "address", "attendanceType"]);
    expect(fields.filter(field => field.enabled).map(field => field.standardKey)).toEqual(["fullName", "email", "mobile"]);
    expect(stats).toEqual({ responses: 0, attending: 0, maybe: 0, notAttending: 0, guests: 0, checkedIn: 0 });

    await expect(team.asOwner.teamEvents.create({ workspaceId: team.workspaceId, title: "Backwards", startAt: "2030-01-10T18:00", endAt: "2030-01-10T17:00" })).rejects.toThrow("cannot end before");
    await expect(team.asOwner.teamEvents.create({ workspaceId: team.workspaceId, title: "Bad link", mapUrl: "javascript:alert(1)" })).rejects.toThrow();
    const undated = await team.asOwner.teamEvents.create({ workspaceId: team.workspaceId, title: "No date" });
    await expect(team.asOwner.teamEvents.setStatus({ workspaceId: team.workspaceId, eventId: undated.id, status: "published" })).rejects.toThrow("start date");

    const audit = await db.select().from(workspaceAuditLog).where(eq(workspaceAuditLog.workspaceId, team.workspaceId));
    expect(audit.filter(row => row.action === "event.created")).toHaveLength(2);
  });

  it("keeps events to admins of the right team", async () => {
    const team = await makeTeam();
    const other = await makeTeam("Other");
    const member = await join(team, "Mia Member");
    const admin = await join(team, "Adam Admin", "admin");
    const stranger = await makeUser("stranger@events.test");
    const event = await liveEvent(team);
    const draft = await team.asOwner.teamEvents.create({ workspaceId: team.workspaceId, title: "Secret plan" });
    await respond(event, "Grace");

    // Members see what the public can see, and nothing about who answered.
    const seen = await member.as.teamEvents.list({ workspaceId: team.workspaceId });
    expect(seen.canManage).toBe(false);
    expect(seen.canCreate).toBe(false);
    expect(seen.events.map(row => row.title)).toEqual(["Launch night"]);
    expect(seen.events[0].stats).toBeNull();
    await expect(member.as.teamEvents.get(event.target)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teamEvents.rsvps(event.target)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teamEvents.exportCsv(event.target)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teamEvents.create({ workspaceId: team.workspaceId, title: "Mine" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teamEvents.setStatus({ ...event.target, status: "archived" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Admins of the team manage it.
    expect((await admin.as.teamEvents.list({ workspaceId: team.workspaceId })).events).toHaveLength(2);
    expect((await admin.as.teamEvents.rsvps(event.target)).rows).toHaveLength(1);
    expect((await admin.as.teamEvents.list({ workspaceId: team.workspaceId })).canCreate).toBe(false);
    expect((await team.asOwner.teamEvents.list({ workspaceId: team.workspaceId })).canCreate).toBe(true);
    await expect(admin.as.teamEvents.create({ workspaceId: team.workspaceId, title: "Admin event" })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only the team owner can do this." });
    expect((await team.asOwner.teamEvents.list({ workspaceId: team.workspaceId })).events).toHaveLength(2);

    // Another team's admin cannot reach it, even by naming their own team with this event's number.
    await expect(other.asOwner.teamEvents.get(event.target)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(other.asOwner.teamEvents.get({ workspaceId: other.workspaceId, eventId: event.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(other.asOwner.teamEvents.rsvps({ workspaceId: other.workspaceId, eventId: event.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(other.asOwner.teamEvents.update({ workspaceId: other.workspaceId, eventId: draft.id, title: "Taken" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerFor(stranger).teamEvents.list({ workspaceId: team.workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(visitor().teamEvents.list({ workspaceId: team.workspaceId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    ENV.teamsEnabled = false;
    await expect(team.asOwner.teamEvents.list({ workspaceId: team.workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(visitor().publicEvent.get({ slug: event.slug })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(respond(event, "Late")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shows the public the event and the form, never the people", async () => {
    const team = await makeTeam("Bright Co");
    const event = await liveEvent(team);
    const draft = await team.asOwner.teamEvents.create({ workspaceId: team.workspaceId, title: "Draft", startAt: "2030-02-01T10:00" });
    await expect(visitor().publicEvent.get({ slug: draft.slug })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(visitor().publicEvent.rsvp({ slug: draft.slug, status: "attending", answers: {} })).rejects.toMatchObject({ code: "NOT_FOUND" });

    await respond(event, "Grace Hopper");
    const page = await visitor().publicEvent.get({ slug: event.slug });
    expect(page).toMatchObject({ title: "Launch night", venue: "The Loft", rsvpState: "open", company: { name: "Bright Co" }, timezone: "Asia/Manila" });
    expect(page.fields.map(field => field.standardKey)).toEqual(["fullName", "email", "mobile"]);
    const everything = JSON.stringify(page);
    expect(everything).not.toContain("Grace");
    expect(everything).not.toContain("guest.test");
    expect(Object.keys(page)).not.toEqual(expect.arrayContaining(["stats", "responses", "workspaceId", "createdBy", "capacity"]));
    expect(await respond(event, "Second")).toEqual({ ok: true });

    await team.asOwner.teamEvents.setStatus({ ...event.target, status: "archived" });
    await expect(visitor().publicEvent.get({ slug: event.slug })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("checks every answer on the server and refuses questions from elsewhere", async () => {
    const team = await makeTeam();
    const event = await liveEvent(team, { allowMaybe: false });
    const elsewhere = await liveEvent(team);
    const send = (body: Record<string, unknown>, status: "attending" | "maybe" = "attending") =>
      visitor().publicEvent.rsvp({ slug: event.slug, status, answers: body as Record<string, string> });

    await expect(send(await answers(event, { email: "a@b.co" }))).rejects.toThrow("Full name is required.");
    await expect(send(await answers(event, { fullName: "Ada", email: "not-an-email" }))).rejects.toThrow("valid email");
    await expect(send(await answers(event, { fullName: "x".repeat(201), email: "a@b.co" }))).rejects.toThrow("too long");
    await expect(send(await answers(event, { fullName: "Ada", email: "a@b.co", mobile: "<script>" }))).rejects.toThrow("valid phone");
    await expect(send(await answers(event, { fullName: "Ada", email: "a@b.co" }), "maybe")).rejects.toThrow("attending or not attending");

    // A question of another event, a hidden question, and a made-up number are all refused.
    const good = await answers(event, { fullName: "Ada", email: "a@b.co" });
    const foreign = Object.keys(await answers(elsewhere, { fullName: "x" }))[0];
    await expect(send({ ...good, [foreign]: "Mallory" })).rejects.toThrow("form has changed");
    const hidden = (await team.asOwner.teamEvents.get(event.target)).fields.find(field => field.standardKey === "company")!;
    await expect(send({ ...good, [String(hidden.id)]: "Evil Corp" })).rejects.toThrow("form has changed");
    await expect(send({ ...good, "999999": "x" })).rejects.toThrow("form has changed");
    await expect(send({ ...good, "1; drop table users": "x" })).rejects.toThrow();
    await expect(send({ ...good, [Object.keys(good)[0]]: { $ne: null } })).rejects.toThrow();

    // Bots that fill the hidden box get a polite nothing.
    expect(await visitor().publicEvent.rsvp({ slug: event.slug, status: "attending", answers: good, website: "https://spam.example" })).toEqual({ ok: true });
    expect((await team.asOwner.teamEvents.rsvps(event.target)).total).toBe(0);

    // Text is stored as text. Control characters are dropped; markup is kept as harmless characters.
    await send(await answers(event, { fullName: "  Ada\u0000 <b>Lovelace</b> ", email: "ADA@B.CO" }));
    const { rows, fields } = await team.asOwner.teamEvents.rsvps(event.target);
    const idOf = (key: string) => String(fields.find(field => field.standardKey === key)!.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].answers[idOf("fullName")]).toBe("Ada <b>Lovelace</b>");
    expect(rows[0].answers[idOf("email")]).toBe("ada@b.co");
  });

  it("closes attending at capacity without touching existing responses", async () => {
    const team = await makeTeam();
    const event = await liveEvent(team, { capacity: 4 });
    await setModes(team, event, { guests: "optional" });

    await respond(event, "Ann", "attending", { guests: 1 });
    await respond(event, "Maybe Mo", "maybe", { guests: 3 });
    expect((await visitor().publicEvent.get({ slug: event.slug })).rsvpState).toBe("open");
    await expect(respond(event, "Big Party", "attending", { guests: 2 })).rejects.toThrow("Only 2 places are left.");
    await expect(respond(event, "Too Many", "attending", { guests: 21 })).rejects.toThrow("between 0 and 20");
    await respond(event, "Bob", "attending", { guests: 1 });

    expect((await visitor().publicEvent.get({ slug: event.slug })).rsvpState).toBe("full");
    await expect(respond(event, "Late Lee")).rejects.toThrow("Registration is full.");
    await respond(event, "Sorry Sam", "not_attending");

    const { stats } = await team.asOwner.teamEvents.get(event.target);
    expect(stats).toEqual({ responses: 4, attending: 2, maybe: 1, notAttending: 1, guests: 2, checkedIn: 0 });

    // Raising the limit opens it again.
    await team.asOwner.teamEvents.update({ ...event.target, title: "Launch night", startAt: "2030-01-10T18:00", capacity: 5 });
    await respond(event, "Late Lee");
    expect((await team.asOwner.teamEvents.get(event.target)).stats.attending).toBe(3);
  });

  it("stops responses after the deadline, when closed and when ended, and keeps the page up", async () => {
    const team = await makeTeam();
    const event = await liveEvent(team);
    await respond(event, "Early Eve");

    await db.update(workspaceEvents).set({ rsvpDeadline: new Date(Date.now() - 60_000) }).where(eq(workspaceEvents.id, event.id));
    await expect(respond(event, "Late Lee")).rejects.toThrow("RSVP registration has closed.");
    expect(await visitor().publicEvent.get({ slug: event.slug })).toMatchObject({ title: "Launch night", rsvpState: "closed" });

    await db.update(workspaceEvents).set({ rsvpDeadline: null }).where(eq(workspaceEvents.id, event.id));
    await team.asOwner.teamEvents.setStatus({ ...event.target, status: "closed" });
    await expect(respond(event, "Late Lee")).rejects.toThrow("RSVP registration has closed.");

    await team.asOwner.teamEvents.setStatus({ ...event.target, status: "ended" });
    await expect(respond(event, "Late Lee")).rejects.toThrow("This event has ended.");
    expect((await visitor().publicEvent.get({ slug: event.slug })).rsvpState).toBe("ended");

    await team.asOwner.teamEvents.setStatus({ ...event.target, status: "published" });
    await db.update(workspaceEvents).set({ endAt: new Date(Date.now() - 60_000) }).where(eq(workspaceEvents.id, event.id));
    await expect(respond(event, "Late Lee")).rejects.toThrow("This event has ended.");
    expect(await db.select().from(workspaceEventRsvps).where(eq(workspaceEventRsvps.eventId, event.id))).toHaveLength(1);
  });

  it("builds the form: own questions, order, required, hidden, and safe removal", async () => {
    const team = await makeTeam();
    const event = await liveEvent(team);
    const elsewhere = await liveEvent(team);
    const current = (await team.asOwner.teamEvents.get(event.target)).fields;
    const asInput = (field: (typeof current)[number]) => ({
      id: field.id,
      label: field.label,
      fieldType: field.fieldType as "short_text",
      mode: (!field.enabled ? "hidden" : field.required ? "required" : "optional") as "required" | "optional" | "hidden",
      options: field.options ?? undefined,
    });
    const base = current.map(asInput);
    const save = (fields: Parameters<typeof team.asOwner.teamEvents.saveFields>[0]["fields"]) => team.asOwner.teamEvents.saveFields({ ...event.target, fields });

    await expect(save([...base, { label: "Shirt size", fieldType: "single_select", mode: "required", options: ["M"] }])).rejects.toThrow("at least two options");
    const foreignId = (await team.asOwner.teamEvents.get(elsewhere.target)).fields[0].id;
    await expect(save([...base, { id: foreignId, label: "Hijack", fieldType: "short_text", mode: "required" }])).rejects.toThrow("does not belong");

    const saved = await save([
      { label: "Shirt size", fieldType: "single_select", mode: "required", options: ["S", "M", "M", "L"] },
      // The name can never be hidden, and ready-made questions keep their name and kind.
      ...base.map(field => (field.label === "Full name" ? { ...field, label: "Renamed", fieldType: "number" as const, mode: "hidden" as const } : field)),
      { label: "Topics", fieldType: "multi_select", mode: "optional", options: ["AI", "Design"] },
      { label: "Newsletter", fieldType: "checkbox", mode: "optional" },
      { label: "Parking?", fieldType: "yes_no", mode: "optional" },
      { label: "Arrival", fieldType: "date", mode: "optional" },
    ]);
    expect(saved.fields[0]).toMatchObject({ label: "Shirt size", required: true, options: ["S", "M", "L"], standardKey: null });
    expect(saved.fields.find(field => field.standardKey === "fullName")).toMatchObject({ label: "Full name", fieldType: "short_text", required: true, enabled: true });

    const page = await visitor().publicEvent.get({ slug: event.slug });
    expect(page.fields.map(field => field.label)).toEqual(["Shirt size", "Full name", "Email", "Mobile number", "Topics", "Newsletter", "Parking?", "Arrival"]);

    const send = async (byKey: Record<string, string | number | boolean | string[]>) => visitor().publicEvent.rsvp({ slug: event.slug, status: "attending", answers: await answers(event, byKey) });
    const person = { fullName: "Ada", email: "a@b.co" };
    await expect(send(person)).rejects.toThrow("Shirt size is required.");
    await expect(send({ ...person, "Shirt size": "XXL" })).rejects.toThrow("Choose one of the options");
    await expect(send({ ...person, "Shirt size": "M", Topics: ["AI", "Hacking"] })).rejects.toThrow("Choose from the options");
    await expect(send({ ...person, "Shirt size": "M", "Parking?": "perhaps" })).rejects.toThrow("yes or no");
    await expect(send({ ...person, "Shirt size": "M", Arrival: "tomorrow" })).rejects.toThrow("needs a date");
    await send({ ...person, "Shirt size": "M", Topics: ["AI", "Design"], Newsletter: true, Arrival: "2030-01-10" });

    // Removing an answered question hides it and keeps its answers. An unanswered one is deleted.
    const after = (await team.asOwner.teamEvents.get(event.target)).fields.map(asInput);
    const trimmed = await save(after.filter(field => field.label !== "Shirt size" && field.label !== "Topics" && field.label !== "Mobile number"));
    expect(trimmed.fields.find(field => field.label === "Shirt size")).toMatchObject({ enabled: false, required: false });
    expect(trimmed.fields.find(field => field.label === "Mobile number")).toBeDefined();
    const again = await save(trimmed.fields.map(asInput).filter(field => field.label !== "Parking?" && field.label !== "Shirt size"));
    expect(again.fields.some(field => field.label === "Parking?")).toBe(false);
    expect(again.fields.some(field => field.label === "Shirt size")).toBe(true);

    const table = await team.asOwner.teamEvents.rsvps(event.target);
    expect(table.fields.map(field => field.label)).toEqual(expect.arrayContaining(["Shirt size", "Topics", "Full name"]));
    expect((await visitor().publicEvent.get({ slug: event.slug })).fields.map(field => field.label)).not.toContain("Shirt size");
  });

  it("gives admins the dashboard, the table, check-in, edits and a safe spreadsheet", async () => {
    const team = await makeTeam();
    const admin = await join(team, "Adam Admin", "admin");
    const event = await liveEvent(team);
    const elsewhere = await liveEvent(team);
    await setModes(team, event, { guests: "optional", company: "optional" });
    await respond(event, "Ann", "attending", { guests: 2, company: "=HYPERLINK(\"http://evil\")" });
    await respond(event, "Ben", "maybe");
    await respond(event, "Cat", "not_attending");
    await respond(elsewhere, "Zed");

    const table = await admin.as.teamEvents.rsvps(event.target);
    expect(table.total).toBe(3);
    expect(table.fields.map(field => field.standardKey)).toEqual(["fullName", "email", "mobile", "company", "guests"]);
    const idOf = (key: string) => String(table.fields.find(field => field.standardKey === key)!.id);
    const nameOf = (row: (typeof table.rows)[number]) => row.answers[idOf("fullName")];
    expect(table.rows.map(nameOf)).toEqual(["Cat", "Ben", "Ann"]);
    expect((await admin.as.teamEvents.rsvps({ ...event.target, search: "ben@" })).rows.map(nameOf)).toEqual(["Ben"]);
    expect((await admin.as.teamEvents.rsvps({ ...event.target, status: "attending" })).rows.map(nameOf)).toEqual(["Ann"]);

    const ann = table.rows.find(row => nameOf(row) === "Ann")!;
    const zed = (await admin.as.teamEvents.rsvps(elsewhere.target)).rows[0];
    const checked = await admin.as.teamEvents.checkIn({ ...event.target, rsvpId: ann.id, checkedIn: true });
    expect(checked.checkedInAt).toBeInstanceOf(Date);
    const [stored] = await db.select().from(workspaceEventRsvps).where(eq(workspaceEventRsvps.id, ann.id));
    expect(stored.checkedInBy).toBe(admin.user.id);
    expect((await admin.as.teamEvents.rsvps({ ...event.target, checkedIn: true })).rows.map(nameOf)).toEqual(["Ann"]);
    expect((await admin.as.teamEvents.rsvps({ ...event.target, checkedIn: false })).rows).toHaveLength(2);

    // A response of another event cannot be reached through this one.
    await expect(admin.as.teamEvents.checkIn({ ...event.target, rsvpId: zed.id, checkedIn: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(admin.as.teamEvents.deleteRsvp({ ...event.target, rsvpId: zed.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const ben = table.rows.find(row => nameOf(row) === "Ben")!;
    await admin.as.teamEvents.updateRsvp({ ...event.target, rsvpId: ben.id, status: "attending", answers: { [idOf("fullName")]: "Benjamin", [idOf("guests")]: 1 } });
    await expect(admin.as.teamEvents.updateRsvp({ ...event.target, rsvpId: ben.id, status: "attending", answers: { "999999": "x" } })).rejects.toThrow("form has changed");
    expect((await admin.as.teamEvents.get(event.target)).stats).toEqual({ responses: 3, attending: 2, maybe: 0, notAttending: 1, guests: 3, checkedIn: 1 });

    const cat = table.rows.find(row => nameOf(row) === "Cat")!;
    await admin.as.teamEvents.deleteRsvp({ ...event.target, rsvpId: cat.id });
    await admin.as.teamEvents.checkIn({ ...event.target, rsvpId: ann.id, checkedIn: false });
    expect((await admin.as.teamEvents.get(event.target)).stats).toMatchObject({ responses: 2, checkedIn: 0 });

    const sheet = await admin.as.teamEvents.exportCsv(event.target);
    expect(sheet.count).toBe(2);
    const lines = sheet.csv.split("\r\n");
    expect(lines[0]).toBe('"Response","Sent","Checked in","Full name","Email","Mobile number","Company","Organization","Job title","Number of guests","Guest names","Dietary restrictions","Address","Attendance type"');
    expect(lines.find(line => line.includes('"Ann"'))).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(lines.find(line => line.includes('"Benjamin"'))).toContain('"Attending"');

    const actions = (await db.select().from(workspaceAuditLog).where(eq(workspaceAuditLog.workspaceId, team.workspaceId))).map(row => row.action);
    expect(actions).toEqual(expect.arrayContaining(["event.created", "event.published", "event.form_changed", "event.rsvp_edited", "event.rsvp_deleted", "event.exported"]));
  });
});
