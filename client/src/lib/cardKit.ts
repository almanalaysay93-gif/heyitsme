// Small browser helpers shared by the dashboard, share sheet, and public card page.
import { structuredName } from "@shared/vcard";

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API denied or unavailable, fall through to execCommand
  }

  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.width = "2em";
    textArea.style.height = "2em";
    textArea.style.padding = "0";
    textArea.style.border = "none";
    textArea.style.outline = "none";
    textArea.style.boxShadow = "none";
    textArea.style.background = "transparent";
    textArea.setAttribute("readonly", "");
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

/** Copies formatted HTML (pastes as rich text in mail clients) with a plain-text alternative. */
export async function copyRichText(html: string, plain: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard && typeof navigator.clipboard.write === "function") {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch {
    // Fall back to selecting a rendered copy below.
  }

  try {
    const holder = document.createElement("div");
    holder.innerHTML = html;
    holder.setAttribute("contenteditable", "true");
    holder.style.position = "fixed";
    holder.style.left = "-9999px";
    holder.style.top = "0";
    document.body.appendChild(holder);
    const range = document.createRange();
    range.selectNodeContents(holder);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const successful = document.execCommand("copy");
    selection?.removeAllRanges();
    document.body.removeChild(holder);
    return successful;
  } catch {
    return false;
  }
}

export function getInitials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "HM";
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "just now";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A follow-up date as the "YYYY-MM-DD" a date input uses. It is stored as midnight UTC, so read it in UTC. */
export function followUpDay(value?: string | Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** Short label for a follow-up day, in UTC so the day matches what was picked. */
export function formatFollowUp(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Open contacts with a follow-up date first, soonest first; the rest keep their order (newest first).
 * A followed-up contact drops back into place, so a done date does not pin it to the top.
 */
export function sortByFollowUp<T extends { followUpOn?: string | Date | null; followedUp?: boolean }>(contacts: T[]): T[] {
  return contacts
    .map((contact, index) => ({ contact, index, day: contact.followedUp ? "" : followUpDay(contact.followUpOn) }))
    .sort((a, b) => {
      if (a.day && b.day) return a.day === b.day ? a.index - b.index : a.day < b.day ? -1 : 1;
      if (a.day || b.day) return a.day ? -1 : 1;
      return a.index - b.index;
    })
    .map((entry) => entry.contact);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Some browsers start the download after click returns, so release the URL a tick later.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function safeFileName(value: string, fallback = "heyitsme") {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
}

export function parseTags(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "") : [];
  } catch {
    return [];
  }
}

export function csvCell(value: unknown) {
  const text = String(value ?? "");
  // Leading =, +, -, @ make spreadsheet apps evaluate the cell as a formula.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}

const vcardEscape = (value: string) => value.replace(/[\\,;]/g, (match) => `\\${match}`).replace(/\r?\n/g, "\\n");
const sanitizeHost = (value: string) => (value || "").replace(/https?:\/\/heyitsme-ecru\.vercel\.app/gi, "https://heyitsme.fyi");

export function buildContactVCard(contact: {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  notes?: string | null;
  website?: string | null;
}) {
  const name = structuredName(contact.name);
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${vcardEscape(name.familyName)};${vcardEscape(name.givenName)};${vcardEscape(name.additionalNames)};;`,
    `FN:${vcardEscape(contact.name || "Contact")}`,
    contact.title ? `TITLE:${vcardEscape(contact.title)}` : null,
    contact.company ? `ORG:${vcardEscape(contact.company)}` : null,
    contact.email ? `EMAIL;TYPE=INTERNET:${contact.email}` : null,
    contact.phone ? `TEL;TYPE=CELL:${contact.phone}` : null,
    contact.website ? `URL:${sanitizeHost(contact.website)}` : null,
    contact.notes ? `NOTE:${vcardEscape(sanitizeHost(contact.notes))}` : null,
    "END:VCARD",
  ].filter(Boolean).join("\r\n");
}
