import { describe, expect, it } from "vitest";
import { makeCardSlug } from "@shared/routes";
import { serverCardFields } from "@shared/cardValidation";
import { z } from "zod";

describe("makeCardSlug", () => {
  it("uses the display name as a readable prefix", () => {
    expect(makeCardSlug("Alex Morgan", "AbC123")).toBe("alex-morgan-abc123");
  });

  it("folds accents instead of dropping letters", () => {
    expect(makeCardSlug("José Núñez", "x1y2z3")).toBe("jose-nunez-x1y2z3");
  });

  it("falls back to card for non-Latin, placeholder and reserved names", () => {
    expect(makeCardSlug("山田太郎", "aaaaaa")).toBe("card-aaaaaa");
    expect(makeCardSlug("Your name", "aaaaaa")).toBe("card-aaaaaa");
    expect(makeCardSlug("Untitled card", "aaaaaa")).toBe("card-aaaaaa");
    expect(makeCardSlug("Demo", "aaaaaa")).toBe("card-aaaaaa");
  });

  it("fits the 120-character column for the longest allowed name", () => {
    const longest = "a".repeat(160);
    z.object(serverCardFields).pick({ displayName: true }).parse({ displayName: longest });
    const slug = makeCardSlug(longest, "abcdef");
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).not.toMatch(/--/);
  });

  it("never leaves a trailing dash when the cap splits a word boundary", () => {
    const name = `${"b".repeat(47)} tail`;
    expect(makeCardSlug(name, "abcdef")).toBe(`${"b".repeat(47)}-abcdef`);
  });
});

describe("slug preservation", () => {
  it("card update input cannot carry a slug, so renames keep the published link", () => {
    const parsed = z.object(serverCardFields).parse({ displayName: "New Name", slug: "hijacked" } as any);
    expect("slug" in parsed).toBe(false);
  });
});
