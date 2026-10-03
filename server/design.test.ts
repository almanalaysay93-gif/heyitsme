import { describe, it, expect } from "vitest";
import {
  ANIMATIONS,
  COLORS,
  THEMES,
  contrast,
  designSchema,
  designReadable,
  premiumDesign,
  premiumQr,
  qrSchema,
} from "../shared/design";
import { pageConfigField, parsePageConfig } from "../shared/pageConfig";
describe("Pro design contract", () => {
  it("allows all six free palettes and three free themes", () => {
    for (const [, color, text] of COLORS.slice(0, 6)) {
      const d = designSchema.parse({ colors: [color], text });
      expect(premiumDesign(d)).toBe(false);
      expect(designReadable(d)).toBe(true);
    }
    for (const t of THEMES.slice(0, 3))
      expect(premiumDesign(t.design)).toBe(false);
  });
  it("classifies premium colors, typography, backgrounds and animations", () => {
    expect(
      premiumDesign(
        designSchema.parse({ colors: [COLORS[6][1]], text: COLORS[6][2] })
      )
    ).toBe(true);
    for (const preset of ANIMATIONS.slice(2))
      expect(
        premiumDesign(
          designSchema.parse({ animation: { preset, intensity: "subtle" } })
        )
      ).toBe(true);
    expect(premiumDesign(designSchema.parse({ font: "Inter" }))).toBe(true);
    expect(premiumDesign(designSchema.parse({ backgroundType: "glass" }))).toBe(
      true
    );
  });
  it("rejects malformed configuration, arbitrary fonts and animation modes", () => {
    expect(
      pageConfigField.safeParse('{"design":{"colors":["red"]}}').success
    ).toBe(false);
    expect(designSchema.safeParse({ font: "Uploaded Font" }).success).toBe(
      false
    );
    expect(
      designSchema.safeParse({
        animation: { preset: "aurora", intensity: "extreme" },
      }).success
    ).toBe(false);
  });
  it("round-trips stored design and flags invisible text and actions", () => {
    const d = designSchema.parse({});
    expect(parsePageConfig(JSON.stringify({ design: d })).design).toEqual(d);
    expect(designReadable({ ...d, text: d.colors[0] })).toBe(false);
    expect(designReadable({ ...d, buttonText: d.button })).toBe(false);
    expect(contrast("#000000", "#FFFFFF")).toBe(21);
  });
  it("keeps Free QR monochrome and rejects unsafe contrast and logos", () => {
    expect(premiumQr(qrSchema.parse({}))).toBe(false);
    expect(qrSchema.safeParse({ foreground: "#AAAAAA" }).success).toBe(false);
    expect(
      qrSchema.safeParse({ foreground: "#FFFFFF", background: "#000000" })
        .success
    ).toBe(false);
    expect(qrSchema.safeParse({ logo: "javascript:alert(1)" }).success).toBe(
      false
    );
  });
});
