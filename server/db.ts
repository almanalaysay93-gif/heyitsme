import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
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
import { DEMO_CARD, DEMO_CARD_ID, DEMO_REFERENCES, DEMO_SLUG } from "@shared/demoCard";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _schemaReady: Promise<void> | null = null;

export function setTestDb(db: any) {
  _db = db;
  _schemaReady = Promise.resolve();
}

// Deploys have no migration step, so bring an older database up to drizzle/0008 on first use:
// columns added after drizzle/0000, then the lookup indexes. Every statement is idempotent.
// Row level security (drizzle/0003) is NOT applied here: the app's DB role isn't the tables' owner, so it has no
// privilege to run ALTER TABLE ... ENABLE ROW LEVEL SECURITY. Apply drizzle/0003_enable_rls.sql by hand as an
// owner/superuser role (e.g. Supabase's SQL Editor, which runs as `postgres`) after each deploy that adds a table.
const SCHEMA_INDEXES = [
  ["cards_owner_updated_idx", 'create index if not exists "cards_owner_updated_idx" on "cards" ("ownerUserId", "updatedAt")'],
  ["cards_owner_creation_key_idx", 'create unique index if not exists "cards_owner_creation_key_idx" on "cards" ("ownerUserId", "creationKey") where "creationKey" is not null'],
  ["contacts_owner_id_idx", 'create index if not exists "contacts_owner_id_idx" on "contacts" ("ownerUserId", "id")'],
  ["analytics_card_created_idx", 'create index if not exists "analytics_card_created_idx" on "analyticsEvents" ("cardId", "createdAt")'],
  ["references_card_created_idx", 'create index if not exists "references_card_created_idx" on "references" ("cardId", "createdAt")'],
] as const;

async function ensureSchema(client: postgres.Sql) {
  const existing = await client<{ table_name: string; column_name: string }[]>`
    select table_name, column_name from information_schema.columns
    where table_schema = current_schema()
      and ((table_name = 'cards' and column_name in ('avatarUrl', 'coverUrl', 'backgroundUrl', 'contactHeading', 'galleryHeading', 'portfolioHeading', 'creationKey', 'page'))
        or (table_name = 'contacts' and column_name in ('followedUp', 'seenAt', 'followUpOn')))`;
  if (existing.length < 11) {
    await client`alter table "cards" add column if not exists "creationKey" varchar(64)`;
    await client`alter table "cards" add column if not exists "avatarUrl" text`;
    await client`alter table "cards" add column if not exists "coverUrl" text`;
    await client`alter table "cards" add column if not exists "backgroundUrl" text`;
    await client`alter table "cards" add column if not exists "contactHeading" varchar(160)`;
    await client`alter table "cards" add column if not exists "galleryHeading" varchar(160)`;
    await client`alter table "cards" add column if not exists "portfolioHeading" varchar(160)`;
    await client`alter table "cards" add column if not exists "page" text`;
    await client`alter table "contacts" add column if not exists "followedUp" boolean default false not null`;
    await client`alter table "contacts" add column if not exists "seenAt" timestamp`;
    await client`alter table "contacts" add column if not exists "followUpOn" timestamp`;
  }

  const names = SCHEMA_INDEXES.map(([name]) => name);
  const indexes = await client<{ indexname: string }[]>`
    select indexname from pg_indexes where schemaname = current_schema() and indexname in ${client(names)}`;
  const present = new Set(indexes.map((row) => row.indexname));
  for (const [name, statement] of SCHEMA_INDEXES) {
    if (!present.has(name)) await client.unsafe(statement);
  }
}

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
      _schemaReady = ensureSchema(client).catch((error) => {
        console.warn("[Database] Could not bring schema up to date:", error);
      });
    } catch (error) {
      console.warn("[Database] Failed to connect PostgreSQL:", error);
      _db = null;
    }
  }
  if (_schemaReady) await _schemaReady;
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

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

/** Most cards getCardsByOwner returns. An owner at the cap may have more than the list shows. */
export const OWNER_CARD_LIMIT = 500;

export async function getCardsByOwner(ownerUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(cards).where(eq(cards.ownerUserId, ownerUserId)).orderBy(desc(cards.updatedAt)).limit(OWNER_CARD_LIMIT);
}

export async function getCardById(id: number) {
  if (id === DEMO_CARD_ID) return DEMO_CARD as any;
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
  if (slug.toLowerCase() === DEMO_SLUG) return DEMO_CARD as any;
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
  if (input.creationKey) {
    const existing = await db
      .select()
      .from(cards)
      .where(and(eq(cards.ownerUserId, input.ownerUserId), eq(cards.creationKey, input.creationKey)))
      .limit(1);
    if (existing[0]) return existing[0];
  }
  try {
    const created = await db.insert(cards).values(input).returning();
    return created[0];
  } catch (err: any) {
    if (input.creationKey) {
      const existing = await db
        .select()
        .from(cards)
        .where(and(eq(cards.ownerUserId, input.ownerUserId), eq(cards.creationKey, input.creationKey)))
        .limit(1);
      if (existing[0]) return existing[0];
    }
    throw err;
  }
}

export async function updateCard(id: number, ownerUserId: number, input: Partial<InsertCard>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(cards).set({ ...input, updatedAt: new Date() }).where(and(eq(cards.id, id), eq(cards.ownerUserId, ownerUserId)));
  return getCardByIdForOwner(id, ownerUserId);
}

/** Erases a card with its references and visit stats. Contacts it collected stay. Returns the erased card, if there was one. */
export async function deleteCard(id: number, ownerUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async (tx) => {
    const [card] = await tx.delete(cards).where(and(eq(cards.id, id), eq(cards.ownerUserId, ownerUserId))).returning();
    if (!card) return undefined;
    await tx.delete(references).where(eq(references.cardId, id));
    await tx.delete(analyticsEvents).where(eq(analyticsEvents.cardId, id));
    return card;
  });
}

export async function getReferencesByCard(cardId: number, approvedOnly = false) {
  if (cardId === DEMO_CARD_ID) return DEMO_REFERENCES as any;
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
  const result = await db.insert(references).values(input).returning();
  return result[0];
}

/** Newest first, keyset-paginated on id so pages stay stable while new contacts arrive. */
export async function getContactsByOwner(ownerUserId: number, options: { cursor?: number | null; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null };
  const where = options.cursor
    ? and(eq(contacts.ownerUserId, ownerUserId), lt(contacts.id, options.cursor))
    : eq(contacts.ownerUserId, ownerUserId);
  const rows = await db.select().from(contacts).where(where).orderBy(desc(contacts.id)).limit(limit + 1);
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
}

export async function createContact(input: InsertContact) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(contacts).values(input).returning();
  return result[0];
}

export async function deleteReference(id: number, ownerUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(references).where(and(eq(references.id, id), eq(references.ownerUserId, ownerUserId)));
  return true;
}

export async function deleteContact(id: number, ownerUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.ownerUserId, ownerUserId)));
  return true;
}

export async function updateContact(
  id: number,
  ownerUserId: number,
  input: Partial<Pick<InsertContact, "tags" | "notes" | "followedUp" | "followUpOn">>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db
    .update(contacts)
    .set(input)
    .where(and(eq(contacts.id, id), eq(contacts.ownerUserId, ownerUserId)))
    .returning();
  return result[0];
}

export async function markContactsSeen(ownerUserId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .update(contacts)
    .set({ seenAt: new Date() })
    .where(and(eq(contacts.ownerUserId, ownerUserId), isNull(contacts.seenAt)))
    .returning({ id: contacts.id });
  return result.length;
}

export type AnalyticsType = "view" | "save" | "vcard" | "link" | "share";

export async function recordAnalytics(cardId: number, type: AnalyticsType, meta?: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(analyticsEvents).values({ cardId, type, meta });
}

/** Event counts per card, type, meta, and UTC day for every card the owner has, since `since`. */
export async function getInsightsRows(ownerUserId: number, since: Date) {
  const db = await getDb();
  if (!db) return [];
  const day = sql<string>`to_char(date_trunc('day', ${analyticsEvents.createdAt}), 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      cardId: analyticsEvents.cardId,
      type: analyticsEvents.type,
      meta: analyticsEvents.meta,
      day,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEvents)
    .innerJoin(cards, eq(cards.id, analyticsEvents.cardId))
    .where(and(eq(cards.ownerUserId, ownerUserId), gte(analyticsEvents.createdAt, since)))
    .groupBy(analyticsEvents.cardId, analyticsEvents.type, analyticsEvents.meta, day);
  return rows.map((row) => ({ ...row, count: Number(row.count) }));
}
