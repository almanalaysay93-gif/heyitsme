export type SignatureInput = {
  displayName: string;
  title?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Absolute https URL, or empty. Relative and data: URLs are dropped because mail clients cannot load them. */
  avatarUrl?: string | null;
  cardUrl: string;
  /** Accent color for the name rule and link, as #rrggbb. */
  accent?: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isHttpUrl = (value?: string | null): value is string => Boolean(value && /^https?:\/\/[^\s"'<>]+$/i.test(value));

/**
 * Table-based, inline-styled HTML so it survives Gmail, Outlook, and Apple Mail signature editors.
 * Every user-supplied value is escaped; only http(s) URLs make it into src/href.
 */
export function buildSignatureHtml(input: SignatureInput) {
  const accent = /^#[0-9a-f]{6}$/i.test(input.accent ?? "") ? input.accent! : "#6b5cff";
  const name = escapeHtml(input.displayName.trim() || "Your name");
  const role = [input.title?.trim(), input.company?.trim()].filter(Boolean).map((part) => escapeHtml(part!)).join(" · ");
  const cardUrl = isHttpUrl(input.cardUrl) ? escapeHtml(input.cardUrl) : "";
  const email = input.email?.trim();
  const phone = input.phone?.trim();
  const phoneHref = phone ? phone.replace(/[^\d+]/g, "") : "";

  const font = "font-family:Arial,Helvetica,sans-serif;";
  const lines: string[] = [];
  if (email) {
    lines.push(`<a href="mailto:${escapeHtml(email)}" style="color:#10152a;text-decoration:none;">${escapeHtml(email)}</a>`);
  }
  if (phone) {
    lines.push(`<a href="tel:${escapeHtml(phoneHref)}" style="color:#10152a;text-decoration:none;">${escapeHtml(phone)}</a>`);
  }
  const contactLine = lines.length
    ? `<tr><td style="${font}font-size:13px;line-height:20px;color:#10152a;padding-top:6px;">${lines.join(" &nbsp;|&nbsp; ")}</td></tr>`
    : "";
  const cardLine = cardUrl
    ? `<tr><td style="${font}font-size:13px;line-height:20px;padding-top:6px;"><a href="${cardUrl}" style="color:${accent};font-weight:bold;text-decoration:none;">View my card &rarr;</a></td></tr>`
    : "";
  const avatarCell = isHttpUrl(input.avatarUrl)
    ? `<td valign="top" style="padding-right:14px;"><img src="${escapeHtml(input.avatarUrl)}" width="64" height="64" alt="${name}" style="display:block;width:64px;height:64px;border-radius:32px;border:0;" /></td>`
    : "";

  return [
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">`,
    `<tr>`,
    avatarCell,
    `<td valign="top" style="border-left:3px solid ${accent};padding-left:12px;">`,
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">`,
    `<tr><td style="${font}font-size:16px;line-height:22px;font-weight:bold;color:#10152a;">${name}</td></tr>`,
    role ? `<tr><td style="${font}font-size:13px;line-height:18px;color:#6f7487;">${role}</td></tr>` : "",
    contactLine,
    cardLine,
    `</table>`,
    `</td>`,
    `</tr>`,
    `</table>`,
  ].join("");
}

export function buildSignatureText(input: SignatureInput) {
  const role = [input.title?.trim(), input.company?.trim()].filter(Boolean).join(" · ");
  const contact = [input.email?.trim(), input.phone?.trim()].filter(Boolean).join(" | ");
  return [input.displayName.trim() || "Your name", role, contact, isHttpUrl(input.cardUrl) ? `View my card: ${input.cardUrl}` : ""]
    .filter(Boolean)
    .join("\n");
}
