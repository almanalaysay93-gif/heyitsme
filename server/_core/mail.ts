import { ENV } from "./env";

export type MailMessage = { to: string; subject: string; text: string; html?: string };

/**
 * Sends one message through Resend. Never throws: a mail failure is logged and reported as false,
 * so callers can fire it after their real work without risking that work.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  if (!ENV.resendApiKey) {
    console.warn("[Mail] RESEND_API_KEY is not set; skipped:", message.subject);
    return false;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: ENV.mailFrom, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error("[Mail] Resend rejected the message:", response.status, (await response.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Mail] send failed:", error);
    return false;
  }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type NewContactMail = {
  to: string;
  cardName: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  contactsUrl: string;
};

/** The note an owner gets when someone leaves their details on a card. */
export function newContactMail(input: NewContactMail): MailMessage {
  // Visitor text goes into a header, so strip line breaks from the subject.
  const name = input.name.replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "Someone";
  const rows: [string, string][] = [["Name", input.name]];
  if (input.phone) rows.push(["Phone", input.phone]);
  if (input.email) rows.push(["Email", input.email]);
  const text = [
    `${name} left their details on ${input.cardName}.`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `See your contacts: ${input.contactsUrl}`,
  ].join("\n");
  const html = [
    `<p>${escapeHtml(name)} left their details on ${escapeHtml(input.cardName)}.</p>`,
    `<p>${rows.map(([label, value]) => `<strong>${label}:</strong> ${escapeHtml(value)}`).join("<br>")}</p>`,
    `<p><a href="${escapeHtml(input.contactsUrl)}">See your contacts</a></p>`,
  ].join("\n");
  return { to: input.to, subject: `New contact: ${name}`, text, html };
}
