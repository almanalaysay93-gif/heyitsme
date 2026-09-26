-- Landing-page templates: template, section layout, services, hours, address, CTA and stats as JSON.
-- server/db.ts (ensureSchema) also applies this at runtime; kept here for manual setups.
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "page" text;
