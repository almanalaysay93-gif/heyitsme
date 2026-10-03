CREATE TABLE IF NOT EXISTS "googleReviewPages" (
  "id" serial PRIMARY KEY,
  "cardId" integer NOT NULL UNIQUE REFERENCES "cards"("id") ON DELETE CASCADE,
  "ownerUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slug" varchar(24) NOT NULL UNIQUE,
  "placeId" varchar(255),
  "businessName" varchar(200),
  "address" text,
  "category" varchar(120),
  "rating" numeric(2,1),
  "reviewCount" integer,
  "mapsUrl" text,
  "reviewUrl" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "showOnCard" boolean NOT NULL DEFAULT true,
  "branding" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "lastSyncedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "google_review_owner_idx" ON "googleReviewPages"("ownerUserId");
CREATE TABLE IF NOT EXISTS "googleReviewEvents" (
  "id" serial PRIMARY KEY,
  "pageId" integer NOT NULL REFERENCES "googleReviewPages"("id") ON DELETE CASCADE,
  "type" varchar(40) NOT NULL,
  "source" varchar(32) NOT NULL,
  "campaign" varchar(64),
  "device" varchar(16),
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "google_review_events_page_date_idx" ON "googleReviewEvents"("pageId", "createdAt");
ALTER TABLE "googleReviewPages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "googleReviewEvents" ENABLE ROW LEVEL SECURITY;
