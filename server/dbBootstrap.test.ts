import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { SCHEMA_BOOTSTRAP_VERSION } from "./db";

it("runs a new runtime bootstrap when a migration is added", () => {
  const files = readdirSync(path.resolve(import.meta.dirname, "../drizzle"))
    .filter(name => /^\d{4}_.*\.sql$/.test(name))
    .sort();
  expect(files.at(-1)).toBe(`${SCHEMA_BOOTSTRAP_VERSION}.sql`);
});
