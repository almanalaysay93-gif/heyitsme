import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { createTestDb } from "./billing/testDb";
import * as schema from "../drizzle/schema";

vi.mock("./_core/rateLimit", async importOriginal => ({
  ...(await importOriginal<typeof import("./_core/rateLimit")>()),
  rateLimit: vi.fn(async () => ({ allowed: true, count: 1, resetMs: 0 })),
}));

const { setTestDb, MAX_PENDING_REVIEWS } = await import("./db");
const { appRouter } = await import("./routers");

const req = { protocol: "https", headers: {}, ip: "203.0.113.9", get: () => "heyitsme.test" } as unknown as TrpcContext["req"];
const res = {} as TrpcContext["res"];
const visitor = () => appRouter.createCaller({ user: null, req, res });
const review = { name: "Bo Visitor", rating: 5, body: "Fast, careful work. Would book again." };

let owner: typeof schema.users.$inferSelect;
let stranger: typeof schema.users.$inferSelect;
const as = (user: typeof owner) => appRouter.createCaller({ user, req, res } as TrpcContext);

beforeAll(async () => {
  const { db } = await createTestDb();
  setTestDb(db);
  [owner] = await db.insert(schema.users).values({ openId: "owner", email: "owner@example.com", name: "Owner" }).returning();
  [stranger] = await db.insert(schema.users).values({ openId: "stranger", email: "stranger@example.com", name: "Stranger" }).returning();
  const page = (template: string) => JSON.stringify({ template });
  await db.insert(schema.cards).values([
    { ownerUserId: owner.id, displayName: "Shop", title: "Owner", slug: "shop", published: true, page: page("business") },
    { ownerUserId: owner.id, displayName: "Salon", title: "Owner", slug: "salon", published: true, page: page("services") },
    { ownerUserId: owner.id, displayName: "Pro", title: "Owner", slug: "pro", published: true, page: page("professional") },
    { ownerUserId: owner.id, displayName: "Draft", title: "Owner", slug: "draft", published: false, page: page("business") },
  ]);
});

describe("client reviews from visitors", () => {
  it("stores a review unapproved, so the public card does not show it", async () => {
    expect(await visitor().publicCard.review({ slug: "shop", ...review })).toEqual({ received: true });
    const card = await visitor().publicCard.bySlug({ slug: "shop" });
    expect(card?.references).toEqual([]);
    const mine = await as(owner).references.list({ cardId: card!.id });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ clientName: "Bo Visitor", rating: 5, fromVisitor: true, approved: false });
  });

  it("shows the review once the owner approves it, and hides it again on request", async () => {
    const card = await visitor().publicCard.bySlug({ slug: "shop" });
    const [pending] = await as(owner).references.list({ cardId: card!.id });
    await as(owner).references.setApproved({ id: pending.id, approved: true });
    expect((await visitor().publicCard.bySlug({ slug: "shop" }))?.references).toHaveLength(1);
    await as(owner).references.setApproved({ id: pending.id, approved: false });
    expect((await visitor().publicCard.bySlug({ slug: "shop" }))?.references).toEqual([]);
  });

  it("lets only the card's owner approve", async () => {
    const card = await visitor().publicCard.bySlug({ slug: "shop" });
    const [pending] = await as(owner).references.list({ cardId: card!.id });
    await expect(as(stranger).references.setApproved({ id: pending.id, approved: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await visitor().publicCard.bySlug({ slug: "shop" }))?.references).toEqual([]);
  });

  it("takes reviews on Services cards, not on Professional or unpublished ones", async () => {
    expect(await visitor().publicCard.review({ slug: "salon", ...review })).toEqual({ received: true });
    await expect(visitor().publicCard.review({ slug: "pro", ...review })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(visitor().publicCard.review({ slug: "draft", ...review })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects bad ratings and too-short text, and drops honeypot submissions silently", async () => {
    await expect(visitor().publicCard.review({ slug: "salon", ...review, rating: 6 })).rejects.toBeTruthy();
    await expect(visitor().publicCard.review({ slug: "salon", ...review, body: "ok" })).rejects.toBeTruthy();
    const card = await visitor().publicCard.bySlug({ slug: "salon" });
    const before = (await as(owner).references.list({ cardId: card!.id })).length;
    expect(await visitor().publicCard.review({ slug: "salon", ...review, website: "http://spam.example" })).toEqual({ received: true });
    expect(await as(owner).references.list({ cardId: card!.id })).toHaveLength(before);
  });

  it("stops taking reviews while too many wait for the owner", async () => {
    const card = await visitor().publicCard.bySlug({ slug: "salon" });
    const waiting = (await as(owner).references.list({ cardId: card!.id })).length;
    for (let i = waiting; i < MAX_PENDING_REVIEWS; i++) await visitor().publicCard.review({ slug: "salon", ...review });
    await expect(visitor().publicCard.review({ slug: "salon", ...review })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
