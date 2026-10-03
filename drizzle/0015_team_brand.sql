-- Teams phase 3: brand, card templates, locked fields and change requests.
-- Only adds nullable columns and two new tables. Personal cards keep "templateId" null and behave as before.
-- Keep in step with server/teams/schemaSql.ts (TEAM_BRAND_SCHEMA_STATEMENTS), which ensureSchema runs on first use.
alter table "workspaces" add column if not exists "lockedFields" jsonb;
alter table "cards" add column if not exists "templateId" integer;
create table if not exists "workspaceTemplates" (
  "id" serial primary key,
  "workspaceId" integer not null,
  "name" varchar(80) not null,
  "design" jsonb not null,
  "company" varchar(160),
  "location" varchar(160),
  "lockedFields" jsonb,
  "isDefault" boolean default false not null,
  "archivedAt" timestamp,
  "createdBy" integer not null,
  "createdAt" timestamp default now() not null,
  "updatedAt" timestamp default now() not null
);
create index if not exists "workspace_templates_workspace_idx" on "workspaceTemplates" ("workspaceId");
create table if not exists "workspaceChangeRequests" (
  "id" serial primary key,
  "workspaceId" integer not null,
  "cardId" integer not null,
  "requestedBy" integer not null,
  "changes" jsonb not null,
  "note" varchar(500),
  "status" varchar(16) default 'pending' not null,
  "decidedBy" integer,
  "decidedAt" timestamp,
  "decisionNote" varchar(500),
  "createdAt" timestamp default now() not null
);
create index if not exists "workspace_change_requests_idx" on "workspaceChangeRequests" ("workspaceId", "status");
alter table "workspaceTemplates" enable row level security;
alter table "workspaceChangeRequests" enable row level security;
