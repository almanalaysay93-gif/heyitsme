import type { Express, Request, Response } from "express";
import { storageBackend, storageGetSignedUrl, StorageNotFoundError } from "../storage";
import { clientIp, MemoryRateLimiter } from "./rateLimit";

// Every hit signs a URL, which is an outbound call on Supabase Storage. The ceiling is high because a card
// page loads many pictures and a whole event can share one address, and it is counted in memory so that
// pictures never wait on Redis.
const HITS_PER_MINUTE = 1200;

export function registerStorageProxy(app: Express, hitsPerMinute = HITS_PER_MINUTE) {
  const limiter = new MemoryRateLimiter();
  app.get("/storage/*", async (req: Request, res: Response) => {
    const limit = limiter.hit(clientIp(req), hitsPerMinute, 60_000);
    if (!limit.allowed) {
      res.status(429).set({ "Retry-After": String(Math.ceil(limit.resetMs / 1000)), "Cache-Control": "no-store" }).send("Too many requests");
      return;
    }

    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!storageBackend()) {
      res.status(500).send("Storage backend not configured");
      return;
    }

    try {
      const url = await storageGetSignedUrl(key);
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      if (err instanceof StorageNotFoundError) {
        res.status(404).send("File not found");
        return;
      }
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
