# Database operations (Supabase Postgres)

## How schema changes reach production
- Deploys run **no migration step**. On first DB use, `ensureSchema` in `server/db.ts` adds every column
  after `0000` and the lookup indexes (all `IF NOT EXISTS`, safe to rerun).
- `drizzle/*.sql` mirror those changes for fresh/manual setups. `drizzle/meta/_journal.json` stops at `0004`;
  `0005`–`0008` are plain idempotent SQL — run them by hand (SQL Editor) rather than via `drizzle-kit migrate`.
- New column? Add it to `drizzle/schema.ts`, `ensureSchema` (and its `existing.length` count), and a new `drizzle/000N_*.sql`.

## Row Level Security (drizzle/0003_enable_rls.sql) — manual, owner role
Why manual: the app's DB role does not own the tables, so it cannot run `ENABLE ROW LEVEL SECURITY`.
RLS with **no policies** is intentional: the server connects as a role RLS doesn't restrict; RLS only shuts
Supabase's Data API (`anon`, `authenticated` keys) out of every table.

Apply (after first deploy, and after any deploy that adds a table):
1. Supabase dashboard → SQL Editor (runs as `postgres`).
2. Paste and run `drizzle/0003_enable_rls.sql`. Add a line for any new table.
3. Verify — every row must show `true`:
   ```sql
   select relname, relrowsecurity from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r'
   order by relname;
   ```
4. Verify from outside: with `SUPABASE_URL` + `SUPABASE_ANON_KEY` in `.env`, run
   `pnpm vitest run server/rls.test.ts` — anon reads must return `[]`. (Skipped when those vars are absent.)

Never add a permissive policy for `anon`: cards are served to the public only through `/c/:slug`, which checks
`published` and `deletedAt` on the server.

## Backups
- Supabase daily backups (plan dependent). Before risky manual SQL, take an on-demand backup or `pg_dump`.
- Users can self-export card content (account menu → *Download my card data*) and contacts (CSV).
