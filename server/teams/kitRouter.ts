// Company files and links, scheduled banners, and the team's email signature and meeting background.
// Admins decide what the company offers; members add approved files to their own card and copy their signature.
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { WALL_TIME, wallToInstant } from "@shared/events";
import {
  BACKGROUND_CTA_MAX,
  BACKGROUND_PARTS,
  BACKGROUND_SIDES,
  BANNER_TARGETS,
  MAX_ASSETS,
  MAX_BANNERS,
  MAX_CARD_ASSETS,
  MAX_SHOWN_BANNERS,
  SIGNATURE_NOTE_MAX,
  SIGNATURE_PARTS,
  readBackgroundSettings,
  readSignatureSettings,
  type AssetKind,
  type CardTeamExtras,
} from "@shared/teamKit";
import { isAdminRole } from "@shared/teams";
import { cards, workspaceAssets, workspaceBanners, workspaceCardAssets, workspaceDepartments, workspaceMembers, workspaces } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { siteOrigin } from "../_core/seo";
import { router } from "../_core/trpc";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { recordAudit, requireWorkspaceAdmin, requireWorkspaceMember } from "./access";
import { departmentInWorkspace, manageableCard } from "./cardsRouter";
import { teamEntitlements } from "./entitlements";
import { id, limit, requireDb, teamProcedure } from "./router";

type Db = Awaited<ReturnType<typeof requireDb>>;

const assetProcedure = teamProcedure("canUseAssetLibrary");
const bannerProcedure = teamProcedure("canManageBrand");
const signatureProcedure = teamProcedure("canGenerateEmailSignatures");
const backgroundProcedure = teamProcedure("canGenerateMeetingBackgrounds");

const MINUTE = 60 * 1000;
const MAX_FILE_BASE64 = 4_200_000;
const title = z.string().trim().min(1, "Give it a name.").max(160);
const webLink = z.string().trim().max(500).regex(/^https?:\/\/[^\s"'<>]+$/i, "Use a full link that starts with https://");
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a color");
const upload = {
  fileName: z.string().min(1).max(180),
  contentType: z.string().max(120),
  dataBase64: z.string().min(1).max(MAX_FILE_BASE64, "File is larger than 3MB. Upload a smaller one, or add it as a link."),
};

// Office files the personal upload route does not take. Checked by their first bytes, like every other upload.
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const OFFICE_TYPES: Record<string, { type: string; magic: number[] }> = {
  pptx: { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", magic: ZIP },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: ZIP },
  ppt: { type: "application/vnd.ms-powerpoint", magic: OLE },
  xls: { type: "application/vnd.ms-excel", magic: OLE },
};

/** The type to store an uploaded company file under. Refuses anything whose bytes are not what its name says. */
async function fileType(fileName: string, declaredType: string, bytes: Buffer) {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const office = OFFICE_TYPES[extension];
  if (office) {
    if (bytes.subarray(0, office.magic.length).equals(Buffer.from(office.magic))) return office.type;
  } else {
    // Loaded on use: the upload checks live beside the personal upload route, which itself mounts this router.
    const { confirmUploadType, resolveUploadType } = await import("../routers");
    const declared = resolveUploadType(fileName, declaredType);
    const confirmed = declared ? confirmUploadType(bytes, declared) : null;
    if (confirmed) return confirmed;
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "Use a PDF, picture, video, Word, PowerPoint or Excel file, or a ZIP. For anything else, add it as a link." });
}

async function storeFile(workspaceId: number, input: { fileName: string; contentType: string; dataBase64: string }) {
  const bytes = Buffer.from(input.dataBase64, "base64");
  const contentType = await fileType(input.fileName, input.contentType, bytes);
  try {
    // Kept in the team's own folder, apart from personal uploads, so the personal clean-up never removes it.
    const stored = await storagePut(`team-${workspaceId}/file-${nanoid(8)}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-")}`, bytes, contentType);
    return { url: stored.url, contentType, sizeBytes: bytes.length, fileName: input.fileName };
  } catch (error) {
    console.error("[Teams] file upload failed:", error);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not save the file right now. Please try again in a moment." });
  }
}

async function assetInWorkspace(db: Db, workspaceId: number, assetId: number) {
  const [asset] = await db.select().from(workspaceAssets).where(and(eq(workspaceAssets.id, assetId), eq(workspaceAssets.workspaceId, workspaceId))).limit(1);
  if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "File not found." });
  return asset;
}

async function assertRoomForAsset(db: Db, workspaceId: number) {
  await db.execute(sql`select pg_advisory_xact_lock(${7019}, ${workspaceId})`);
  const [existing] = await db.select({ total: sql<number>`count(*)::int` }).from(workspaceAssets).where(eq(workspaceAssets.workspaceId, workspaceId));
  if ((existing?.total ?? 0) >= MAX_ASSETS) throw new TRPCError({ code: "FORBIDDEN", message: `A team can keep up to ${MAX_ASSETS} files and links.` });
}

export const teamAssetsRouter = router({
  /** Everyone in the team sees the approved files. Admins also see archived ones and how many cards use each. */
  list: assetProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const { member } = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    const admin = isAdminRole(member.role);
    const assets = await db
      .select()
      .from(workspaceAssets)
      .where(and(eq(workspaceAssets.workspaceId, input.workspaceId), admin ? undefined : isNull(workspaceAssets.archivedAt)))
      .orderBy(asc(workspaceAssets.title));
    // The cards this person may add files to: every company card for an admin, their own active cards for a member.
    const myCards = await db
      .select({ id: cards.id, displayName: cards.displayName, title: cards.title })
      .from(cards)
      .where(and(eq(cards.workspaceId, input.workspaceId), isNull(cards.deletedAt), admin ? undefined : and(eq(cards.assignedUserId, ctx.user.id), isNull(cards.teamStatus))))
      .orderBy(asc(cards.displayName));
    const links = assets.length
      ? await db
          .select({ assetId: workspaceCardAssets.assetId, cardId: workspaceCardAssets.cardId })
          .from(workspaceCardAssets)
          .innerJoin(cards, eq(cards.id, workspaceCardAssets.cardId))
          .where(and(inArray(workspaceCardAssets.assetId, assets.map(asset => asset.id)), eq(cards.workspaceId, input.workspaceId), isNull(cards.deletedAt)))
      : [];
    const mine = new Set(myCards.map(card => card.id));
    return {
      canManage: admin,
      perCard: MAX_CARD_ASSETS,
      cards: myCards,
      assets: assets.map(asset => {
        const onCards = links.filter(link => link.assetId === asset.id).map(link => link.cardId);
        return {
          id: asset.id,
          title: asset.title,
          kind: asset.kind as AssetKind,
          url: asset.url,
          fileName: asset.fileName,
          sizeBytes: asset.sizeBytes,
          archived: asset.archivedAt !== null,
          updatedAt: asset.updatedAt,
          cardIds: onCards.filter(cardId => mine.has(cardId)),
          cardCount: admin ? onCards.length : null,
        };
      }),
    };
  }),

  addLink: assetProcedure.input(z.object({ workspaceId: id, title, url: webLink })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    return db.transaction(async tx => {
      await assertRoomForAsset(tx, input.workspaceId);
      const [asset] = await tx.insert(workspaceAssets).values({ workspaceId: input.workspaceId, title: input.title, kind: "link", url: input.url, createdBy: ctx.user.id }).returning({ id: workspaceAssets.id });
      await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "asset.added", entityType: "asset", entityId: asset.id, metadata: { title: input.title, kind: "link" } });
      return asset;
    });
  }),

  upload: assetProcedure.input(z.object({ workspaceId: id, title, ...upload })).mutation(async ({ ctx, input }) => {
    await limit("team-file", `user:${ctx.user.id}`, 30, 10 * MINUTE);
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const file = await storeFile(input.workspaceId, input);
    return db.transaction(async tx => {
      await assertRoomForAsset(tx, input.workspaceId);
      const [asset] = await tx.insert(workspaceAssets).values({ workspaceId: input.workspaceId, title: input.title, kind: "file", ...file, createdBy: ctx.user.id }).returning({ id: workspaceAssets.id });
      await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "asset.added", entityType: "asset", entityId: asset.id, metadata: { title: input.title, kind: "file" } });
      return asset;
    });
  }),

  /** Renames a file or link, and for a link changes where it goes. Cards that show it follow at once. */
  update: assetProcedure.input(z.object({ workspaceId: id, assetId: id, title, url: webLink.optional() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const asset = await assetInWorkspace(db, input.workspaceId, input.assetId);
    if (input.url && asset.kind !== "link") throw new TRPCError({ code: "BAD_REQUEST", message: "Upload a new file to replace this one." });
    await db.update(workspaceAssets).set({ title: input.title, ...(input.url ? { url: input.url } : {}), updatedAt: new Date() }).where(eq(workspaceAssets.id, asset.id));
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "asset.updated", entityType: "asset", entityId: asset.id, metadata: { title: input.title } });
    return { ok: true } as const;
  }),

  /** A newer version of a file. Every card that shows it gives visitors the new one from now on. */
  replaceFile: assetProcedure.input(z.object({ workspaceId: id, assetId: id, ...upload })).mutation(async ({ ctx, input }) => {
    await limit("team-file", `user:${ctx.user.id}`, 30, 10 * MINUTE);
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const asset = await assetInWorkspace(db, input.workspaceId, input.assetId);
    if (asset.kind !== "file") throw new TRPCError({ code: "BAD_REQUEST", message: "This is a link. Change where it goes instead." });
    const file = await storeFile(input.workspaceId, input);
    await db.update(workspaceAssets).set({ ...file, updatedAt: new Date() }).where(eq(workspaceAssets.id, asset.id));
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "asset.replaced", entityType: "asset", entityId: asset.id, metadata: { title: asset.title } });
    return { url: file.url };
  }),

  /** Archiving takes a file off every card and out of the members' list. It is kept, and restoring brings it back. */
  setArchived: assetProcedure.input(z.object({ workspaceId: id, assetId: id, archived: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const asset = await assetInWorkspace(db, input.workspaceId, input.assetId);
    await db.update(workspaceAssets).set({ archivedAt: input.archived ? new Date() : null, updatedAt: new Date() }).where(eq(workspaceAssets.id, asset.id));
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: input.archived ? "asset.archived" : "asset.restored", entityType: "asset", entityId: asset.id, metadata: { title: asset.title } });
    return { ok: true } as const;
  }),

  /** Shows an approved file on a card, or takes it off. A member can do this for their own card only. */
  setOnCard: assetProcedure.input(z.object({ workspaceId: id, assetId: id, cardId: id, shown: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const access = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    const card = await manageableCard(db, access, input.cardId);
    const asset = await assetInWorkspace(db, input.workspaceId, input.assetId);
    if (!input.shown) {
      await db.delete(workspaceCardAssets).where(and(eq(workspaceCardAssets.cardId, card.id), eq(workspaceCardAssets.assetId, asset.id)));
    } else {
      if (asset.archivedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "That file is archived." });
      await db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(${7019}, ${input.workspaceId})`);
        const [existing] = await tx.select({ total: sql<number>`count(*)::int` }).from(workspaceCardAssets).where(eq(workspaceCardAssets.cardId, card.id));
        if ((existing?.total ?? 0) >= MAX_CARD_ASSETS) throw new TRPCError({ code: "FORBIDDEN", message: `A card can show up to ${MAX_CARD_ASSETS} company files.` });
        await tx.insert(workspaceCardAssets).values({ cardId: card.id, assetId: asset.id, addedBy: ctx.user.id }).onConflictDoNothing();
      });
    }
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: input.shown ? "asset.card_added" : "asset.card_removed", entityType: "asset", entityId: asset.id, metadata: { title: asset.title, card: card.displayName } });
    return { ok: true } as const;
  }),
});

const wall = z.string().regex(WALL_TIME, "Choose a date and time.");
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(value => value || null);
const bannerInput = z.object({
  workspaceId: id,
  bannerId: id.optional(),
  title: z.string().trim().min(1, "Give the banner a title.").max(120),
  description: optionalText(400),
  ctaLabel: optionalText(40),
  ctaUrl: webLink.optional().nullable().or(z.literal("")).transform(value => value || null),
  startAt: wall,
  endAt: wall,
  target: z.enum(BANNER_TARGETS),
  departmentId: id.optional().nullable(),
  cardIds: z.array(id).max(200).optional(),
});

const bannerState = (banner: { startAt: Date; endAt: Date }, now: Date) => (banner.endAt <= now ? "ended" : banner.startAt > now ? "scheduled" : "live");

export const teamBannersRouter = router({
  list: bannerProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const { workspace } = await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const now = new Date();
    const [banners, departments, companyCards] = await Promise.all([
      db.select().from(workspaceBanners).where(eq(workspaceBanners.workspaceId, input.workspaceId)).orderBy(desc(workspaceBanners.startAt)),
      db.select({ id: workspaceDepartments.id, name: workspaceDepartments.name }).from(workspaceDepartments).where(and(eq(workspaceDepartments.workspaceId, input.workspaceId), isNull(workspaceDepartments.archivedAt))).orderBy(asc(workspaceDepartments.name)),
      db.select({ id: cards.id, displayName: cards.displayName }).from(cards).where(and(eq(cards.workspaceId, input.workspaceId), isNull(cards.deletedAt))).orderBy(asc(cards.displayName)),
    ]);
    return {
      timezone: workspace.timezone,
      departments,
      cards: companyCards,
      banners: banners.map(banner => ({
        id: banner.id,
        title: banner.title,
        description: banner.description,
        ctaLabel: banner.ctaLabel,
        ctaUrl: banner.ctaUrl,
        startAt: banner.startAt,
        endAt: banner.endAt,
        target: banner.target as (typeof BANNER_TARGETS)[number],
        departmentId: banner.departmentId,
        cardIds: banner.cardIds ?? [],
        state: bannerState(banner, now),
      })),
    };
  }),

  /** Creates a banner, or changes one. It appears and disappears on its own, at the times given in the team's time zone. */
  save: bannerProcedure.input(bannerInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const { workspace } = await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const startAt = wallToInstant(input.startAt, workspace.timezone);
    const endAt = wallToInstant(input.endAt, workspace.timezone);
    if (endAt <= startAt) throw new TRPCError({ code: "BAD_REQUEST", message: "The end must be after the start." });
    if (Boolean(input.ctaLabel) !== Boolean(input.ctaUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "A button needs both its words and its link." });
    let departmentId: number | null = null;
    let cardIds: number[] | null = null;
    if (input.target === "department") {
      if (!input.departmentId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a department." });
      departmentId = (await departmentInWorkspace(db, input.workspaceId, input.departmentId)).id;
    }
    if (input.target === "cards") {
      const wanted = Array.from(new Set(input.cardIds ?? []));
      if (wanted.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one card." });
      // Only this team's cards count. A card number from anywhere else is refused, not stored.
      const own = await db.select({ id: cards.id }).from(cards).where(and(inArray(cards.id, wanted), eq(cards.workspaceId, input.workspaceId), isNull(cards.deletedAt)));
      if (own.length !== wanted.length) throw new TRPCError({ code: "BAD_REQUEST", message: "One of those cards is not a card of this team." });
      cardIds = wanted;
    }
    const values = { title: input.title, description: input.description, ctaLabel: input.ctaLabel, ctaUrl: input.ctaUrl, startAt, endAt, target: input.target, departmentId, cardIds, updatedAt: new Date() };
    if (input.bannerId) {
      const [banner] = await db.select({ id: workspaceBanners.id }).from(workspaceBanners).where(and(eq(workspaceBanners.id, input.bannerId), eq(workspaceBanners.workspaceId, input.workspaceId))).limit(1);
      if (!banner) throw new TRPCError({ code: "NOT_FOUND", message: "Banner not found." });
      await db.update(workspaceBanners).set(values).where(eq(workspaceBanners.id, banner.id));
      await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "banner.updated", entityType: "banner", entityId: banner.id, metadata: { title: input.title } });
      return banner;
    }
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(${7019}, ${input.workspaceId})`);
      const [existing] = await tx.select({ total: sql<number>`count(*)::int` }).from(workspaceBanners).where(eq(workspaceBanners.workspaceId, input.workspaceId));
      if ((existing?.total ?? 0) >= MAX_BANNERS) throw new TRPCError({ code: "FORBIDDEN", message: `A team can keep up to ${MAX_BANNERS} banners. Remove an old one first.` });
      const [banner] = await tx.insert(workspaceBanners).values({ workspaceId: input.workspaceId, createdBy: ctx.user.id, ...values }).returning({ id: workspaceBanners.id });
      await recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "banner.created", entityType: "banner", entityId: banner.id, metadata: { title: input.title } });
      return banner;
    });
  }),

  remove: bannerProcedure.input(z.object({ workspaceId: id, bannerId: id })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
    const [banner] = await db.delete(workspaceBanners).where(and(eq(workspaceBanners.id, input.bannerId), eq(workspaceBanners.workspaceId, input.workspaceId))).returning({ id: workspaceBanners.id, title: workspaceBanners.title });
    if (!banner) throw new TRPCError({ code: "NOT_FOUND", message: "Banner not found." });
    await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "banner.removed", entityType: "banner", entityId: banner.id, metadata: { title: banner.title } });
    return { ok: true } as const;
  }),
});

export const teamKitRouter = router({
  /**
   * What a person needs to make their signature and meeting background: the team's settings, the company details,
   * and the published company cards they may use. Admins get every published card, so they can prepare one for someone.
   */
  get: signatureProcedure.input(z.object({ workspaceId: id })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const { member, workspace } = await requireWorkspaceMember(db, ctx.user.id, input.workspaceId);
    const admin = isAdminRole(member.role);
    const origin = siteOrigin(ctx.req);
    const absolute = (url: string | null) => (url && url.startsWith("/") ? `${origin}${url}` : url);
    const rows = await db
      .select({ id: cards.id, displayName: cards.displayName, title: cards.title, company: cards.company, email: cards.email, phone: cards.phone, slug: cards.slug })
      .from(cards)
      .where(and(eq(cards.workspaceId, input.workspaceId), isNull(cards.deletedAt), isNull(cards.teamStatus), eq(cards.published, true), admin ? undefined : eq(cards.assignedUserId, ctx.user.id)))
      .orderBy(asc(cards.displayName));
    return {
      canManage: admin,
      company: { name: workspace.name, website: workspace.website, logoUrl: absolute(workspace.logoUrl), color: workspace.brandColors?.primary ?? null },
      signature: readSignatureSettings(workspace.signatureSettings),
      background: teamEntitlements(workspace).canGenerateMeetingBackgrounds ? readBackgroundSettings(workspace.backgroundSettings) : null,
      cards: rows
        .filter(card => card.slug)
        .map(card => ({
          id: card.id,
          name: card.displayName,
          title: card.title,
          company: card.company,
          email: card.email,
          phone: card.phone,
          cardUrl: `${origin}/c/${card.slug}`,
          qrUrl: `${origin}/api/qr/c/${card.slug}.png`,
        })),
    };
  }),

  saveSignature: signatureProcedure
    .input(z.object({ workspaceId: id, parts: z.array(z.enum(SIGNATURE_PARTS)).max(SIGNATURE_PARTS.length), color: hex.nullable(), note: z.string().trim().max(SIGNATURE_NOTE_MAX) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
      const settings = readSignatureSettings({ parts: input.parts, color: input.color, note: input.note });
      await db.update(workspaces).set({ signatureSettings: settings, updatedAt: new Date() }).where(eq(workspaces.id, input.workspaceId));
      await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "signature.updated", entityType: "workspace", entityId: input.workspaceId });
      return settings;
    }),

  saveBackground: backgroundProcedure
    .input(z.object({ workspaceId: id, parts: z.array(z.enum(BACKGROUND_PARTS)).max(BACKGROUND_PARTS.length), color: hex.nullable(), side: z.enum(BACKGROUND_SIDES), cta: z.string().trim().max(BACKGROUND_CTA_MAX) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireWorkspaceAdmin(db, ctx.user.id, input.workspaceId);
      const settings = readBackgroundSettings({ parts: input.parts, color: input.color, side: input.side, cta: input.cta });
      await db.update(workspaces).set({ backgroundSettings: settings, updatedAt: new Date() }).where(eq(workspaces.id, input.workspaceId));
      await recordAudit(db, { workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "background.updated", entityType: "workspace", entityId: input.workspaceId });
      return settings;
    }),
});

/**
 * What a public company card shows from its team: the banners running right now that are aimed at it, and the
 * approved files added to it. Personal cards get nothing. A failure here must never take the card down, so it
 * answers null instead of throwing.
 */
export async function cardTeamExtras(card: { id: number; workspaceId: number | null; assignedUserId: number | null }): Promise<CardTeamExtras | null> {
  if (!card.workspaceId || !ENV.teamsEnabled) return null;
  try {
    const db = await getDb();
    if (!db) return null;
    const now = new Date();
    const [workspace] = await db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.id, card.workspaceId), isNull(workspaces.deletedAt))).limit(1);
    if (!workspace) return null;
    const [running, holder, files] = await Promise.all([
      db.select().from(workspaceBanners).where(and(eq(workspaceBanners.workspaceId, card.workspaceId), lte(workspaceBanners.startAt, now), gt(workspaceBanners.endAt, now))).orderBy(desc(workspaceBanners.startAt)),
      card.assignedUserId
        ? db.select({ departmentId: workspaceMembers.departmentId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, card.workspaceId), eq(workspaceMembers.userId, card.assignedUserId))).limit(1)
        : Promise.resolve([]),
      db
        .select({ id: workspaceAssets.id, title: workspaceAssets.title, kind: workspaceAssets.kind, url: workspaceAssets.url })
        .from(workspaceCardAssets)
        .innerJoin(workspaceAssets, eq(workspaceAssets.id, workspaceCardAssets.assetId))
        .where(and(eq(workspaceCardAssets.cardId, card.id), eq(workspaceAssets.workspaceId, card.workspaceId), isNull(workspaceAssets.archivedAt)))
        .orderBy(asc(workspaceCardAssets.id))
        .limit(MAX_CARD_ASSETS),
    ]);
    const departmentId = holder[0]?.departmentId ?? null;
    const banners = running
      .filter(banner => banner.target === "all" || (banner.target === "department" && departmentId !== null && banner.departmentId === departmentId) || (banner.target === "cards" && (banner.cardIds ?? []).includes(card.id)))
      .slice(0, MAX_SHOWN_BANNERS)
      .map(banner => ({ id: banner.id, title: banner.title, description: banner.description, ctaLabel: banner.ctaLabel, ctaUrl: banner.ctaUrl }));
    if (banners.length === 0 && files.length === 0) return null;
    return { banners, files: files.map(file => ({ ...file, kind: file.kind as AssetKind })) };
  } catch (error) {
    console.error("[Teams] card extras failed:", error);
    return null;
  }
}
