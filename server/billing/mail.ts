import type { MailMessage } from "../_core/mail";

const dateText = (date: Date) => date.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" });

/** Sent after a verified payment for a team's plan. */
export function teamPaymentSucceededMail(input: { to: string; periodEnd: Date; teamUrl: string }): MailMessage {
  const lines = [
    "Your payment went through. heyitsme Teams is on for your team.",
    "",
    `The team's plan runs until ${dateText(input.periodEnd)}. Renew from the team's Billing tab before then. If it runs out, nothing is deleted.`,
    "",
    `Open your team: ${input.teamUrl}`,
  ];
  return {
    to: input.to,
    subject: "Your heyitsme Teams plan is active",
    text: lines.join("\n"),
    html: lines.map((line) => (line ? `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>` : "")).join(""),
  };
}

/** Sent after a verified payment. No amounts beyond the plan, no payment details. */
export function paymentSucceededMail(input: { to: string; periodEnd: Date; foundingNumber: number | null; billingUrl: string }): MailMessage {
  const lines = [
    "Your payment went through. heyitsme Pro is on.",
    "",
    `Pro stays active until ${dateText(input.periodEnd)}. We will remind you before then.`,
  ];
  if (input.foundingNumber !== null) lines.push(`You are Founding Member #${input.foundingNumber}. Your founding price holds while your plan stays active.`);
  lines.push("", `See your plan and receipts: ${input.billingUrl}`);
  return {
    to: input.to,
    subject: "Your heyitsme Pro plan is active",
    text: lines.join("\n"),
    html: lines.map((line) => (line ? `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>` : "")).join(""),
  };
}
