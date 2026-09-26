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
  PREVIEW_CARD_STORAGE_KEY,
  portfolioStoredLength,
  readPreviewCard,
  resolveActiveCard,
  splitHeading,
  toDraft,
  toHref,
  uploadInlineMedia,
  validateCardData,
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

  it("saves socials, contact providers, location, and websites with Apple/Google compatible fields", () => {
    const cardWithSocials = {
      ...emptyCard,
      displayName: "Ada Lane",
      title: "Design Lead",
      location: "San Francisco, CA",
      bio: "Crafting digital experiences.",
      channels: JSON.stringify([
        { provider: "linkedin", url: "https://www.linkedin.com/in/ada", label: "LinkedIn" },
        { provider: "whatsapp", url: "+1 (415) 555-0183", label: "WhatsApp" },
        { provider: "x", url: "@adalane", label: "X" },
      ]),
      links: JSON.stringify(["https://ada.design"]),
    };

    const vcard = buildVCard(cardWithSocials, "https://heyitsme.example/c/ada", "https://heyitsme.example");

    // Location
    expect(vcard).toContain("ADR;TYPE=WORK:;;;San Francisco\\, CA;;;");

    // Apple Contacts X-SOCIALPROFILE
    expect(vcard).toContain("X-SOCIALPROFILE;TYPE=linkedin;x-user=ada:https://www.linkedin.com/in/ada");
    expect(vcard).toContain("X-SOCIALPROFILE;TYPE=whatsapp:https://wa.me/14155550183");
    expect(vcard).toContain("X-SOCIALPROFILE;TYPE=twitter;x-user=adalane:https://x.com/adalane");

    // Grouped URLs with custom labels (iOS & Android)
    expect(vcard).toContain("item1.URL:https://www.linkedin.com/in/ada");
    expect(vcard).toContain("item1.X-ABLabel:LinkedIn");
    expect(vcard).toContain("item2.URL:https://wa.me/14155550183");
    expect(vcard).toContain("item2.X-ABLabel:WhatsApp");
    expect(vcard).toContain("item3.URL:https://x.com/adalane");
    expect(vcard).toContain("item3.X-ABLabel:X");
    expect(vcard).toContain("item4.URL:https://ada.design");
    expect(vcard).toContain("item4.X-ABLabel:Ada");

    // Notes fallback preserving bio and formatted link list
    expect(vcard).toContain("NOTE:Crafting digital experiences.\\n\\nContact & Social Links:\\n• LinkedIn: https://www.linkedin.com/in/ada\\n• WhatsApp: https://wa.me/14155550183\\n• X: https://x.com/adalane\\n• Ada: https://ada.design");
  });
});

describe("cardPayload", () => {
  it("trims fields without inventing fake defaults or deleting invalid email", () => {
    const payload = cardPayload({
      ...emptyCard,
      displayName: "  Ada Lane  ",
      title: "",
      email: "not-an-email",
      company: " Northwind ",
      links: "a.design, b.com",
    });
    expect(payload.displayName).toBe("Ada Lane");
    expect(payload.title).toBe("");
    expect(payload.email).toBe("not-an-email");
    expect(payload.company).toBe("Northwind");
    expect(payload.avatarUrl).toBeNull();
    expect(payload.links).toBe('["https://a.design","https://b.com"]');
    expect(payload.contactHeading).toBeNull();
    expect(payload.galleryHeading).toBeNull();
    expect(payload.portfolioHeading).toBeNull();
  });

  it("trims custom section headings and passes them through", () => {
    const payload = cardPayload({
      ...emptyCard,
      contactHeading: "  Let's chat directly!  ",
      galleryHeading: "Selected shots",
      portfolioHeading: "Featured projects",
    });
    expect(payload.contactHeading).toBe("Let's chat directly!");
    expect(payload.galleryHeading).toBe("Selected shots");
    expect(payload.portfolioHeading).toBe("Featured projects");
  });
});

describe("validateCardData", () => {
  it("requires a non-empty displayName", () => {
    const emptyName = validateCardData({ displayName: "   " });
    expect(emptyName.isValid).toBe(false);
    expect(emptyName.errors.displayName).toBeDefined();

    const validName = validateCardData({ displayName: "Ada Lane" });
    expect(validName.isValid).toBe(true);
    expect(validName.errors.displayName).toBeUndefined();
  });

  it("keeps role/title optional and allows blank title", () => {
    const res = validateCardData({ displayName: "Ada Lane", title: "" });
    expect(res.isValid).toBe(true);
    expect(res.errors.title).toBeUndefined();
  });

  it("validates email when provided and rejects malformed email", () => {
    const invalid = validateCardData({ displayName: "Ada", email: "not-an-email" });
    expect(invalid.isValid).toBe(false);
    expect(invalid.errors.email).toBe("Please enter a valid email address.");

    const valid = validateCardData({ displayName: "Ada", email: "ada@example.com" });
    expect(valid.isValid).toBe(true);
    expect(valid.errors.email).toBeUndefined();

    const blank = validateCardData({ displayName: "Ada", email: "" });
    expect(blank.isValid).toBe(true);
  });

  it("rejects unsafe URL schemes in links", () => {
    const unsafe = validateCardData({
      displayName: "Ada",
      links: JSON.stringify(["javascript:alert(1)"]),
    });
    expect(unsafe.isValid).toBe(false);
    expect(unsafe.errors.links).toBeDefined();

    const badUrl = validateCardData({
      displayName: "Ada",
      links: JSON.stringify(["not a valid domain url"]),
    });
    expect(badUrl.isValid).toBe(false);
    expect(badUrl.errors.links).toBeDefined();

    const valid = validateCardData({
      displayName: "Ada",
      links: JSON.stringify(["https://ada.design", "github.com/ada"]),
    });
    expect(valid.isValid).toBe(true);
  });

  it("validates channels with provider-specific rules", () => {
    const validPhone = validateCardData({
      displayName: "Ada",
      channels: JSON.stringify([{ provider: "whatsapp", url: "+1 415 555 0183" }]),
    });
    expect(validPhone.isValid).toBe(true);

    const unsafeChannel = validateCardData({
      displayName: "Ada",
      channels: JSON.stringify([{ provider: "x", url: "javascript:alert(1)" }]),
    });
    expect(unsafeChannel.isValid).toBe(false);
    expect(unsafeChannel.errors.channels).toBeDefined();
  });
});

describe("toDraft", () => {
  it("maps null section headings to empty strings", () => {
    const draft = toDraft({
      id: 1,
      displayName: "Ada",
      title: "Designer",
      company: null,
      email: null,
      phone: null,
      location: null,
      bio: null,
      links: null,
      portfolio: null,
      channels: null,
      theme: "midnight",
      avatarUrl: null,
      coverUrl: null,
      backgroundUrl: null,
      slug: "ada",
      published: true,
      contactHeading: null,
      galleryHeading: null,
      portfolioHeading: null,
    });
    expect(draft.contactHeading).toBe("");
    expect(draft.galleryHeading).toBe("");
    expect(draft.portfolioHeading).toBe("");
  });
});

describe("readPreviewCard", () => {
  it("reads a preview marked Live as private and stores that correction", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
      },
    });
    store.set(PREVIEW_CARD_STORAGE_KEY, JSON.stringify({ ...emptyCard, id: 5, displayName: "Ada", published: true }));

    expect(readPreviewCard()?.published).toBe(false);
    expect(JSON.parse(store.get(PREVIEW_CARD_STORAGE_KEY) ?? "{}").published).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("splitHeading", () => {
  it("falls back to default title and emphasis when custom text is empty or blank", () => {
    expect(splitHeading(undefined, "Pick the easiest", "way in.")).toEqual({
      title: "Pick the easiest",
      emphasis: "way in.",
    });
    expect(splitHeading(null, "Moments & work in", "focus.")).toEqual({
      title: "Moments & work in",
      emphasis: "focus.",
    });
    expect(splitHeading("   ", "A little proof of", "the practice.")).toEqual({
      title: "A little proof of",
      emphasis: "the practice.",
    });
  });

  it("returns default styling when custom text matches the default sentence", () => {
    expect(splitHeading("Pick the easiest way in.", "Pick the easiest", "way in.")).toEqual({
      title: "Pick the easiest",
      emphasis: "way in.",
    });
    expect(splitHeading("Moments & work in focus", "Moments & work in", "focus.")).toEqual({
      title: "Moments & work in",
      emphasis: "focus.",
    });
  });

  it("splits multi-word custom heading by isolating the last word for emphasis", () => {
    expect(splitHeading("Get in touch with me", "Pick the easiest", "way in.")).toEqual({
      title: "Get in touch with",
      emphasis: "me",
    });
    expect(splitHeading("Recent creative work", "A little proof of", "the practice.")).toEqual({
      title: "Recent creative",
      emphasis: "work",
    });
  });

  it("handles single-word custom heading without emphasis", () => {
    expect(splitHeading("Portfolio", "A little proof of", "the practice.")).toEqual({
      title: "Portfolio",
      emphasis: "",
    });
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

describe("resolveActiveCard", () => {
  const fallback = { id: 0, displayName: "Fallback Draft", published: false, deletedAt: null };
  const draft1 = { id: 1, displayName: "Draft One", published: false, deletedAt: null };
  const live1 = { id: 2, displayName: "Live One", published: true, deletedAt: null };
  const live2 = { id: 3, displayName: "Live Two", published: true, deletedAt: null };
  const archived = { id: 4, displayName: "Archived", published: true, deletedAt: new Date() };

  it("returns fallbackDraft when cards array is empty", () => {
    expect(resolveActiveCard([], 0, fallback)).toBe(fallback);
    expect(resolveActiveCard([], 5, fallback)).toBe(fallback);
  });

  it("returns explicitly selected non-deleted card", () => {
    expect(resolveActiveCard([draft1, live1], 1, fallback)).toBe(draft1);
    expect(resolveActiveCard([draft1, live1], 2, fallback)).toBe(live1);
  });

  it("falls back to first published card if explicit selection was deleted", () => {
    expect(resolveActiveCard([draft1, live1, archived], 4, fallback)).toBe(live1);
  });

  it("falls back to first published card if explicit selection does not exist", () => {
    expect(resolveActiveCard([draft1, live1, live2], 99, fallback)).toBe(live1);
  });

  it("falls back to first non-deleted draft when no published cards exist", () => {
    expect(resolveActiveCard([draft1], 0, fallback)).toBe(draft1);
    expect(resolveActiveCard([archived, draft1], 0, fallback)).toBe(draft1);
  });

  it("returns fallbackDraft if all cards are deleted", () => {
    expect(resolveActiveCard([archived], 0, fallback)).toBe(fallback);
  });
});

describe("splitHeading and card headings regression", () => {
  it("splits single-line heading on last word boundary", () => {
    expect(splitHeading("Pick the easiest way in", "Fallback 1", "Fallback 2")).toEqual({
      title: "Pick the easiest way",
      emphasis: "in",
    });
  });

  it("splits two-line heading on newline", () => {
    expect(splitHeading("Selected\nClient Work", "Fallback 1", "Fallback 2")).toEqual({
      title: "Selected Client",
      emphasis: "Work",
    });
  });

  it("falls back cleanly on empty string", () => {
    expect(splitHeading("", "Default Lead", "Default Tail")).toEqual({
      title: "Default Lead",
      emphasis: "Default Tail",
    });
  });
});

