// The statements of drizzle/0013_teams.sql (teams.test.ts keeps the two equal). ensureSchema runs these
// because Vercel deploys run no migration step. Every statement is idempotent.
export const TEAMS_SCHEMA_STATEMENTS: readonly string[] = [
  "create table if not exists \"workspaces\" (\n  \"id\" serial primary key,\n  \"name\" varchar(120) not null,\n  \"logoUrl\" text,\n  \"description\" text,\n  \"website\" varchar(300),\n  \"email\" varchar(320),\n  \"phone\" varchar(64),\n  \"address\" varchar(300),\n  \"industry\" varchar(80),\n  \"brandColors\" jsonb,\n  \"timezone\" varchar(64) default 'Asia/Manila' not null,\n  \"createdBy\" integer not null,\n  \"createdAt\" timestamp default now() not null,\n  \"updatedAt\" timestamp default now() not null,\n  \"deletedAt\" timestamp\n)",
  "create table if not exists \"workspaceMembers\" (\n  \"id\" serial primary key,\n  \"workspaceId\" integer not null,\n  \"userId\" integer,\n  \"email\" varchar(320) not null,\n  \"role\" varchar(16) default 'member' not null,\n  \"status\" varchar(16) default 'invited' not null,\n  \"jobTitle\" varchar(160),\n  \"departmentId\" integer,\n  \"invitedBy\" integer,\n  \"joinedAt\" timestamp,\n  \"removedAt\" timestamp,\n  \"createdAt\" timestamp default now() not null,\n  \"updatedAt\" timestamp default now() not null\n)",
  "create unique index if not exists \"workspace_members_workspace_email_idx\" on \"workspaceMembers\" (\"workspaceId\", \"email\")",
  "create unique index if not exists \"workspace_members_workspace_user_idx\" on \"workspaceMembers\" (\"workspaceId\", \"userId\") where \"userId\" is not null",
  "create index if not exists \"workspace_members_user_idx\" on \"workspaceMembers\" (\"userId\")",
  "create table if not exists \"workspaceInvitations\" (\n  \"id\" serial primary key,\n  \"workspaceId\" integer not null,\n  \"memberId\" integer not null,\n  \"tokenHash\" varchar(64) not null unique,\n  \"expiresAt\" timestamp not null,\n  \"acceptedAt\" timestamp,\n  \"revokedAt\" timestamp,\n  \"createdBy\" integer not null,\n  \"createdAt\" timestamp default now() not null\n)",
  "create index if not exists \"workspace_invitations_member_idx\" on \"workspaceInvitations\" (\"memberId\")",
  "create table if not exists \"workspaceAuditLog\" (\n  \"id\" serial primary key,\n  \"workspaceId\" integer not null,\n  \"actorUserId\" integer,\n  \"action\" varchar(48) not null,\n  \"entityType\" varchar(32) not null,\n  \"entityId\" varchar(64),\n  \"metadata\" jsonb,\n  \"createdAt\" timestamp default now() not null\n)",
  "create index if not exists \"workspace_audit_workspace_created_idx\" on \"workspaceAuditLog\" (\"workspaceId\", \"createdAt\")",
  "alter table \"workspaces\" enable row level security",
  "alter table \"workspaceMembers\" enable row level security",
  "alter table \"workspaceInvitations\" enable row level security",
  "alter table \"workspaceAuditLog\" enable row level security"
];

// The statements of drizzle/0014_team_cards.sql, kept equal by the same test.
export const TEAM_CARDS_SCHEMA_STATEMENTS: readonly string[] = [
  "alter table \"cards\" add column if not exists \"workspaceId\" integer",
  "alter table \"cards\" add column if not exists \"assignedUserId\" integer",
  "alter table \"cards\" add column if not exists \"teamStatus\" varchar(16)",
  "create index if not exists \"cards_workspace_idx\" on \"cards\" (\"workspaceId\") where \"workspaceId\" is not null",
  "create index if not exists \"cards_assigned_user_idx\" on \"cards\" (\"assignedUserId\") where \"assignedUserId\" is not null",
  "alter table \"contacts\" add column if not exists \"workspaceId\" integer",
  "alter table \"contacts\" add column if not exists \"capturedByUserId\" integer",
  "create table if not exists \"workspaceDepartments\" (\n  \"id\" serial primary key,\n  \"workspaceId\" integer not null,\n  \"name\" varchar(80) not null,\n  \"leadMemberId\" integer,\n  \"archivedAt\" timestamp,\n  \"createdAt\" timestamp default now() not null,\n  \"updatedAt\" timestamp default now() not null\n)",
  "create unique index if not exists \"workspace_departments_name_idx\" on \"workspaceDepartments\" (\"workspaceId\", lower(\"name\"))",
  "alter table \"workspaceDepartments\" enable row level security"
];

// The statements of drizzle/0015_team_brand.sql, kept equal by the same test.
export const TEAM_BRAND_SCHEMA_STATEMENTS: readonly string[] = [
  "alter table \"workspaces\" add column if not exists \"lockedFields\" jsonb",
  "alter table \"cards\" add column if not exists \"templateId\" integer",
  "create table if not exists \"workspaceTemplates\" (\n  \"id\" serial primary key,\n  \"workspaceId\" integer not null,\n  \"name\" varchar(80) not null,\n  \"design\" jsonb not null,\n  \"company\" varchar(160),\n  \"location\" varchar(160),\n  \"lockedFields\" jsonb,\n  \"isDefault\" boolean default false not null,\n  \"archivedAt\" timestamp,\n  \"createdBy\" integer not null,\n  \"createdAt\" timestamp default now() not null,\n  \"updatedAt\" timestamp default now() not null\n)",
  "create index if not exists \"workspace_templates_workspace_idx\" on \"workspaceTemplates\" (\"workspaceId\")",
  "create table if not exists \"workspaceChangeRequests\" (\n  \"id\" serial primary key,\n  \"workspaceId\" integer not null,\n  \"cardId\" integer not null,\n  \"requestedBy\" integer not null,\n  \"changes\" jsonb not null,\n  \"note\" varchar(500),\n  \"status\" varchar(16) default 'pending' not null,\n  \"decidedBy\" integer,\n  \"decidedAt\" timestamp,\n  \"decisionNote\" varchar(500),\n  \"createdAt\" timestamp default now() not null\n)",
  "create index if not exists \"workspace_change_requests_idx\" on \"workspaceChangeRequests\" (\"workspaceId\", \"status\")",
  "alter table \"workspaceTemplates\" enable row level security",
  "alter table \"workspaceChangeRequests\" enable row level security"
];

// The statements of drizzle/0016_team_contacts.sql (teamContacts.test.ts keeps the two equal).
export const TEAM_CONTACTS_SCHEMA_STATEMENTS: readonly string[] = [
  "alter table \"contacts\" add column if not exists \"assignedUserId\" integer",
  "alter table \"contacts\" add column if not exists \"departmentId\" integer",
  "create index if not exists \"contacts_workspace_idx\" on \"contacts\" (\"workspaceId\", \"id\") where \"workspaceId\" is not null",
  "update \"contacts\" set \"assignedUserId\" = \"capturedByUserId\" where \"workspaceId\" is not null and \"assignedUserId\" is null and \"ownerUserId\" = \"capturedByUserId\"",
  "update \"contacts\" set \"ownerUserId\" = m.\"userId\" from \"workspaceMembers\" m where m.\"workspaceId\" = \"contacts\".\"workspaceId\" and m.\"role\" = 'owner' and m.\"status\" = 'active' and m.\"userId\" is not null and \"contacts\".\"ownerUserId\" <> m.\"userId\""
];
// The statements of drizzle/0017_team_analytics.sql (teamAnalytics.test.ts keeps the two equal).
export const TEAM_ANALYTICS_SCHEMA_STATEMENTS: readonly string[] = [
  "alter table \"workspaces\" add column if not exists \"leaderboardEnabled\" boolean default false not null"
];
// The statements of drizzle/0018_team_events.sql (teamEvents.test.ts keeps the two equal).
export const TEAM_EVENTS_SCHEMA_STATEMENTS: readonly string[] = [
  "create table if not exists \"workspaceEvents\" (\n  \"id\" serial primary key,\n  \"workspaceId\" integer not null,\n  \"createdBy\" integer not null,\n  \"slug\" varchar(40) not null unique,\n  \"title\" varchar(160) not null,\n  \"description\" text,\n  \"coverImageUrl\" text,\n  \"startAt\" timestamp,\n  \"endAt\" timestamp,\n  \"venue\" varchar(200),\n  \"address\" varchar(300),\n  \"mapUrl\" varchar(500),\n  \"organizerName\" varchar(160),\n  \"organizerContact\" varchar(200),\n  \"rsvpDeadline\" timestamp,\n  \"capacity\" integer,\n  \"allowMaybe\" boolean default true not null,\n  \"design\" jsonb,\n  \"status\" varchar(16) default 'draft' not null,\n  \"createdAt\" timestamp default now() not null,\n  \"updatedAt\" timestamp default now() not null\n)",
  "create index if not exists \"workspace_events_workspace_idx\" on \"workspaceEvents\" (\"workspaceId\")",
  "create table if not exists \"workspaceEventFields\" (\n  \"id\" serial primary key,\n  \"eventId\" integer not null,\n  \"standardKey\" varchar(32),\n  \"label\" varchar(160) not null,\n  \"fieldType\" varchar(24) not null,\n  \"required\" boolean default false not null,\n  \"enabled\" boolean default true not null,\n  \"sortOrder\" integer default 0 not null,\n  \"options\" jsonb,\n  \"createdAt\" timestamp default now() not null\n)",
  "create index if not exists \"workspace_event_fields_event_idx\" on \"workspaceEventFields\" (\"eventId\")",
  "create table if not exists \"workspaceEventRsvps\" (\n  \"id\" serial primary key,\n  \"eventId\" integer not null,\n  \"status\" varchar(16) not null,\n  \"guests\" integer default 0 not null,\n  \"submittedAt\" timestamp default now() not null,\n  \"updatedAt\" timestamp default now() not null,\n  \"checkedInAt\" timestamp,\n  \"checkedInBy\" integer\n)",
  "create index if not exists \"workspace_event_rsvps_event_idx\" on \"workspaceEventRsvps\" (\"eventId\", \"id\")",
  "create table if not exists \"workspaceEventRsvpAnswers\" (\n  \"id\" serial primary key,\n  \"rsvpId\" integer not null,\n  \"fieldId\" integer not null,\n  \"value\" jsonb\n)",
  "create index if not exists \"workspace_event_rsvp_answers_rsvp_idx\" on \"workspaceEventRsvpAnswers\" (\"rsvpId\")",
  "alter table \"workspaceEvents\" enable row level security",
  "alter table \"workspaceEventFields\" enable row level security",
  "alter table \"workspaceEventRsvps\" enable row level security",
  "alter table \"workspaceEventRsvpAnswers\" enable row level security"
];
// The statements of drizzle/0019_team_assets.sql (teamKit.test.ts keeps the two equal).
export const TEAM_ASSETS_SCHEMA_STATEMENTS: readonly string[] = [
  "alter table \"workspaces\" add column if not exists \"signatureSettings\" jsonb",
  "alter table \"workspaces\" add column if not exists \"backgroundSettings\" jsonb",
  "create table if not exists \"workspaceAssets\" (\n  \"id\" serial primary key,\n  \"workspaceId\" integer not null,\n  \"title\" varchar(160) not null,\n  \"kind\" varchar(8) not null,\n  \"url\" text not null,\n  \"fileName\" varchar(180),\n  \"contentType\" varchar(120),\n  \"sizeBytes\" integer,\n  \"archivedAt\" timestamp,\n  \"createdBy\" integer not null,\n  \"createdAt\" timestamp default now() not null,\n  \"updatedAt\" timestamp default now() not null\n)",
  "create index if not exists \"workspace_assets_workspace_idx\" on \"workspaceAssets\" (\"workspaceId\")",
  "create table if not exists \"workspaceCardAssets\" (\n  \"id\" serial primary key,\n  \"cardId\" integer not null,\n  \"assetId\" integer not null,\n  \"addedBy\" integer not null,\n  \"createdAt\" timestamp default now() not null\n)",
  "create unique index if not exists \"workspace_card_assets_card_asset_idx\" on \"workspaceCardAssets\" (\"cardId\", \"assetId\")",
  "create index if not exists \"workspace_card_assets_asset_idx\" on \"workspaceCardAssets\" (\"assetId\")",
  "create table if not exists \"workspaceBanners\" (\n  \"id\" serial primary key,\n  \"workspaceId\" integer not null,\n  \"title\" varchar(120) not null,\n  \"description\" varchar(400),\n  \"ctaLabel\" varchar(40),\n  \"ctaUrl\" varchar(500),\n  \"startAt\" timestamp not null,\n  \"endAt\" timestamp not null,\n  \"target\" varchar(16) default 'all' not null,\n  \"departmentId\" integer,\n  \"cardIds\" jsonb,\n  \"createdBy\" integer not null,\n  \"createdAt\" timestamp default now() not null,\n  \"updatedAt\" timestamp default now() not null\n)",
  "create index if not exists \"workspace_banners_workspace_idx\" on \"workspaceBanners\" (\"workspaceId\", \"endAt\")",
  "alter table \"workspaceAssets\" enable row level security",
  "alter table \"workspaceCardAssets\" enable row level security",
  "alter table \"workspaceBanners\" enable row level security"
];
// The statements of drizzle/0020_team_seats.sql (teamSeats.test.ts keeps the two equal).
export const TEAM_SEATS_SCHEMA_STATEMENTS: readonly string[] = [
  "alter table \"workspaces\" add column if not exists \"seatLimit\" integer",
  "alter table \"workspaces\" add column if not exists \"accessUntil\" timestamp"
];
// The statements of drizzle/0022_event_page.sql (teamEvents.test.ts keeps the two equal).
export const TEAM_EVENT_PAGE_SCHEMA_STATEMENTS: readonly string[] = [
  "alter table \"workspaceEvents\" add column if not exists \"page\" jsonb"
];
