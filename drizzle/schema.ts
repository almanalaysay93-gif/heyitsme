import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
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
});

export const cards = pgTable("cards", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("ownerUserId").notNull(),
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
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  published: boolean("published").default(false).notNull(),
  deletedAt: timestamp("deletedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
});

export const contacts = pgTable("contacts", {
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
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export const analyticsEvents = pgTable("analyticsEvents", {
  id: serial("id").primaryKey(),
  cardId: integer("cardId").notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  meta: text("meta"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

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
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type InsertCard = typeof cards.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type Reference = typeof references.$inferSelect;
export type InsertReference = typeof references.$inferInsert;
