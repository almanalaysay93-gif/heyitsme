import { describe, expect, it } from "vitest";
import { buildVCard, emptyCard, parseChannels, parseLinks, parsePortfolio, toHref } from "./card";

describe("toHref", () => {
  it("blocks script-capable schemes, including obfuscated ones", () => {
    expect(toHref("javascript:alert(1)")).toBe("#");
    expect(toHref(" JaVaScRiPt:alert(1)")).toBe("#");
    expect(toHref("java\tscript:alert(1)")).toBe("#");
    expect(toHref("data:text/html,<b>x</b>")).toBe("#");
    expect(toHref("vbscript:msgbox")).toBe("#");
  });

  it("keeps real links and upgrades bare domains", () => {
    expect(toHref("https://ada.design")).toBe("https://ada.design");
    expect(toHref("mailto:ada@example.com")).toBe("mailto:ada@example.com");
    expect(toHref("/storage/file.pdf")).toBe("/storage/file.pdf");
    expect(toHref("ada.design")).toBe("https://ada.design");
    expect(toHref("   ")).toBe("#");
  });
});

describe("parse helpers", () => {
  it("parseLinks reads JSON arrays and legacy comma lists", () => {
    expect(parseLinks('["a.com","","b.com"]')).toEqual(["a.com", "b.com"]);
    expect(parseLinks("a.com, b.com")).toEqual(["a.com", "b.com"]);
    expect(parseLinks(null)).toEqual([]);
  });

  it("parsePortfolio drops items without a url and survives bad JSON", () => {
    expect(parsePortfolio('[{"id":"1","url":"x"},{"id":"2"}]')).toHaveLength(1);
    expect(parsePortfolio("{nope")).toEqual([]);
  });

  it("parseChannels keeps empty rows only when asked", () => {
    const raw = JSON.stringify([{ provider: "linkedin", url: "" }, { provider: "x", url: "x.com/ada" }]);
    expect(parseChannels(raw)).toHaveLength(1);
    expect(parseChannels(raw, { keepEmpty: true })).toHaveLength(2);
  });
});

describe("buildVCard", () => {
  const card = {
    ...emptyCard,
    displayName: "Ada, Lane",
    title: "Designer; Lead",
    company: "Northwind",
    email: "ada@example.com",
    phone: "+1 555 0100",
    bio: "Line one\nLine two",
    avatarUrl: "/storage/ada.webp",
  };

  it("escapes separators and uses CRLF line endings", () => {
    const vcard = buildVCard(card, "https://heyitsme.example/c/ada", "https://heyitsme.example");
    expect(vcard.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(vcard).toContain("FN:Ada\\, Lane");
    expect(vcard).toContain("TITLE:Designer\\; Lead");
    expect(vcard).toContain("NOTE:Line one\\nLine two");
    expect(vcard).toContain("PHOTO;VALUE=URI:https://heyitsme.example/storage/ada.webp");
    expect(vcard.endsWith("END:VCARD")).toBe(true);
  });

  it("skips inline data photos and empty fields", () => {
    const vcard = buildVCard({ ...emptyCard, displayName: "", avatarUrl: "data:image/png;base64,AAAA" }, "https://x.example/c/a", "https://x.example");
    expect(vcard).toContain("FN:Contact");
    expect(vcard).not.toContain("PHOTO");
    expect(vcard).not.toContain("EMAIL");
  });
});
