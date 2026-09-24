import express from "express";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ENV } from "./env";
import { registerStorageProxy } from "./storageProxy";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi
    .fn()
    .mockResolvedValue(
      "https://example-bucket.s3.amazonaws.com/test-key.png?signature=mocked"
    ),
}));

const { createSignedUrl } = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
vi.mock("./supabase", () => ({
  getSupabaseAdminClient: () => ({ storage: { from: () => ({ createSignedUrl }) } }),
}));

describe("storage proxy route", () => {
  let app: express.Express;
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(async () => {
    app = express();
    registerStorageProxy(app);

    server = createServer(app);
    await new Promise<void>(resolve => {
      server.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("redirects with 307 to presigned S3 url", async () => {
    ENV.s3Bucket = "my-test-bucket";

    const response = await fetch(`${baseUrl}/storage/test-key.png`, {
      redirect: "manual",
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example-bucket.s3.amazonaws.com/test-key.png?signature=mocked"
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 500 when no storage backend is configured", async () => {
    const original = { ...ENV };
    ENV.s3Bucket = "";
    ENV.supabaseUrl = "";

    try {
      const response = await fetch(`${baseUrl}/storage/test-key.png`, {
        redirect: "manual",
      });

      expect(response.status).toBe(500);
      const text = await response.text();
      expect(text).toBe("Storage backend not configured");
    } finally {
      Object.assign(ENV, original);
    }
  });

  describe("with Supabase Storage", () => {
    const original = { ...ENV };
    beforeAll(() => {
      ENV.s3Bucket = "";
      ENV.supabaseUrl = "https://project.supabase.co";
      ENV.supabaseServiceRoleKey = "service-key";
    });
    afterAll(() => {
      Object.assign(ENV, original);
    });

    it("redirects with 307 to a signed Supabase url", async () => {
      createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: "https://project.supabase.co/storage/v1/object/sign/uploads/a.png?token=t" }, error: null });

      const response = await fetch(`${baseUrl}/storage/a.png`, { redirect: "manual" });

      expect(createSignedUrl).toHaveBeenCalledWith("a.png", 3600);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://project.supabase.co/storage/v1/object/sign/uploads/a.png?token=t");
    });

    it("returns 404 for a file that does not exist", async () => {
      createSignedUrl.mockResolvedValueOnce({ data: null, error: new Error("Object not found") });

      const response = await fetch(`${baseUrl}/storage/missing.png`, { redirect: "manual" });

      expect(response.status).toBe(404);
    });
  });
});
