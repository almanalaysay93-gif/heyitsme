import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  analyticsEvents,
  cards,
  contacts,
  InsertCard,
  InsertReference,
  InsertContact,
  InsertUser,
  users,
  references,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const isLocal =
        process.env.DATABASE_URL.includes("localhost") ||
        process.env.DATABASE_URL.includes("127.0.0.1");
      const client = postgres(process.env.DATABASE_URL, {
        max: 5,
        prepare: false,
        ssl: isLocal ? false : "require",
        idle_timeout: 20,
        connect_timeout: 15,
      });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect PostgreSQL:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] === undefined) continue;
    values[field] = user[field] ?? null;
    updateSet[field] = user[field] ?? null;
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getCardsByOwner(ownerUserId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cards).where(eq(cards.ownerUserId, ownerUserId)).orderBy(desc(cards.updatedAt)).limit(50);
}

export async function getCardById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
  return result[0];
}

export async function getCardByIdForOwner(id: number, ownerUserId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(cards)
    .where(and(eq(cards.id, id), eq(cards.ownerUserId, ownerUserId)))
    .limit(1);
  return result[0];
}

export async function getPublicCardBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(cards)
    .where(and(eq(cards.slug, slug), eq(cards.published, true), isNull(cards.deletedAt)))
    .limit(1);
  return result[0];
}

export async function createCard(input: InsertCard) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(cards).values(input);
  const created = await db.select().from(cards).where(eq(cards.slug, input.slug)).limit(1);
  return created[0];
}

export async function updateCard(id: number, ownerUserId: number, input: Partial<InsertCard>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(cards).set(input).where(and(eq(cards.id, id), eq(cards.ownerUserId, ownerUserId)));
  return getCardByIdForOwner(id, ownerUserId);
}

export async function deleteCard(id: number, ownerUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const card = await getCardByIdForOwner(id, ownerUserId);
  if (!card) return false;
  await db.update(cards).set({ deletedAt: new Date(), published: false }).where(and(eq(cards.id, id), eq(cards.ownerUserId, ownerUserId)));
  return true;
}

export async function restoreCard(id: number, ownerUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(cards).set({ deletedAt: null }).where(and(eq(cards.id, id), eq(cards.ownerUserId, ownerUserId)));
  return getCardByIdForOwner(id, ownerUserId);
}

export async function getReferencesByCard(cardId: number, approvedOnly = false) {
  const db = await getDb();
  if (!db) return [];
  const filters = approvedOnly
    ? and(eq(references.cardId, cardId), eq(references.approved, true))
    : eq(references.cardId, cardId);
  return db.select().from(references).where(filters).orderBy(desc(references.createdAt)).limit(50);
}

export async function getReferencesByOwner(cardId: number, ownerUserId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(references)
    .where(and(eq(references.cardId, cardId), eq(references.ownerUserId, ownerUserId)))
    .orderBy(desc(references.createdAt)).limit(50);
}

export async function createReference(input: InsertReference) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(references).values(input);
  const result = await db.select().from(references)
    .where(and(eq(references.cardId, input.cardId), eq(references.clientName, input.clientName)))
    .orderBy(desc(references.createdAt)).limit(1);
  return result[0];
}

export async function getContactsByOwner(ownerUserId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contacts).where(eq(contacts.ownerUserId, ownerUserId)).orderBy(desc(contacts.createdAt)).limit(200);
}

export async function createContact(input: InsertContact) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(contacts).values(input);
  const result = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.ownerUserId, input.ownerUserId), eq(contacts.name, input.name)))
    .orderBy(desc(contacts.createdAt))
    .limit(1);
  return result[0];
}

export async function recordAnalytics(cardId: number, type: "view" | "save", meta?: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(analyticsEvents).values({ cardId, type, meta });
}
