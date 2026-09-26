import { describe, expect, it } from "vitest";
import { defaultPageConfig, pageConfigSchema, parsePageConfig, resolveSections, type PageConfig } from "@shared/pageConfig";
import { hasPendingEdits, isUnusableLink, moveSection, normalizeLink, toEmittable, toggleSection } from "./pageDesigner";

const base = (): PageConfig => defaultPageConfig("services");

describe("toEmittable", () => {
  it("drops incomplete rows and the result passes the schema", () => {
    const config: PageConfig = {
      ...base(),
      stats: [{ value: "12", label: "years" }, { value: "300", label: "" }],
      services: [
        { name: "  Haircut ", description: "", price: "$30", url: "" },
        { name: "", description: "half typed", price: "$10", url: "" },
      ],
      hours: [{ days: "Mon", time: "" }, { days: "Tue – Fri", time: "9–5" }],
    };
    const out = toEmittable(config);
    expect(out).not.toBeNull();
    expect(pageConfigSchema.safeParse(out).success).toBe(true);
    expect(out!.stats).toEqual([{ value: "12", label: "years" }]);
    expect(out!.services.map((s) => s.name)).toEqual(["Haircut"]);
    expect(out!.hours).toEqual([{ days: "Tue – Fri", time: "9–5" }]);
    expect(out!.sections).toEqual(resolveSections(config));
  });

  it("normalises links and blanks ones it cannot use", () => {
    const out = toEmittable({
      ...base(),
      accent: "not-a-color",
      cta: { label: "Book", url: "cal.com/me" },
      services: [{ name: "Cut", description: "", price: "", url: "javascript:alert(1)" }],
    })!;
    expect(out.accent).toBe("");
    expect(out.cta).toEqual({ label: "Book", url: "https://cal.com/me" });
    expect(out.services[0].url).toBe("");
  });

  it("round-trips through parsePageConfig", () => {
    const out = toEmittable({ ...base(), accent: "#112233", address: "1 Main St" })!;
    expect(parsePageConfig(JSON.stringify(out))).toEqual(out);
  });

  it("refuses configs over the size cap", () => {
    const long = "x".repeat(240);
    const services = Array.from({ length: 12 }, (_, i) => ({ name: `S${i}`, description: long, price: "", url: `https://example.com/${"y".repeat(400)}` }));
    expect(toEmittable({ ...base(), services })).toBeNull();
  });
});

describe("normalizeLink", () => {
  it("handles common inputs", () => {
    expect(normalizeLink("https://a.co")).toBe("https://a.co");
    expect(normalizeLink("me@a.co")).toBe("mailto:me@a.co");
    expect(normalizeLink("+1 415 555 0183")).toBe("tel:+14155550183");
    expect(normalizeLink("hello there")).toBe("");
    expect(isUnusableLink("hello there")).toBe(true);
    expect(isUnusableLink("")).toBe(false);
  });
});

describe("section ordering", () => {
  const sections = resolveSections(base());

  it("moves up and down by one", () => {
    const down = moveSection(sections, 0, 1);
    expect(down[0].id).toBe(sections[1].id);
    expect(down[1].id).toBe(sections[0].id);
    expect(moveSection(down, 1, -1)).toEqual(sections);
  });

  it("ignores moves past either end without mutating", () => {
    expect(moveSection(sections, 0, -1)).toBe(sections);
    expect(moveSection(sections, sections.length - 1, 1)).toBe(sections);
  });

  it("toggles one section's visibility", () => {
    const toggled = toggleSection(sections, 2);
    expect(toggled[2].hidden).toBe(true);
    expect(toggled.filter((s) => s.hidden)).toHaveLength(1);
    expect(sections[2].hidden).toBe(false);
  });
});

describe("gate regressions", () => {
  it("flags half-typed rows and unusable links as pending, complete ones as not", () => {
    const clean = defaultPageConfig("business");
    expect(hasPendingEdits(clean)).toBe(false);
    expect(hasPendingEdits({ ...clean, stats: [{ value: "12", label: "" }] })).toBe(true);
    expect(hasPendingEdits({ ...clean, hours: [{ days: "", time: "9–5" }] })).toBe(true);
    expect(hasPendingEdits({ ...clean, services: [{ name: "", description: "", price: "$10", url: "" }] })).toBe(true);
    expect(hasPendingEdits({ ...clean, cta: { label: "Go", url: "not a link" } })).toBe(true);
    expect(hasPendingEdits({ ...clean, stats: [{ value: "12", label: "years" }] })).toBe(false);
  });

  it("drops a link that the https:// prefix pushes past 600 characters instead of failing the page", () => {
    const long = `${"a".repeat(590)}.com`;
    expect(normalizeLink(long)).toBe("");
    const out = toEmittable({ ...defaultPageConfig(), cta: { label: "Go", url: long } });
    expect(out).not.toBeNull();
    expect(out!.cta?.url).toBe("");
  });

  it("keeps the services headline", () => {
    expect(toEmittable({ ...defaultPageConfig("services"), headline: "  Color & cuts  " })!.headline).toBe("Color & cuts");
  });
});
