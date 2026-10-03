import {
  boolean,
  doublePrecision,
  index,
  integer,
  numeric,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 16 }).default("user").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { mode: "date" }).defaultNow().notNull(),
}).enableRLS();

export const cards = pgTable("cards", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("ownerUserId").notNull(),
  creationKey: varchar("creationKey", { length: 64 }),
  displayName: varchar("displayName", { length: 160 }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  company: varchar("company", { length: 160 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  location: varchar("location", { length: 160 }),
  bio: text("bio"),
  links: text("links"),
  portfolio: text("portfolio"),
  channels: text("channels"),
  theme: text("theme"),
  logoUrl: text("logoUrl"),
  avatarUrl: text("avatarUrl"),
  coverUrl: text("coverUrl"),
  backgroundUrl: text("backgroundUrl"),
  contactHeading: varchar("contactHeading", { length: 160 }),
  galleryHeading: varchar("galleryHeading", { length: 160 }),
  portfolioHeading: varchar("portfolioHeading", { length: 160 }),
  // Landing-page template, section layout and template content as JSON. See shared/pageConfig.ts.
  page: text("page"),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  published: boolean("published").default(false).notNull(),
  deletedAt: timestamp("deletedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
},
  table => [
  index("cards_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
  uniqueIndex("cards_owner_creation_key_idx").on(table.ownerUserId, table.creationKey),
]).enableRLS();

export const contacts = pgTable("contacts", {
    status: varchar("status", { length: 16 }).default("new").notNull(),
    campaignId: varchar("campaignId", { length: 32 }),
    id: serial("id").primaryKey(),
  ownerUserId: integer("ownerUserId").notNull(),
  cardId: integer("cardId"),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  company: varchar("company", { length: 160 }),
  title: varchar("title", { length: 160 }),
  tags: text("tags"),
  notes: text("notes"),
  source: varchar("source", { length: 32 }).default("exchange_form").notNull(),
  followedUp: boolean("followedUp").default(false).notNull(),
  seenAt: timestamp("seenAt", { mode: "date" }),
  // When the owner means to reach out. No reminders are sent; it only orders the list.
  followUpOn: timestamp("followUpOn", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
},
  table => [index("contacts_owner_id_idx").on(table.ownerUserId, table.id)]
).enableRLS();

export const qrCampaigns = pgTable(
  "qrCampaigns",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    ownerUserId: integer("ownerUserId")
      .notNull()
      .references(() => users.id),
    cardId: integer("cardId")
      .notNull()
      .references(() => cards.id),
    name: varchar("name", { length: 80 }).notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  },
  table => [index("qr_campaign_owner_idx").on(table.ownerUserId, table.cardId)]).enableRLS();

export const analyticsEvents = pgTable("analyticsEvents", {
  id: serial("id").primaryKey(),
  cardId: integer("cardId").notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  meta: text("meta"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
},
  table => [index("analytics_card_created_idx").on(table.cardId, table.createdAt),
  ]).enableRLS();

export const references = pgTable("references", {
  id: serial("id").primaryKey(),
  cardId: integer("cardId").notNull(),
  ownerUserId: integer("ownerUserId").notNull(),
  clientName: varchar("clientName", { length: 160 }).notNull(),
  clientRole: varchar("clientRole", { length: 160 }),
  company: varchar("company", { length: 160 }),
  quote: text("quote").notNull(),
  avatarUrl: text("avatarUrl"),
  approved: boolean("approved").default(true).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
},
  table => [index("references_card_created_idx").on(table.cardId, table.createdAt),
  ]).enableRLS();

// Billing (drizzle/0009_billing.sql). Card data never lives here: payment details stay with the gateway.

export const billingAccounts = pgTable("billingAccounts", {
  id: serial("id").primaryKey(),
  ownerType: varchar("ownerType", { length: 16 }).default("user").notNull(),
  ownerUserId: integer("ownerUserId"),
  organizationId: integer("organizationId"),
  provider: varchar("provider", { length: 32 }).default("2c2p").notNull(),
  providerCustomerRef: varchar("providerCustomerRef", { length: 128 }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
},
  table => [uniqueIndex("billing_accounts_owner_user_idx").on(table.ownerUserId),
  ]).enableRLS();

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  billingAccountId: integer("billingAccountId").notNull(),
  planCode: varchar("planCode", { length: 16 }).notNull(),
  billingCycle: varchar("billingCycle", { length: 16 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("PHP").notNull(),
  priceMinor: integer("priceMinor").notNull(),
  providerSubscriptionRef: varchar("providerSubscriptionRef", { length: 128,
    }),
  providerRecurringRef: varchar("providerRecurringRef", { length: 128 }),
  foundingMember: boolean("foundingMember").default(false).notNull(),
  foundingMemberNumber: integer("foundingMemberNumber"),
  currentPeriodStart: timestamp("currentPeriodStart", { mode: "date",
    }).notNull(),
  currentPeriodEnd: timestamp("currentPeriodEnd", { mode: "date" }).notNull(),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
  canceledAt: timestamp("canceledAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
},
  table => [
  index("subscriptions_account_idx").on(table.billingAccountId),
  uniqueIndex("subscriptions_founding_number_idx").on(table.foundingMemberNumber),
]).enableRLS();

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  billingAccountId: integer("billingAccountId"),
  userId: integer("userId").notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  /** Our invoice number sent to the gateway. Unique, so one gateway result settles one payment once. */
  providerTransactionId: varchar("providerTransactionId", { length: 64 }).notNull().unique(),
  /** The gateway's own reference (2C2P tranRef), once known. */
  providerInvoiceRef: varchar("providerInvoiceRef", { length: 128 }).unique(),
  purpose: varchar("purpose", { length: 24 }).notNull(),
  planCode: varchar("planCode", { length: 16 }),
  billingCycle: varchar("billingCycle", { length: 16 }),
  channel: varchar("channel", { length: 16 }),
  orderId: integer("orderId"),
  amountMinor: integer("amountMinor").notNull(),
  currency: varchar("currency", { length: 3 }).default("PHP").notNull(),
  /** Price was quoted at the founding rate. Founding status itself is only given on success. */
  foundingPrice: boolean("foundingPrice").default(false).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  failureCode: varchar("failureCode", { length: 32 }),
  failureMessage: varchar("failureMessage", { length: 200 }),
  metadataJson: text("metadataJson"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  succeededAt: timestamp("succeededAt", { mode: "date" }),
},
  table => [index("payments_user_created_idx").on(table.userId, table.createdAt),
  ]).enableRLS();

export const usageCounters = pgTable("usageCounters", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("ownerUserId").notNull(),
  metric: varchar("metric", { length: 32 }).notNull(),
  periodKey: varchar("periodKey", { length: 16 }).notNull(),
  count: integer("count").default(0).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
},
  table => [uniqueIndex("usage_counters_owner_metric_period_idx").on(table.ownerUserId, table.metric, table.periodKey),
  ]).enableRLS();

export const entitlementOverrides = pgTable("entitlementOverrides", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  entitlement: varchar("entitlement", { length: 32 }).notNull(),
  valueJson: text("valueJson").notNull(),
  reason: varchar("reason", { length: 200 }).notNull(),
  expiresAt: timestamp("expiresAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
},
  table => [index("entitlement_overrides_user_idx").on(table.userId)]).enableRLS();

/** One row per campaign. `used` only grows inside the verified-payment transaction. */
export const offerCounters = pgTable("offerCounters", {
  code: varchar("code", { length: 32 }).primaryKey(),
  used: integer("used").default(0).notNull(),
  maximum: integer("maximum").notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
}).enableRLS();

export const googleReviewPages = pgTable("googleReviewPages", {
  id: serial("id").primaryKey(),
  cardId: integer("cardId").notNull().unique().references(() => cards.id, { onDelete: "cascade" }),
  ownerUserId: integer("ownerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 24 }).notNull().unique(),
  placeId: varchar("placeId", { length: 255 }),
  businessName: varchar("businessName", { length: 200 }),
  address: text("address"),
  category: varchar("category", { length: 120 }),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  rating: numeric("rating", { precision: 2, scale: 1 }),
  reviewCount: integer("reviewCount"),
  mapsUrl: text("mapsUrl"),
  reviewUrl: text("reviewUrl"),
  enabled: boolean("enabled").default(true).notNull(),
  showOnCard: boolean("showOnCard").default(true).notNull(),
  branding: jsonb("branding").$type<Record<string, unknown>>().default({}).notNull(),
  lastSyncedAt: timestamp("lastSyncedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("google_review_owner_idx").on(table.ownerUserId)]).enableRLS();

export const googleReviewEvents = pgTable("googleReviewEvents", {
  id: serial("id").primaryKey(),
  pageId: integer("pageId").notNull().references(() => googleReviewPages.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }).notNull(),
  source: varchar("source", { length: 32 }).notNull(),
  campaign: varchar("campaign", { length: 64 }),
  device: varchar("device", { length: 16 }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("google_review_events_page_date_idx").on(table.pageId, table.createdAt)]).enableRLS();

// One row per request sent to Google Places. Never deleted, and not tied to the card by a foreign key, so the
// history outlives a removed card.
export const googlePlacesUsage = pgTable("googlePlacesUsage", {
  id: serial("id").primaryKey(),
  cardId: integer("cardId"),
  ownerUserId: integer("ownerUserId"),
  requestType: varchar("requestType", { length: 24 }).notNull(),
  requestCount: integer("requestCount").default(1).notNull(),
  sessionId: varchar("sessionId", { length: 64 }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("google_places_usage_created_idx").on(table.createdAt)]).enableRLS();

export const appSettings = pgTable("appSettings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
}).enableRLS();

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type InsertCard = typeof cards.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type Reference = typeof references.$inferSelect;
export type InsertReference = typeof references.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
