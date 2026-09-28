import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { planPriceMinor, type BillingCycle, type PaidPlanCode, type PaymentChannel } from "@shared/plans";
import { payments } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { logJson } from "../_core/seo";
import { PaymentProviderError, type PaymentProvider } from "./provider";
import { foundingPriceEligible, getOrCreateBillingAccount, getUserSubscriptions, settlePayment, type Db, type SettleOutcome } from "./service";
import { TwoC2PProvider } from "./twoc2p";

let providerOverride: PaymentProvider | null = null;

/** Tests swap in a fake gateway. */
export function setPaymentProvider(provider: PaymentProvider | null) {
  providerOverride = provider;
}

export function getPaymentProvider(): PaymentProvider {
  if (providerOverride) return providerOverride;
  if (ENV.paymentProvider !== "2c2p") throw new PaymentProviderError(`Unknown payment provider ${ENV.paymentProvider}`, "not_configured");
  return new TwoC2PProvider({ merchantId: ENV.paymentGatewayMerchantId, secret: ENV.paymentGatewaySecret, env: ENV.paymentProviderEnv as "sandbox" | "production" });
}

/** Channels a buyer can pick right now. Empty means checkout is closed. */
export function enabledChannels(): PaymentChannel[] {
  if (!ENV.paymentsEnabled) return [];
  const channels: PaymentChannel[] = [];
  if (ENV.googlePayEnabled) channels.push("googlepay");
  if (ENV.gcashEnabled) channels.push("gcash");
  return channels;
}

/** Monthly needs a recurring charge. Without it only annual is sold, so nobody is promised a renewal we can't take. */
export function enabledCycles(): BillingCycle[] {
  return ENV.googlePayRecurringEnabled ? ["monthly", "annual"] : ["annual"];
}

export class CheckoutClosedError extends Error {
  constructor(readonly reason: "payments_off" | "channel_off" | "cycle_off" | "plan_off") {
    super(reason);
  }
}

/** Invoice numbers: letters and digits only, under 2C2P's 50-character limit, not guessable. */
export const newInvoiceNo = () => `HIM${Date.now().toString(36).toUpperCase()}${nanoid(10).replace(/[^A-Za-z0-9]/g, "0")}`;

export type CheckoutInput = { planCode: PaidPlanCode; billingCycle: BillingCycle; channel: PaymentChannel };

/**
 * Quotes the price on the server, records a pending payment, then opens the gateway checkout.
 * The browser gets only a redirect URL. Nothing here grants access.
 */
export async function startCheckout(db: Db, user: { id: number }, input: CheckoutInput, origin: string, now = new Date()) {
  if (!ENV.paymentsEnabled) throw new CheckoutClosedError("payments_off");
  if (!enabledChannels().includes(input.channel)) throw new CheckoutClosedError("channel_off");
  if (!enabledCycles().includes(input.billingCycle)) throw new CheckoutClosedError("cycle_off");
  if (input.planCode === "teams" && !ENV.teamsEnabled) throw new CheckoutClosedError("plan_off");

  const account = await getOrCreateBillingAccount(db, user.id);
  const founding = input.planCode === "pro" && (await foundingPriceEligible(db, user.id, now));
  const amountMinor = planPriceMinor(input.planCode, input.billingCycle, founding);
  const hasPlan = (await getUserSubscriptions(db, user.id)).some((sub) => sub.planCode === input.planCode);
  const invoiceNo = newInvoiceNo();

  await db.insert(payments).values({
    billingAccountId: account.id,
    userId: user.id,
    provider: ENV.paymentProvider,
    providerTransactionId: invoiceNo,
    purpose: hasPlan ? "renewal" : "subscription",
    planCode: input.planCode,
    billingCycle: input.billingCycle,
    channel: input.channel,
    amountMinor,
    currency: "PHP",
    foundingPrice: founding,
    status: "created",
  });
  logJson("info", "payment created", { invoiceNo, plan: input.planCode, cycle: input.billingCycle, channel: input.channel, amountMinor });

  try {
    const session = await getPaymentProvider().createCheckout({
      invoiceNo,
      amountMinor,
      currency: "PHP",
      description: `heyitsme ${input.planCode === "pro" ? "Pro" : "Teams"} (${input.billingCycle})`,
      channel: input.channel,
      frontendReturnUrl: `${origin}/api/payments/2c2p/return?invoice=${invoiceNo}`,
      backendReturnUrl: `${origin}/api/payments/2c2p/callback`,
    });
    await db.update(payments).set({ status: "pending", updatedAt: new Date() }).where(eq(payments.providerTransactionId, invoiceNo));
    return { invoiceNo, redirectUrl: session.redirectUrl, amountMinor, founding };
  } catch (error) {
    const code = error instanceof PaymentProviderError ? error.code : "provider_error";
    await db
      .update(payments)
      .set({ status: "failed", failureCode: code.slice(0, 32), failureMessage: "Checkout could not open", updatedAt: new Date() })
      .where(eq(payments.providerTransactionId, invoiceNo));
    logJson("error", "checkout failed to open", { invoiceNo, code, error: String(error) });
    throw error;
  }
}

/**
 * Settles one invoice from the gateway's own answer. A callback body is only a hint that something changed:
 * we verify its signature, then ask the gateway directly before touching entitlements.
 */
export async function reconcileInvoice(db: Db, invoiceNo: string): Promise<SettleOutcome> {
  const status = await getPaymentProvider().getPaymentStatus(invoiceNo);
  const outcome = await settlePayment(db, status);
  logJson("info", "payment settled", { invoiceNo, status: status.status, code: status.code, outcome: outcome.outcome });
  return outcome;
}
