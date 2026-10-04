import { describe, expect, it } from "vitest";
import {
  EVENT_PAGE_LIMITS,
  EVENT_PALETTES,
  EVENT_SECTION_IDS,
  EVENT_THEMES,
  agendaByDay,
  defaultEventPage,
  eventAccent,
  eventCountdown,
  eventIcs,
  eventLook,
  eventQr,
  eventPageImages,
  eventPageSchema,
  googleCalendarLink,
  normalizeEventPage,
  orderSpeakers,
  parseEventPage,
  resolveEventSections,
  rowSpeakers,
  sponsorsByTier,
} from "@shared/eventPage";
import { contrastRatio } from "@shared/pageConfig";

const speaker = (name: string, featured = false) => ({ name, featured });

describe("event page schema", () => {
  it("gives a working page for nothing, junk, or an out-of-range value", () => {
    const blank = defaultEventPage();
    expect(blank).toMatchObject({ theme: "tide", accent: "", font: "modern", agenda: [], speakers: [], gallery: [], sponsors: [], faq: [], links: [] });
    expect(parseEventPage(null)).toEqual(blank);
    expect(parseEventPage("oops")).toEqual(blank);
    expect(parseEventPage({ theme: "neon" })).toEqual(blank);
    expect(parseEventPage({ theme: "midnight", faq: [{ question: "Parking?", answer: "Yes, free." }] })).toMatchObject({ theme: "midnight", faq: [{ question: "Parking?", answer: "Yes, free." }] });
  });

  it("keeps an older event's font and button color, and drops its background", () => {
    expect(defaultEventPage({ font: "classic", button: "#aa2211", background: "#000000" })).toMatchObject({ font: "classic", accent: "#aa2211", theme: "tide" });
    expect(parseEventPage(null, { button: "red" } as never).accent).toBe("");
  });

  it("allows up to 3 featured speakers and 12 speakers", () => {
    const names = Array.from({ length: 12 }, (_, index) => speaker(`Speaker ${index + 1}`, index < 3));
    expect(eventPageSchema.safeParse({ speakers: names }).success).toBe(true);
    const tooManyFeatured = eventPageSchema.safeParse({ speakers: names.map((item, index) => ({ ...item, featured: index < 4 })) });
    expect(tooManyFeatured.success).toBe(false);
    expect(tooManyFeatured.error?.issues[0].message).toBe("Up to 3 featured speakers. Unfeature one first.");
    expect(eventPageSchema.safeParse({ speakers: [...names, speaker("One more")] }).success).toBe(false);
    expect(EVENT_PAGE_LIMITS).toMatchObject({ speakers: 12, featured: 3, gallery: 12 });
  });

  it("only takes stored images and safe links", () => {
    expect(eventPageSchema.safeParse({ gallery: [{ url: "/storage/team-1/event-2-a.png" }] }).success).toBe(true);
    for (const url of ["https://evil.test/a.png", "", "/storage/team-1/event-2-a/../../team-9/x.png", "javascript:alert(1)"]) {
      expect(eventPageSchema.safeParse({ gallery: [{ url }] }).success, url).toBe(false);
    }
    expect(eventPageSchema.safeParse({ links: [{ title: "Tickets", url: "https://tickets.test" }] }).success).toBe(true);
    expect(eventPageSchema.safeParse({ links: [{ title: "Bad", url: "javascript:alert(1)" }] }).success).toBe(false);
    expect(eventPageSchema.safeParse({ sponsors: [{ name: "Acme", url: "ftp://files.test/logo" }] }).success).toBe(false);
    expect(eventPageSchema.safeParse({ accent: "blue" }).success).toBe(false);
  });

  it("orders sections as saved, adds the ones never placed, and drops repeats", () => {
    expect(resolveEventSections({}).map(section => section.id)).toEqual([...EVENT_SECTION_IDS]);
    const resolved = resolveEventSections({ sections: [{ id: "faq", hidden: true }, { id: "speakers", hidden: false }, { id: "faq", hidden: false }] });
    expect(resolved.slice(0, 2)).toEqual([{ id: "faq", hidden: true }, { id: "speakers", hidden: false }]);
    expect(resolved).toHaveLength(EVENT_SECTION_IDS.length);
  });

  it("picks the accent: the event's, then the brand's, then the theme's", () => {
    expect(eventAccent({ theme: "tide", accent: "#112233" }, "#445566")).toBe("#112233");
    expect(eventAccent({ theme: "tide", accent: "" }, "#445566")).toBe("#445566");
    expect(eventAccent({ theme: "sunset", accent: "" }, "not-a-color")).toBe(EVENT_PALETTES.sunset.accent);
  });

  it("keeps theme text and accents readable (WCAG AA)", () => {
    for (const theme of EVENT_THEMES) {
      const { paper, ink, accent } = EVENT_PALETTES[theme];
      expect(contrastRatio(ink, paper), `${theme} ink`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio("#ffffff", accent), `${theme} button`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("splits featured speakers from the rest and lists every stored image", () => {
    const page = eventPageSchema.parse({
      speakers: [{ name: "A" }, { name: "B", featured: true, photoUrl: "/storage/team-1/event-1-b.png" }, { name: "C", featured: true }],
      gallery: [{ url: "/storage/team-1/event-1-g.png" }],
      sponsors: [{ name: "Acme", logoUrl: "/storage/team-1/event-1-s.png" }, { name: "No logo" }],
    });
    const { featured, rest } = orderSpeakers(page.speakers);
    expect(featured.map(item => item.name)).toEqual(["B", "C"]);
    expect(rest.map(item => item.name)).toEqual(["A"]);
    expect(eventPageImages(page)).toEqual(["/storage/team-1/event-1-b.png", "/storage/team-1/event-1-g.png", "/storage/team-1/event-1-s.png"]);
  });
});

describe("event days, tiers and row speakers", () => {
  it("reads a page saved before days, tiers and row speakers as one flat list", () => {
    const old = parseEventPage({ agenda: [{ time: "9:00", title: "Doors" }], speakers: [{ name: "Ada" }], sponsors: [{ name: "Acme" }] });
    expect(old).toMatchObject({ agendaDays: [], sponsorTiers: [], agenda: [{ day: 0, speakerIds: [] }], speakers: [{ id: "" }], sponsors: [{ tier: 0 }] });
    expect(agendaByDay(old)).toEqual([{ label: "", top: false, items: old.agenda }]);
    expect(sponsorsByTier(old)).toEqual([{ label: "", top: false, items: old.sponsors }]);
    expect(agendaByDay(defaultEventPage())).toEqual([]);
  });

  it("groups rows by day and sponsors by tier, in the admin's order, leaving out empty groups", () => {
    const page = eventPageSchema.parse({
      agendaDays: ["Friday", "Saturday", "Sunday"],
      agenda: [{ title: "Closing", day: 2 }, { title: "Doors", day: 0 }, { title: "Keynote", day: 0 }],
      sponsorTiers: ["Gold", "Silver"],
      sponsors: [{ name: "Beta", tier: 1 }, { name: "Acme", tier: 0 }, { name: "Core", tier: 1 }],
    });
    expect(agendaByDay(page).map(day => [day.label, day.items.map(row => row.title)])).toEqual([["Friday", ["Doors", "Keynote"]], ["Sunday", ["Closing"]]]);
    expect(sponsorsByTier(page).map(tier => [tier.label, tier.top, tier.items.map(item => item.name)])).toEqual([["Gold", true, ["Acme"]], ["Silver", false, ["Beta", "Core"]]]);
    // Only the first tier the admin listed is the top one, even when it has no sponsors.
    expect(sponsorsByTier({ ...page, sponsors: page.sponsors.filter(item => item.tier === 1) }).map(tier => tier.top)).toEqual([false]);
  });

  it("gives every speaker its own id and keeps the ids they already have", () => {
    let next = 0;
    const page = eventPageSchema.parse({ speakers: [{ name: "Ada", id: "keep1" }, { name: "Grace" }, { name: "Twin", id: "keep1" }] });
    const fixed = normalizeEventPage(page, () => `new${++next}`);
    expect(fixed.speakers.map(speaker => speaker.id)).toEqual(["keep1", "new1", "new2"]);
    expect(normalizeEventPage(fixed, () => "unused")).toEqual(fixed);
    const ids = normalizeEventPage(eventPageSchema.parse({ speakers: Array.from({ length: 12 }, (_, index) => ({ name: `S${index}` })) })).speakers.map(speaker => speaker.id);
    expect(new Set(ids).size).toBe(12);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{1,16}$/);
  });

  it("drops row speakers that do not exist and pulls rows back from a day or tier that is gone", () => {
    const page = eventPageSchema.parse({
      agendaDays: ["Friday", "Saturday"],
      speakers: [{ name: "Ada", id: "ada" }, { name: "Grace", id: "grace" }],
      agenda: [{ title: "Panel", day: 1, speakerIds: ["grace", "ghost", "ada", "grace"] }, { title: "Lost", day: 5 }],
      sponsors: [{ name: "Acme", tier: 3 }],
    });
    const fixed = normalizeEventPage(page);
    expect(fixed.agenda.map(row => [row.day, row.speakerIds])).toEqual([[1, ["grace", "ada"]], [0, []]]);
    expect(fixed.sponsors[0].tier).toBe(0);
    expect(rowSpeakers(fixed, fixed.agenda[0]).map(speaker => speaker.name)).toEqual(["Grace", "Ada"]);
    expect(rowSpeakers(page, { speakerIds: ["ghost"] })).toEqual([]);
  });

  it("caps days, tiers and speakers on a row, and refuses a blank name or a strange id", () => {
    const names = (count: number) => Array.from({ length: count }, (_, index) => `Name ${index + 1}`);
    expect(eventPageSchema.safeParse({ agendaDays: names(7), sponsorTiers: names(5) }).success).toBe(true);
    expect(eventPageSchema.safeParse({ agendaDays: names(8) }).error?.issues[0].message).toBe("Up to 7 days.");
    expect(eventPageSchema.safeParse({ sponsorTiers: names(6) }).error?.issues[0].message).toBe("Up to 5 sponsor tiers.");
    expect(eventPageSchema.safeParse({ agendaDays: ["  "] }).success).toBe(false);
    expect(eventPageSchema.safeParse({ agenda: [{ title: "Panel", speakerIds: ["a", "b", "c", "d", "e", "f", "g"] }] }).error?.issues[0].message).toBe("Up to 6 speakers on one row.");
    expect(eventPageSchema.safeParse({ agenda: [{ title: "Panel", day: 7 }] }).success).toBe(false);
    expect(eventPageSchema.safeParse({ agenda: [{ title: "Panel", day: -1 }] }).success).toBe(false);
    expect(eventPageSchema.safeParse({ speakers: [{ name: "Ada", id: "<script>" }] }).success).toBe(false);
    expect(EVENT_PAGE_LIMITS).toMatchObject({ agendaDays: 7, sponsorTiers: 5, rowSpeakers: 6 });
  });
});

describe("event calendar and countdown", () => {
  const event = { title: "Launch; night, live", startAt: "2030-01-10T10:00:00.000Z", endAt: "2030-01-10T13:00:00.000Z", location: "The Loft, Makati", details: "Line one\nLine two", url: "https://heyitsme.fyi/event/abc123", uid: "abc123" };

  it("writes a one-event .ics file in UTC with escaped text", () => {
    const ics = eventIcs(event, new Date("2029-12-01T00:00:00.000Z"));
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines).toContain("UID:abc123@heyitsme.fyi");
    expect(lines).toContain("DTSTAMP:20291201T000000Z");
    expect(lines).toContain("DTSTART:20300110T100000Z");
    expect(lines).toContain("DTEND:20300110T130000Z");
    expect(lines).toContain("SUMMARY:Launch\\; night\\, live");
    expect(lines).toContain("LOCATION:The Loft\\, Makati");
    expect(lines).toContain("DESCRIPTION:Line one\\nLine two\\n\\nhttps://heyitsme.fyi/event/abc123");
  });

  it("treats an event with no end time as one hour long", () => {
    expect(eventIcs({ ...event, endAt: null })).toContain("DTEND:20300110T110000Z");
    const link = new URL(googleCalendarLink({ ...event, endAt: null }));
    expect(link.origin + link.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(link.searchParams.get("dates")).toBe("20300110T100000Z/20300110T110000Z");
    expect(link.searchParams.get("text")).toBe("Launch; night, live");
    expect(link.searchParams.get("location")).toBe("The Loft, Makati");
  });

  it("counts down, then says live, then stops", () => {
    const start = "2030-01-10T10:00:00.000Z";
    const at = (iso: string) => new Date(iso).getTime();
    expect(eventCountdown(start, null, at("2030-01-08T08:58:57.000Z"))).toEqual({ state: "before", days: 2, hours: 1, minutes: 1, seconds: 3 });
    expect(eventCountdown(start, "2030-01-10T12:00:00.000Z", at("2030-01-10T11:00:00.000Z"))).toEqual({ state: "live" });
    expect(eventCountdown(start, "2030-01-10T12:00:00.000Z", at("2030-01-10T12:00:00.000Z"))).toEqual({ state: "over" });
    expect(eventCountdown(start, null, at("2030-01-10T12:59:00.000Z"))).toEqual({ state: "live" });
    expect(eventCountdown(start, null, at("2030-01-10T13:00:00.000Z"))).toEqual({ state: "over" });
    expect(eventCountdown(null, null, 0)).toBeNull();
    expect(eventCountdown("not a date", null, 0)).toBeNull();
  });
});

describe("event page look", () => {
  const page = (value: Record<string, unknown> = {}) => eventPageSchema.parse(value);

  it("starts as the glass style with full motion and no colors of its own", () => {
    expect(defaultEventPage()).toMatchObject({
      style: "glass",
      motion: "full",
      colors: { background: "", text: "", button: "", buttonText: "" },
      qr: { dots: "", background: "", frame: "", rounded: false },
    });
    // A page saved before these options existed reads the same way.
    expect(parseEventPage({ theme: "sunset" })).toMatchObject({ theme: "sunset", style: "glass", motion: "full", qr: { rounded: false } });
    expect(eventPageSchema.safeParse({ colors: { background: "red" } }).success).toBe(false);
    expect(eventPageSchema.safeParse({ style: "3d" }).success).toBe(false);
    expect(eventPageSchema.safeParse({ motion: "wild" }).success).toBe(false);
  });

  it("follows the theme and the accent until a color is picked", () => {
    for (const theme of EVENT_THEMES) {
      const look = eventLook(page({ theme }));
      expect(look).toMatchObject({ theme, paper: EVENT_PALETTES[theme].paper, ink: EVENT_PALETTES[theme].ink, ownPaper: false, ownInk: false, notes: [] });
      expect(look.button).toBe(look.accent);
      expect(contrastRatio(look.onButton, look.button)).toBeGreaterThanOrEqual(4.5);
    }
    expect(eventLook(page(), "#aa2211")).toMatchObject({ accent: "#aa2211", button: "#aa2211" });
  });

  it("uses the admin's colors when they can be read", () => {
    const look = eventLook(page({ colors: { background: "#fff8e7", text: "#3a2a00", button: "#111111", buttonText: "#ffd54a" } }));
    expect(look).toMatchObject({ theme: "tide", paper: "#fff8e7", ink: "#3a2a00", button: "#111111", onButton: "#ffd54a", ownPaper: true, ownInk: true, notes: [] });
  });

  it("switches to the dark panels for a dark background, and back for a light one", () => {
    const dark = eventLook(page({ theme: "sunset", colors: { background: "#101820" } }));
    expect(dark.theme).toBe("midnight");
    expect(contrastRatio(dark.ink, dark.paper)).toBeGreaterThanOrEqual(4.5);
    const light = eventLook(page({ theme: "midnight", colors: { background: "#fdf6ec" } }));
    expect(light.theme).toBe("tide");
    expect(contrastRatio(light.ink, light.paper)).toBeGreaterThanOrEqual(4.5);
    expect(eventLook(page({ theme: "sunset", colors: { background: "#fdf6ec" } })).theme).toBe("sunset");
  });

  it("never shows text that cannot be read, on any background", () => {
    for (const background of ["#000000", "#ffffff", "#777777", "#757575", "#808080", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#8a2be2"]) {
      for (const text of ["", "#000000", "#ffffff", "#777777", background]) {
        const look = eventLook(page({ colors: { background, text, button: background, buttonText: text } }));
        expect(contrastRatio(look.ink, look.paper), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
        if (look.theme !== "midnight") expect(contrastRatio(look.ink, "#ffffff"), `${text} on a light panel`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(look.onButton, look.button), `button ${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(look.accentText, look.paper)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(eventLook(page({ accent: background })).onAccent, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("says so when it had to replace a color", () => {
    const look = eventLook(page({ colors: { background: "#ffffff", text: "#eeeeee", button: "#222222", buttonText: "#333333" } }));
    expect(look.ink).toBe(EVENT_PALETTES.tide.ink);
    expect(look.onButton).toBe("#ffffff");
    expect(look.notes).toHaveLength(2);
  });

  it("keeps the QR code scannable", () => {
    expect(eventQr(page())).toEqual({ dots: "#111827", background: "#ffffff", frame: "#234bad", rounded: false, note: null });
    expect(eventQr(page(), "#0e7469").frame).toBe("#0e7469");
    expect(eventQr(page({ qr: { frame: "#aa2211" } }), "#0e7469").frame).toBe("#aa2211");
    expect(eventQr(page({ qr: { dots: "#0b2a2d", background: "#eef5f3", rounded: true } }))).toMatchObject({ dots: "#0b2a2d", background: "#eef5f3", rounded: true, note: null });
    // Light dots on a dark background, and a pair too close together, both go back to black on white.
    for (const qr of [{ dots: "#ffffff", background: "#000000" }, { dots: "#888888", background: "#999999" }, { background: "#222222" }]) {
      const safe = eventQr(page({ qr: { ...qr, frame: "#aa2211", rounded: true } }));
      expect(safe).toMatchObject({ dots: "#111827", background: "#ffffff", frame: "#aa2211", rounded: true });
      expect(safe.note).toBeTruthy();
    }
  });
});
