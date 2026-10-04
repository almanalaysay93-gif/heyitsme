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
import { sql } from "drizzle-orm";

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
  // Company cards (Teams). A personal card leaves all three empty. For a company card ownerUserId is the team
  // owner, workspaceId is the team, and assignedUserId is the person using it (or nobody).
  workspaceId: integer("workspaceId"),
  assignedUserId: integer("assignedUserId"),
  // Empty for a card in normal use; "suspended" or "archived" once a team admin takes it offline.
  teamStatus: varchar("teamStatus", { length: 16 }),
  // The team template this company card takes its look from, if any.
  templateId: integer("templateId"),
  deletedAt: timestamp("deletedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
},
  table => [
  index("cards_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
  uniqueIndex("cards_owner_creation_key_idx").on(table.ownerUserId, table.creationKey),
  index("cards_workspace_idx").on(table.workspaceId).where(sql`${table.workspaceId} is not null`),
  index("cards_assigned_user_idx").on(table.assignedUserId).where(sql`${table.assignedUserId} is not null`),
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
  // Set when the contact came in through a company card (Teams).
  workspaceId: integer("workspaceId"),
  capturedByUserId: integer("capturedByUserId"),
  // A team contact is held in the team owner's name ("ownerUserId"), like a company card. These say who on the
  // team looks after it now and which department collected it. Null on personal contacts.
  assignedUserId: integer("assignedUserId"),
  departmentId: integer("departmentId"),
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
  /** 1 to 5 stars. Only reviews left by visitors carry one. */
  rating: integer("rating"),
  /** True when a visitor left it on the public card. Those wait, unapproved, for the owner. */
  fromVisitor: boolean("fromVisitor").default(false).notNull(),
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
// Teams (drizzle/0013). A workspace is a company space; personal cards and accounts never depend on one.
export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  logoUrl: text("logoUrl"),
  description: text("description"),
  website: varchar("website", { length: 300 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  address: varchar("address", { length: 300 }),
  industry: varchar("industry", { length: 80 }),
  brandColors: jsonb("brandColors").$type<Record<string, string>>(),
  // Card details members may not change on any company card. See shared/teams.ts LOCKABLE_FIELDS.
  lockedFields: jsonb("lockedFields").$type<string[]>(),
  // Ranking people is each team's choice. Off until an admin turns it on.
  leaderboardEnabled: boolean("leaderboardEnabled").default(false).notNull(),
  // What the team's email signature and meeting background show. See shared/teamKit.ts.
  signatureSettings: jsonb("signatureSettings").$type<Record<string, unknown>>(),
  backgroundSettings: jsonb("backgroundSettings").$type<Record<string, unknown>>(),
  // Seats this team may fill. Empty means the standard allowance. Set by heyitsme only, never by the team.
  seatLimit: integer("seatLimit"),
  // When the team's plan runs out. Empty means no end. After it the team can be read but not changed.
  accessUntil: timestamp("accessUntil", { mode: "date" }),
  timezone: varchar("timezone", { length: 64 }).default("Asia/Manila").notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  // Closing a workspace only sets this. Nothing is deleted.
  deletedAt: timestamp("deletedAt", { mode: "date" }),
}).enableRLS();

// One row per person per workspace, kept for life: an invitation, then a membership, then "removed".
// userId is empty until the invited person signs in and accepts. email is stored lowercase.
export const workspaceMembers = pgTable("workspaceMembers", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  userId: integer("userId"),
  email: varchar("email", { length: 320 }).notNull(),
  role: varchar("role", { length: 16 }).default("member").notNull(),
  status: varchar("status", { length: 16 }).default("invited").notNull(),
  jobTitle: varchar("jobTitle", { length: 160 }),
  departmentId: integer("departmentId"),
  invitedBy: integer("invitedBy"),
  joinedAt: timestamp("joinedAt", { mode: "date" }),
  removedAt: timestamp("removedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workspace_members_workspace_email_idx").on(table.workspaceId, table.email),
  uniqueIndex("workspace_members_workspace_user_idx").on(table.workspaceId, table.userId).where(sql`${table.userId} is not null`),
  index("workspace_members_user_idx").on(table.userId),
]).enableRLS();

// Only the SHA-256 of an invitation link's token is stored. The token itself is never written anywhere.
export const workspaceInvitations = pgTable("workspaceInvitations", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  memberId: integer("memberId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  acceptedAt: timestamp("acceptedAt", { mode: "date" }),
  revokedAt: timestamp("revokedAt", { mode: "date" }),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("workspace_invitations_member_idx").on(table.memberId)]).enableRLS();

// Optional grouping of people inside a workspace. leadMemberId names who leads it; it grants no permissions.
export const workspaceDepartments = pgTable("workspaceDepartments", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  leadMemberId: integer("leadMemberId"),
  archivedAt: timestamp("archivedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [uniqueIndex("workspace_departments_name_idx").on(table.workspaceId, sql`lower(${table.name})`)]).enableRLS();

// A company look admins put on cards: a design, the company details it fills in, and the details it locks.
export const workspaceTemplates = pgTable("workspaceTemplates", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  design: jsonb("design").$type<Record<string, unknown>>().notNull(),
  company: varchar("company", { length: 160 }),
  location: varchar("location", { length: 160 }),
  lockedFields: jsonb("lockedFields").$type<string[]>(),
  isDefault: boolean("isDefault").default(false).notNull(),
  archivedAt: timestamp("archivedAt", { mode: "date" }),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("workspace_templates_workspace_idx").on(table.workspaceId)]).enableRLS();

// A member's request to change locked details of their card. status: pending, approved, rejected or cancelled.
export const workspaceChangeRequests = pgTable("workspaceChangeRequests", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  cardId: integer("cardId").notNull(),
  requestedBy: integer("requestedBy").notNull(),
  changes: jsonb("changes").$type<Record<string, string | null>>().notNull(),
  note: varchar("note", { length: 500 }),
  status: varchar("status", { length: 16 }).default("pending").notNull(),
  decidedBy: integer("decidedBy"),
  decidedAt: timestamp("decidedAt", { mode: "date" }),
  decisionNote: varchar("decisionNote", { length: 500 }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("workspace_change_requests_idx").on(table.workspaceId, table.status)]).enableRLS();

// Team events. Times are moments in UTC; the team's time zone decides how they are typed and shown.
export const workspaceEvents = pgTable("workspaceEvents", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  createdBy: integer("createdBy").notNull(),
  slug: varchar("slug", { length: 40 }).notNull().unique(),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description"),
  coverImageUrl: text("coverImageUrl"),
  startAt: timestamp("startAt", { mode: "date" }),
  endAt: timestamp("endAt", { mode: "date" }),
  venue: varchar("venue", { length: 200 }),
  address: varchar("address", { length: 300 }),
  mapUrl: varchar("mapUrl", { length: 500 }),
  organizerName: varchar("organizerName", { length: 160 }),
  organizerContact: varchar("organizerContact", { length: 200 }),
  rsvpDeadline: timestamp("rsvpDeadline", { mode: "date" }),
  capacity: integer("capacity"),
  allowMaybe: boolean("allowMaybe").default(true).notNull(),
  design: jsonb("design").$type<{ background?: string; button?: string; font?: "modern" | "classic" | "friendly" }>(),
  status: varchar("status", { length: 16 }).default("draft").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("workspace_events_workspace_idx").on(table.workspaceId)]).enableRLS();

// One question on an event's RSVP form. standardKey marks the ready-made ones.
export const workspaceEventFields = pgTable("workspaceEventFields", {
  id: serial("id").primaryKey(),
  eventId: integer("eventId").notNull(),
  standardKey: varchar("standardKey", { length: 32 }),
  label: varchar("label", { length: 160 }).notNull(),
  fieldType: varchar("fieldType", { length: 24 }).notNull(),
  required: boolean("required").default(false).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  sortOrder: integer("sortOrder").default(0).notNull(),
  options: jsonb("options").$type<string[]>(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("workspace_event_fields_event_idx").on(table.eventId)]).enableRLS();

// One response. guests repeats the "number of guests" answer so places can be counted without reading answers.
export const workspaceEventRsvps = pgTable("workspaceEventRsvps", {
  id: serial("id").primaryKey(),
  eventId: integer("eventId").notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  guests: integer("guests").default(0).notNull(),
  submittedAt: timestamp("submittedAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  checkedInAt: timestamp("checkedInAt", { mode: "date" }),
  checkedInBy: integer("checkedInBy"),
}, (table) => [index("workspace_event_rsvps_event_idx").on(table.eventId, table.id)]).enableRLS();

export const workspaceEventRsvpAnswers = pgTable("workspaceEventRsvpAnswers", {
  id: serial("id").primaryKey(),
  rsvpId: integer("rsvpId").notNull(),
  fieldId: integer("fieldId").notNull(),
  value: jsonb("value").$type<string | number | boolean | string[]>(),
}, (table) => [index("workspace_event_rsvp_answers_rsvp_idx").on(table.rsvpId)]).enableRLS();

// Company files and links admins approve. Cards point at a row, so replacing the file updates every card.
export const workspaceAssets = pgTable("workspaceAssets", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  kind: varchar("kind", { length: 8 }).notNull(),
  url: text("url").notNull(),
  fileName: varchar("fileName", { length: 180 }),
  contentType: varchar("contentType", { length: 120 }),
  sizeBytes: integer("sizeBytes"),
  archivedAt: timestamp("archivedAt", { mode: "date" }),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("workspace_assets_workspace_idx").on(table.workspaceId)]).enableRLS();

export const workspaceCardAssets = pgTable("workspaceCardAssets", {
  id: serial("id").primaryKey(),
  cardId: integer("cardId").notNull(),
  assetId: integer("assetId").notNull(),
  addedBy: integer("addedBy").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workspace_card_assets_card_asset_idx").on(table.cardId, table.assetId),
  index("workspace_card_assets_asset_idx").on(table.assetId),
]).enableRLS();

// A temporary announcement on company cards. Shown between startAt and endAt, on the cards it is aimed at.
export const workspaceBanners = pgTable("workspaceBanners", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  description: varchar("description", { length: 400 }),
  ctaLabel: varchar("ctaLabel", { length: 40 }),
  ctaUrl: varchar("ctaUrl", { length: 500 }),
  startAt: timestamp("startAt", { mode: "date" }).notNull(),
  endAt: timestamp("endAt", { mode: "date" }).notNull(),
  target: varchar("target", { length: 16 }).default("all").notNull(),
  departmentId: integer("departmentId"),
  cardIds: jsonb("cardIds").$type<number[]>(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("workspace_banners_workspace_idx").on(table.workspaceId, table.endAt)]).enableRLS();

export const workspaceAuditLog = pgTable("workspaceAuditLog", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  actorUserId: integer("actorUserId"),
  action: varchar("action", { length: 48 }).notNull(),
  entityType: varchar("entityType", { length: 32 }).notNull(),
  entityId: varchar("entityId", { length: 64 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("workspace_audit_workspace_created_idx").on(table.workspaceId, table.createdAt)]).enableRLS();

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type Reference = typeof references.$inferSelect;
export type InsertReference = typeof references.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
