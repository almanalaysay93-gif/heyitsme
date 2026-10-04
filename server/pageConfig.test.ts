import { describe, expect, it } from "vitest";
import {
  defaultPageConfig,
  pageConfigField,
  parsePageConfig,
  readableOn,
  resolveSections,
  switchTemplate,
  TEMPLATES,
} from "@shared/pageConfig";

describe("parsePageConfig", () => {
  it("falls back to the Professional default for empty, corrupt or invalid values", () => {
    for (const raw of [null, "", "not json", '{"template":"casino"}', "[]"]) {
      expect(parsePageConfig(raw).template).toBe("professional");
    }
  });

  it("keeps valid owner content", () => {
    const raw = JSON.stringify({ template: "services", services: [{ name: "Haircut", price: "₱350" }], accent: "#b4452f" });
    const config = parsePageConfig(raw);
    expect(config.template).toBe("services");
    expect(config.services[0]).toMatchObject({ name: "Haircut", price: "₱350", description: "", url: "" });
    expect(config.accent).toBe("#b4452f");
  });
});

describe("resolveSections", () => {
  it("uses the template order when the owner never reordered", () => {
    expect(resolveSections(defaultPageConfig("business")).map((s) => s.id)).toEqual(TEMPLATES.business.sections);
  });

  it("gives Business and Services a Google reviews section, and Professional none", () => {
    expect(resolveSections(defaultPageConfig("business")).map((s) => s.id)).toContain("googleReviews");
    expect(resolveSections(defaultPageConfig("services")).map((s) => s.id)).toContain("googleReviews");
    expect(resolveSections(defaultPageConfig("professional")).map((s) => s.id)).not.toContain("googleReviews");
  });

  it("on a card saved before Google reviews was its own section, places it right after references with the same visibility", () => {
    const saved = { ...defaultPageConfig("business"), sections: [{ id: "references" as const, hidden: true }, { id: "contact" as const, hidden: false }] };
    const out = resolveSections(saved);
    expect(out.slice(0, 3)).toEqual([{ id: "references", hidden: true }, { id: "googleReviews", hidden: true }, { id: "contact", hidden: false }]);
  });

  it("keeps owner order, drops duplicates and appends sections the owner never placed", () => {
    const config = { ...defaultPageConfig("services"), sections: [{ id: "contact" as const, hidden: true }, { id: "contact" as const, hidden: false }] };
    const out = resolveSections(config);
    expect(out[0]).toEqual({ id: "contact", hidden: true });
    expect(out.filter((s) => s.id === "contact")).toHaveLength(1);
    expect(out).toHaveLength(TEMPLATES.services.sections.length);
  });
});

describe("switchTemplate", () => {
  it("adopts the new order but keeps content and hidden choices", () => {
    const start = { ...defaultPageConfig("professional"), services: [{ name: "Audit", description: "", price: "", url: "" }] };
    start.sections = resolveSections(start).map((s) => (s.id === "references" ? { ...s, hidden: true } : s));
    const next = switchTemplate(start, "business");
    expect(next.template).toBe("business");
    expect(next.services).toHaveLength(1);
    expect(resolveSections(next).map((s) => s.id)).toEqual(TEMPLATES.business.sections);
    expect(resolveSections(next).find((s) => s.id === "references")?.hidden).toBe(true);
  });
});

describe("pageConfigField (server validation)", () => {
  it("accepts empty and valid values", () => {
    expect(pageConfigField.safeParse(null).success).toBe(true);
    expect(pageConfigField.safeParse(JSON.stringify(defaultPageConfig("business"))).success).toBe(true);
  });

  it("rejects unsafe links, bad colors, oversized lists and non-JSON", () => {
    const bad = [
      JSON.stringify({ cta: { label: "Go", url: "javascript:alert(1)" } }),
      JSON.stringify({ links: [{ title: "Bad", url: "javascript:alert(1)" }] }),
      JSON.stringify({ accent: "red" }),
      JSON.stringify({ stats: Array.from({ length: 5 }, () => ({ value: "1", label: "x" })) }),
      JSON.stringify({ links: Array.from({ length: 13 }, (_, i) => ({ title: `L${i}`, url: "https://example.com" })) }),
      JSON.stringify({ contactPersons: Array.from({ length: 9 }, (_, i) => ({ name: `P${i}` })) }),
      "{nope",
    ];
    for (const value of bad) expect(pageConfigField.safeParse(value).success).toBe(false);
  });

  it("accepts valid business links and contact persons", () => {
    const valid = JSON.stringify({
      template: "business",
      contactPersons: [
        { name: "Maria Santos", role: "Office in Charge", phone: "+63 912 345 6789", email: "maria@example.com" },
      ],
      links: [
        { title: "Portal", url: "https://portal.example.com", description: "Online portal" },
      ],
    });
    expect(pageConfigField.safeParse(valid).success).toBe(true);
  });
});

describe("readableOn", () => {
  it("picks dark text on light accents and white on dark ones", () => {
    expect(readableOn("#ffd5a7")).toBe("#111111");
    expect(readableOn("#11152b")).toBe("#ffffff");
  });
});

describe("frames", () => {
  it("uses the template default until the owner picks one, and rejects unknown frames", async () => {
    const { resolveFrame } = await import("@shared/pageConfig");
    expect(resolveFrame(defaultPageConfig("professional"))).toBe("portrait");
    expect(resolveFrame({ ...defaultPageConfig("services"), frame: "blob" })).toBe("blob");
    expect(pageConfigField.safeParse(JSON.stringify({ frame: "tombstone" })).success).toBe(false);
  });
});


describe("business section compatibility", () => {
  it("gives business blocks their own hide and order controls without losing content", () => {
    const config = parsePageConfig(JSON.stringify({
      template: "business",
      sections: [{ id: "resourceLinks", hidden: true }, { id: "contactPersons" }],
      links: [{ title: "Portal", url: "https://example.com" }],
      contactPersons: [{ name: "Officer" }],
    }));
    expect(config.template).toBe("business");
    expect(resolveSections(config).slice(0, 2)).toEqual([
      { id: "resourceLinks", hidden: true }, { id: "contactPersons", hidden: false },
    ]);
    const switched = switchTemplate(config, "services");
    expect(switched.links).toEqual(config.links);
    expect(switched.contactPersons).toEqual(config.contactPersons);
    expect(resolveSections(switched).find((section) => section.id === "resourceLinks")?.hidden).toBe(true);
  });

  it("keeps old hidden contact directories hidden when new controls are introduced", () => {
    const config = parsePageConfig(JSON.stringify({
      template: "business", sections: [{ id: "contact", hidden: true }],
      links: [{ title: "Portal", url: "https://example.com" }],
      contactPersons: [{ name: "Officer" }],
    }));
    for (const id of ["contactPersons", "resourceLinks"]) {
      expect(resolveSections(config).find((section) => section.id === id)?.hidden).toBe(true);
    }
  });
});
