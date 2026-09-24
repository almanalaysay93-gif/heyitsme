import { describe, expect, it } from "vitest";
import { buildSignatureHtml, buildSignatureText } from "./emailSignature";

const base = {
  displayName: "Ada Lane",
  title: "Designer",
  company: "Studio North",
  email: "ada@studio.co",
  phone: "+1 415 555 0183",
  avatarUrl: "https://cdn.example.com/ada.jpg",
  cardUrl: "https://heyitsme.app/c/ada-x1",
};

describe("buildSignatureHtml", () => {
  it("renders the fields, card link, and avatar", () => {
    const html = buildSignatureHtml(base);
    expect(html).toContain("Ada Lane");
    expect(html).toContain("Designer · Studio North");
    expect(html).toContain('href="mailto:ada@studio.co"');
    expect(html).toContain('href="tel:+14155550183"');
    expect(html).toContain('href="https://heyitsme.app/c/ada-x1"');
    expect(html).toContain('src="https://cdn.example.com/ada.jpg"');
    expect(html.startsWith("<table")).toBe(true);
  });

  it("escapes every user value", () => {
    const html = buildSignatureHtml({
      ...base,
      displayName: `<script>alert(1)</script>`,
      company: `A&B "Co"`,
      email: `x"><img src=x onerror=alert(1)>@a.co`,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A&amp;B &quot;Co&quot;");
  });

  it("drops avatar and link values that mail clients cannot load or that are unsafe", () => {
    const html = buildSignatureHtml({ ...base, avatarUrl: "/storage/ada.jpg", cardUrl: "javascript:alert(1)" });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("View my card");
  });

  it("ignores an invalid accent color", () => {
    const html = buildSignatureHtml({ ...base, accent: "red;background:url(x)" });
    expect(html).toContain("#6b5cff");
    expect(html).not.toContain("url(x)");
  });
});

describe("buildSignatureText", () => {
  it("builds a plain-text alternative without empty lines", () => {
    expect(buildSignatureText({ ...base, phone: "" })).toBe(
      "Ada Lane\nDesigner · Studio North\nada@studio.co\nView my card: https://heyitsme.app/c/ada-x1",
    );
  });
});
