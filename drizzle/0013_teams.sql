-- Teams phase 1: workspaces, membership, invitations and the audit log. Every statement is idempotent.
-- Personal accounts, cards, contacts and billing are untouched: these are new tables only.
-- server/teams/schemaSql.ts holds the same statements for ensureSchema (a test keeps the two equal).
create table if not exists "workspaces" (
  "id" serial primary key,
  "name" varchar(120) not null,
  "logoUrl" text,
  "description" text,
  "website" varchar(300),
  "email" varchar(320),
  "phone" varchar(64),
  "address" varchar(300),
  "industry" varchar(80),
  "brandColors" jsonb,
  "timezone" varchar(64) default 'Asia/Manila' not null,
  "createdBy" integer not null,
  "createdAt" timestamp default now() not null,
  "updatedAt" timestamp default now() not null,
  "deletedAt" timestamp
);
create table if not exists "workspaceMembers" (
  "id" serial primary key,
  "workspaceId" integer not null,
  "userId" integer,
  "email" varchar(320) not null,
  "role" varchar(16) default 'member' not null,
  "status" varchar(16) default 'invited' not null,
  "jobTitle" varchar(160),
  "departmentId" integer,
  "invitedBy" integer,
  "joinedAt" timestamp,
  "removedAt" timestamp,
  "createdAt" timestamp default now() not null,
  "updatedAt" timestamp default now() not null
);
create unique index if not exists "workspace_members_workspace_email_idx" on "workspaceMembers" ("workspaceId", "email");
create unique index if not exists "workspace_members_workspace_user_idx" on "workspaceMembers" ("workspaceId", "userId") where "userId" is not null;
create index if not exists "workspace_members_user_idx" on "workspaceMembers" ("userId");
create table if not exists "workspaceInvitations" (
  "id" serial primary key,
  "workspaceId" integer not null,
  "memberId" integer not null,
  "tokenHash" varchar(64) not null unique,
  "expiresAt" timestamp not null,
  "acceptedAt" timestamp,
  "revokedAt" timestamp,
  "createdBy" integer not null,
  "createdAt" timestamp default now() not null
);
create index if not exists "workspace_invitations_member_idx" on "workspaceInvitations" ("memberId");
create table if not exists "workspaceAuditLog" (
  "id" serial primary key,
  "workspaceId" integer not null,
  "actorUserId" integer,
  "action" varchar(48) not null,
  "entityType" varchar(32) not null,
  "entityId" varchar(64),
  "metadata" jsonb,
  "createdAt" timestamp default now() not null
);
create index if not exists "workspace_audit_workspace_created_idx" on "workspaceAuditLog" ("workspaceId", "createdAt");
alter table "workspaces" enable row level security;
alter table "workspaceMembers" enable row level security;
alter table "workspaceInvitations" enable row level security;
alter table "workspaceAuditLog" enable row level security;
