/**
 * Server-rendered <head> for public card pages, so link previews (iMessage, Slack,
 * LinkedIn, WhatsApp) and crawlers see the person instead of the generic app shell.
 * Pure string work — no Express or DB — so it is easy to test.
 */

export type CardMeta = {
  slug: string;
  displayName: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  links?: string | null;
};

const HEAD_TAGS_TO_REPLACE =
  /[ \t]*<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>\s*\n?|[ \t]*<link\s+rel="canonical"[^>]*>\s*\n?/gi;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON that is safe to drop inside a <script> element. */
export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function absoluteUrl(raw: string | null | undefined, siteUrl: string): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return `${siteUrl}${value}`;
  return null;
}

function publicLinks(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === "string" ? item : typeof item?.url === "string" ? item.url : ""))
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (/^https?:\/\//i.test(item) ? item : `https://${item}`))
      .filter((item) => {
        try {
          const url = new URL(item);
          return url.protocol === "https:" || url.protocol === "http:";
        } catch {
          return false;
        }
      })
      .slice(0, 10);
  } catch {
    return [];
  }
}

export function cardTitle(card: CardMeta): string {
  return `${card.displayName}${card.title ? ` · ${card.title}` : ""} — heyitsme`;
}

export function cardDescription(card: CardMeta): string {
  const fallback = `${card.displayName}${card.title ? `, ${card.title}` : ""}${card.company ? ` at ${card.company}` : ""}. Save my contact or exchange details.`;
  return (card.bio?.trim() || fallback).replace(/\s+/g, " ").slice(0, 200);
}

function setTitle(template: string, title: string): string {
  return template.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function injectHead(template: string, tags: string[]): string {
  const block = `    ${tags.join("\n    ")}\n  </head>`;
  return template.replace(HEAD_TAGS_TO_REPLACE, "").replace(/\s*<\/head>/i, `\n${block}`);
}

export function renderCardHtml(template: string, card: CardMeta, siteUrl: string): string {
  const site = siteUrl.replace(/\/$/, "");
  const url = `${site}/c/${encodeURIComponent(card.slug)}`;
  const title = cardTitle(card);
  const description = cardDescription(card);
  const image = absoluteUrl(card.coverUrl, site) ?? absoluteUrl(card.avatarUrl, site) ?? `${site}/og.png`;
  const avatar = absoluteUrl(card.avatarUrl, site);

  const person: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: card.displayName,
    url,
  };
  if (card.title) person.jobTitle = card.title;
  if (card.company) person.worksFor = { "@type": "Organization", name: card.company };
  if (card.bio) person.description = card.bio.slice(0, 500);
  if (avatar) person.image = avatar;
  if (card.location) person.address = { "@type": "PostalAddress", addressLocality: card.location };
  const sameAs = publicLinks(card.links);
  if (sameAs.length) person.sameAs = sameAs;

  const attr = escapeHtml;
  const tags = [
    `<meta name="description" content="${attr(description)}" />`,
    `<link rel="canonical" href="${attr(url)}" />`,
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:site_name" content="heyitsme" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
    `<meta property="og:image" content="${attr(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${attr(title)}" />`,
    `<meta name="twitter:description" content="${attr(description)}" />`,
    `<meta name="twitter:image" content="${attr(image)}" />`,
    `<script type="application/ld+json">${safeJsonForScript(person)}</script>`,
  ];

  return injectHead(setTitle(template, title), tags);
}

export function renderCardNotFoundHtml(template: string): string {
  return injectHead(setTitle(template, "Card not found — heyitsme"), [
    `<meta name="robots" content="noindex" />`,
    `<meta name="description" content="This heyitsme card is not available." />`,
  ]);
}
