import { SITEMAP_PATHS } from "@shared/routes";
import { sql } from "drizzle-orm";
import express, { type Express, type Request } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, getPublicCardBySlug } from "../db";
import { ENV } from "./env";
import { renderCardHtml, renderCardNotFoundHtml } from "./meta";
import { clientIp, hashIdentifier, rateLimit } from "./rateLimit";

export function siteOrigin(req: Request): string {
  return ENV.siteUrl || `${req.protocol}://${req.get("host")}`;
}

let templateCache: string | null = null;

/**
 * The built index.html. Read from disk when it ships with the function (vercel.json
 * includeFiles) or when running locally; otherwise fetched once from the static CDN,
 * which serves /index.html before any rewrite applies.
 */
async function loadTemplate(req: Request): Promise<string | null> {
  if (templateCache) return templateCache;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "dist", "public", "index.html"),
    path.resolve(here, "..", "public", "index.html"),
    path.resolve(here, "..", "..", "dist", "public", "index.html"),
  ];
  for (const candidate of candidates) {
    try {
      templateCache = fs.readFileSync(candidate, "utf-8");
      return templateCache;
    } catch {
      // try the next location
    }
  }
  try {
    // The deployment's own host, not SITE_URL: preview builds have different asset hashes.
    const response = await fetch(`${req.protocol}://${req.get("host")}/index.html`, { signal: AbortSignal.timeout(2000) });
    const html = response.ok ? await response.text() : "";
    if (html.includes('<div id="root">')) templateCache = html;
  } catch {
    // fall through to the client-rendered page
  }
  return templateCache;
}

function logJson(level: "info" | "warn" | "error", msg: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function clip(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

export function registerSeoRoutes(app: Express) {
  app.get("/robots.txt", (req, res) => {
    const origin = siteOrigin(req);
    res
      .type("text/plain")
      .set("Cache-Control", "public, max-age=3600")
      .send(["User-agent: *", "Allow: /", "Disallow: /app", "Disallow: /api/", "", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n"));
  });

  app.get("/sitemap.xml", (req, res) => {
    const origin = siteOrigin(req);
    const urls = SITEMAP_PATHS.map((pathname) => `  <url><loc>${origin}${pathname}</loc></url>`).join("\n");
    res
      .type("application/xml")
      .set("Cache-Control", "public, max-age=3600")
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  });

  // Public cards get real <head> tags so shared links unfurl with the person's name and photo.
  // In development Vite serves the page instead, so there is no built template to fill.
  app.get("/c/:slug", async (req, res, next) => {
    if (process.env.NODE_ENV === "development" || !ENV.databaseUrl) return next();
    const template = await loadTemplate(req);
    if (!template) return next();

    const slug = String(req.params.slug ?? "").slice(0, 120);
    try {
      const card = await getPublicCardBySlug(slug);
      if (!card) {
        res.status(404).set("Cache-Control", "no-store").type("html").send(renderCardNotFoundHtml(template));
        return;
      }
      res
        .status(200)
        .set("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=60")
        .type("html")
        .send(renderCardHtml(template, card, siteOrigin(req)));
    } catch (error) {
      logJson("error", "card page render failed", { slug, error: String(error) });
      res.status(503).set({ "Retry-After": "30", "Cache-Control": "no-store" }).type("html").send(template);
    }
  });

  // Uptime monitors should poll this. 200 when the database answers, 503 otherwise.
  app.get("/api/health", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    if (!ENV.databaseUrl) {
      res.status(503).json({ ok: false, db: "not_configured" });
      return;
    }
    const started = Date.now();
    try {
      const db = await getDb();
      if (!db) throw new Error("database unavailable");
      await db.execute(sql`select 1`);
      res.json({ ok: true, db: "up", latencyMs: Date.now() - started });
    } catch (error) {
      logJson("error", "health check failed", { error: String(error) });
      res.status(503).json({ ok: false, db: "down" });
    }
  });

  // Crash reports from the browser (ErrorBoundary and window error handlers).
  app.post(
    "/api/client-error",
    express.json({ limit: "16kb", type: ["application/json", "text/plain"] }),
    async (req, res) => {
      const limit = await rateLimit(`client-error:${hashIdentifier(clientIp(req))}`, 20, 10 * 60_000);
      if (limit.allowed && req.body && typeof req.body === "object") {
        const body = req.body as Record<string, unknown>;
        logJson("error", "client error", {
          source: clip(body.source, 20),
          message: clip(body.message, 500),
          stack: clip(body.stack, 4000),
          componentStack: clip(body.componentStack, 4000),
          path: clip(body.path, 300),
          userAgent: clip(body.userAgent, 300),
          release: clip(body.release, 40),
        });
      }
      res.status(204).end();
    },
  );
}

export { logJson };
