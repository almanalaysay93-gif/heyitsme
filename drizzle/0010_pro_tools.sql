ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL DEFAULT 'new';
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "campaignId" varchar(32);
CREATE TABLE IF NOT EXISTS "qrCampaigns" (
  "id" varchar(32) PRIMARY KEY,
  "ownerUserId" integer NOT NULL REFERENCES "users"("id"),
  "cardId" integer NOT NULL REFERENCES "cards"("id"),
  "name" varchar(80) NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "qr_campaign_owner_idx" ON "qrCampaigns"("ownerUserId", "cardId");
ALTER TABLE "qrCampaigns" ENABLE ROW LEVEL SECURITY;
