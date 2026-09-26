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
      JSON.stringify({ accent: "red" }),
      JSON.stringify({ stats: Array.from({ length: 5 }, () => ({ value: "1", label: "x" })) }),
      "{nope",
    ];
    for (const value of bad) expect(pageConfigField.safeParse(value).success).toBe(false);
  });
});

describe("readableOn", () => {
  it("picks dark text on light accents and white on dark ones", () => {
    expect(readableOn("#ffd5a7")).toBe("#111111");
    expect(readableOn("#11152b")).toBe("#ffffff");
  });
});
