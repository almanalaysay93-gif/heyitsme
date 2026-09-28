-- Paid plans: billing accounts, subscriptions, payments, usage counters, overrides and offer counters.
-- Forward-only and idempotent. server/db.ts ensureSchema runs the same statements on first use,
-- because Vercel deploys run no migration step. Existing tables are not changed.
-- Row level security: tables created by the app role are owned by it, so ensureSchema can enable RLS.
-- If an owner role (Supabase SQL Editor) creates them instead, the ALTER statements below cover it.

create table if not exists "billingAccounts" (
  "id" serial primary key,
  "ownerType" varchar(16) default 'user' not null,
  "ownerUserId" integer,
  "organizationId" integer,
  "provider" varchar(32) default '2c2p' not null,
  "providerCustomerRef" varchar(128),
  "createdAt" timestamp default now() not null,
  "updatedAt" timestamp default now() not null
);
create unique index if not exists "billing_accounts_owner_user_idx" on "billingAccounts" ("ownerUserId");

create table if not exists "subscriptions" (
  "id" serial primary key,
  "billingAccountId" integer not null,
  "planCode" varchar(16) not null,
  "billingCycle" varchar(16) not null,
  "status" varchar(16) not null,
  "currency" varchar(3) default 'PHP' not null,
  "priceMinor" integer not null,
  "providerSubscriptionRef" varchar(128),
  "providerRecurringRef" varchar(128),
  "foundingMember" boolean default false not null,
  "foundingMemberNumber" integer,
  "currentPeriodStart" timestamp not null,
  "currentPeriodEnd" timestamp not null,
  "cancelAtPeriodEnd" boolean default false not null,
  "canceledAt" timestamp,
  "createdAt" timestamp default now() not null,
  "updatedAt" timestamp default now() not null
);
create index if not exists "subscriptions_account_idx" on "subscriptions" ("billingAccountId");
create unique index if not exists "subscriptions_founding_number_idx" on "subscriptions" ("foundingMemberNumber");

create table if not exists "payments" (
  "id" serial primary key,
  "billingAccountId" integer,
  "userId" integer not null,
  "provider" varchar(32) not null,
  "providerTransactionId" varchar(64) not null unique,
  "providerInvoiceRef" varchar(128) unique,
  "purpose" varchar(24) not null,
  "planCode" varchar(16),
  "billingCycle" varchar(16),
  "channel" varchar(16),
  "orderId" integer,
  "amountMinor" integer not null,
  "currency" varchar(3) default 'PHP' not null,
  "foundingPrice" boolean default false not null,
  "status" varchar(24) not null,
  "failureCode" varchar(32),
  "failureMessage" varchar(200),
  "metadataJson" text,
  "createdAt" timestamp default now() not null,
  "updatedAt" timestamp default now() not null,
  "succeededAt" timestamp
);
create index if not exists "payments_user_created_idx" on "payments" ("userId", "createdAt");

create table if not exists "usageCounters" (
  "id" serial primary key,
  "ownerUserId" integer not null,
  "metric" varchar(32) not null,
  "periodKey" varchar(16) not null,
  "count" integer default 0 not null,
  "updatedAt" timestamp default now() not null
);
create unique index if not exists "usage_counters_owner_metric_period_idx" on "usageCounters" ("ownerUserId", "metric", "periodKey");

create table if not exists "entitlementOverrides" (
  "id" serial primary key,
  "userId" integer not null,
  "entitlement" varchar(32) not null,
  "valueJson" text not null,
  "reason" varchar(200) not null,
  "expiresAt" timestamp,
  "createdAt" timestamp default now() not null
);
create index if not exists "entitlement_overrides_user_idx" on "entitlementOverrides" ("userId");

create table if not exists "offerCounters" (
  "code" varchar(32) primary key,
  "used" integer default 0 not null,
  "maximum" integer not null,
  "updatedAt" timestamp default now() not null
);
insert into "offerCounters" ("code", "maximum") values ('founding_pro', 500) on conflict ("code") do nothing;

alter table "billingAccounts" enable row level security;
alter table "subscriptions" enable row level security;
alter table "payments" enable row level security;
alter table "usageCounters" enable row level security;
alter table "entitlementOverrides" enable row level security;
alter table "offerCounters" enable row level security;
