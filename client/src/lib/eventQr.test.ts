import { describe, expect, it } from "vitest";
import { eventQrSvg } from "./eventQr";

const look = { dots: "#112233", background: "#fefefe", frame: "#0e7469", rounded: false };
const url = "https://heyitsme.fyi/event/launch-night?source=qr";

describe("event QR code", () => {
  it("draws the chosen frame, background and dot colors", () => {
    const svg = eventQrSvg(url, look, "Scan to RSVP", null);
    expect(svg).toContain('rx="36" fill="#0e7469"');
    expect(svg).toContain('rx="20" fill="#fefefe"');
    expect(svg).toMatch(/<path d="[^"]+" fill="#112233"\/>/);
    expect(svg).toContain(">Scan to RSVP</text>");
    expect(svg).not.toContain("<image");
  });

  it("rounds the dots but keeps the three corner squares square", () => {
    const square = eventQrSvg(url, look, "", null);
    const round = eventQrSvg(url, { ...look, rounded: true }, "", null);
    expect(square).not.toMatch(/a5 5 0 1 0/);
    expect(round).toMatch(/a5 5 0 1 0 10 0/);
    // Top-left corner module: 28 frame padding + 40 quiet zone.
    expect(round).toContain("M68 68h10v10h-10z");
    const dots = (svg: string) => (svg.match(/M\d+/g) ?? []).length;
    expect(dots(round)).toBe(dots(square));
  });

  it("leaves room for a logo and escapes the line under the code", () => {
    const plain = eventQrSvg(url, look, "", null);
    const withLogo = eventQrSvg(url, look, `Scan <now> & "go"`, "data:image/png;base64,AAAA");
    expect(withLogo).toContain("<image href=\"data:image/png;base64,AAAA\"");
    expect(withLogo.match(/M\d+/g)!.length).toBeLessThan(plain.match(/M\d+/g)!.length);
    expect(withLogo).toContain("Scan &lt;now&gt; &amp; &quot;go&quot;");
  });

  it("picks a readable color for the line under the code", () => {
    expect(eventQrSvg(url, { ...look, frame: "#101010" }, "Go", null)).toMatch(/fill="#ffffff">Go</);
    expect(eventQrSvg(url, { ...look, frame: "#f5f5f5" }, "Go", null)).toMatch(/fill="#111827">Go</);
  });
});
