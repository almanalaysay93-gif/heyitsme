-- T02 idempotent card creation. server/db.ts (ensureSchema) also applies this at runtime; kept here for manual setups.
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "creationKey" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cards_owner_creation_key_idx" ON "cards" ("ownerUserId", "creationKey") WHERE "creationKey" IS NOT NULL;
