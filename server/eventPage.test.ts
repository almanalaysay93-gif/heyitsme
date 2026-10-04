import { describe, expect, it } from "vitest";
import {
  EVENT_PAGE_LIMITS,
  EVENT_PALETTES,
  EVENT_SECTION_IDS,
  EVENT_THEMES,
  defaultEventPage,
  eventAccent,
  eventCountdown,
  eventIcs,
  eventPageImages,
  eventPageSchema,
  googleCalendarLink,
  orderSpeakers,
  parseEventPage,
  resolveEventSections,
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
