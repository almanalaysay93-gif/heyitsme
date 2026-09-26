import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { themeOptions } from "./card";

// WCAG 2.x relative luminance and contrast ratio.
type RGB = [number, number, number];
const hex = (value: string): RGB => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v * t + b[i] * (1 - t)) as RGB;
const channel = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]: RGB) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const css = readFileSync(path.resolve(import.meta.dirname, "../index.css"), "utf8");
function whiteAlpha(selector: string): number {
  const rule = css.split(/\r?\n/).find((line) => line.startsWith(`${selector} {`) && line.includes("rgba(255,255,255,"));
  const match = rule?.match(/rgba\(255,255,255,([.\d]+)\)/);
  if (!match) throw new Error(`no white text color for ${selector}`);
  return Number(match[1]);
}

describe("card text contrast (WCAG AA 4.5:1)", () => {
  const texts = [".card-role", ".card-bio", ".card-bottomline"].map((selector) => [selector, whiteAlpha(selector)] as const);

  for (const theme of themeOptions) {
    const [a, b, c] = theme.colors.map(hex);
    // Base plus the two radial glows at roughly half their peak strength, where text actually sits.
    // ponytail: approximates the gradient; a pixel-sampling screenshot test is the upgrade if themes get brighter.
    const backgrounds = { base: a, bottomLeft: mix(b, a, 0.65 * 0.5), topRight: mix(c, a, 0.48 * 0.5) };
    for (const [selector, alpha] of texts) {
      for (const [where, bg] of Object.entries(backgrounds)) {
        it(`${theme.id} ${selector} on ${where}`, () => {
          expect(ratio(mix([255, 255, 255], bg, alpha), bg)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});
