ALTER TABLE "googleReviewPages" ADD COLUMN IF NOT EXISTS "latitude" double precision;
ALTER TABLE "googleReviewPages" ADD COLUMN IF NOT EXISTS "longitude" double precision;
CREATE TABLE IF NOT EXISTS "googlePlacesUsage" (
  "id" serial PRIMARY KEY,
  "cardId" integer,
  "ownerUserId" integer,
  "requestType" varchar(24) NOT NULL,
  "requestCount" integer NOT NULL DEFAULT 1,
  "sessionId" varchar(64),
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "google_places_usage_created_idx" ON "googlePlacesUsage"("createdAt");
CREATE TABLE IF NOT EXISTS "appSettings" (
  "key" varchar(64) PRIMARY KEY,
  "value" jsonb NOT NULL,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "googlePlacesUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appSettings" ENABLE ROW LEVEL SECURITY;
