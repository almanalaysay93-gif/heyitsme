import "dotenv/config";
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerPaymentRoutes } from "../billing/paymentRoutes";
import QRCode from "qrcode";
import { registerSeoRoutes, logJson, siteOrigin } from "./seo";
import { getPublicCardBySlug } from "../db";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { publicReviewDestination, trackReviewEvent } from "../googleReviews";
import { clientIp, hashIdentifier, rateLimit } from "./rateLimit";

// Keep in sync with the headers block in vercel.json, which covers static files Vercel serves directly.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Website tiles on cards ask Microlink for a screenshot of the site.
  "connect-src 'self' https://api.microlink.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Vite's dev server injects inline scripts for HMR, so only enforce CSP on built output.
  if (process.env.NODE_ENV !== "development") {
    res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    // Same value as vercel.json. No includeSubDomains/preload: other subdomains (mail) are not ours to pin.
    res.setHeader("Strict-Transport-Security", "max-age=63072000");
  }
  next();
};

const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error?.status ?? error?.statusCode) || 500;
  if (status >= 500) logJson("error", "unhandled request error", { method: req.method, path: req.path, error: String(error?.stack ?? error) });
  const message = status === 413 ? "Request is too large." : status < 500 ? "Bad request." : "Something went wrong on our side.";
  res.status(status).json({ error: message });
};

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(securityHeaders);
  // Uploads arrive as base64 inside tRPC JSON: 3 MB files become ~4.2 MB. Vercel caps bodies at 4.5 MB.
  app.use("/api/trpc", express.json({ limit: "6mb" }));
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ limit: "100kb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerPaymentRoutes(app);
  registerSeoRoutes(app);
  // The QR picture an email signature shows. Mail apps need a real image address, and this one only ever encodes
  // the link of a published card, so it cannot be used to make a code for anything else.
  app.get("/api/qr/c/:file", async (req, res) => {
    const slug = /^([A-Za-z0-9_-]{1,120})\.png$/.exec(String(req.params.file ?? ""))?.[1];
    if (!slug) return res.status(404).send("Not found.");
    const limited = await rateLimit(`qr-image:${hashIdentifier(clientIp(req))}`, 120, 60_000);
    if (!limited.allowed) return res.status(429).send("Please wait and try again.");
    try {
      const card = await getPublicCardBySlug(slug);
      if (!card) return res.status(404).send("Not found.");
      const png = await QRCode.toBuffer(`${siteOrigin(req)}/c/${card.slug}?source=signature`, { errorCorrectionLevel: "M", width: 336, margin: 2 });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(png);
    } catch (error) {
      logJson("error", "qr image failed", { error: String(error) });
      return res.status(503).send("Temporarily unavailable.");
    }
  });
  app.get("/api/google-reviews/:slug/write", async (req, res) => {
    const slug = String(req.params.slug ?? "");
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(slug)) return res.status(404).send("Review page not found.");
    const limited = await rateLimit(`review-out:${hashIdentifier(clientIp(req))}`, 30, 60_000);
    if (!limited.allowed) return res.status(429).send("Please wait and try again.");
    try {
      // The destination comes from what setup stored. This route never calls Google Places.
      const target = await publicReviewDestination(slug);
      if (!target) return res.status(404).send("Review page not found.");
      const source = /^[a-z0-9_-]{1,32}$/.test(String(req.query.source ?? "")) ? String(req.query.source) : "direct";
      await trackReviewEvent(slug, "google_review_click", source);
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(302, target);
    } catch (error) {
      logJson("error", "review link failed", { error: String(error) });
      return res.status(503).send("Google Reviews is temporarily unavailable. Please try again.");
    }
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path, type }) {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          logJson("error", "trpc internal error", { path, type, error: String(error.cause?.stack ?? error.stack ?? error.message) });
        }
      },
    })
  );
  app.use(errorHandler);
  return app;
}
