-- Teams phase 4: contacts collected through company cards belong to the company.
-- Only adds nullable columns. A personal contact keeps "workspaceId" null and behaves as before. Nothing is deleted.
-- The two updates move contacts that phase 2 filed under the card holder: the holder stays the assigned person,
-- and the contact is held in the team owner's name, the same way company cards are.
-- Keep in step with server/teams/schemaSql.ts (TEAM_CONTACTS_SCHEMA_STATEMENTS), which ensureSchema runs on first use.
alter table "contacts" add column if not exists "assignedUserId" integer;
alter table "contacts" add column if not exists "departmentId" integer;
create index if not exists "contacts_workspace_idx" on "contacts" ("workspaceId", "id") where "workspaceId" is not null;
update "contacts" set "assignedUserId" = "capturedByUserId" where "workspaceId" is not null and "assignedUserId" is null and "ownerUserId" = "capturedByUserId";
update "contacts" set "ownerUserId" = m."userId" from "workspaceMembers" m where m."workspaceId" = "contacts"."workspaceId" and m."role" = 'owner' and m."status" = 'active' and m."userId" is not null and "contacts"."ownerUserId" <> m."userId";
