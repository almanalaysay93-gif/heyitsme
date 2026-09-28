// Test helper: an in-memory Postgres (PGlite) with every migration in drizzle/ applied, in order.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

export async function createTestDb() {
  const client = new PGlite();
  const dir = path.resolve(__dirname, "../../drizzle");
  for (const file of readdirSync(dir).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort()) {
    await client.exec(readFileSync(path.join(dir, file), "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return { client, db: drizzle(client) };
}
