import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cards, users } from "../drizzle/schema";
import { createTestDb } from "./billing/testDb";
import { setTestDb } from "./db";
import { connectManualReviewPage, publicReviewDestination, publicReviewPage, ReviewLinkRequiredError, ReviewPlanLimitError, reviewPageForCard } from "./googleReviews";

let closeDb: () => Promise<void>;
let db: Awaited<ReturnType<typeof createTestDb>>["db"];

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  closeDb = () => created.client.close();
  setTestDb(db);
});

afterAll(async () => {
  setTestDb(null);
  await closeDb();
});

describe("manual Google review setup", () => {
  it("publishes a direct review link without creating a Maps search link", async () => {
    const [owner] = await db.insert(users).values({ openId: "manual-review-owner", email: "manual-review@example.test" }).returning();
    const [card] = await db.insert(cards).values({ ownerUserId: owner.id, displayName: "Clinic Owner", title: "Owner", company: "Example Clinic", slug: "manual-review-card", published: true }).returning();
    const reviewUrl = "https://g.page/r/example/review";
    const page = await connectManualReviewPage(card.id, owner.id, reviewUrl);

    expect(page).toMatchObject({ placeId: null, businessName: "Example Clinic", reviewUrl });
    expect(await publicReviewDestination(page!.slug)).toBe(reviewUrl);
    expect(await publicReviewPage(page!.slug)).toMatchObject({ mapsUrl: null, businessName: "Example Clinic" });
    expect(await reviewPageForCard(card.id)).toMatchObject({ slug: page!.slug });
  });

  it("counts against the weekly setup limit", async () => {
    const [owner] = await db.insert(users).values({ openId: "manual-review-limit", email: "manual-limit@example.test" }).returning();
    const [card] = await db.insert(cards).values({ ownerUserId: owner.id, displayName: "Limit Owner", title: "Owner", slug: "manual-limit-card", published: true }).returning();
    await connectManualReviewPage(card.id, owner.id, "https://g.page/r/first/review");
    await expect(connectManualReviewPage(card.id, owner.id, "https://g.page/r/second/review")).rejects.toBeInstanceOf(ReviewPlanLimitError);
    expect(await publicReviewDestination((await reviewPageForCard(card.id))!.slug)).toBe("https://g.page/r/first/review");
  });

  it("refuses a link that is not a Google review link, and another owner's card", async () => {
    const [owner] = await db.insert(users).values({ openId: "manual-review-bad", email: "manual-bad@example.test" }).returning();
    const [stranger] = await db.insert(users).values({ openId: "manual-review-stranger", email: "manual-stranger@example.test" }).returning();
    const [card] = await db.insert(cards).values({ ownerUserId: owner.id, displayName: "Bad Link Owner", title: "Owner", slug: "manual-bad-card", published: true }).returning();
    await expect(connectManualReviewPage(card.id, owner.id, "https://example.com/r/x/review")).rejects.toBeInstanceOf(ReviewLinkRequiredError);
    expect(await connectManualReviewPage(card.id, stranger.id, "https://g.page/r/example/review")).toBeNull();
    expect(await reviewPageForCard(card.id)).toBeNull();
  });
});
