import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TEAMS_PLAN, planPriceMinor, type BillingCycle, type PaidPlanCode, type PaymentChannel,
} from "@shared/plans";
import { payments } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { logJson } from "../_core/seo";
import { PaymentProviderError, type PaymentProvider } from "./provider";
import { TEAM_PAYMENT_PURPOSE, getOrCreateBillingAccount, getUserSubscriptions, settlePayment, type Db, type SettleOutcome,
} from "./service";
import { TwoC2PProvider } from "./twoc2p";

let providerOverride: PaymentProvider | null = null;

/** Tests swap in a fake gateway. */
export function setPaymentProvider(provider: PaymentProvider | null) {
  providerOverride = provider;
}

export function getPaymentProvider(): PaymentProvider {
  if (providerOverride) return providerOverride;
  if (ENV.paymentProvider !== "2c2p") throw new PaymentProviderError(`Unknown payment provider ${ENV.paymentProvider}`,
      "not_configured"
    );
  return new TwoC2PProvider({
    merchantId: ENV.paymentGatewayMerchantId,
    secret: ENV.paymentGatewaySecret,
    env: ENV.paymentProviderEnv as "sandbox" | "production",
  });
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
  return ["monthly"];
}

/** Teams is sold only while its own switch is on and a payment channel is open. Until then starting a team is free. */
export function teamsCheckoutOpen(): boolean {
  return ENV.teamsEnabled && ENV.teamsBillingEnabled && enabledChannels().length > 0;
}

export class CheckoutClosedError extends Error {
  constructor(
    readonly reason: "payments_off" | "channel_off" | "cycle_off" | "plan_off" | "team_free"
  ) {
    super(reason);
  }
}

/** Invoice numbers: letters and digits only, under 2C2P's 50-character limit, not guessable. */
export const newInvoiceNo = () =>
  `HIM${Date.now().toString(36).toUpperCase()}${nanoid(10).replace(/[^A-Za-z0-9]/g, "0")}`;

export type CheckoutInput = {
  planCode: PaidPlanCode;
  billingCycle: BillingCycle;
  channel: PaymentChannel;
};

/**
 * Quotes the price on the server, records a pending payment, then opens the gateway checkout.
 * The browser gets only a redirect URL. Nothing here grants access.
 */
export async function startCheckout(
  db: Db,
  user: { id: number },
  input: CheckoutInput,
  origin: string,
  now = new Date()
) {
  if (!ENV.paymentsEnabled) throw new CheckoutClosedError("payments_off");
  if (!enabledChannels().includes(input.channel))
    throw new CheckoutClosedError("channel_off");
  if (!enabledCycles().includes(input.billingCycle))
    throw new CheckoutClosedError("cycle_off");
  if (input.planCode !== "pro") throw new CheckoutClosedError("plan_off");

  const account = await getOrCreateBillingAccount(db, user.id);
  const founding = false;
  const amountMinor = planPriceMinor(
    input.planCode,
    input.billingCycle,
    founding
  );
  const hasPlan = (await getUserSubscriptions(db, user.id)).some(
    sub => sub.planCode === input.planCode
  );
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
  logJson("info", "payment created", {
    invoiceNo,
    plan: input.planCode,
    cycle: input.billingCycle,
    channel: input.channel,
    amountMinor,
  });

  const redirectUrl = await openGatewayCheckout(db, { invoiceNo, amountMinor, description: "heyitsme Pro (monthly)", channel: input.channel }, origin);
  return { invoiceNo, redirectUrl, amountMinor, founding };
}

/**
 * The same steps for one team: the price comes from the server, the payment row names the team, and the
 * team's plan date moves only when that payment is settled. The caller has already checked ownership.
 */
export async function startTeamCheckout(
  db: Db,
  user: { id: number },
  workspace: { id: number; accessUntil: Date | null },
  channel: PaymentChannel,
  origin: string
) {
  if (!ENV.paymentsEnabled) throw new CheckoutClosedError("payments_off");
  if (!teamsCheckoutOpen()) throw new CheckoutClosedError("plan_off");
  if (!enabledChannels().includes(channel)) throw new CheckoutClosedError("channel_off");
  // A team with no end date is free for good. Charging it would buy nothing.
  if (workspace.accessUntil === null) throw new CheckoutClosedError("team_free");

  const account = await getOrCreateBillingAccount(db, user.id);
  const amountMinor = TEAMS_PLAN.priceMinor;
  const invoiceNo = newInvoiceNo();
  await db.insert(payments).values({
    billingAccountId: account.id,
    userId: user.id,
    provider: ENV.paymentProvider,
    providerTransactionId: invoiceNo,
    purpose: TEAM_PAYMENT_PURPOSE,
    planCode: "teams",
    billingCycle: "monthly",
    channel,
    amountMinor,
    currency: "PHP",
    status: "created",
    metadataJson: JSON.stringify({ workspaceId: workspace.id }),
  });
  logJson("info", "payment created", { invoiceNo, plan: "teams", cycle: "monthly", channel, amountMinor, workspaceId: workspace.id });
  const redirectUrl = await openGatewayCheckout(db, { invoiceNo, amountMinor, description: "heyitsme Teams (monthly)", channel }, origin);
  return { invoiceNo, redirectUrl, amountMinor };
}

/** Opens the hosted page for a payment row that already exists, and marks the row pending or failed. */
async function openGatewayCheckout(
  db: Db,
  order: { invoiceNo: string; amountMinor: number; description: string; channel: PaymentChannel },
  origin: string
) {
  const { invoiceNo } = order;
  try {
    const session = await getPaymentProvider().createCheckout({
      ...order,
      currency: "PHP",
      frontendReturnUrl: `${origin}/api/payments/2c2p/return?invoice=${invoiceNo}`,
      backendReturnUrl: `${origin}/api/payments/2c2p/callback`,
    });
    await db
      .update(payments)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(payments.providerTransactionId, invoiceNo));
    return session.redirectUrl;
  } catch (error) {
    const code =
      error instanceof PaymentProviderError ? error.code : "provider_error";
    await db
      .update(payments)
      .set({
        status: "failed",
        failureCode: code.slice(0, 32),
        failureMessage: "Checkout could not open",
        updatedAt: new Date(),
      })
      .where(eq(payments.providerTransactionId, invoiceNo));
    logJson("error", "checkout failed to open", {
      invoiceNo,
      code,
      error: String(error),
    });
    throw error;
  }
}

/**
 * Settles one invoice from the gateway's own answer. A callback body is only a hint that something changed:
 * we verify its signature, then ask the gateway directly before touching entitlements.
 */
export async function reconcileInvoice(
  db: Db,
  invoiceNo: string
): Promise<SettleOutcome> {
  const status = await getPaymentProvider().getPaymentStatus(invoiceNo);
  const outcome = await settlePayment(db, status);
  logJson("info", "payment settled", {
    invoiceNo,
    status: status.status,
    code: status.code,
    outcome: outcome.outcome,
  });
  return outcome;
}
