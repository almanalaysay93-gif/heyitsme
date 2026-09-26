import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCard, setTestDb } from "./db";

describe("db.createCard idempotency", () => {
  afterEach(() => {
    setTestDb(null);
    vi.clearAllMocks();
  });

  it("returns existing card when creationKey is already present", async () => {
    const existingCard = {
      id: 101,
      ownerUserId: 1,
      creationKey: "key-123",
      displayName: "First Card",
      title: "Dev",
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingCard]),
          }),
        }),
      }),
      insert: vi.fn(),
    };

    setTestDb(mockDb);

    const result = await createCard({
      ownerUserId: 1,
      creationKey: "key-123",
      displayName: "Second Try",
      title: "Dev",
    } as any);

    expect(result).toEqual(existingCard);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("returns existing card on concurrent collision / duplicate constraint error", async () => {
    const existingCard = {
      id: 102,
      ownerUserId: 1,
      creationKey: "key-concurrent",
      displayName: "Concurrent Card",
      title: "Dev",
    };

    let selectCallCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => {
              selectCallCount++;
              if (selectCallCount === 1) {
                // First pre-check returns empty
                return [];
              }
              // Second check inside catch block returns the concurrently inserted card
              return [existingCard];
            }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("duplicate key value violates unique constraint")),
        }),
      }),
    };

    setTestDb(mockDb);

    const result = await createCard({
      ownerUserId: 1,
      creationKey: "key-concurrent",
      displayName: "Concurrent Card",
      title: "Dev",
    } as any);

    expect(result).toEqual(existingCard);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });
});

describe("db.getCardsByOwner error handling", () => {
  afterEach(() => {
    setTestDb(null);
    vi.clearAllMocks();
  });

  it("throws error when db is unavailable instead of returning empty array", async () => {
    setTestDb(null);
    const { getCardsByOwner } = await import("./db");
    await expect(getCardsByOwner(1)).rejects.toThrow("Database unavailable");
  });
});
