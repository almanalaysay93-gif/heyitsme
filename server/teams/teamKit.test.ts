import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { instantToWall } from "@shared/events";
import { MAX_CARD_ASSETS, readBackgroundSettings, readSignatureSettings, signatureHtml, signatureText } from "@shared/teamKit";
import { cards, users, workspaceAssets, workspaceAuditLog } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { ENV } from "../_core/env";
import { createTestDb } from "../billing/testDb";
import { TEAM_ASSETS_SCHEMA_STATEMENTS } from "./schemaSql";

vi.mock("../_core/rateLimit", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/rateLimit")>()),
  rateLimit: vi.fn(async () => ({ allowed: true, count: 1, resetMs: 0 })),
}));
vi.mock("../_core/mail", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/mail")>()),
  sendMail: vi.fn(async () => true),
}));
vi.mock("../uploadSweep", () => ({ tidyOwnerUploads: vi.fn() }));
vi.mock("../storage", async importOriginal => ({
  ...(await importOriginal<typeof import("../storage")>()),
  storagePut: vi.fn(async (key: string) => ({ key, url: `/storage/${key}` })),
}));

const { appRouter } = await import("../routers");
const { setTestDb } = await import("../db");
const { storagePut } = await import("../storage");

const saved = { ...ENV };
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let closeDb: () => Promise<void>;

const req = { protocol: "https", headers: {}, ip: "203.0.113.9", get: () => "heyitsme.test", query: {} } as unknown as TrpcContext["req"];
const callerFor = (user: typeof users.$inferSelect | null) => appRouter.createCaller({ user, req, res: {} as TrpcContext["res"] });
const visitor = () => callerFor(null);

let seq = 0;
async function makeUser(email: string, name = email.split("@")[0]) {
  const [row] = await db.insert(users).values({ openId: `k-${++seq}`, email, name }).returning();
  return row;
}

async function makeTeam(name = "Acme") {
  const owner = await makeUser(`owner${++seq}@kit.test`, "Olive Owner");
  const workspace = await callerFor(owner).teams.create({ name });
  return { owner, workspace, workspaceId: workspace.id, asOwner: callerFor(owner) };
}
type Team = Awaited<ReturnType<typeof makeTeam>>;

async function join(team: Team, role: "admin" | "member" = "member") {
  const email = `person${++seq}@kit.test`;
  const user = await makeUser(email);
  const invite = await team.asOwner.teams.invite({ workspaceId: team.workspaceId, email, role });
  await callerFor(user).teams.acceptInvite({ token: invite.inviteUrl.split("/").pop()! });
  return { user, memberId: invite.memberId, as: callerFor(user) };
}

/** A published company card held by a new member. */
async function liveCard(team: Team, displayName = "Sam Seller") {
  const holder = await join(team);
  const card = await team.asOwner.teamCards.create({ workspaceId: team.workspaceId, displayName, title: "Account Manager", assignMemberId: holder.memberId });
  await team.asOwner.teamCards.publish({ workspaceId: team.workspaceId, cardId: card.id, published: true });
  const [row] = await db.select().from(cards).where(eq(cards.id, card.id));
  return { holder, card, slug: row.slug! };
}

const base64 = (bytes: number[] | string) => Buffer.from(typeof bytes === "string" ? bytes : Uint8Array.from(bytes)).toString("base64");
const PDF = base64("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
const pdf = (name = "brochure.pdf") => ({ fileName: name, contentType: "application/pdf", dataBase64: PDF });
const shown = async (slug: string) => (await visitor().publicCard.bySlug({ slug }))?.team ?? null;
/** A wall-clock time this many hours from now, in the team's time zone. */
const hoursFromNow = (hours: number, timezone: string) => instantToWall(new Date(Date.now() + hours * 3_600_000), timezone);
const actions = async (workspaceId: number) => (await db.select().from(workspaceAuditLog).where(eq(workspaceAuditLog.workspaceId, workspaceId))).map(row => row.action);

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  closeDb = () => created.client.close();
  setTestDb(db);
});
beforeEach(() => {
  Object.assign(ENV, saved, { teamsEnabled: true, siteUrl: "https://heyitsme.test" });
  vi.mocked(storagePut).mockClear();
});
afterEach(() => Object.assign(ENV, saved));
afterAll(() => closeDb());

describe("team assets schema", () => {
  it("ensureSchema runs exactly the statements of drizzle/0019_team_assets.sql", () => {
    const file = readFileSync(path.resolve(__dirname, "../../drizzle/0019_team_assets.sql"), "utf8");
    const statements = file
      .split("\n")
      .filter(line => !line.startsWith("--"))
      .join("\n")
      .split(";")
      .map(statement => statement.trim().replace(/\r/g, ""))
      .filter(Boolean);
    expect([...TEAM_ASSETS_SCHEMA_STATEMENTS]).toEqual(statements);
  });
});

describe("company files", () => {
  it("only admins add, change and archive files; members only see approved ones", async () => {
    const team = await makeTeam();
    const { workspaceId } = team;
    const member = await join(team);
    const outsider = await makeTeam("Rival");

    await expect(member.as.teamAssets.addLink({ workspaceId, title: "Catalog", url: "https://acme.test/catalog" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teamAssets.upload({ workspaceId, title: "Brochure", ...pdf() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(outsider.asOwner.teamAssets.list({ workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(outsider.asOwner.teamAssets.addLink({ workspaceId, title: "Catalog", url: "https://rival.test" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storagePut).not.toHaveBeenCalled();

    const link = await team.asOwner.teamAssets.addLink({ workspaceId, title: "Catalog", url: "https://acme.test/catalog" });
    const file = await team.asOwner.teamAssets.upload({ workspaceId, title: "Brochure", ...pdf() });
    expect(vi.mocked(storagePut).mock.calls[0][0]).toMatch(new RegExp(`^team-${workspaceId}/file-`));
    await expect(member.as.teamAssets.update({ workspaceId, assetId: link.id, title: "Mine now" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teamAssets.setArchived({ workspaceId, assetId: file.id, archived: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Another team's admin cannot reach this team's file through their own workspace.
    await expect(outsider.asOwner.teamAssets.setArchived({ workspaceId: outsider.workspaceId, assetId: file.id, archived: true })).rejects.toMatchObject({ code: "NOT_FOUND" });

    await team.asOwner.teamAssets.setArchived({ workspaceId, assetId: file.id, archived: true });
    const forMember = await member.as.teamAssets.list({ workspaceId });
    expect(forMember.canManage).toBe(false);
    expect(forMember.assets.map(asset => asset.title)).toEqual(["Catalog"]);
    expect(forMember.assets[0].cardCount).toBeNull();
    const forAdmin = await team.asOwner.teamAssets.list({ workspaceId });
    expect(forAdmin.assets.map(asset => [asset.title, asset.archived])).toEqual([["Brochure", true], ["Catalog", false]]);
    expect(await actions(workspaceId)).toEqual(expect.arrayContaining(["asset.added", "asset.archived"]));
  });

  it("refuses files whose contents are not what the name says, and unsafe links", async () => {
    const team = await makeTeam();
    const { workspaceId } = team;
    const add = (fileName: string, contentType: string, bytes: number[] | string) => team.asOwner.teamAssets.upload({ workspaceId, title: "File", fileName, contentType, dataBase64: base64(bytes) });

    await expect(add("brochure.pdf", "application/pdf", "<html><script>alert(1)</script></html>")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(add("page.html", "text/html", "<html></html>")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(add("run.exe", "application/octet-stream", [0x4d, 0x5a, 0x90, 0x00])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(add("deck.pptx", "application/pdf", "%PDF-1.7 not a deck")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storagePut).not.toHaveBeenCalled();

    await add("deck.pptx", "", [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
    await add("prices.xls", "application/vnd.ms-excel", [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
    expect(vi.mocked(storagePut).mock.calls.map(call => call[2])).toEqual([
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-excel",
    ]);

    for (const url of ["javascript:alert(1)", "data:text/html,<script>1</script>", "/storage/other", "ftp://acme.test/file"]) {
      await expect(team.asOwner.teamAssets.addLink({ workspaceId, title: "Bad", url })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("a member adds approved files to their own card only, and visitors get the newest version", async () => {
    const team = await makeTeam();
    const { workspaceId } = team;
    const mine = await liveCard(team);
    const other = await liveCard(team, "Other Person");
    const rival = await makeTeam("Rival");
    const rivalCard = await liveCard(rival, "Rival Rep");
    const file = await team.asOwner.teamAssets.upload({ workspaceId, title: "Brochure", ...pdf() });
    const rivalFile = await rival.asOwner.teamAssets.upload({ workspaceId: rival.workspaceId, title: "Rival deck", ...pdf() });
    const as = mine.holder.as;

    expect(await shown(mine.slug)).toBeNull();
    await expect(as.teamAssets.setOnCard({ workspaceId, assetId: file.id, cardId: other.card.id, shown: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(as.teamAssets.setOnCard({ workspaceId, assetId: file.id, cardId: rivalCard.card.id, shown: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(as.teamAssets.setOnCard({ workspaceId, assetId: rivalFile.id, cardId: mine.card.id, shown: true })).rejects.toMatchObject({ code: "NOT_FOUND" });

    await as.teamAssets.setOnCard({ workspaceId, assetId: file.id, cardId: mine.card.id, shown: true });
    await as.teamAssets.setOnCard({ workspaceId, assetId: file.id, cardId: mine.card.id, shown: true });
    const before = await shown(mine.slug);
    expect(before?.files).toHaveLength(1);
    expect(before?.files[0]).toMatchObject({ title: "Brochure", kind: "file" });
    expect(await shown(other.slug)).toBeNull();
    const listed = await as.teamAssets.list({ workspaceId });
    expect(listed.cards.map(card => card.id)).toEqual([mine.card.id]);
    expect(listed.assets[0].cardIds).toEqual([mine.card.id]);

    // The admin uploads a newer brochure: the card shows it without the member doing anything.
    const replaced = await team.asOwner.teamAssets.replaceFile({ workspaceId, assetId: file.id, ...pdf("brochure-2031.pdf") });
    await team.asOwner.teamAssets.update({ workspaceId, assetId: file.id, title: "Brochure 2031" });
    const after = await shown(mine.slug);
    expect(after?.files[0]).toMatchObject({ title: "Brochure 2031", url: replaced.url });
    expect(after?.files[0].url).not.toBe(before?.files[0].url);

    await team.asOwner.teamAssets.setArchived({ workspaceId, assetId: file.id, archived: true });
    expect(await shown(mine.slug)).toBeNull();
    await expect(as.teamAssets.setOnCard({ workspaceId, assetId: file.id, cardId: mine.card.id, shown: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await team.asOwner.teamAssets.setArchived({ workspaceId, assetId: file.id, archived: false });
    expect((await shown(mine.slug))?.files).toHaveLength(1);

    await as.teamAssets.setOnCard({ workspaceId, assetId: file.id, cardId: mine.card.id, shown: false });
    expect(await shown(mine.slug)).toBeNull();
  });

  it("a paused card cannot be changed by its holder, and a card holds a limited number of files", async () => {
    const team = await makeTeam();
    const { workspaceId } = team;
    const mine = await liveCard(team);
    const ids: number[] = [];
    for (let index = 0; index <= MAX_CARD_ASSETS; index++) ids.push((await team.asOwner.teamAssets.addLink({ workspaceId, title: `Link ${index}`, url: `https://acme.test/${index}` })).id);
    for (let index = 0; index < MAX_CARD_ASSETS; index++) await mine.holder.as.teamAssets.setOnCard({ workspaceId, assetId: ids[index], cardId: mine.card.id, shown: true });
    await expect(mine.holder.as.teamAssets.setOnCard({ workspaceId, assetId: ids[MAX_CARD_ASSETS], cardId: mine.card.id, shown: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await shown(mine.slug))?.files).toHaveLength(MAX_CARD_ASSETS);

    await team.asOwner.teamCards.setStatus({ workspaceId, cardId: mine.card.id, status: "suspended" });
    await expect(mine.holder.as.teamAssets.setOnCard({ workspaceId, assetId: ids[0], cardId: mine.card.id, shown: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("company banners", () => {
  it("only admins manage banners, and a banner needs sensible times and targets", async () => {
    const team = await makeTeam();
    const { workspaceId } = team;
    const member = await join(team);
    const rival = await makeTeam("Rival");
    const rivalCard = await liveCard(rival);
    const zone = (await team.asOwner.teamBanners.list({ workspaceId })).timezone;
    const banner = { workspaceId, title: "Now hiring", startAt: hoursFromNow(-1, zone), endAt: hoursFromNow(2, zone), target: "all" as const };

    await expect(member.as.teamBanners.list({ workspaceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.as.teamBanners.save(banner)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(rival.asOwner.teamBanners.save(banner)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(team.asOwner.teamBanners.save({ ...banner, endAt: hoursFromNow(-2, zone) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(team.asOwner.teamBanners.save({ ...banner, ctaLabel: "Apply" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(team.asOwner.teamBanners.save({ ...banner, ctaLabel: "Apply", ctaUrl: "javascript:alert(1)" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(team.asOwner.teamBanners.save({ ...banner, target: "department" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(team.asOwner.teamBanners.save({ ...banner, target: "cards", cardIds: [rivalCard.card.id] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const rivalDepartment = await rival.asOwner.teamDepartments.create({ workspaceId: rival.workspaceId, name: "Sales" });
    await expect(team.asOwner.teamBanners.save({ ...banner, target: "department", departmentId: rivalDepartment.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const created = await team.asOwner.teamBanners.save({ ...banner, ctaLabel: "Apply", ctaUrl: "https://acme.test/jobs" });
    await expect(rival.asOwner.teamBanners.remove({ workspaceId: rival.workspaceId, bannerId: created.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(rival.asOwner.teamBanners.save({ ...banner, workspaceId: rival.workspaceId, bannerId: created.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await team.asOwner.teamBanners.list({ workspaceId })).banners.map(row => [row.title, row.state])).toEqual([["Now hiring", "live"]]);
    await team.asOwner.teamBanners.remove({ workspaceId, bannerId: created.id });
    expect((await team.asOwner.teamBanners.list({ workspaceId })).banners).toEqual([]);
    expect(await actions(workspaceId)).toEqual(expect.arrayContaining(["banner.created", "banner.removed"]));
  });

  it("a banner shows only while it runs, and only on the cards it is aimed at", async () => {
    const team = await makeTeam();
    const { workspaceId } = team;
    const sales = await liveCard(team, "Sally Sales");
    const support = await liveCard(team, "Sam Support");
    const rival = await makeTeam("Rival");
    const rivalCard = await liveCard(rival, "Rival Rep");
    const department = await team.asOwner.teamDepartments.create({ workspaceId, name: "Sales" });
    await team.asOwner.teamDepartments.assignMember({ workspaceId, memberId: sales.holder.memberId, departmentId: department.id });
    const zone = (await team.asOwner.teamBanners.list({ workspaceId })).timezone;
    const running = { workspaceId, startAt: hoursFromNow(-1, zone), endAt: hoursFromNow(2, zone) };

    await team.asOwner.teamBanners.save({ ...running, title: "Everyone", target: "all" });
    await team.asOwner.teamBanners.save({ ...running, title: "Sales only", target: "department", departmentId: department.id });
    await team.asOwner.teamBanners.save({ ...running, title: "Support card", target: "cards", cardIds: [support.card.id] });
    await team.asOwner.teamBanners.save({ workspaceId, title: "Later", target: "all", startAt: hoursFromNow(24, zone), endAt: hoursFromNow(48, zone) });
    await team.asOwner.teamBanners.save({ workspaceId, title: "Over", target: "all", startAt: hoursFromNow(-48, zone), endAt: hoursFromNow(-24, zone) });

    const titles = async (slug: string) => ((await shown(slug))?.banners ?? []).map(banner => banner.title).sort();
    expect(await titles(sales.slug)).toEqual(["Everyone", "Sales only"]);
    expect(await titles(support.slug)).toEqual(["Everyone", "Support card"]);
    expect(await titles(rivalCard.slug)).toEqual([]);
    expect((await team.asOwner.teamBanners.list({ workspaceId })).banners.map(banner => banner.state).sort()).toEqual(["ended", "live", "live", "live", "scheduled"]);

    // What a visitor receives says nothing about the team, its people or who the banner is aimed at.
    const extras = await shown(sales.slug);
    expect(Object.keys(extras!).sort()).toEqual(["banners", "files"]);
    expect(Object.keys(extras!.banners[0]).sort()).toEqual(["ctaLabel", "ctaUrl", "description", "id", "title"]);
    const page = await visitor().publicCard.bySlug({ slug: sales.slug });
    expect(page).not.toHaveProperty("workspaceId");
    expect(page).not.toHaveProperty("assignedUserId");

    ENV.teamsEnabled = false;
    expect(await shown(sales.slug)).toBeNull();
  });
});

describe("email signature and meeting background", () => {
  it("members get their own published card; only admins change the team's design", async () => {
    const team = await makeTeam();
    const { workspaceId } = team;
    const mine = await liveCard(team);
    await liveCard(team, "Other Person");
    const rival = await makeTeam("Rival");

    await expect(rival.asOwner.teamKit.get({ workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(mine.holder.as.teamKit.saveSignature({ workspaceId, parts: ["email"], color: null, note: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(mine.holder.as.teamKit.saveBackground({ workspaceId, parts: ["name"], color: null, side: "left", cta: "Scan me" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await team.asOwner.teamKit.saveSignature({ workspaceId, parts: ["email", "qr"], color: "#112233", note: "Confidential." });
    await team.asOwner.teamKit.saveBackground({ workspaceId, parts: ["name", "qr"], color: "#445566", side: "left", cta: "Scan me" });
    const kit = await mine.holder.as.teamKit.get({ workspaceId });
    expect(kit.canManage).toBe(false);
    expect(kit.signature).toEqual({ parts: ["email", "qr"], color: "#112233", note: "Confidential." });
    expect(kit.background).toEqual({ parts: ["name", "qr"], color: "#445566", side: "left", cta: "Scan me" });
    expect(kit.cards.map(card => card.id)).toEqual([mine.card.id]);
    expect(kit.cards[0].cardUrl).toBe(`https://heyitsme.test/c/${mine.slug}`);
    expect(kit.cards[0].qrUrl).toBe(`https://heyitsme.test/api/qr/c/${mine.slug}.png`);
    expect((await team.asOwner.teamKit.get({ workspaceId })).cards).toHaveLength(2);
    expect(await actions(workspaceId)).toEqual(expect.arrayContaining(["signature.updated", "background.updated"]));
  });

  it("stored settings are cleaned before use", () => {
    expect(readSignatureSettings(null).parts).toContain("qr");
    expect(readSignatureSettings({ parts: ["email", "<script>", 7], color: "red;background:url(x)", note: "a\u0000b" })).toEqual({ parts: ["email"], color: null, note: "a b" });
    expect(readBackgroundSettings({ parts: "all", side: "up", color: "#12345", cta: 5 })).toMatchObject({ color: null, side: "right", cta: "Scan to connect" });
  });

  it("the signature escapes every value and writes only safe links", () => {
    const settings = readSignatureSettings({ note: `</td><script>alert(1)</script>` });
    const person = { name: `Sam <b>"Seller"</b>`, title: "Sales & Service", company: null, email: `sam@acme.test"><img src=x>`, phone: "+63 917 555 0100", cardUrl: "javascript:alert(1)", qrUrl: "https://heyitsme.test/api/qr/c/sam.png" };
    const company = { name: `Acme "Co"`, website: "javascript:alert(2)", logoUrl: "data:image/svg+xml,<svg onload=alert(3)>", color: "#0a7d55" };
    const html = signatureHtml(settings, person, company);
    expect(html).not.toMatch(/<script|javascript:|data:|<b>|<img src=x/i);
    expect(html).toContain("Sam &lt;b&gt;&quot;Seller&quot;&lt;/b&gt;");
    expect(html).toContain("Sales &amp; Service");
    expect(html).toContain(`href="tel:+639175550100"`);
    expect(html).toContain(`src="https://heyitsme.test/api/qr/c/sam.png"`);
    expect(html).toContain("#0a7d55");
    // Left out when the team turns a part off.
    const plain = signatureHtml(readSignatureSettings({ parts: ["title"] }), { ...person, email: "sam@acme.test", cardUrl: "https://heyitsme.test/c/sam" }, { ...company, website: "acme.test", logoUrl: "https://heyitsme.test/logo.png" });
    expect(plain).not.toMatch(/<img|mailto:|tel:|acme\.test/);
    expect(signatureText(readSignatureSettings(null), { ...person, name: "Sam Seller", email: "sam@acme.test", cardUrl: "https://heyitsme.test/c/sam" }, { ...company, website: "acme.test" }).split("\n")).toEqual([
      "Sam Seller",
      `Sales & Service · Acme "Co"`,
      "sam@acme.test",
      "+63 917 555 0100",
      "https://acme.test",
      "https://heyitsme.test/c/sam",
    ]);
  });

  it("nothing of the kit works while Teams is off", async () => {
    const team = await makeTeam();
    ENV.teamsEnabled = false;
    await expect(team.asOwner.teamAssets.list({ workspaceId: team.workspaceId })).rejects.toBeTruthy();
    await expect(team.asOwner.teamBanners.list({ workspaceId: team.workspaceId })).rejects.toBeTruthy();
    await expect(team.asOwner.teamKit.get({ workspaceId: team.workspaceId })).rejects.toBeTruthy();
    expect(await db.select().from(workspaceAssets).where(eq(workspaceAssets.workspaceId, team.workspaceId))).toEqual([]);
  });
});
