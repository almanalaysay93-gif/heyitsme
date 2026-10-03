-- Teams phase 7: company files and links, which cards show them, scheduled banners, and the team's email
-- signature and meeting background settings. Three new tables and two new columns. Nothing existing is changed.
alter table "workspaces" add column if not exists "signatureSettings" jsonb;
alter table "workspaces" add column if not exists "backgroundSettings" jsonb;
create table if not exists "workspaceAssets" (
  "id" serial primary key,
  "workspaceId" integer not null,
  "title" varchar(160) not null,
  "kind" varchar(8) not null,
  "url" text not null,
  "fileName" varchar(180),
  "contentType" varchar(120),
  "sizeBytes" integer,
  "archivedAt" timestamp,
  "createdBy" integer not null,
  "createdAt" timestamp default now() not null,
  "updatedAt" timestamp default now() not null
);
create index if not exists "workspace_assets_workspace_idx" on "workspaceAssets" ("workspaceId");
create table if not exists "workspaceCardAssets" (
  "id" serial primary key,
  "cardId" integer not null,
  "assetId" integer not null,
  "addedBy" integer not null,
  "createdAt" timestamp default now() not null
);
create unique index if not exists "workspace_card_assets_card_asset_idx" on "workspaceCardAssets" ("cardId", "assetId");
create index if not exists "workspace_card_assets_asset_idx" on "workspaceCardAssets" ("assetId");
create table if not exists "workspaceBanners" (
  "id" serial primary key,
  "workspaceId" integer not null,
  "title" varchar(120) not null,
  "description" varchar(400),
  "ctaLabel" varchar(40),
  "ctaUrl" varchar(500),
  "startAt" timestamp not null,
  "endAt" timestamp not null,
  "target" varchar(16) default 'all' not null,
  "departmentId" integer,
  "cardIds" jsonb,
  "createdBy" integer not null,
  "createdAt" timestamp default now() not null,
  "updatedAt" timestamp default now() not null
);
create index if not exists "workspace_banners_workspace_idx" on "workspaceBanners" ("workspaceId", "endAt");
alter table "workspaceAssets" enable row level security;
alter table "workspaceCardAssets" enable row level security;
alter table "workspaceBanners" enable row level security;
