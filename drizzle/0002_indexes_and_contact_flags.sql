-- Idempotent: production databases may already have these from the runtime bootstrap in server/db.ts (ensureSchema).
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "followedUp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "seenAt" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_card_created_idx" ON "analyticsEvents" USING btree ("cardId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_owner_updated_idx" ON "cards" USING btree ("ownerUserId","updatedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_owner_id_idx" ON "contacts" USING btree ("ownerUserId","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "references_card_created_idx" ON "references" USING btree ("cardId","createdAt");