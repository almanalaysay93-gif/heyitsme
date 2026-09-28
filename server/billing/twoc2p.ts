import { jwtVerify, SignJWT } from "jose";
import type { PaymentChannel } from "@shared/plans";
import { PaymentProviderError, type CheckoutRequest, type CheckoutSession, type PaymentProvider, type PaymentResult } from "./provider";

// 2C2P Payment Gateway (PGW) v4.5, redirect integration: we create a payment token, the buyer pays on the
// 2C2P hosted page (which renders the official Google Pay and wallet buttons), and 2C2P posts a signed result
// to our backend URL. Requests and responses are JWTs signed with HMAC SHA-256 using the merchant secret key.
// Contract checked 2026-09-28 against developer.2c2p.com: /payment/4.5/paymentToken and /payment/4.5/paymentInquiry.
// Assumption to confirm with 2C2P for the merchant account: "DPAY" lists GCash on the hosted page for PHP.

const HOSTS = { sandbox: "https://sandbox-pgw.2c2p.com", production: "https://pgw.2c2p.com" } as const;
const VERSION = "4.5";

export const CHANNEL_CODES: Record<PaymentChannel, string> = {
  googlepay: "GOOGLEPAY",
  gcash: "DPAY",
};

const SUCCESS = "0000";
// Codes 2C2P uses while a payment is still open. Anything else that is not success is a failure.
// A later success still settles a payment we marked failed, so a wrong guess here is recoverable.
const PENDING_CODES = new Set(["0001", "1001", "2001"]);

export type TwoC2PConfig = {
  merchantId: string;
  secret: string;
  env: "sandbox" | "production";
  fetchImpl?: typeof fetch;
};

type Claims = Record<string, unknown>;

/** Centavos to the decimal amount 2C2P expects, e.g. 129000 -> 1290. */
export const toGatewayAmount = (minor: number) => Math.round(minor) / 100;
/** 2C2P decimal amount back to centavos. Rounds, so 1290.00 and "1290.00" both give 129000. */
export const fromGatewayAmount = (amount: unknown) => Math.round(Number(amount) * 100);

export function classifyCode(code: string): PaymentResult["status"] {
  if (code === SUCCESS) return "succeeded";
  if (PENDING_CODES.has(code)) return "pending";
  return "failed";
}

export class TwoC2PProvider implements PaymentProvider {
  readonly name = "2c2p";
  private readonly key: Uint8Array;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: TwoC2PConfig) {
    if (!config.merchantId || !config.secret) throw new PaymentProviderError("2C2P merchant id and secret are required", "not_configured");
    this.key = new TextEncoder().encode(config.secret);
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async sign(claims: Claims): Promise<string> {
    return new SignJWT(claims).setProtectedHeader({ alg: "HS256", typ: "JWT" }).sign(this.key);
  }

  async verify(token: unknown): Promise<Claims | null> {
    if (typeof token !== "string" || token.length > 8192) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"] });
      return payload as Claims;
    } catch {
      return null;
    }
  }

  private async call(path: string, claims: Claims): Promise<Claims> {
    const response = await this.fetchImpl(`${HOSTS[this.config.env]}/payment/${VERSION}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ payload: await this.sign(claims) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new PaymentProviderError(`2C2P ${path} returned HTTP ${response.status}`, "http_error");
    const body = (await response.json().catch(() => null)) as { payload?: unknown; respCode?: string } | null;
    // Errors come back unsigned as { respCode, respDesc }. Only a verified payload is trusted.
    if (!body?.payload) throw new PaymentProviderError(`2C2P ${path} rejected the request (${body?.respCode ?? "no code"})`, "rejected");
    const claimsOut = await this.verify(body.payload);
    if (!claimsOut) throw new PaymentProviderError(`2C2P ${path} response signature did not verify`, "bad_signature");
    return claimsOut;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const result = await this.call("paymentToken", {
      merchantID: this.config.merchantId,
      invoiceNo: request.invoiceNo,
      description: request.description.slice(0, 250),
      amount: toGatewayAmount(request.amountMinor),
      currencyCode: request.currency,
      paymentChannel: [CHANNEL_CODES[request.channel]],
      frontendReturnUrl: request.frontendReturnUrl,
      backendReturnUrl: request.backendReturnUrl,
    });
    const code = String(result.respCode ?? "");
    if (code !== SUCCESS || typeof result.webPaymentUrl !== "string" || !result.webPaymentUrl.startsWith("https://")) {
      throw new PaymentProviderError(`2C2P did not open a checkout (${code || "no code"})`, "rejected");
    }
    return { redirectUrl: result.webPaymentUrl, providerToken: String(result.paymentToken ?? "") };
  }

  createOneTimePayment(request: CheckoutRequest) {
    return this.createCheckout(request);
  }

  async createRecurringSubscription(): Promise<CheckoutSession> {
    // 2C2P recurring plans need merchant-level setup per channel. Not faked: monthly stays off until confirmed.
    throw new PaymentProviderError("Recurring billing is not enabled for this merchant account", "not_supported");
  }

  async cancelSubscription(): Promise<void> {
    // Annual plans are one-time charges, so there is nothing to stop at the gateway.
  }

  async getSubscriptionStatus(): Promise<"active" | "canceled" | "unknown"> {
    return "unknown";
  }

  private toResult(claims: Claims): PaymentResult {
    const code = String(claims.respCode ?? "");
    return {
      invoiceNo: String(claims.invoiceNo ?? ""),
      status: classifyCode(code),
      amountMinor: fromGatewayAmount(claims.amount),
      currency: String(claims.currencyCode ?? ""),
      providerRef: claims.tranRef ? String(claims.tranRef) : null,
      channelCode: claims.channelCode ? String(claims.channelCode) : null,
      code: code.slice(0, 32),
    };
  }

  async verifyCallback(body: unknown): Promise<PaymentResult | null> {
    const token = body && typeof body === "object" ? (body as { payload?: unknown }).payload : undefined;
    const claims = await this.verify(token);
    if (!claims || claims.merchantID !== this.config.merchantId || !claims.invoiceNo) return null;
    return this.toResult(claims);
  }

  async getPaymentStatus(invoiceNo: string): Promise<PaymentResult> {
    const claims = await this.call("paymentInquiry", { merchantID: this.config.merchantId, invoiceNo, locale: "en" });
    if (claims.merchantID && claims.merchantID !== this.config.merchantId) {
      throw new PaymentProviderError("2C2P inquiry answered for another merchant", "bad_signature");
    }
    return { ...this.toResult(claims), invoiceNo };
  }

  async refundPayment(): Promise<void> {
    // Refunds run from the 2C2P merchant portal until the owner sets a refund policy.
    throw new PaymentProviderError("Refunds are handled in the 2C2P merchant portal", "not_supported");
  }
}
