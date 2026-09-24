import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getBucket: vi.fn(),
  createBucket: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("./_core/supabase", () => ({
  getSupabaseAdminClient: () => ({
    storage: { getBucket: storage.getBucket, createBucket: storage.createBucket, from: () => ({ upload: storage.upload }) },
  }),
}));

// Fresh modules per test, so the "bucket is ready" memo starts empty.
async function load() {
  const { ENV } = await import("./_core/env");
  Object.assign(ENV, { s3Bucket: "", supabaseUrl: "https://project.supabase.co", supabaseServiceRoleKey: "service-key", supabaseStorageBucket: "uploads" });
  const { storagePut } = await import("./storage");
  return { ENV, storagePut };
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
