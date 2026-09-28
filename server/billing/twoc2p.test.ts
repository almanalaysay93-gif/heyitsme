import { SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { classifyCode, fromGatewayAmount, toGatewayAmount, TwoC2PProvider } from "./twoc2p";

const SECRET = "test-secret-key-that-is-long-enough-000000";
const MERCHANT = "JT01";
const sign = (claims: Record<string, unknown>, secret = SECRET) =>
  new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(secret));

function provider(fetchImpl?: typeof fetch) {
  return new TwoC2PProvider({ merchantId: MERCHANT, secret: SECRET, env: "sandbox", fetchImpl });
}

const checkout = {
  invoiceNo: "HIM123",
  amountMinor: 129000,
  currency: "PHP" as const,
  description: "heyitsme Pro (annual)",
  channel: "googlepay" as const,
  frontendReturnUrl: "https://heyitsme.fyi/api/payments/2c2p/return?invoice=HIM123",
  backendReturnUrl: "https://heyitsme.fyi/api/payments/2c2p/callback",
};

describe("2C2P amounts and codes", () => {
  it("converts centavos to the gateway decimal and back", () => {
    expect(toGatewayAmount(129000)).toBe(1290);
    expect(toGatewayAmount(9950)).toBe(99.5);
    expect(fromGatewayAmount("1290.00")).toBe(129000);
    expect(fromGatewayAmount(99.5)).toBe(9950);
  });

  it("treats only 0000 as success", () => {
    expect(classifyCode("0000")).toBe("succeeded");
    expect(classifyCode("0001")).toBe("pending");
    expect(classifyCode("4200")).toBe("failed");
    expect(classifyCode("")).toBe("failed");
  });
});

describe("TwoC2PProvider.createCheckout", () => {
  it("sends a signed token request with the server amount and the Google Pay channel", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const claims = await provider().verify(body.payload);
      expect(claims).toMatchObject({ merchantID: MERCHANT, invoiceNo: "HIM123", amount: 1290, currencyCode: "PHP", paymentChannel: ["GOOGLEPAY"] });
      return new Response(JSON.stringify({ payload: await sign({ respCode: "0000", webPaymentUrl: "https://sandbox-pgw-ui.2c2p.com/pay/abc", paymentToken: "tok" }) }));
    });
    const session = await provider(fetchImpl as unknown as typeof fetch).createCheckout(checkout);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://sandbox-pgw.2c2p.com/payment/4.5/paymentToken");
    expect(session.redirectUrl).toBe("https://sandbox-pgw-ui.2c2p.com/pay/abc");
  });

  it("uses DPAY for GCash", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const claims = await provider().verify(JSON.parse(String(init.body)).payload);
      expect(claims?.paymentChannel).toEqual(["DPAY"]);
      return new Response(JSON.stringify({ payload: await sign({ respCode: "0000", webPaymentUrl: "https://x.2c2p.com/p" }) }));
    });
    await provider(fetchImpl as unknown as typeof fetch).createCheckout({ ...checkout, channel: "gcash" });
  });

  it("refuses a response signed with another key", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ payload: await sign({ respCode: "0000", webPaymentUrl: "https://evil.example/pay" }, "wrong-secret-wrong-secret-wrong-secret") })));
    await expect(provider(fetchImpl as unknown as typeof fetch).createCheckout(checkout)).rejects.toMatchObject({ code: "bad_signature" });
  });

  it("refuses an unsigned error body", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ respCode: "9015", respDesc: "Invalid merchant" })));
    await expect(provider(fetchImpl as unknown as typeof fetch).createCheckout(checkout)).rejects.toMatchObject({ code: "rejected" });
  });
});

describe("TwoC2PProvider.verifyCallback", () => {
  it("accepts a correctly signed notification for this merchant", async () => {
    const result = await provider().verifyCallback({ payload: await sign({ merchantID: MERCHANT, invoiceNo: "HIM123", amount: "1290.00", currencyCode: "PHP", respCode: "0000", tranRef: "T1" }) });
    expect(result).toEqual({ invoiceNo: "HIM123", status: "succeeded", amountMinor: 129000, currency: "PHP", providerRef: "T1", channelCode: null, code: "0000" });
  });

  it("rejects a forged signature, another merchant, an alg:none token, and a missing payload", async () => {
    const forged = await sign({ merchantID: MERCHANT, invoiceNo: "HIM123", respCode: "0000" }, "attacker-secret-attacker-secret-0000");
    const otherMerchant = await sign({ merchantID: "OTHER", invoiceNo: "HIM123", respCode: "0000" });
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ merchantID: MERCHANT, invoiceNo: "HIM123", respCode: "0000" })).toString("base64url")}.`;
    expect(await provider().verifyCallback({ payload: forged })).toBeNull();
    expect(await provider().verifyCallback({ payload: otherMerchant })).toBeNull();
    expect(await provider().verifyCallback({ payload: none })).toBeNull();
    expect(await provider().verifyCallback({ invoiceNo: "HIM123", respCode: "0000" })).toBeNull();
  });
});
