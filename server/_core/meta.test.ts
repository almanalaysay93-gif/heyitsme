import { describe, expect, it } from "vitest";
import { cardDescription, cardTitle, escapeHtml, renderCardHtml, renderCardNotFoundHtml, safeJsonForScript, type CardMeta } from "./meta";

const template = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>heyitsme — professional presence, made shareable</title>
    <meta name="description" content="Generic description" />
    <meta property="og:title" content="Generic" />
    <meta property="og:image" content="https://heyitsme.example/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

const card: CardMeta = {
  slug: "ada-lane",
  displayName: "Ada Lane",
  title: "Product Designer",
  company: "Northwind",
  location: "Lisbon",
  bio: "I design calm software.",
  avatarUrl: "/storage/1-avatar/ada.webp",
  coverUrl: null,
  links: JSON.stringify(["linkedin.com/in/ada", "javascript:alert(1)", { url: "https://ada.design" }]),
};

describe("escapeHtml", () => {
  it("escapes every character that can break out of an attribute", () => {
    expect(escapeHtml(`"><script>alert('x')</script>&`)).toBe("&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;");
  });
});

describe("safeJsonForScript", () => {
  it("cannot close the surrounding script element", () => {
    const json = safeJsonForScript({ name: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({ name: "</script><script>alert(1)</script>" });
  });

  it("escapes line and paragraph separators", () => {
    const json = safeJsonForScript({ bio: `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c` });
    expect(json).toContain("\\u2028");
    expect(json).toContain("\\u2029");
  });
});

describe("cardTitle / cardDescription", () => {
  it("builds a title from name and role", () => {
    expect(cardTitle(card)).toBe("Ada Lane · Product Designer — heyitsme");
    expect(cardTitle({ ...card, title: null })).toBe("Ada Lane — heyitsme");
  });

  it("prefers the bio and falls back to role and company", () => {
    expect(cardDescription(card)).toBe("I design calm software.");
    expect(cardDescription({ ...card, bio: "  " })).toBe("Ada Lane, Product Designer at Northwind. Save my contact or exchange details.");
    expect(cardDescription({ ...card, bio: "x".repeat(400) })).toHaveLength(200);
  });
});

describe("renderCardHtml", () => {
  const html = renderCardHtml(template, card, "https://heyitsme.example/");

  it("replaces the generic title and social tags instead of duplicating them", () => {
    expect(html).toContain("<title>Ada Lane · Product Designer — heyitsme</title>");
    expect(html).not.toContain("Generic");
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html.match(/name="twitter:card"/g)).toHaveLength(1);
  });

  it("points canonical and og:url at the public card", () => {
    expect(html).toContain('<link rel="canonical" href="https://heyitsme.example/c/ada-lane" />');
    expect(html).toContain('<meta property="og:url" content="https://heyitsme.example/c/ada-lane" />');
  });

  it("makes image paths absolute and falls back to the site image", () => {
    expect(html).toContain('<meta property="og:image" content="https://heyitsme.example/storage/1-avatar/ada.webp" />');
    const bare = renderCardHtml(template, { ...card, avatarUrl: "data:image/png;base64,AAAA" }, "https://heyitsme.example");
    expect(bare).toContain('<meta property="og:image" content="https://heyitsme.example/og.png" />');
  });

  it("keeps the app scripts and adds Person structured data with only web links", () => {
    expect(html).toContain('src="/assets/index-abc.js"');
    const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1];
    const person = JSON.parse(ld ?? "{}");
    expect(person["@type"]).toBe("Person");
    expect(person.jobTitle).toBe("Product Designer");
    expect(person.worksFor.name).toBe("Northwind");
    expect(person.sameAs).toEqual(["https://linkedin.com/in/ada", "https://ada.design"]);
  });

  it("escapes hostile card fields", () => {
    const evil = renderCardHtml(
      template,
      { ...card, displayName: `"><img src=x onerror=alert(1)>`, bio: "</script><script>alert(1)</script>" },
      "https://heyitsme.example",
    );
    expect(evil).not.toContain("<img src=x");
    expect(evil).not.toContain("</script><script>alert(1)");
  });
});

describe("renderCardNotFoundHtml", () => {
  it("marks missing cards noindex and drops the generic social tags", () => {
    const html = renderCardNotFoundHtml(template);
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toContain("<title>Card not found — heyitsme</title>");
    expect(html).not.toContain("og:title");
  });
});
