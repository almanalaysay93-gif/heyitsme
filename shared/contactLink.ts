import { phoneHref } from "./phone";

export function isContactLink(value: string): boolean {
  if (!value) return true;
  if (/^tel:/i.test(value)) return Boolean(phoneHref(value.slice(4)));
  if (/^mailto:/i.test(value)) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.slice(7));
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && url.hostname.includes(".") && !/\s/.test(value);
  } catch { return false; }
}
