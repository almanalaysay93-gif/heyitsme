-- Teams phase 6: events. A simple event page with an RSVP form, the questions on it, the responses and their answers.
-- Four new tables, nothing existing is changed. Times are stored as moments in UTC.
create table if not exists "workspaceEvents" (
  "id" serial primary key,
  "workspaceId" integer not null,
  "createdBy" integer not null,
  "slug" varchar(40) not null unique,
  "title" varchar(160) not null,
  "description" text,
  "coverImageUrl" text,
  "startAt" timestamp,
  "endAt" timestamp,
  "venue" varchar(200),
  "address" varchar(300),
  "mapUrl" varchar(500),
  "organizerName" varchar(160),
  "organizerContact" varchar(200),
  "rsvpDeadline" timestamp,
  "capacity" integer,
  "allowMaybe" boolean default true not null,
  "design" jsonb,
  "status" varchar(16) default 'draft' not null,
  "createdAt" timestamp default now() not null,
  "updatedAt" timestamp default now() not null
);
create index if not exists "workspace_events_workspace_idx" on "workspaceEvents" ("workspaceId");
create table if not exists "workspaceEventFields" (
  "id" serial primary key,
  "eventId" integer not null,
  "standardKey" varchar(32),
  "label" varchar(160) not null,
  "fieldType" varchar(24) not null,
  "required" boolean default false not null,
  "enabled" boolean default true not null,
  "sortOrder" integer default 0 not null,
  "options" jsonb,
  "createdAt" timestamp default now() not null
);
create index if not exists "workspace_event_fields_event_idx" on "workspaceEventFields" ("eventId");
create table if not exists "workspaceEventRsvps" (
  "id" serial primary key,
  "eventId" integer not null,
  "status" varchar(16) not null,
  "guests" integer default 0 not null,
  "submittedAt" timestamp default now() not null,
  "updatedAt" timestamp default now() not null,
  "checkedInAt" timestamp,
  "checkedInBy" integer
);
create index if not exists "workspace_event_rsvps_event_idx" on "workspaceEventRsvps" ("eventId", "id");
create table if not exists "workspaceEventRsvpAnswers" (
  "id" serial primary key,
  "rsvpId" integer not null,
  "fieldId" integer not null,
  "value" jsonb
);
create index if not exists "workspace_event_rsvp_answers_rsvp_idx" on "workspaceEventRsvpAnswers" ("rsvpId");
alter table "workspaceEvents" enable row level security;
alter table "workspaceEventFields" enable row level security;
alter table "workspaceEventRsvps" enable row level security;
alter table "workspaceEventRsvpAnswers" enable row level security;
