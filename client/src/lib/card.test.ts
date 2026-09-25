import { describe, expect, it, vi } from "vitest";
import {
  buildVCard,
  cardPayload,
  channelHref,
  emptyCard,
  executeBatchUpload,
  getNextLightboxIndex,
  getPrevLightboxIndex,
  isLightboxOpen,
  MAX_PORTFOLIO_ITEMS,
  MAX_PORTFOLIO_LENGTH,
  parseChannels,
  parseLinks,
  parsePortfolio,
  portfolioStoredLength,
  toHref,
  uploadInlineMedia,
  websiteShotFrom,
  websiteShotRequest,
  type PortfolioItem,
} from "./card";

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

describe("GalleryLightbox navigation & state", () => {
  it("determines whether the lightbox is open based on index and item bounds", () => {
    expect(isLightboxOpen(null, 3)).toBe(false);
    expect(isLightboxOpen(-1, 3)).toBe(false);
    expect(isLightboxOpen(3, 3)).toBe(false);
    expect(isLightboxOpen(4, 3)).toBe(false);
    expect(isLightboxOpen(0, 3)).toBe(true);
    expect(isLightboxOpen(2, 3)).toBe(true);
    expect(isLightboxOpen(0, 0)).toBe(false);
  });

  it("navigates forward with wrap-around to start", () => {
    expect(getNextLightboxIndex(0, 3)).toBe(1);
    expect(getNextLightboxIndex(1, 3)).toBe(2);
    expect(getNextLightboxIndex(2, 3)).toBe(0);
    expect(getNextLightboxIndex(0, 1)).toBe(0);
    expect(getNextLightboxIndex(0, 0)).toBe(0);
  });

  it("navigates backward with wrap-around to end", () => {
    expect(getPrevLightboxIndex(2, 3)).toBe(1);
    expect(getPrevLightboxIndex(1, 3)).toBe(0);
    expect(getPrevLightboxIndex(0, 3)).toBe(2);
    expect(getPrevLightboxIndex(0, 1)).toBe(0);
    expect(getPrevLightboxIndex(0, 0)).toBe(0);
  });
});

describe("executeBatchUpload", () => {
  it("uploads all files successfully and assigns proper properties", async () => {
    const existing: PortfolioItem[] = [
      { id: "existing-1", kind: "link", title: "My Site", url: "https://example.com" },
    ];
    const files = [
      { name: "photo1.jpg", type: "image/jpeg" },
      { name: "clip.mp4", type: "video/mp4" },
      { name: "doc.pdf", type: "application/pdf" },
    ];
    const uploader = vi.fn().mockImplementation(async (f) => `/storage/7-portfolio/${f.name}`);
    const onProgress = vi.fn();

    const result = await executeBatchUpload(existing, files, uploader, {
      description: "Sample description",
      onProgress,
    });

    expect(result.error).toBeUndefined();
    expect(result.warning).toBeUndefined();
    expect(result.newItems).toHaveLength(3);
    expect(result.updatedItems).toHaveLength(4);
    expect(uploader).toHaveBeenCalledTimes(3);

    // First image receives the initial description, subsequent ones do not unless single
    expect(result.newItems[0].kind).toBe("image");
    expect(result.newItems[0].title).toBe("");
    expect(result.newItems[0].url).toBe("/storage/7-portfolio/photo1.jpg");
    expect(result.newItems[0].description).toBe("Sample description");

    expect(result.newItems[1].kind).toBe("video");
    expect(result.newItems[1].title).toBe("clip");
    expect(result.newItems[1].url).toBe("/storage/7-portfolio/clip.mp4");
    expect(result.newItems[1].description).toBeUndefined();

    expect(result.newItems[2].kind).toBe("file");
    expect(result.newItems[2].title).toBe("doc");
    expect(result.newItems[2].url).toBe("/storage/7-portfolio/doc.pdf");

    expect(onProgress).toHaveBeenCalledWith("Uploading 1 of 3 (photo1.jpg)…");
  });

  it("handles partial failure without dropping successful uploads", async () => {
    const files = [
      { name: "good1.png", type: "image/png" },
      { name: "corrupted.png", type: "image/png" },
      { name: "good2.png", type: "image/png" },
    ];
    const uploader = vi.fn().mockImplementation(async (f) => {
      if (f.name === "corrupted.png") throw new Error("Upload failed: file corrupted");
      return `/storage/7-portfolio/${f.name}`;
    });
    const onError = vi.fn();

    const result = await executeBatchUpload([], files, uploader, { onError });

    expect(result.newItems).toHaveLength(2);
    expect(result.newItems.map((item) => item.url)).toEqual([
      "/storage/7-portfolio/good1.png",
      "/storage/7-portfolio/good2.png",
    ]);
    expect(onError).toHaveBeenCalledWith("corrupted.png", expect.any(Error));
  });

  it("rejects uploads when portfolio has already reached maximum item capacity", async () => {
    const fullItems: PortfolioItem[] = Array.from({ length: MAX_PORTFOLIO_ITEMS }, (_, i) => ({
      id: `item-${i}`,
      kind: "image",
      title: "",
      url: `/storage/7-portfolio/pic-${i}.jpg`,
    }));

    const uploader = vi.fn();
    const result = await executeBatchUpload(fullItems, [{ name: "another.png", type: "image/png" }], uploader);

    expect(result.error).toContain(`Portfolio is full (maximum ${MAX_PORTFOLIO_ITEMS} items)`);
    expect(result.newItems).toHaveLength(0);
    expect(uploader).not.toHaveBeenCalled();
  });

  it("slices batch files and issues a warning when selection exceeds remaining slots", async () => {
    const items: PortfolioItem[] = Array.from({ length: 18 }, (_, i) => ({
      id: `item-${i}`,
      kind: "image",
      title: "",
      url: `/storage/7-portfolio/pic-${i}.jpg`,
    }));

    const files = [
      { name: "photo1.png", type: "image/png" },
      { name: "photo2.png", type: "image/png" },
      { name: "photo3.png", type: "image/png" },
      { name: "photo4.png", type: "image/png" },
    ];
    const uploader = vi.fn().mockImplementation(async (f) => `/storage/7-portfolio/${f.name}`);

    const result = await executeBatchUpload(items, files, uploader);

    expect(result.warning).toContain(`Only 2 item(s) can be added (maximum ${MAX_PORTFOLIO_ITEMS})`);
    expect(result.newItems).toHaveLength(2);
    expect(uploader).toHaveBeenCalledTimes(2);
  });

  it("stops before calling uploader when projected serialized size exceeds max length", async () => {
    // Construct an item that puts total JSON close to the cap
    const longDesc = "A".repeat(4000);
    const nearCapItems: PortfolioItem[] = [
      { id: "1", kind: "image", title: "", url: "https://example.com/1.jpg", description: longDesc },
      { id: "2", kind: "image", title: "", url: "https://example.com/2.jpg", description: longDesc },
    ];

    const files = [
      { name: "photo1.jpg", type: "image/jpeg" },
      { name: "photo2.jpg", type: "image/jpeg" },
    ];
    const uploader = vi.fn().mockResolvedValue("/storage/7-portfolio/photo.jpg");

    // With maxLength set to 8500 (near current JSON length), projected length will hit cap
    const result = await executeBatchUpload(nearCapItems, files, uploader, {
      maxLength: 8500,
    });

    expect(result.warning).toContain("Portfolio size limit reached");
    expect(result.newItems).toHaveLength(0);
    // Uploader was never called! No orphan files created in storage!
    expect(uploader).not.toHaveBeenCalled();
  });
});


describe("preview-mode portfolio uploads", () => {
  it("count inline photos at their future storage link length, so they fit under the cap", async () => {
    const inlinePhoto = `data:image/jpeg;base64,${"A".repeat(40_000)}`;
    const result = await executeBatchUpload([], [{ name: "me.jpg", type: "image/jpeg" }], async () => inlinePhoto);

    expect(result.warning).toBeUndefined();
    expect(result.newItems).toHaveLength(1);
    expect(result.newItems[0].url).toBe(inlinePhoto);
    expect(portfolioStoredLength(result.updatedItems)).toBeLessThan(MAX_PORTFOLIO_LENGTH);
  });

  it("measure regular links as they are", () => {
    const items: PortfolioItem[] = [{ id: "1", kind: "link", title: "Site", url: "https://ada.design" }];
    expect(portfolioStoredLength(items)).toBe(JSON.stringify(items).length);
  });
});
