import type { Express, Request, Response } from "express";
import { sendMail } from "../_core/mail";
import { clientIp, hashIdentifier, rateLimit } from "../_core/rateLimit";
import { logJson, siteOrigin } from "../_core/seo";
import { getDb, getUserById } from "../db";
import { getPaymentProvider, reconcileInvoice } from "./checkout";
import { paymentSucceededMail, teamPaymentSucceededMail } from "./mail";
import type { SettleOutcome } from "./service";

const INVOICE = /^[A-Za-z0-9]{1,50}$/;

export async function notifyActivation(outcome: SettleOutcome, origin: string) {
  if (outcome.outcome !== "activated" && outcome.outcome !== "team_activated") return;
  try {
    const user = await getUserById(outcome.userId);
    if (!user?.email) return;
    if (outcome.outcome === "team_activated") {
      await sendMail(teamPaymentSucceededMail({ to: user.email, periodEnd: outcome.periodEnd, teamUrl: `${origin}/app/team/${outcome.workspaceId}` }));
      return;
    }
    await sendMail(paymentSucceededMail({ to: user.email, periodEnd: outcome.periodEnd, foundingNumber: outcome.foundingMemberNumber, billingUrl: `${origin}/app/billing` }));
  } catch (error) {
    console.error("[Mail] could not send payment confirmation:", error);
  }
}

/** Gateway server-to-server result. Signature first, then a direct inquiry, then one idempotent settlement. */
async function handleCallback(req: Request, res: Response) {
  const limit = await rateLimit(`payment-callback:${hashIdentifier(clientIp(req))}`, 120, 60_000);
  if (!limit.allowed) {
    res.status(429).json({ error: "Too many requests." });
    return;
  }
  const db = await getDb();
  if (!db) {
    res.status(503).json({ error: "Unavailable." });
    return;
  }
  let invoiceNo: string;
  try {
    const verified = await getPaymentProvider().verifyCallback(req.body);
    if (!verified || !INVOICE.test(verified.invoiceNo)) {
      logJson("warn", "payment callback rejected", { reason: "unverified" });
      res.status(400).json({ error: "Bad request." });
      return;
    }
    invoiceNo = verified.invoiceNo;
  } catch (error) {
    logJson("error", "payment callback verify failed", { error: String(error) });
    res.status(500).json({ error: "Something went wrong on our side." });
    return;
  }
  try {
    const outcome = await reconcileInvoice(db, invoiceNo);
    await notifyActivation(outcome, siteOrigin(req));
    res.status(200).json({ received: true });
  } catch (error) {
    // 5xx makes the gateway retry; settlement is idempotent, so a retry is safe.
    logJson("error", "payment callback settle failed", { invoiceNo, error: String(error) });
    res.status(500).json({ error: "Something went wrong on our side." });
  }
}

/** Where the hosted page sends the buyer back. Navigation only: it never reads a result from the request. */
function handleReturn(req: Request, res: Response) {
  const invoice = typeof req.query.invoice === "string" && INVOICE.test(req.query.invoice) ? req.query.invoice : "";
  res.redirect(303, invoice ? `/app/billing?payment=${invoice}` : "/app/billing");
}

export function registerPaymentRoutes(app: Express) {
  app.post("/api/payments/2c2p/callback", handleCallback);
  app.get("/api/payments/2c2p/return", handleReturn);
  app.post("/api/payments/2c2p/return", handleReturn);
}

export const _test = { handleCallback, handleReturn };
