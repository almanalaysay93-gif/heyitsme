import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCardsByOwner: vi.fn(),
  storageList: vi.fn(),
  storageDelete: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock("./db", () => ({ getCardsByOwner: mocks.getCardsByOwner, OWNER_CARD_LIMIT: 3 }));
vi.mock("./storage", () => ({ storageList: mocks.storageList, storageDelete: mocks.storageDelete }));
vi.mock("./_core/rateLimit", () => ({ rateLimit: mocks.rateLimit }));

import { SWEEP_GRACE_MS, sweepableKeys, sweepUnusedUploads, tidyOwnerUploads } from "./uploadSweep";

const NOW = Date.parse("2026-09-25T12:00:00Z");
const old = new Date(NOW - SWEEP_GRACE_MS - 1);
const fresh = new Date(NOW - 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageDelete.mockResolvedValue(undefined);
  mocks.rateLimit.mockResolvedValue({ allowed: true });
});

describe("sweepableKeys", () => {
  it("keeps uploads inside the grace period and ones with no known age", () => {
    const files = [
      { key: "7-portfolio/old.jpg", createdAt: old },
      { key: "7-portfolio/fresh.jpg", createdAt: fresh },
      { key: "7-portfolio/unknown.jpg", createdAt: null },
    ];
    expect(sweepableKeys(files, NOW)).toEqual(["7-portfolio/old.jpg"]);
  });
});

describe("sweepUnusedUploads", () => {
  it("deletes old uploads no card links to, and keeps linked and new ones", async () => {
    mocks.getCardsByOwner.mockResolvedValue([{ avatarUrl: "/storage/7-portfolio/linked.jpg", portfolio: "[]" }]);
    mocks.storageList.mockResolvedValue([
      { key: "7-portfolio/linked.jpg", createdAt: old },
      { key: "7-portfolio/never-saved.jpg", createdAt: old },
      { key: "7-portfolio/still-editing.jpg", createdAt: fresh },
    ]);

    expect(await sweepUnusedUploads(7, NOW)).toEqual(["7-portfolio/never-saved.jpg"]);
    expect(mocks.storageList).toHaveBeenCalledWith("7-portfolio");
    expect(mocks.storageDelete).toHaveBeenCalledWith(["7-portfolio/never-saved.jpg"]);
  });

  it("keeps portfolio and unpublished-card media and never touches another owner's keys", async () => {
    mocks.getCardsByOwner.mockResolvedValue([
      { avatarUrl: null, portfolio: JSON.stringify([{ kind: "pdf", url: "https://heyitsme.fyi/api/storage/7-portfolio/deck.pdf" }]), published: false },
    ]);
    mocks.storageList.mockResolvedValue([
      { key: "7-portfolio/deck.pdf", createdAt: old },
      { key: "70-portfolio/someone-else.jpg", createdAt: old },
      { key: "7-portfolio/../70-portfolio/escape.jpg", createdAt: old },
    ]);

    expect(await sweepUnusedUploads(7, NOW)).toEqual([]);
  });

  it("deletes nothing when the owner has more cards than the list returns", async () => {
    mocks.getCardsByOwner.mockResolvedValue([{}, {}, {}]);

    expect(await sweepUnusedUploads(7, NOW)).toEqual([]);
    expect(mocks.storageList).not.toHaveBeenCalled();
    expect(mocks.storageDelete).not.toHaveBeenCalled();
  });
});

describe("tidyOwnerUploads", () => {
  it("deletes a replaced photo that no card links to any more", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    mocks.getCardsByOwner.mockResolvedValue([{ avatarUrl: "/storage/7-portfolio/new.jpg", backgroundUrl: "/storage/7-portfolio/bg.jpg" }]);

    await tidyOwnerUploads(7, { avatarUrl: "/storage/7-portfolio/old.jpg", backgroundUrl: "/storage/7-portfolio/bg.jpg" });

    expect(mocks.storageDelete).toHaveBeenCalledWith(["7-portfolio/old.jpg"]);
    expect(mocks.storageList).not.toHaveBeenCalled();
  });

  it("never throws when storage fails, since the card change already happened", async () => {
    mocks.getCardsByOwner.mockResolvedValue([]);
    mocks.storageDelete.mockRejectedValue(new Error("storage down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(tidyOwnerUploads(7, { avatarUrl: "/storage/7-portfolio/a.jpg" })).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
