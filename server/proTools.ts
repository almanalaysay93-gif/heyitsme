import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { cards, contacts, qrCampaigns } from "../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { assertPro } from "./billing/gate";
import { requireDb } from "./billing/router";
import { getCardByIdForOwner, recordAnalytics } from "./db";
import { clientIp, hashIdentifier, rateLimit } from "./_core/rateLimit";
import type { InsightsRow } from "./insights";
export async function advancedInsights(
  user: { id: number; email: string | null },
  rows: InsightsRow[],
  daily: { day: string; views: number }[]
) {
  if (!ENV.proAnalyticsEnabled) return null;
  try {
    await assertPro(user);
  } catch (error) {
    if (error instanceof TRPCError && error.code === "FORBIDDEN") return null;
    throw error;
  }
  const campaigns = await (await requireDb())
    .select()
    .from(qrCampaigns)
    .where(eq(qrCampaigns.ownerUserId, user.id));
  const counts = new Map<string, number>();
  const exchanges = new Map<string, number>();
  const scans = new Map<string, number>();
  for (const row of rows) {
    if (row.type === "save")
      exchanges.set(row.day, (exchanges.get(row.day) ?? 0) + row.count);
    if (row.type === "qr") {
      counts.set(row.meta ?? "", (counts.get(row.meta ?? "") ?? 0) + row.count);
      scans.set(row.day, (scans.get(row.day) ?? 0) + row.count);
    }
  }
  return {
    qrScans: Array.from(counts.values()).reduce((n, v) => n + v, 0),
    daily: daily.map(d => ({
      ...d,
      exchanges: exchanges.get(d.day) ?? 0,
      qrScans: scans.get(d.day) ?? 0,
    })),
    campaigns: campaigns
      .map(c => ({
        id: c.id,
        name: c.name,
        cardId: c.cardId,
        scans: counts.get(c.id) ?? 0,
      }))
      .sort((a, b) => b.scans - a.scans),
  };
}

export const CONTACT_STATUSES = [
  "new",
  "contacted",
  "follow-up",
  "converted",
  "archived",
] as const;
export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export async function campaignForCard(id: string | undefined, cardId: number) {
  if (!id || !ENV.qrCampaignsEnabled) return null;
  const db = await requireDb();
  const [campaign] = await db
    .select()
    .from(qrCampaigns)
    .where(and(eq(qrCampaigns.id, id), eq(qrCampaigns.cardId, cardId)));
  return campaign ?? null;
}
export const qrCampaignRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await assertPro(ctx.user);
    return (await requireDb())
      .select()
      .from(qrCampaigns)
      .where(eq(qrCampaigns.ownerUserId, ctx.user.id));
  }),
  create: protectedProcedure
    .input(
      z.object({
        cardId: z.number().int().positive(),
        name: z.string().trim().min(1).max(80),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertPro(ctx.user);
      if (!ENV.qrCampaignsEnabled)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "QR campaigns are not enabled yet.",
        });
      const card = await getCardByIdForOwner(input.cardId, ctx.user.id);
      if (!card || card.deletedAt)
        throw new TRPCError({ code: "NOT_FOUND", message: "Card not found." });
      const db = await requireDb();
      const [row] = await db
        .insert(qrCampaigns)
        .values({ ...input, id: nanoid(16), ownerUserId: ctx.user.id })
        .returning();
      return { ...row, slug: card.slug };
    }),
  scan: publicProcedure
    .input(
      z.object({
        cardId: z.number().int().positive(),
        campaignId: z.string().max(32),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const limit = await rateLimit(
        `qr:${hashIdentifier(clientIp(ctx.req))}`,
        30,
        60000
      );
      if (!limit.allowed) return { ok: false };
      const campaign = await campaignForCard(input.campaignId, input.cardId);
      if (!campaign) return { ok: false };
      const db = await requireDb();
      const [card] = await db
        .select()
        .from(cards)
        .where(
          and(
            eq(cards.id, input.cardId),
            eq(cards.published, true),
            isNull(cards.deletedAt),
            isNull(cards.teamStatus)
          )
        );
      if (!card) return { ok: false };
      await recordAnalytics(input.cardId, "qr", campaign.id);
      return { ok: true };
    }),
});
export async function exportContactsForOwner(user: {
  id: number;
  email: string | null;
}) {
  if (ENV.planLimitsEnabled) await assertPro(user);
  const rows = await (await requireDb())
    .select()
    .from(contacts)
    .where(and(eq(contacts.ownerUserId, user.id), isNull(contacts.workspaceId)));
  const keys = [
    "name",
    "email",
    "phone",
    "company",
    "title",
    "source",
    "cardId",
    "campaignId",
    "status",
    "tags",
    "notes",
    "followUpOn",
    "followedUp",
    "createdAt",
  ] as const;
  return [
    keys.join(","),
    ...rows.map(row =>
      keys
        .map(key =>
          csvCell(
            row[key] instanceof Date
              ? (row[key] as Date).toISOString()
              : row[key]
          )
        )
        .join(",")
    ),
  ].join("\r\n");
}
