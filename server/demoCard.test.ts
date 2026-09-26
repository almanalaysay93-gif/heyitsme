import { describe, expect, it } from "vitest";
import { DEMO_CARD, DEMO_CARD_ID, DEMO_REFERENCES, DEMO_SLUG } from "@shared/demoCard";
import { isReservedSlug } from "@shared/routes";
import { getCardById, getPublicCardBySlug, getReferencesByCard } from "./db";
import { appRouter } from "./routers";

describe("Demo Card (/c/demo)", () => {
  it("reserves the demo slug", () => {
    expect(isReservedSlug(DEMO_SLUG)).toBe(true);
    expect(isReservedSlug("DEMO")).toBe(true);
    expect(isReservedSlug("random-user-slug")).toBe(false);
  });

  it("returns DEMO_CARD fixture via db helpers without database calls", async () => {
    const publicCard = await getPublicCardBySlug("demo");
    expect(publicCard).toBeDefined();
    expect(publicCard?.slug).toBe("demo");
    expect(publicCard?.displayName).toBe("Alex Morgan");
    expect(publicCard?.email).toBe("alex@example.com");

    const cardById = await getCardById(DEMO_CARD_ID);
    expect(cardById).toBeDefined();
    expect(cardById?.id).toBe(DEMO_CARD_ID);

    const refs = await getReferencesByCard(DEMO_CARD_ID);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].clientName).toBe("Sarah Chen");
  });

  it("publicCard.bySlug serves demo card with references", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {
        protocol: "http",
        get: () => "heyitsme.fyi",
        ip: "127.0.0.1",
      } as any,
      res: {} as any,
    });

    const result = await caller.publicCard.bySlug({ slug: "demo" });
    expect(result).not.toBeNull();
    expect(result?.slug).toBe("demo");
    expect(result?.displayName).toBe("Alex Morgan");
    expect(result?.references.length).toBeGreaterThan(0);
  });

  it("publicCard.exchange simulates success for demo card without modifying DB or sending mail", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {
        protocol: "http",
        get: () => "heyitsme.fyi",
        ip: "127.0.0.1",
      } as any,
      res: {} as any,
    });

    const exchanged = await caller.publicCard.exchange({
      cardId: DEMO_CARD_ID,
      name: "Jordan Lee",
      email: "jordan@example.com",
      phone: "+1 555-0199",
      company: "Acme",
      title: "Product Manager",
      notes: "Met at demo",
    });

    expect(exchanged.id).toBe(-999);
    expect(exchanged.name).toBe("Jordan Lee");
    expect(exchanged.email).toBe("jordan@example.com");
  });

  it("publicCard.track accepts demo card without errors", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {
        protocol: "http",
        get: () => "heyitsme.fyi",
        ip: "127.0.0.1",
      } as any,
      res: {} as any,
    });

    const result = await caller.publicCard.track({
      cardId: DEMO_CARD_ID,
      type: "vcard",
    });

    expect(result).toEqual({ ok: true });
  });
});
