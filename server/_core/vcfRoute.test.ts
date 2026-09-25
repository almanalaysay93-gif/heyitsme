import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ getPublicCardBySlug: vi.fn() }));
vi.mock("../db", async (importOriginal) => ({ ...(await importOriginal<typeof import("../db")>()), ...db }));

const { registerSeoRoutes } = await import("./seo");

let base = "";
let server: ReturnType<ReturnType<typeof express>["listen"]>;

beforeAll(async () => {
  const app = express();
  registerSeoRoutes(app);
  // Stand-in for the SPA fallback that follows in the real server.
  app.use((_req, res) => res.status(418).send("fell through"));
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => db.getPublicCardBySlug.mockReset());

describe("GET /c/:slug.vcf", () => {
  it("serves the card as an inline vCard", async () => {
    db.getPublicCardBySlug.mockResolvedValue({
      slug: "ada",
      displayName: "Ada Lane",
      title: "Designer",
      company: null,
      email: "ada@example.com",
      phone: "+1 555 0100",
      bio: null,
      avatarUrl: "/storage/ada.webp",
    });
    const response = await fetch(`${base}/c/ada.vcf`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/vcard; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="ada.vcf"');
    const body = await response.text();
    expect(db.getPublicCardBySlug).toHaveBeenCalledWith("ada");
    expect(body.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(body).toContain("FN:Ada Lane");
    expect(body).toContain("TEL;TYPE=CELL:+1 555 0100");
    expect(body).toContain(`URL:${base}/c/ada`);
    expect(body).toContain(`PHOTO;VALUE=URI:${base}/storage/ada.webp`);
    expect(body).not.toContain("ORG:");
  });

  it("404s for a missing or unpublished card", async () => {
    db.getPublicCardBySlug.mockResolvedValue(undefined);
    const response = await fetch(`${base}/c/nobody.vcf`);
    expect(response.status).toBe(404);
  });

  it("leaves the plain card page to the page route", async () => {
    db.getPublicCardBySlug.mockResolvedValue(undefined);
    const response = await fetch(`${base}/c/ada`);
    expect(response.headers.get("content-type") ?? "").not.toContain("vcard");
  });
});
