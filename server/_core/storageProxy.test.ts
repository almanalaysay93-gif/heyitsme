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

  it("returns 500 when S3 bucket is not configured", async () => {
    const originalBucket = ENV.s3Bucket;
    ENV.s3Bucket = "";

    try {
      const response = await fetch(`${baseUrl}/storage/test-key.png`, {
        redirect: "manual",
      });

      expect(response.status).toBe(500);
      const text = await response.text();
      expect(text).toBe("Storage backend not configured");
    } finally {
      ENV.s3Bucket = originalBucket;
    }
  });
});
