/** Returns a dialable URI, including an optional extension, or null for incomplete numbers. */
export function phoneHref(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  const match = value.match(/^(\+?[\d\s().-]+?)(?:\s*(?:ext\.?|extension|x|;ext=)\s*(\d{1,8}))?$/i);
  if (!match) return null;
  const number = match[1].replace(/[\s().-]/g, "");
  if (!/^\+?\d{6,15}$/.test(number)) return null;
  return `tel:${number}${match[2] ? `;ext=${match[2]}` : ""}`;
}
