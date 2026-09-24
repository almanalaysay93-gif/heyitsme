-- No policies on purpose: the app connects as the table owner, which RLS does not restrict, so this only locks out
-- Supabase's Data API (anon and authenticated roles). server/db.ts (ensureSchema) applies the same thing at runtime.
ALTER TABLE "analyticsEvents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "references" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;