import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./env";
import { newContactMail, sendMail } from "./mail";

const message = { to: "owner@example.com", subject: "New contact: Ada", text: "Ada left their details." };

describe("sendMail", () => {
  const fetchMock = vi.fn();
  const originalKey = ENV.resendApiKey;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    ENV.resendApiKey = originalKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skips without a key and does not throw", async () => {
    ENV.resendApiKey = "";
    await expect(sendMail(message)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts one message to Resend with the key", async () => {
    ENV.resendApiKey = "re_test";
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    await expect(sendMail(message)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toMatchObject({ to: ["owner@example.com"], subject: "New contact: Ada" });
  });

  it("reports false when Resend rejects or the network fails", async () => {
    ENV.resendApiKey = "re_test";
    fetchMock.mockResolvedValueOnce(new Response("domain not verified", { status: 403 }));
    await expect(sendMail(message)).resolves.toBe(false);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(sendMail(message)).resolves.toBe(false);
  });
});

describe("newContactMail", () => {
  it("lists the details and links to contacts", () => {
    const mail = newContactMail({ to: "o@x.com", cardName: "Ada Lane", name: "Bo", email: "bo@x.com", phone: "+1 555", contactsUrl: "https://heyitsme.fyi/app/contacts" });
    expect(mail.subject).toBe("New contact: Bo");
    expect(mail.text).toContain("Phone: +1 555");
    expect(mail.text).toContain("Email: bo@x.com");
    expect(mail.text).toContain("https://heyitsme.fyi/app/contacts");
  });

  it("keeps visitor text out of headers and markup", () => {
    const mail = newContactMail({ to: "o@x.com", cardName: "Ada", name: "Eve\r\nBcc: x@y.com <b>", contactsUrl: "https://x/app/contacts" });
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.html).not.toContain("<b>");
    expect(mail.html).toContain("&lt;b&gt;");
  });
});
