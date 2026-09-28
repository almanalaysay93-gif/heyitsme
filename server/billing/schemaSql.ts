// The statements of drizzle/0009_billing.sql (billingSchema.test.ts keeps the two equal). ensureSchema runs these
// because Vercel deploys run no migration step. Every statement is idempotent.
export const BILLING_SCHEMA_STATEMENTS: readonly string[] = [
  "create table if not exists \"billingAccounts\" (\n  \"id\" serial primary key,\n  \"ownerType\" varchar(16) default 'user' not null,\n  \"ownerUserId\" integer,\n  \"organizationId\" integer,\n  \"provider\" varchar(32) default '2c2p' not null,\n  \"providerCustomerRef\" varchar(128),\n  \"createdAt\" timestamp default now() not null,\n  \"updatedAt\" timestamp default now() not null\n)",
  "create unique index if not exists \"billing_accounts_owner_user_idx\" on \"billingAccounts\" (\"ownerUserId\")",
  "create table if not exists \"subscriptions\" (\n  \"id\" serial primary key,\n  \"billingAccountId\" integer not null,\n  \"planCode\" varchar(16) not null,\n  \"billingCycle\" varchar(16) not null,\n  \"status\" varchar(16) not null,\n  \"currency\" varchar(3) default 'PHP' not null,\n  \"priceMinor\" integer not null,\n  \"providerSubscriptionRef\" varchar(128),\n  \"providerRecurringRef\" varchar(128),\n  \"foundingMember\" boolean default false not null,\n  \"foundingMemberNumber\" integer,\n  \"currentPeriodStart\" timestamp not null,\n  \"currentPeriodEnd\" timestamp not null,\n  \"cancelAtPeriodEnd\" boolean default false not null,\n  \"canceledAt\" timestamp,\n  \"createdAt\" timestamp default now() not null,\n  \"updatedAt\" timestamp default now() not null\n)",
  "create index if not exists \"subscriptions_account_idx\" on \"subscriptions\" (\"billingAccountId\")",
  "create unique index if not exists \"subscriptions_founding_number_idx\" on \"subscriptions\" (\"foundingMemberNumber\")",
  "create table if not exists \"payments\" (\n  \"id\" serial primary key,\n  \"billingAccountId\" integer,\n  \"userId\" integer not null,\n  \"provider\" varchar(32) not null,\n  \"providerTransactionId\" varchar(64) not null unique,\n  \"providerInvoiceRef\" varchar(128) unique,\n  \"purpose\" varchar(24) not null,\n  \"planCode\" varchar(16),\n  \"billingCycle\" varchar(16),\n  \"channel\" varchar(16),\n  \"orderId\" integer,\n  \"amountMinor\" integer not null,\n  \"currency\" varchar(3) default 'PHP' not null,\n  \"foundingPrice\" boolean default false not null,\n  \"status\" varchar(24) not null,\n  \"failureCode\" varchar(32),\n  \"failureMessage\" varchar(200),\n  \"metadataJson\" text,\n  \"createdAt\" timestamp default now() not null,\n  \"updatedAt\" timestamp default now() not null,\n  \"succeededAt\" timestamp\n)",
  "create index if not exists \"payments_user_created_idx\" on \"payments\" (\"userId\", \"createdAt\")",
  "create table if not exists \"usageCounters\" (\n  \"id\" serial primary key,\n  \"ownerUserId\" integer not null,\n  \"metric\" varchar(32) not null,\n  \"periodKey\" varchar(16) not null,\n  \"count\" integer default 0 not null,\n  \"updatedAt\" timestamp default now() not null\n)",
  "create unique index if not exists \"usage_counters_owner_metric_period_idx\" on \"usageCounters\" (\"ownerUserId\", \"metric\", \"periodKey\")",
  "create table if not exists \"entitlementOverrides\" (\n  \"id\" serial primary key,\n  \"userId\" integer not null,\n  \"entitlement\" varchar(32) not null,\n  \"valueJson\" text not null,\n  \"reason\" varchar(200) not null,\n  \"expiresAt\" timestamp,\n  \"createdAt\" timestamp default now() not null\n)",
  "create index if not exists \"entitlement_overrides_user_idx\" on \"entitlementOverrides\" (\"userId\")",
  "create table if not exists \"offerCounters\" (\n  \"code\" varchar(32) primary key,\n  \"used\" integer default 0 not null,\n  \"maximum\" integer not null,\n  \"updatedAt\" timestamp default now() not null\n)",
  "insert into \"offerCounters\" (\"code\", \"maximum\") values ('founding_pro', 500) on conflict (\"code\") do nothing",
  "alter table \"billingAccounts\" enable row level security",
  "alter table \"subscriptions\" enable row level security",
  "alter table \"payments\" enable row level security",
  "alter table \"usageCounters\" enable row level security",
  "alter table \"entitlementOverrides\" enable row level security",
  "alter table \"offerCounters\" enable row level security"
];
