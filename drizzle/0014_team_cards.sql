-- Teams phase 2: company-owned cards and departments.
-- Only adds nullable columns and one new table. A personal card keeps "workspaceId" null and behaves as before.
-- Keep in step with server/teams/schemaSql.ts (TEAM_CARDS_SCHEMA_STATEMENTS), which ensureSchema runs on first use.
alter table "cards" add column if not exists "workspaceId" integer;
alter table "cards" add column if not exists "assignedUserId" integer;
alter table "cards" add column if not exists "teamStatus" varchar(16);
create index if not exists "cards_workspace_idx" on "cards" ("workspaceId") where "workspaceId" is not null;
create index if not exists "cards_assigned_user_idx" on "cards" ("assignedUserId") where "assignedUserId" is not null;
alter table "contacts" add column if not exists "workspaceId" integer;
alter table "contacts" add column if not exists "capturedByUserId" integer;
create table if not exists "workspaceDepartments" (
  "id" serial primary key,
  "workspaceId" integer not null,
  "name" varchar(80) not null,
  "leadMemberId" integer,
  "archivedAt" timestamp,
  "createdAt" timestamp default now() not null,
  "updatedAt" timestamp default now() not null
);
create unique index if not exists "workspace_departments_name_idx" on "workspaceDepartments" ("workspaceId", lower("name"));
alter table "workspaceDepartments" enable row level security;
