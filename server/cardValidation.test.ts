import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const db = vi.hoisted(() => ({
  createCard: vi.fn(),
  updateCard: vi.fn(),
  getCardByIdForOwner: vi.fn(),
  getCardsByOwner: vi.fn(),
  deleteCard: vi.fn(),
}));

vi.mock("./db", async (importOriginal) => ({ ...(await importOriginal<typeof import("./db")>()), ...db }));
vi.mock("./uploadSweep", () => ({ tidyOwnerUploads: vi.fn() }));

const { appRouter } = await import("./routers");

const user = { id: 3, openId: "owner-3", name: "Ada", email: "ada@example.com", role: "user" as const };
const req = { protocol: "https", headers: {}, ip: "127.0.0.1", get: () => "heyitsme.test" } as unknown as TrpcContext["req"];
const authedCaller = () => appRouter.createCaller({ user, req, res: {} as TrpcContext["res"] });

describe("cards.create validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty or whitespace-only display name", async () => {
    await expect(
      authedCaller().cards.create({
        displayName: "   ",
        title: "Designer",
      })
    ).rejects.toThrow();
  });

  it("allows valid name without role/title and defaults title to empty string", async () => {
    db.createCard.mockImplementation(async (input) => ({ id: 10, ...input }));

    const res = await authedCaller().cards.create({
      displayName: "Ada Lane",
    });

    expect(res.id).toBe(10);
    expect(db.createCard).toHaveBeenCalledTimes(1);
    expect(db.createCard.mock.calls[0][0].title).toBe("");
  });

  it("rejects malformed email address instead of silently nullifying it", async () => {
    await expect(
      authedCaller().cards.create({
        displayName: "Ada Lane",
        email: "not-an-email",
      })
    ).rejects.toThrow(/email/i);
  });

  it("rejects unsafe link schemes like javascript:", async () => {
    await expect(
      authedCaller().cards.create({
        displayName: "Ada Lane",
        links: JSON.stringify(["javascript:alert(1)"]),
      })
    ).rejects.toThrow();
  });

  it("passes creationKey to db.createCard for idempotency deduplication", async () => {
    db.createCard.mockImplementation(async (input) => ({ id: 42, ...input }));

    const res = await authedCaller().cards.create({
      displayName: "Ada Lane",
      creationKey: "draft_12345_abcde",
    });

    expect(res.id).toBe(42);
    expect(db.createCard).toHaveBeenCalledWith(
      expect.objectContaining({
        creationKey: "draft_12345_abcde",
        displayName: "Ada Lane",
      })
    );
  });
});

describe("cards.update validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns NOT_FOUND when updating non-existent card", async () => {
    db.getCardByIdForOwner.mockResolvedValue(null);

    await expect(
      authedCaller().cards.update({
        id: 999,
        displayName: "Ada Lane",
      })
    ).rejects.toThrow(/Card not found/i);
  });

  it("rejects invalid email on update", async () => {
    await expect(
      authedCaller().cards.update({
        id: 10,
        displayName: "Ada Lane",
        email: "bad-email",
      })
    ).rejects.toThrow(/email/i);
  });
});

describe("cards.publish validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns NOT_FOUND if card target is not found", async () => {
    db.getCardByIdForOwner.mockResolvedValue(null);

    await expect(
      authedCaller().cards.publish({
        id: 999,
        published: true,
      })
    ).rejects.toThrow(/Card not found/i);
  });

  it("rejects publishing when card has invalid data (e.g. blank name)", async () => {
    db.getCardByIdForOwner.mockResolvedValue({
      id: 10,
      ownerUserId: 3,
      displayName: "   ",
      title: "Designer",
    });

    await expect(
      authedCaller().cards.publish({
        id: 10,
        published: true,
      })
    ).rejects.toThrow(/Cannot publish/i);
  });

  it("allows unpublishing even if draft has missing fields", async () => {
    db.getCardByIdForOwner.mockResolvedValue({
      id: 10,
      ownerUserId: 3,
      displayName: "Ada Lane",
      published: true,
    });
    db.updateCard.mockResolvedValue({ id: 10, published: false });

    const result = await authedCaller().cards.publish({
      id: 10,
      published: false,
    });

    expect(result).toEqual({ id: 10, published: false });
    expect(db.updateCard).toHaveBeenCalledWith(10, 3, { published: false });
  });

  it("returns NOT_FOUND when updateCard returns undefined during publish", async () => {
    db.getCardByIdForOwner.mockResolvedValue({
      id: 10,
      ownerUserId: 3,
      displayName: "Ada Lane",
    });
    db.updateCard.mockResolvedValue(undefined);

    await expect(
      authedCaller().cards.publish({
        id: 10,
        published: true,
      })
    ).rejects.toThrow(/Card not found/i);
  });
});

describe("cards.delete procedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns NOT_FOUND when deleting non-existent or inaccessible card", async () => {
    db.deleteCard.mockResolvedValue(undefined);

    await expect(authedCaller().cards.delete({ id: 999 })).rejects.toThrow(/Card not found/i);
    expect(db.deleteCard).toHaveBeenCalledWith(999, 3);
  });

  it("deletes card and returns true when target exists", async () => {
    db.deleteCard.mockResolvedValue({ id: 10, ownerUserId: 3 });

    const result = await authedCaller().cards.delete({ id: 10 });
    expect(result).toBe(true);
    expect(db.deleteCard).toHaveBeenCalledWith(10, 3);
  });
});

describe("cards.list procedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("propagates error when database is unavailable rather than returning empty success", async () => {
    db.getCardsByOwner.mockRejectedValue(new Error("Database unavailable"));

    await expect(authedCaller().cards.list()).rejects.toThrow(/Database unavailable/i);
  });

  it("returns cards when database is available", async () => {
    const mockCards = [{ id: 10, displayName: "Ada", ownerUserId: 3 }];
    db.getCardsByOwner.mockResolvedValue(mockCards);

    const result = await authedCaller().cards.list();
    expect(result).toEqual(mockCards);
    expect(db.getCardsByOwner).toHaveBeenCalledWith(3);
  });
});
