import { createHash } from "node:crypto";
import type { Request } from "express";
import { ENV } from "./env";

export type RateLimitResult = { allowed: boolean; count: number; resetMs: number };

type Bucket = { count: number; expiresAt: number };

const MAX_MEMORY_KEYS = 10_000;

/**
 * Fixed-window counter kept in this process. On serverless each warm instance has its
 * own copy, so it is a floor, not a guarantee; set Upstash env vars for a shared limit.
 */
export class MemoryRateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(private now: () => number = Date.now) {}

  hit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      if (this.buckets.size >= MAX_MEMORY_KEYS) this.sweep(now);
      bucket = { count: 0, expiresAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return { allowed: bucket.count <= limit, count: bucket.count, resetMs: bucket.expiresAt - now };
  }

  private sweep(now: number) {
    this.buckets.forEach((bucket, key) => {
      if (bucket.expiresAt <= now) this.buckets.delete(key);
    });
    // Still full of live keys: drop the oldest insertions rather than grow without bound.
    const overflow = this.buckets.size - MAX_MEMORY_KEYS + 1;
    if (overflow > 0) {
      let dropped = 0;
      for (const key of Array.from(this.buckets.keys())) {
        if (dropped >= overflow) break;
        this.buckets.delete(key);
        dropped += 1;
      }
    }
  }
}

const memory = new MemoryRateLimiter();

function upstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function upstashHit(config: { url: string; token: string }, key: string, windowMs: number) {
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", key],
      ["PEXPIRE", key, String(windowMs), "NX"],
      ["PTTL", key],
    ]),
    signal: AbortSignal.timeout(800),
  });
  if (!response.ok) throw new Error(`Upstash responded ${response.status}`);
  const results = (await response.json()) as Array<{ result?: unknown; error?: string }>;
  const count = Number(results[0]?.result);
  const ttl = Number(results[2]?.result);
  if (!Number.isFinite(count)) throw new Error("Upstash returned no count");
  return { count, resetMs: Number.isFinite(ttl) && ttl > 0 ? ttl : windowMs };
}

/**
 * Count one hit against `key` and report whether it is within `limit` per `windowMs`.
 * Uses Upstash Redis when configured, falling back to per-instance memory if it is
 * missing or unreachable, so a Redis outage never takes the site down.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const namespaced = `rl:${key}`;
  const config = upstashConfig();
  if (config) {
    try {
      const { count, resetMs } = await upstashHit(config, namespaced, windowMs);
      return { allowed: count <= limit, count, resetMs };
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", msg: "rate limit store unavailable, using memory", error: String(error) }));
    }
  }
  return memory.hit(namespaced, limit, windowMs);
}

/**
 * Client address for abuse controls. `trust proxy` is 1, so Express takes the
 * last hop from X-Forwarded-For (the one Vercel appends), which a client cannot spoof.
 */
export function clientIp(req: Pick<Request, "ip" | "socket"> | undefined): string {
  return req?.ip || req?.socket?.remoteAddress || "unknown";
}

/** One-way hash so raw IP addresses are never written to the rate-limit store. */
export function hashIdentifier(value: string): string {
  return createHash("sha256").update(`${ENV.cookieSecret}:${value}`).digest("base64url").slice(0, 22);
}
