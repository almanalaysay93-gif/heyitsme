import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cards, users, workspaceAuditLog, workspaceEvents } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { createTestDb } from "../billing/testDb";
import { TEAM_EVENT_PAGE_SCHEMA_STATEMENTS } from "./schemaSql";

vi.mock("../_core/rateLimit", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/rateLimit")>()),
  rateLimit: vi.fn(async () => ({ allowed: true, count: 1, resetMs: 0 })),
}));
vi.mock("../_core/mail", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/mail")>()),
  sendMail: vi.fn(async () => true),
}));
vi.mock("../uploadSweep", () => ({ tidyOwnerUploads: vi.fn() }));
const storagePut = vi.fn(async (key: string) => ({ key, url: `/storage/${key}` }));
const storageDelete = vi.fn(async (_keys: string[]) => undefined);
vi.mock("../storage", async importOriginal => ({
  ...(await importOriginal<typeof import("../storage")>()),
  storagePut: (key: string) => storagePut(key),
  storageDelete: (keys: string[]) => storageDelete(keys),
}));

const { appRouter } = await import("../routers");
const { setTestDb } = await import("../db");

const saved = { ...ENV };
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;

const req = { protocol: "https", headers: {}, ip: "203.0.113.9", get: () => "heyitsme.test", query: {} } as unknown as TrpcContext["req"];
const callerFor = (user: typeof users.$inferSelect | null) => appRouter.createCaller({ user, req, res: {} as TrpcContext["res"] });
const visitor = () => callerFor(null);
// A real 1x1 PNG, so the upload's byte check passes.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let seq = 0;
async function makeUser(email: string, name = email.split("@")[0]) {
  const [row] = await db.insert(users).values({ openId: `ep-${++seq}`, email, name }).returning();
  return row;
}
async function makeTeam(name = "Acme") {
  const owner = await makeUser(`owner${++seq}@page.test`, "Olive Owner");
  const workspace = await callerFor(owner).teams.create({ name });
  return { owner, workspaceId: workspace.id, asOwner: callerFor(owner) };
}
type Team = Awaited<ReturnType<typeof makeTeam>>;
async function join(team: Team, name: string, role: "admin" | "member" = "member") {
  const email = `person${++seq}@page.test`;
  const user = await makeUser(email, name);
  const invite = await team.asOwner.teams.invite({ workspaceId: team.workspaceId, email, role });
  await callerFor(user).teams.acceptInvite({ token: invite.inviteUrl.split("/").pop()! });
  return { user, as: callerFor(user) };
}
async function makeEvent(team: Team, publish = true) {
  const created = await team.asOwner.teamEvents.create({ workspaceId: team.workspaceId, title: "Launch night", startAt: "2030-01-10T18:00", venue: "The Loft" });
  if (publish) await team.asOwner.teamEvents.setStatus({ workspaceId: team.workspaceId, eventId: created.id, status: "published" });
  return { ...created, target: { workspaceId: team.workspaceId, eventId: created.id } };
}
async function makeCard(team: Team, slug: string, published: boolean) {
  const [card] = await db.insert(cards).values({ ownerUserId: team.owner.id, workspaceId: team.workspaceId, displayName: "Sam Speaker", title: "Founder", bio: "Builds things.", slug, published }).returning();
  return card;
}
const upload = (team: Team, target: { workspaceId: number; eventId: number }) =>
  team.asOwner.teamEvents.uploadImage({ ...target, fileName: "photo.png", contentType: "image/png", dataBase64: PNG });

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  closeDb = () => created.client.close();
  setTestDb(db);
});
beforeEach(() => {
  Object.assign(ENV, saved, { teamsEnabled: true, siteUrl: "https://heyitsme.test" });
  storagePut.mockClear();
  storageDelete.mockClear();
});
afterEach(() => Object.assign(ENV, saved));
afterAll(() => closeDb());

describe("team event page", () => {
  it("ensureSchema runs exactly the statements of drizzle/0022_event_page.sql", () => {
    const file = readFileSync(path.resolve(__dirname, "../../drizzle/0022_event_page.sql"), "utf8");
    const statements = file
      .split("\n")
      .filter(line => !line.startsWith("--"))
      .join("\n")
      .split(";")
      .map(s => s.trim().replaceAll("\r", ""))
      .filter(Boolean);
    expect([...TEAM_EVENT_PAGE_SCHEMA_STATEMENTS]).toEqual(statements);
  });

  it("starts every event on a working default page and shows saved content to visitors", async () => {
    const team = await makeTeam();
    const event = await makeEvent(team);
    const before = await visitor().publicEvent.get({ slug: event.slug });
    expect(before.page).toMatchObject({ theme: "tide", accent: "", agenda: [], speakers: [] });
    expect(before).not.toHaveProperty("design");

    await team.asOwner.teamEvents.savePage({
      ...event.target,
      page: {
        theme: "midnight",
        accent: "#5446e6",
        sections: [{ id: "faq", hidden: false }, { id: "schedule", hidden: true }],
        agenda: [{ time: "6:00 PM", title: "Doors open" }],
        speakers: [{ name: "Ada", featured: true, bio: "Keynote." }, { name: "Grace" }],
        faq: [{ question: "Parking?", answer: "Free on site." }],
        links: [{ title: "Tickets", url: "https://tickets.test" }],
      },
    });
    const after = await visitor().publicEvent.get({ slug: event.slug });
    expect(after.page).toMatchObject({ theme: "midnight", accent: "#5446e6", agenda: [{ time: "6:00 PM", title: "Doors open", note: "" }], faq: [{ question: "Parking?" }] });
    expect(after.page.sections?.slice(0, 2)).toEqual([{ id: "faq", hidden: false }, { id: "schedule", hidden: true }]);
    expect(after.page.speakers.map(speaker => [speaker.name, speaker.featured])).toEqual([["Ada", true], ["Grace", false]]);
    expect((await team.asOwner.teamEvents.get(event.target)).page.theme).toBe("midnight");

    const audit = await db.select().from(workspaceAuditLog).where(eq(workspaceAuditLog.workspaceId, team.workspaceId));
    expect(audit.filter(row => row.action === "event.page_changed")).toHaveLength(1);
  });

  it("moves an older event's button color and font onto the new page", async () => {
    const team = await makeTeam();
    const event = await makeEvent(team);
    await db.update(workspaceEvents).set({ design: { font: "classic", button: "#aa2211", background: "#101010" } }).where(eq(workspaceEvents.id, event.id));
    const { page } = await visitor().publicEvent.get({ slug: event.slug });
    expect(page).toMatchObject({ theme: "tide", accent: "#aa2211", font: "classic" });
  });

  it("refuses more than 3 featured speakers, more than 12 speakers, and a page that is too large", async () => {
    const team = await makeTeam();
    const event = await makeEvent(team);
    const many = (count: number, featured: number) => Array.from({ length: count }, (_, index) => ({ name: `Speaker ${index + 1}`, featured: index < featured }));
    await expect(team.asOwner.teamEvents.savePage({ ...event.target, page: { speakers: many(5, 4) } })).rejects.toThrow("Up to 3 featured speakers. Unfeature one first.");
    await expect(team.asOwner.teamEvents.savePage({ ...event.target, page: { speakers: many(13, 0) } })).rejects.toThrow("Up to 12 speakers.");
    await expect(team.asOwner.teamEvents.savePage({ ...event.target, page: { speakers: many(12, 3) } })).resolves.toBeTruthy();
    const long = "x".repeat(790);
    await expect(
      team.asOwner.teamEvents.savePage({
        ...event.target,
        page: { faq: Array.from({ length: 20 }, () => ({ question: "q".repeat(150), answer: long })), agenda: Array.from({ length: 30 }, () => ({ title: "t".repeat(110), note: "n".repeat(290), time: "9:00" })), speakers: Array.from({ length: 12 }, () => ({ name: "n".repeat(70), bio: "b".repeat(390) })), links: Array.from({ length: 12 }, () => ({ title: "t".repeat(70), url: `https://example.test/${"u".repeat(500)}`, description: "d".repeat(150) })), sponsors: Array.from({ length: 12 }, () => ({ name: "s".repeat(70), url: `https://example.test/${"u".repeat(500)}` })) },
      })
    ).rejects.toThrow("This page holds too much text.");
  });

  it("only links to images uploaded for this event, and deletes the ones a save drops", async () => {
    const team = await makeTeam();
    const event = await makeEvent(team);
    const other = await makeEvent(team);
    const prefix = `/storage/team-${team.workspaceId}/event-${event.id}-`;

    await expect(team.asOwner.teamEvents.uploadImage({ ...event.target, fileName: "notes.png", contentType: "image/png", dataBase64: Buffer.from("just text").toString("base64") })).rejects.toThrow("Use a JPG, PNG or WebP image.");
    const first = await upload(team, event.target);
    const second = await upload(team, event.target);
    expect(first.url.startsWith(prefix)).toBe(true);
    const foreign = await upload(team, other.target);

    await expect(team.asOwner.teamEvents.savePage({ ...event.target, page: { gallery: [{ url: foreign.url }] } })).rejects.toThrow("Upload the image again.");
    await expect(team.asOwner.teamEvents.savePage({ ...event.target, page: { gallery: [{ url: `${prefix}x/../../team-999/a.png` }] } })).rejects.toThrow("Upload the image again.");
    await expect(team.asOwner.teamEvents.savePage({ ...event.target, page: { speakers: [{ name: "Ada", photoUrl: "https://evil.test/a.png" }] } })).rejects.toThrow("Upload the image again.");

    await team.asOwner.teamEvents.savePage({ ...event.target, page: { gallery: [{ url: first.url }], speakers: [{ name: "Ada", photoUrl: second.url }] } });
    expect(storageDelete).not.toHaveBeenCalled();
    await team.asOwner.teamEvents.savePage({ ...event.target, page: { gallery: [{ url: first.url }], speakers: [{ name: "Ada" }] } });
    expect(storageDelete).toHaveBeenCalledTimes(1);
    expect(storageDelete).toHaveBeenCalledWith([second.url.slice("/storage/".length)]);
  });

  it("links a speaker only to a card of the same team, and only while that card is online", async () => {
    const team = await makeTeam();
    const rival = await makeTeam("Rival");
    const event = await makeEvent(team);
    await makeCard(team, "sam-speaker-own1", false);
    await makeCard(rival, "sam-speaker-rival1", true);

    expect(await team.asOwner.teamEvents.speakerCards(event.target)).toEqual([{ slug: "sam-speaker-own1", name: "Sam Speaker", role: "Founder", bio: "Builds things.", hasPhoto: false }]);
    await expect(team.asOwner.teamEvents.savePage({ ...event.target, page: { speakers: [{ name: "Sam", cardSlug: "sam-speaker-rival1" }] } })).rejects.toThrow("A speaker can only link to a card from this team.");
    await expect(team.asOwner.teamEvents.copyCardPhoto({ ...event.target, cardSlug: "sam-speaker-rival1" })).rejects.toThrow("A speaker can only link to a card from this team.");
    expect(await team.asOwner.teamEvents.copyCardPhoto({ ...event.target, cardSlug: "sam-speaker-own1" })).toEqual({ url: "" });

    await team.asOwner.teamEvents.savePage({ ...event.target, page: { speakers: [{ name: "Sam", cardSlug: "sam-speaker-own1" }] } });
    expect((await visitor().publicEvent.get({ slug: event.slug })).page.speakers[0].cardSlug).toBe("");
    await db.update(cards).set({ published: true }).where(eq(cards.slug, "sam-speaker-own1"));
    expect((await visitor().publicEvent.get({ slug: event.slug })).page.speakers[0].cardSlug).toBe("sam-speaker-own1");
    // The admin still sees the link they set.
    expect((await team.asOwner.teamEvents.get(event.target)).page.speakers[0].cardSlug).toBe("sam-speaker-own1");
  });

  it("lets only admins of the team edit or preview the page, and previews a draft", async () => {
    const team = await makeTeam();
    const other = await makeTeam("Other");
    const member = await join(team, "Mia Member");
    const admin = await join(team, "Adam Admin", "admin");
    const draft = await makeEvent(team, false);

    await expect(visitor().publicEvent.get({ slug: draft.slug })).rejects.toThrow();
    await admin.as.teamEvents.savePage({ ...draft.target, page: { faq: [{ question: "Dress code?", answer: "Smart casual." }] } });
    const preview = await admin.as.teamEvents.preview(draft.target);
    expect(preview).toMatchObject({ slug: draft.slug, title: "Launch night", rsvpState: "closed" });
    expect(preview.page.faq).toHaveLength(1);

    for (const caller of [member.as, other.asOwner, visitor()]) {
      await expect(caller.teamEvents.preview(draft.target)).rejects.toThrow();
      await expect(caller.teamEvents.savePage({ ...draft.target, page: {} })).rejects.toThrow();
      await expect(caller.teamEvents.uploadImage({ ...draft.target, fileName: "photo.png", contentType: "image/png", dataBase64: PNG })).rejects.toThrow();
      await expect(caller.teamEvents.speakerCards(draft.target)).rejects.toThrow();
    }
    expect(storagePut).not.toHaveBeenCalled();
  });
});
