import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

const hasSupabaseAnon = Boolean(ENV.supabaseUrl && ENV.supabaseAnonKey);
const hasDatabaseUrl = Boolean(ENV.databaseUrl);

describe("Row Level Security (RLS) enforcement", () => {
  it.runIf(hasSupabaseAnon)(
    "blocks anon client from reading cards, contacts, and users via Supabase Data API",
    async () => {
      const client = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey);

      const [cards, contacts, users, references, analytics] = await Promise.all([
        client.from("cards").select("*"),
        client.from("contacts").select("*"),
        client.from("users").select("*"),
        client.from("references").select("*"),
        client.from("analyticsEvents").select("*"),
      ]);

      // Supabase PostgREST with RLS enabled and no SELECT policies returns empty datasets (0 rows)
      expect(cards.error).toBeNull();
      expect(cards.data).toEqual([]);

      expect(contacts.error).toBeNull();
      expect(contacts.data).toEqual([]);

      expect(users.error).toBeNull();
      expect(users.data).toEqual([]);

      expect(references.error).toBeNull();
      expect(references.data).toEqual([]);

      expect(analytics.error).toBeNull();
      expect(analytics.data).toEqual([]);
    },
  );

  it.runIf(hasSupabaseAnon)("rejects anon client insert attempts with RLS policy error", async () => {
    const client = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey);

    const { data, error } = await client.from("cards").insert({
      displayName: "Unauthorized Card",
      title: "Attacker",
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    // PostgreSQL error code 42501: insufficient_privilege / row-level security policy violation
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/violates row-level security policy/i);
  });

  it.runIf(hasDatabaseUrl)(
    "rejects SELECT queries when role is set to anon or authenticated in PostgreSQL",
    async () => {
      const sql = postgres(ENV.databaseUrl);
      try {
        // 1. Table owner can read rows (proves rows actually exist in the table)
        const ownerCards = await sql`SELECT count(*) FROM "cards"`;
        expect(Number(ownerCards[0].count)).toBeGreaterThanOrEqual(1);

        // 2. Under SET LOCAL ROLE anon, RLS filters all rows
        await sql.begin(async (tx) => {
          await tx`SET LOCAL ROLE anon`;
          const anonCards = await tx`SELECT count(*) FROM "cards"`;
          const anonContacts = await tx`SELECT count(*) FROM "contacts"`;
          const anonUsers = await tx`SELECT count(*) FROM "users"`;
          expect(Number(anonCards[0].count)).toBe(0);
          expect(Number(anonContacts[0].count)).toBe(0);
          expect(Number(anonUsers[0].count)).toBe(0);
        });

        // 3. Under SET LOCAL ROLE authenticated, RLS filters all rows
        await sql.begin(async (tx) => {
          await tx`SET LOCAL ROLE authenticated`;
          const authCards = await tx`SELECT count(*) FROM "cards"`;
          const authContacts = await tx`SELECT count(*) FROM "contacts"`;
          const authUsers = await tx`SELECT count(*) FROM "users"`;
          expect(Number(authCards[0].count)).toBe(0);
          expect(Number(authContacts[0].count)).toBe(0);
          expect(Number(authUsers[0].count)).toBe(0);
        });
      } finally {
        await sql.end();
      }
    },
  );
});
