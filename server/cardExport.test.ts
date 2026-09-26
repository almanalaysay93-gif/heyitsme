import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { buildCardExport, CARD_EXPORT_FORMAT, CARD_EXPORT_VERSION } from "./cardExport";
import type { TrpcContext } from "./_core/context";

const at = new Date("2026-09-01T00:00:00Z");
const card: any = {
  id: 7, ownerUserId: 1, creationKey: "secret-key", displayName: "Alex Morgan", title: "Designer", company: "Example Co",
  email: "alex@example.com", phone: "+1 555 0100", location: "Manila", bio: "Hi",
  links: '["https://example.com"]', portfolio: '[{"kind":"image","url":"/api/storage/u/1/a.png"}]', channels: "not json",
  theme: "tide", logoUrl: null, avatarUrl: "/api/storage/u/1/me.png", coverUrl: null, backgroundUrl: null,
  contactHeading: null, galleryHeading: "Work", portfolioHeading: null,
  slug: "alex-morgan-abc123", published: true, deletedAt: null, createdAt: at, updatedAt: at,
};

describe("buildCardExport", () => {
  it("declares format, version and URL-only media scope", () => {
    const out = buildCardExport([card], new Map(), at);
    expect(out).toMatchObject({ format: CARD_EXPORT_FORMAT, version: CARD_EXPORT_VERSION, mediaScope: "urls-only", exportedAt: at.toISOString() });
  });

  it("includes every content field, parsed lists and references", () => {
    const ref: any = { id: 1, cardId: 7, ownerUserId: 1, clientName: "Jo", clientRole: null, company: null, quote: "Great", avatarUrl: null, approved: true, createdAt: at };
    const [c] = buildCardExport([card], new Map([[7, [ref]]]), at).cards;
    expect(c.displayName).toBe("Alex Morgan");
    expect(c.publicUrlPath).toBe("/c/alex-morgan-abc123");
    expect(c.links).toEqual(["https://example.com"]);
    expect(c.portfolio).toEqual([{ kind: "image", url: "/api/storage/u/1/a.png" }]);
    expect(c.channels).toEqual([]); // corrupt JSON degrades to empty, not a crash
    expect(c.media.avatarUrl).toBe("/api/storage/u/1/me.png");
    expect(c.headings.gallery).toBe("Work");
    expect(c.references).toEqual([{ clientName: "Jo", clientRole: null, company: null, quote: "Great", avatarUrl: null, approved: true, createdAt: at.toISOString() }]);
  });

  it("leaves out internal ids, owner ids, creation keys and deleted cards", () => {
    const out = buildCardExport([card, { ...card, id: 8, slug: "gone", deletedAt: at }], new Map(), at);
    expect(out.cards).toHaveLength(1);
    const json = JSON.stringify(out);
    expect(json).not.toContain("secret-key");
    expect(json).not.toContain("ownerUserId");
    expect(out.cards[0]).not.toHaveProperty("id");
  });
});

describe("cards.export authorization", () => {
  it("rejects signed-out callers", async () => {
    const ctx = { user: null, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext;
    await expect(appRouter.createCaller(ctx).cards.export()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
