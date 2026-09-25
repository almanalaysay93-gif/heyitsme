import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const db = vi.hoisted(() => ({
  getCardById: vi.fn(),
  createContact: vi.fn(),
  recordAnalytics: vi.fn(),
  getUserById: vi.fn(),
  updateContact: vi.fn(),
}));
const mail = vi.hoisted(() => ({ sendMail: vi.fn() }));

vi.mock("./db", async (importOriginal) => ({ ...(await importOriginal<typeof import("./db")>()), ...db }));
vi.mock("./_core/mail", async (importOriginal) => ({ ...(await importOriginal<typeof import("./_core/mail")>()), ...mail }));
vi.mock("./_core/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_core/rateLimit")>()),
  rateLimit: vi.fn(async () => ({ allowed: true, count: 1, resetMs: 0 })),
}));

const { appRouter } = await import("./routers");

const card = { id: 7, ownerUserId: 3, displayName: "Ada Lane", published: true, deletedAt: null };
const req = { protocol: "https", headers: {}, ip: "203.0.113.9", get: () => "heyitsme.test" } as unknown as TrpcContext["req"];
const publicCaller = () => appRouter.createCaller({ user: null, req, res: {} as TrpcContext["res"] });
const visitor = { cardId: 7, name: "Bo Visitor", email: "bo@example.com", phone: "+1 555 0100" };

describe("publicCard.exchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.getCardById.mockResolvedValue(card);
    db.createContact.mockImplementation(async (input) => ({ id: 42, ...input }));
    db.getUserById.mockResolvedValue({ id: 3, email: "ada@example.com" });
    mail.sendMail.mockResolvedValue(true);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("saves the contact and emails the owner once", async () => {
    const saved = await publicCaller().publicCard.exchange(visitor);
    expect(saved.id).toBe(42);
    expect(db.createContact).toHaveBeenCalledTimes(1);
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    const sent = mail.sendMail.mock.calls[0][0];
    expect(sent.to).toBe("ada@example.com");
    expect(sent.text).toContain("Bo Visitor");
    expect(sent.text).toContain("+1 555 0100");
    expect(sent.text).toContain("bo@example.com");
    expect(sent.text).toContain("/app/contacts");
  });

  it("still saves the contact when sending throws", async () => {
    mail.sendMail.mockRejectedValue(new Error("Resend down"));
    const saved = await publicCaller().publicCard.exchange(visitor);
    expect(saved.id).toBe(42);
    expect(db.createContact).toHaveBeenCalledTimes(1);
  });

  it("still saves the contact when the owner lookup fails", async () => {
    db.getUserById.mockRejectedValue(new Error("db hiccup"));
    await expect(publicCaller().publicCard.exchange(visitor)).resolves.toMatchObject({ id: 42 });
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it("sends nothing for the honeypot", async () => {
    const result = await publicCaller().publicCard.exchange({ ...visitor, website: "http://spam.example" });
    expect(result.id).toBe(0);
    expect(db.createContact).not.toHaveBeenCalled();
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it("sends nothing when the owner has no email", async () => {
    db.getUserById.mockResolvedValue({ id: 3, email: null });
    await publicCaller().publicCard.exchange(visitor);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});

describe("contacts.update follow-up date", () => {
  const owner = { id: 3, openId: "o", email: "ada@example.com", name: "Ada", loginMethod: "google", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as NonNullable<TrpcContext["user"]>;
  const ownerCaller = () => appRouter.createCaller({ user: owner, req, res: {} as TrpcContext["res"] });

  beforeEach(() => {
    vi.clearAllMocks();
    db.updateContact.mockImplementation(async (id, _owner, patch) => ({ id, ...patch }));
  });

  it("stores the day as midnight UTC", async () => {
    await ownerCaller().contacts.update({ id: 5, followUpOn: "2026-10-02" });
    expect(db.updateContact).toHaveBeenCalledWith(5, 3, { followUpOn: new Date("2026-10-02T00:00:00Z") });
  });

  it("clears it with null and leaves it alone when omitted", async () => {
    await ownerCaller().contacts.update({ id: 5, followUpOn: null });
    expect(db.updateContact).toHaveBeenLastCalledWith(5, 3, { followUpOn: null });
    await ownerCaller().contacts.update({ id: 5, followedUp: true });
    expect(db.updateContact).toHaveBeenLastCalledWith(5, 3, { followedUp: true });
  });

  it("rejects a malformed day", async () => {
    await expect(ownerCaller().contacts.update({ id: 5, followUpOn: "next week" })).rejects.toThrow();
    await expect(ownerCaller().contacts.update({ id: 5, followUpOn: "2026-13-45" })).rejects.toThrow();
    expect(db.updateContact).not.toHaveBeenCalled();
  });
});
