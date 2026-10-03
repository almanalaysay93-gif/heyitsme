import { describe, expect, it } from "vitest";
import { buildVCard } from "@shared/vcard";
import { phoneHref } from "@shared/phone";
import { serverCardFields, validateCardData } from "@shared/cardValidation";
import { normalizeLink } from "./pageDesigner";

describe("September 29 contact regressions", () => {
  it("exports the street address before the legacy city and falls back when empty", () => {
    const card = { displayName: "Test", location: "Davao City", page: JSON.stringify({ address: "123 Test St, Davao City" }) };
    expect(buildVCard(card, "https://example.com/c/test", "https://example.com")).toContain("ADR;TYPE=WORK:;;123 Test St\\, Davao City;;;;");
    expect(buildVCard({ ...card, page: "" }, "", "")).toContain("ADR;TYPE=WORK:;;;Davao City;;;");
  });
  it("keeps extension-only information but never exports an invalid dial action", () => {
    expect(phoneHref("local 4125")).toBeNull();
    expect(phoneHref("+63 82 123 4567 ext. 4125")).toBe("tel:+63821234567;ext=4125");
    const vcf = buildVCard({ displayName: "Test", phone: "local 4125" }, "", "");
    expect(vcf).not.toContain("TEL;");
    expect(vcf).toContain("Phone information: local 4125");
  });
  it("rejects junk phone values on both client and server", () => {
    expect(validateCardData({ displayName: "Test", phone: "letters ABC☎" }).errors.phone).toBeTruthy();
    expect(serverCardFields.phone.safeParse("letters ABC☎").success).toBe(false);
    expect(serverCardFields.phone.safeParse("+63 82 123 4567 ext. 4125").success).toBe(true);
  });
  it("rejects malformed primary links instead of emitting them", () => {
    for (const value of ["not a url", "ht!tp://bad", "https://", "mailto:bad-email", "tel:local4125"]) expect(normalizeLink(value)).toBe("");
    expect(normalizeLink("example.com/book")).toBe("https://example.com/book");
  });
});
