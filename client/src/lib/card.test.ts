import { describe, expect, it } from "vitest";
import { buildVCard, cardPayload, channelHref, emptyCard, parseChannels, parseLinks, parsePortfolio, toHref, uploadInlineMedia, websiteShotFrom, websiteShotRequest } from "./card";

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

describe("website screenshots", () => {
  it("asks for a screenshot of web pages only", () => {
    const request = new URL(websiteShotRequest("paddlebase.org")!);
    expect(request.origin).toBe("https://api.microlink.io");
    expect(request.searchParams.get("url")).toBe("https://paddlebase.org");
    expect(request.searchParams.get("screenshot")).toBe("true");
    expect(websiteShotRequest("/storage/7-portfolio/deck.pdf")).toBeNull();
    expect(websiteShotRequest("mailto:ada@example.com")).toBeNull();
    expect(websiteShotRequest("javascript:alert(1)")).toBeNull();
  });

  it("uses the screenshot only when the site loaded", () => {
    const shot = { url: "https://iad.microlink.io/abc.jpeg" };
    expect(websiteShotFrom({ status: "success", statusCode: 200, data: { screenshot: shot } })).toBe(shot.url);
    expect(websiteShotFrom({ status: "success", statusCode: 304, data: { screenshot: shot } })).toBe(shot.url);
    // A domain that doesn't resolve comes back with no status code and a picture of the browser's error page.
    expect(websiteShotFrom({ status: "success", statusCode: null, data: { screenshot: shot } })).toBeNull();
    expect(websiteShotFrom({ status: "success", statusCode: 404, data: { screenshot: shot } })).toBeNull();
    expect(websiteShotFrom({ status: "fail", code: "ERATE" })).toBeNull();
    expect(websiteShotFrom({ status: "success", statusCode: 200, data: { screenshot: { url: "javascript:x" } } })).toBeNull();
  });
});

describe("channelHref", () => {
  it("turns phone numbers into each messenger's link", () => {
    expect(channelHref({ provider: "whatsapp", url: "+1 (415) 555-0183" })).toBe("https://wa.me/14155550183");
    expect(channelHref({ provider: "viber", url: "+63 917 555 0100" })).toBe("viber://chat?number=%2B639175550100");
    expect(channelHref({ provider: "signal", url: "+14155550183" })).toBe("https://signal.me/#p/+14155550183");
    expect(channelHref({ provider: "telegram", url: "+14155550183" })).toBe("https://t.me/+14155550183");
  });

  it("turns handles into profile links but keeps real links and domains", () => {
    expect(channelHref({ provider: "x", url: "@ada" })).toBe("https://x.com/ada");
    expect(channelHref({ provider: "instagram", url: "@ada.lane" })).toBe("https://instagram.com/ada.lane");
    expect(channelHref({ provider: "telegram", url: "ada_lane" })).toBe("https://t.me/ada_lane");
    expect(channelHref({ provider: "whatsapp", url: "wa.me/14155550183" })).toBe("https://wa.me/14155550183");
    expect(channelHref({ provider: "linkedin", url: "https://linkedin.com/in/ada" })).toBe("https://linkedin.com/in/ada");
    expect(channelHref({ provider: "x", url: "javascript:alert(1)" })).toBe("#");
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

describe("cardPayload", () => {
  it("fills required fields and turns blanks and bad emails into null", () => {
    const payload = cardPayload({ ...emptyCard, displayName: "  ", email: "not-an-email", company: " Northwind ", links: "a.com, b.com" });
    expect(payload.displayName).toBe("Untitled card");
    expect(payload.title).toBe("Professional");
    expect(payload.email).toBeNull();
    expect(payload.company).toBe("Northwind");
    expect(payload.avatarUrl).toBeNull();
    expect(payload.links).toBe('["a.com","b.com"]');
  });
});

describe("uploadInlineMedia", () => {
  it("uploads data: URLs and keeps links that are already stored", async () => {
    const uploads: string[] = [];
    const card = {
      ...emptyCard,
      avatarUrl: "data:image/webp;base64,QUJD",
      coverUrl: "https://cdn.example/cover.jpg",
      portfolio: JSON.stringify([
        { id: "1", kind: "file", title: "Deck", url: "data:application/pdf;base64,UERG" },
        { id: "2", kind: "link", title: "Site", url: "https://ada.design" },
      ]),
    };

    const result = await uploadInlineMedia(card, async (file) => {
      uploads.push(`${file.fileName}|${file.contentType}|${file.dataBase64}`);
      return `/storage/${file.fileName}`;
    });

    expect(uploads).toEqual(["Deck|application/pdf|UERG", "profile-photo|image/webp|QUJD"]);
    expect(result.avatarUrl).toBe("/storage/profile-photo");
    expect(result.coverUrl).toBe("https://cdn.example/cover.jpg");
    expect(parsePortfolio(result.portfolio).map((item) => item.url)).toEqual(["/storage/Deck", "https://ada.design"]);
  });
});

describe("parsePortfolio", () => {
  it("parses gallery items including title, url, kind, and description", () => {
    const raw = JSON.stringify([
      { id: "1", kind: "image", title: "Sunset at Shore", url: "https://example.com/sunset.jpg", description: "Golden hour photo taken with Leica Q2" },
      { id: "2", kind: "image", title: "Architecture", url: "https://example.com/arch.jpg" },
      { id: "3", kind: "link", title: "Portfolio site", url: "https://example.com" },
    ]);
    const parsed = parsePortfolio(raw);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].description).toBe("Golden hour photo taken with Leica Q2");
    expect(parsed[0].kind).toBe("image");
    expect(parsed[1].description).toBeUndefined();
  });
});
