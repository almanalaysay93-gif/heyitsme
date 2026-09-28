import type { PaymentChannel } from "@shared/plans";

// Billing logic talks to this interface only, so another gateway can be added without touching it.
// Every amount is integer centavos. Adapters convert to the gateway's own format.

export type CheckoutRequest = {
  invoiceNo: string;
  amountMinor: number;
  currency: "PHP";
  description: string;
  channel: PaymentChannel;
  /** Browser lands here after the hosted page. Navigation only: it never grants anything. */
  frontendReturnUrl: string;
  /** Gateway posts the signed result here. */
  backendReturnUrl: string;
};

export type CheckoutSession = { redirectUrl: string; providerToken: string };

export type PaymentResult = {
  invoiceNo: string;
  status: "succeeded" | "failed" | "pending";
  amountMinor: number;
  currency: string;
  providerRef: string | null;
  channelCode: string | null;
  /** Gateway code, safe to store. Never shown raw to visitors. */
  code: string;
};

export class PaymentProviderError extends Error {
  constructor(message: string, readonly code = "provider_error") {
    super(message);
  }
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  createOneTimePayment(request: CheckoutRequest): Promise<CheckoutSession>;
  /** Only when the merchant account has recurring billing for the channel. See GOOGLE_PAY_RECURRING_ENABLED. */
  createRecurringSubscription(request: CheckoutRequest): Promise<CheckoutSession>;
  cancelSubscription(providerSubscriptionRef: string): Promise<void>;
  getSubscriptionStatus(providerSubscriptionRef: string): Promise<"active" | "canceled" | "unknown">;
  /** Verifies a gateway callback body. Returns null when it is unsigned, forged, or not for this merchant. */
  verifyCallback(body: unknown): Promise<PaymentResult | null>;
  /** Asks the gateway directly. The source of truth before any entitlement changes. */
  getPaymentStatus(invoiceNo: string): Promise<PaymentResult>;
  refundPayment(invoiceNo: string, amountMinor: number): Promise<void>;
}
