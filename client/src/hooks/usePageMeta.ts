import { useEffect } from "react";

export const DEFAULT_DESCRIPTION = "heyitsme is a free digital business card for professional introductions that feel like you.";

type PageMeta = {
  title: string;
  description?: string;
  /** Path of the canonical URL, e.g. "/privacy". Omit to drop the canonical link. */
  canonicalPath?: string;
  noindex?: boolean;
};

function setMeta(attr: "name" | "property", key: string, content: string | null) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content === null) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setCanonical(href: string | null) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (href === null) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
}

/** Keeps <title>, description, canonical, and robots in step with the current route. */
export function usePageMeta({ title, description = DEFAULT_DESCRIPTION, canonicalPath, noindex = false }: PageMeta) {
  useEffect(() => {
    document.title = title;
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("name", "robots", noindex ? "noindex" : null);
    const url = canonicalPath ? `${window.location.origin}${canonicalPath}` : null;
    setCanonical(url);
    if (url) setMeta("property", "og:url", url);
  }, [title, description, canonicalPath, noindex]);
}
