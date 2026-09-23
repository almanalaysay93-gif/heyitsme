import type { Express, Request, Response } from "express";
import { storageGetSignedUrl } from "../storage";
import { ENV } from "./env";

export function registerStorageProxy(app: Express) {
  app.get("/storage/*", async (req: Request, res: Response) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.s3Bucket) {
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
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
