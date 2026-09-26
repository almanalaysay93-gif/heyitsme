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
    expect(response.headers.get("cache-control")).toBe("no-cache, no-store, must-revalidate");
    const body = await response.text();
    expect(db.getPublicCardBySlug).toHaveBeenCalledWith("ada");
    expect(body.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(body).toContain("FN:Ada Lane");
    expect(body).toContain("TEL;TYPE=CELL:+1 555 0100");
    expect(body).toContain(`URL:${base}/c/ada`);
    expect(body).toContain(`PHOTO;VALUE=URI:${base}/storage/ada.webp`);
    expect(body).not.toContain("ORG:");
  });

  it("escapes Unicode characters and multiline notes in vCard", async () => {
    db.getPublicCardBySlug.mockResolvedValue({
      slug: "jose",
      displayName: "José García",
      title: "Lead; Engineer, Core",
      company: "Acme\\Corp",
      email: "jose@example.com",
      phone: "+34 91 123 4567",
      bio: "Line one\nLine two",
      avatarUrl: null,
    });
    const response = await fetch(`${base}/c/jose.vcf`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("FN:José García");
    expect(body).toContain("TITLE:Lead\\; Engineer\\, Core");
    expect(body).toContain("ORG:Acme\\\\Corp");
    expect(body).toContain("NOTE:Line one\\nLine two");
  });

  it("includes socials, contact channels, and website links in served vCard", async () => {
    db.getPublicCardBySlug.mockResolvedValue({
      slug: "sara",
      displayName: "Sara Connor",
      title: "Security Specialist",
      company: "Cyberdyne Systems",
      email: "sara@example.com",
      phone: "+1 555 9999",
      location: "Los Angeles, CA",
      bio: "Protecting the future.",
      channels: JSON.stringify([
        { provider: "telegram", url: "@saraconnor", label: "Telegram" },
        { provider: "signal", url: "+15559999", label: "Signal" },
      ]),
      links: JSON.stringify(["https://cyberdyne.example"]),
      avatarUrl: "/storage/sara.jpg",
    });

    const response = await fetch(`${base}/c/sara.vcf`);
    expect(response.status).toBe(200);
    const body = await response.text();

    expect(body).toContain("N:Connor;Sara;;;");
    expect(body).toContain("FN:Sara Connor");
    expect(body).toContain("ADR;TYPE=WORK:;;;Los Angeles\\, CA;;;");
    expect(body).toContain("X-SOCIALPROFILE;TYPE=telegram;x-user=saraconnor:https://t.me/saraconnor");
    expect(body).toContain("X-SOCIALPROFILE;TYPE=signal:https://signal.me/#p/+15559999");
    expect(body).toContain("item1.URL:https://t.me/saraconnor");
    expect(body).toContain("item1.X-ABLabel:Telegram");
    expect(body).toContain("item2.URL:https://signal.me/#p/+15559999");
    expect(body).toContain("item2.X-ABLabel:Signal");
    expect(body).toContain("item3.URL:https://cyberdyne.example");
    expect(body).toContain("NOTE:Protecting the future.\\n\\nContact & Social Links:\\n• Telegram: https://t.me/saraconnor\\n• Signal: https://signal.me/#p/+15559999\\n• Cyberdyne: https://cyberdyne.example");
  });

  it("never includes legacy heyitsme-ecru.vercel.app domain in vCard URLs", async () => {
    db.getPublicCardBySlug.mockResolvedValue({
      slug: "legacy",
      displayName: "Legacy Test",
      channels: JSON.stringify([
        { provider: "website", url: "https://heyitsme-ecru.vercel.app/c/legacy", label: "Legacy" },
      ]),
      avatarUrl: "https://heyitsme-ecru.vercel.app/storage/legacy.jpg",
    });
    const response = await fetch(`${base}/c/legacy.vcf`, {
      headers: { host: "heyitsme-ecru.vercel.app" },
    });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("heyitsme-ecru.vercel.app");
    expect(body).toContain("URL:https://heyitsme.fyi/c/legacy");
    expect(body).toContain("PHOTO;VALUE=URI:https://heyitsme.fyi/storage/legacy.jpg");
    expect(body).toContain("item1.URL:https://heyitsme.fyi/c/legacy");
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

describe("SEO host redirects and robots.txt", () => {
  it("redirects legacy host heyitsme-ecru.vercel.app to heyitsme.fyi with 301 preserving path and query", async () => {
    const response = await fetch(`${base}/c/ada?ref=card`, {
      headers: { "x-forwarded-host": "heyitsme-ecru.vercel.app" },
      redirect: "manual",
    });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://heyitsme.fyi/c/ada?ref=card");
  });

  it("serves disallow on preview vercel host to exclude preview deployments from indexing", async () => {
    const response = await fetch(`${base}/robots.txt`, {
      headers: { "x-forwarded-host": "heyitsme-preview-branch.vercel.app" },
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("Disallow: /");
    expect(text).not.toContain("Allow: /");
  });

  it("serves standard robots and sitemap on production domain", async () => {
    const response = await fetch(`${base}/robots.txt`, {
      headers: { "x-forwarded-host": "heyitsme.fyi" },
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("Allow: /");
    expect(text).toContain("Sitemap:");
  });
});
