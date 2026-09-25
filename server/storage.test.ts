import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getBucket: vi.fn(),
  createBucket: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
}));
vi.mock("./_core/supabase", () => ({
  getSupabaseAdminClient: () => ({
    storage: { getBucket: storage.getBucket, createBucket: storage.createBucket, from: () => ({ upload: storage.upload, remove: storage.remove, list: storage.list }) },
  }),
}));

// Fresh modules per test, so the "bucket is ready" memo starts empty.
async function load() {
  const { ENV } = await import("./_core/env");
  Object.assign(ENV, { s3Bucket: "", supabaseUrl: "https://project.supabase.co", supabaseServiceRoleKey: "service-key", supabaseStorageBucket: "uploads" });
  const { storageDelete, storageList, storagePut } = await import("./storage");
  return { ENV, storageDelete, storageList, storagePut };
}

describe("storagePut with Supabase Storage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates the private bucket once, then uploads under a unique key", async () => {
    const { storagePut } = await load();
    storage.getBucket.mockResolvedValueOnce({ data: null, error: new Error("Bucket not found") });
    storage.createBucket.mockResolvedValueOnce({ data: { name: "uploads" }, error: null });
    storage.upload.mockResolvedValue({ data: {}, error: null });

    const first = await storagePut("7-portfolio/abc-photo.webp", Buffer.from("x"), "image/webp");
    await storagePut("7-portfolio/def-photo.webp", Buffer.from("y"), "image/webp");

    expect(storage.createBucket).toHaveBeenCalledTimes(1);
    expect(storage.createBucket).toHaveBeenCalledWith("uploads", { public: false });
    expect(first.key).toMatch(/^7-portfolio\/abc-photo_[0-9a-f]{8}\.webp$/);
    expect(first.url).toBe(`/storage/${first.key}`);
    expect(storage.upload).toHaveBeenCalledWith(first.key, Buffer.from("x"), { contentType: "image/webp", upsert: false });
  });

  it("surfaces upload errors", async () => {
    const { storagePut } = await load();
    storage.getBucket.mockResolvedValueOnce({ data: { name: "uploads" }, error: null });
    storage.upload.mockResolvedValueOnce({ data: null, error: new Error("new row violates row-level security policy") });

    await expect(storagePut("a.png", Buffer.from("x"), "image/png")).rejects.toThrow("row-level security");
  });

  it("fails clearly when no storage is configured", async () => {
    const { ENV, storagePut } = await load();
    ENV.supabaseUrl = "";

    await expect(storagePut("a.png", Buffer.from("x"), "image/png")).rejects.toThrow("File storage is not configured");
  });
});

describe("storageDelete with Supabase Storage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("removes the files in one call and skips the call when there is nothing to remove", async () => {
    const { storageDelete } = await load();
    storage.remove.mockResolvedValue({ data: [], error: null });

    await storageDelete([]);
    await storageDelete(["/7-portfolio/a.webp", "7-portfolio/b.pdf"]);

    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(["7-portfolio/a.webp", "7-portfolio/b.pdf"]);
  });

  it("splits large deletes into batches of 1000", async () => {
    const { storageDelete } = await load();
    storage.remove.mockResolvedValue({ data: [], error: null });

    await storageDelete(Array.from({ length: 1001 }, (_, i) => `7-portfolio/${i}.webp`));

    expect(storage.remove).toHaveBeenCalledTimes(2);
    expect(storage.remove.mock.calls[1][0]).toEqual(["7-portfolio/1000.webp"]);
  });
});

describe("storageList with Supabase Storage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("lists a folder's files with their upload time and skips sub-folders", async () => {
    const { storageList } = await load();
    storage.list.mockResolvedValueOnce({
      data: [
        { id: "f1", name: "a_1a2b3c4d.webp", created_at: "2026-09-01T00:00:00Z" },
        { id: null, name: "nested", created_at: null },
      ],
      error: null,
    });

    expect(await storageList("7-portfolio/")).toEqual([
      { key: "7-portfolio/a_1a2b3c4d.webp", createdAt: new Date("2026-09-01T00:00:00Z") },
    ]);
    expect(storage.list).toHaveBeenCalledWith("7-portfolio", expect.objectContaining({ limit: 1000, offset: 0 }));
  });

  it("returns nothing for a bucket that does not exist yet", async () => {
    const { storageList } = await load();
    storage.list.mockResolvedValueOnce({ data: null, error: new Error("Bucket not found") });

    expect(await storageList("7-portfolio")).toEqual([]);
  });
});
