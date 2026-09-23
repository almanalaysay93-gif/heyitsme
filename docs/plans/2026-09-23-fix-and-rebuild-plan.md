# heyitsme — Fix & Rebuild Plan

**Date:** 2026-09-23
**Live URL:** https://heyitsme-ecru.vercel.app (Vercel project `alai2/heyitsme`)
**Status at time of writing:** Frontend loads; **backend is 100% down** — every `/api/*` and `/storage/*` request returns `FUNCTION_INVOCATION_FAILED`.

This document lists every problem found in the scan, why it happens, how to fix it, and how to verify the fix. Work the phases **in order** — later phases cannot be tested until Phase 1 and 2 are done.

---

## Ground rules (read before touching code)

1. **One phase at a time.** Deploy to a **preview** (`vercel` without `--prod`) after each phase and verify before moving on. Only promote with `vercel --prod` after the preview passes.
2. **"Deployed" is not "working".** A 200 on `/` only proves static HTML is served. Always hit an API route (e.g. `/api/trpc/auth.me`) and check `vercel logs <deployment-url>` before calling anything done.
3. **Run `pnpm check` (tsc --noEmit) before every deploy.** The build does not fail on type errors (esbuild transpiles without typechecking), so type errors reach production silently.
4. **Never fake success.** No `toast.success` unless the server confirmed the write. If an action is unavailable (preview mode, unsaved card), say so and disable the button.
5. **Keep changes scoped.** Each fix below names the file and line. Don't refactor `Home.tsx` into many files as part of these fixes — that's a separate task (see Phase 6).
6. **Don't commit secrets.** `.env.local` (created by `vercel link`) is gitignored; keep it that way.

---

## Phase 1 — Get the backend running (CRITICAL)

### Problem 1: Serverless function can't find its own modules

**Symptom** (from `vercel logs`):
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server/_core/app' imported from /var/task/api/index.js
```

**Cause:** `package.json` has `"type": "module"`. Vercel compiles `api/index.ts` per-file into ESM. Native Node ESM requires full file extensions (`./app.js`) and does not understand the `@shared/*` tsconfig path alias. The server code uses extensionless imports and `@shared/...` everywhere, so nothing resolves at runtime.

**Fix: pre-bundle the server into one file with esbuild during the build**, so the function has zero internal imports to resolve.

1. Create `server/_core/vercel-entry.ts`:
   ```ts
   import { createApp } from "./app";

   export default createApp();
   ```

2. Replace `api/index.ts` with a **plain JS** file `api/index.js` (delete the `.ts`):
   ```js
   export { default } from "../dist/server/app.mjs";
   ```

3. Update `vercel.json`:
   ```json
   {
     "buildCommand": "vite build && esbuild server/_core/vercel-entry.ts --bundle --platform=node --target=node20 --format=esm --outfile=dist/server/app.mjs --alias:@shared=./shared --banner:js=\"import { createRequire } from 'module'; const require = createRequire(import.meta.url);\"",
     "outputDirectory": "dist/public",
     "functions": {
       "api/index.js": { "includeFiles": "dist/server/**" }
     },
     "rewrites": [
       { "source": "/api/(.*)", "destination": "/api" },
       { "source": "/storage/(.*)", "destination": "/api" },
       { "source": "/(.*)", "destination": "/index.html" }
     ]
   }
   ```
   - Everything is bundled (no `--packages=external`), so no `node_modules` tracing is needed at runtime.
   - The `createRequire` banner fixes CommonJS dependencies that call `require()` inside an ESM bundle.
   - If a dependency refuses to bundle (native binaries), mark only that one `--external:<pkg>`.

4. `server/_core/app.ts` imports `dotenv/config`. Harmless on Vercel (no `.env` file), keep it for local dev.

**Verify:**
```bash
pnpm check
vercel --token $VERCEL_TOKEN                      # preview deploy
node -e "fetch('<preview-url>/api/trpc/auth.me?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D').then(r=>r.text()).then(console.log)"
vercel logs <preview-url> --token $VERCEL_TOKEN
```
Expected: `auth.me` returns `[{"result":{"data":{"json":null}}}]` (null = not logged in), **not** a 500.

**Fallback if Vercel builds `api/` before `buildCommand` runs** (bundle missing at trace time): switch to the Build Output API — have the build script write `.vercel/output/functions/api.func/index.mjs` + `.vc-config.json` (`{"runtime":"nodejs20.x","handler":"index.mjs","launcherType":"Nodejs"}`) and `.vercel/output/static/` + `.vercel/output/config.json` with the same rewrites as `routes`. Then deploy with `vercel deploy --prebuilt`.

---

### Problem 2: Stale MySQL migration files + confirm Vercel DB connection

**Supabase project:** `gomtjpaotoqnwskjqpgk` (region ap-northeast-1).
SQL editor: https://supabase.com/dashboard/project/gomtjpaotoqnwskjqpgk/sql/new

**Status:** The schema was **already applied** to this project on 2026-09-23 (Antigravity session, commit `09bbea6`) — all 5 tables were created from `drizzle/schema.ts`. The DB itself is likely fine. What's left:

- `drizzle/0000_soft_odin.sql` … `0003_*.sql` and `drizzle/meta/` are **leftover MySQL** files (backticks, `AUTO_INCREMENT`). They don't match the live DB and will confuse `drizzle-kit migrate`.
- Vercel's `DATABASE_URL` must be the **pooler** URL. The direct host `db.gomtjpaotoqnwskjqpgk.supabase.co` is IPv6-only, and Vercel functions can't reach it.

**Fix:**
1. **Confirm the tables exist** — paste into the Supabase SQL editor (read-only):
   ```sql
   select table_name from information_schema.tables
   where table_schema = 'public' order by table_name;
   ```
   Expect `analyticsEvents`, `cards`, `contacts`, `references`, `users`. If any are missing, run `pnpm drizzle-kit push` with the **session pooler** URL (port 5432) and review the printed diff before confirming. Never accept a diff that drops a table.
2. **Archive the MySQL files** (don't delete — keep them for reference):
   ```bash
   mkdir -p drizzle/_legacy_mysql
   git mv drizzle/000*.sql drizzle/meta drizzle/_legacy_mysql/
   ```
   Future schema changes: edit `schema.ts` → `drizzle-kit generate` (writes Postgres SQL) → `drizzle-kit migrate`.
3. **Check Vercel's `DATABASE_URL`** (Project → Settings → Environment Variables). It should look like:
   ```
   postgresql://postgres.gomtjpaotoqnwskjqpgk:<password>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
   ```
   Use port **6543** (transaction pooler) for the serverless app — `server/db.ts` already sets `prepare: false` and `ssl: "require"` for this. Use port 5432 only for `drizzle-kit`.
4. The `references` table name is a reserved word in Postgres. Drizzle quotes it; raw SQL must use `"references"`.
5. **Don't mix projects:** `sktiapp` has its own `supabase/migrations/0001_init.sql` and no Supabase URL configured. Don't run it in this project — it would put another app's tables into heyitsme's DB.

**Verify:** the SQL query above lists all 5 tables. After the Phase 1 deploy: sign in → create a card → reload → the card is still in "My cards". Then in the SQL editor, `select id, slug, published from cards order by id desc limit 5;` shows it.

---

### Problem 3: Google OAuth redirect URI must match the live domain

`GOOGLE_REDIRECT_URI` is set on Vercel but hidden. It must equal exactly:
```
https://heyitsme-ecru.vercel.app/api/oauth/callback
```
and that same URI must be listed under **Authorized redirect URIs** in Google Cloud Console → Credentials → OAuth client. For preview deploys either add the preview URL too, or leave `GOOGLE_REDIRECT_URI` unset for the Preview environment (the code falls back to `${req.protocol}://${host}/api/oauth/callback`).

Also check `server/_core/oauth.ts`: behind Vercel's proxy `req.protocol` is `http` unless Express trusts the proxy. Add in `server/_core/app.ts`:
```ts
app.set("trust proxy", 1);
```

**Verify:** click "Continue with Google" → Google consent → land back on `/` signed in (sidebar shows your name, "All access · free").

---

## Phase 2 — Public card page (`/c/:slug`) — the landing page people actually see

All in `client/src/pages/Home.tsx` → `PublicCardPage` unless noted.

### 2.1 "Scan to save this card" does nothing (line ~550)
The hint promises a save action but there is no QR and no contact file.

**Fix:** add a real **Save contact** button that downloads a vCard, and show a QR of the page URL.
```ts
function buildVCard(card: CardDraft) {
  const esc = (v: string) => v.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCARD", "VERSION:3.0",
    `FN:${esc(card.displayName)}`,
    card.title && `TITLE:${esc(card.title)}`,
    card.company && `ORG:${esc(card.company)}`,
    card.email && `EMAIL;TYPE=INTERNET:${card.email}`,
    card.phone && `TEL;TYPE=CELL:${card.phone}`,
    `URL:${window.location.href}`,
    card.bio && `NOTE:${esc(card.bio)}`,
    "END:VCARD",
  ].filter(Boolean);
  return lines.join("\r\n");
}
```
Trigger with a Blob + `<a download="name.vcf">`. Replace the "Scan to save" text with the button, and render `<QRCodeSVG value={window.location.href} />` under the card on desktop.
Record the save server-side (`recordAnalytics(cardId, "save", "vcard")`) via a small public mutation if you want stats.

### 2.2 Exchange form fakes success on preview cards (line ~549)
`if (card.id > 0) await exchange...; setSent(true)` → when `id` is 0 nothing is sent but the user sees "Nice. You're in."
**Fix:** if `card.id <= 0`, hide the "Exchange details" button entirely (preview cards only exist in the owner's browser anyway).

### 2.3 Exchange form: empty name gives a raw zod error
**Fix:** add `required` to the name input (extend `Field` to accept `required`), and trim/validate before calling the mutation. Show "Please add your name" instead of the zod message.

### 2.4 Messaging links get broken by forced `https://` (line ~524, also links at ~550)
`viber://…`, `tg://…`, `whatsapp://…`, `mailto:` become `https://viber://…`.
**Fix:** one helper used everywhere:
```ts
function toHref(raw: string) {
  const v = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v; // already has a scheme
  return `https://${v}`;
}
```
Also reject `javascript:` explicitly in that helper (return `"#"`) — card content is user-supplied and rendered for strangers.

### 2.5 Share sheet shows a dead QR for unpublished / preview cards (line ~505)
**Fix:** in `ShareSheet`, if `!isAuthenticated || card.id <= 0 || !card.published`, replace the QR + link with a message and a single action ("Sign in to publish" or "Publish card"). Pass `isAuthenticated` and `onPublish` as props.

### 2.6 Not-found state
"This card moved." is shown both for a real 404 and for server errors. Once Phase 1 is done, distinguish: `cardQuery.isError` → "We couldn't load this card, try again" with a retry button; `data === undefined/null` → current "moved" message.

---

## Phase 3 — Builder & dashboard broken buttons

### 3.1 "Add channel" does nothing (lines 131, 484)
`addChannel` pushes `{ provider, url: "" }`, then `parseChannels` filters `item?.url`, so the new row disappears immediately.
**Fix:** split parsing for **editing** vs **display**:
- `parseChannels(raw, { keepEmpty: true })` in `ChannelsEditor` (keeps rows with empty URL).
- Default (drop empty) for the public page and in `saveDraft` payload.
Same pattern check for `parsePortfolio` (currently fine because portfolio items are only added with a URL).

### 3.2 "Publish & copy link" never copies (lines 323, 440)
`onPublishAndCopy={async () => { await saveDraft(); }}` — `saveAndCopyLink` exists but is unused.
**Fix:** `onPublishAndCopy={saveAndCopyLink}`. Then make sure the saved card is published: in `saveAndCopyLink`, if `!saved.published`, call `publishCard` first. Note `copyPublicLink` defaults to `activeCard`, which is stale right after save — always pass `saved` explicitly (already done in `saveAndCopyLink`).

### 3.3 Editing via direct URL creates a duplicate card (lines 262–264)
Reloading `/app/cards/12/edit` shows an empty form because the effect skips when `isBuilder`, and saving then calls `create` (id 0).
**Fix:** read the id from the route and load it:
```ts
const editMatch = path.match(/^\/app\/cards\/(\d+)\/edit/);
const editId = editMatch ? Number(editMatch[1]) : 0;
useEffect(() => {
  if (!editId) return;
  const found = cards.find((c) => c.id === editId);
  if (found && draft.id !== editId) setDraft(found);
}, [editId, cards]);
```
While `cardsQuery.isLoading`, show a skeleton instead of the empty form. If the id isn't found after loading, redirect to `/app/cards` with a toast.

### 3.4 References: not loaded, and fake success on unsaved cards (lines 440, 489)
- Load existing ones with `trpc.references.list.useQuery({ cardId }, { enabled: cardId > 0 })` and render them (plus a delete action — needs a new `references.delete` protected procedure).
- If `draft.id <= 0`, disable "Add reference" with the hint "Save the card first".
- Only toast success after the mutation resolves.

### 3.5 "Use email instead" goes to Google (line 435, `client/src/const.ts:23`)
There is no email login. **Remove the button** (or build email magic-link auth later via Supabase — out of scope here). `startGoogleLogin` is an alias of `startLogin`; keep one.

### 3.6 Buttons with no handler
| Element | Line | Fix |
|---|---|---|
| Contact row "⋯" | ~501 | Menu with "Copy email", "Delete contact" (needs `contacts.delete` procedure) — or remove the button |
| Top-bar avatar | ~438 | Open a small menu: name, "Sign out" |
| Sidebar profile "⋯" | ~426 | Same menu as avatar, or remove the icon |

### 3.7 Placeholder nav items (line 434)
"Share moments" and "Profile settings" only toast "coming next". Either hide them or render them disabled with a "Soon" badge. Don't ship clickable buttons that do nothing.

### 3.8 Delete confirm contradicts Undo (line 341)
Delete is a soft delete with an Undo banner. Change text to: `Delete "<name>"? You can undo this for a few seconds.`

### 3.9 Publish semantics (`server/routers.ts:61`)
`cards.create` hard-codes `published: true`, but the UI treats publishing as a separate step and the `emptyCard` default is `published: false`. Decide one:
- **Recommended:** create as `published: false`; "Save card" saves privately, "Publish & copy link" publishes. Matches the UI.
Update the router and make sure 3.2 publishes explicitly.

---

## Phase 4 — Preview mode & data honesty

1. **Fake contacts & fake name.** `localContacts` seeds "Mina Park" / "Jordan Lee" and the sidebar says "Alex Morgan" for signed-out users. Replace with an empty state and "Guest" — or label them clearly as "Example". Same for the hard-coded avatar stack `MP / JL / +` in `OverviewView` (derive from real contacts).
2. **Preview uploads use `blob:` URLs** (`addMediaFile`, line ~408) which die on reload but get saved to localStorage. In preview mode, disable upload with "Sign in to upload files", or store small images as data URLs with a size cap.
3. **Preview cards can't be shared.** Make this explicit in the UI wherever share/copy/QR appears (see 2.5).

---

## Phase 5 — Cleanup & hardening

1. **Analytics script** in `client/index.html` loads a literal `%VITE_ANALYTICS_ENDPOINT%/umami` (404 on every page view). Remove the tag, or inject it only when `VITE_ANALYTICS_ENDPOINT` is set (via a small Vite `transformIndexHtml` plugin).
2. **TypeScript errors during build** (`oauth.ts`, `storageProxy.ts`, `cookies.ts`, `sdk.ts`, `storage.ts`): Express `Request`/`Response` lose their members — typical of duplicate/mismatched `@types/express` / `@types/express-serve-static-core` under pnpm. Run `pnpm why @types/express-serve-static-core`, pin a single version via `pnpm.overrides` in `package.json`, reinstall, `pnpm check` must be clean. `storage.ts:85` (`S3Client.send` missing) is the same class of issue with `@aws-sdk/*` versions — align all `@aws-sdk/*` packages to the same version.
3. **Make type errors fail the build**: prefix `buildCommand` with `tsc --noEmit &&` once `pnpm check` is clean.
4. **Upload limit**: `media.upload` accepts 20 MB base64 through a serverless function; Vercel's request body limit is ~4.5 MB. Switch uploads to the already-written `getPresignedPutUrl` (browser PUTs straight to S3), then save `/storage/<key>` in the portfolio.
5. **Storage proxy** serves any key to anyone (`/storage/*`). Acceptable for public portfolio files, but keep private data out of that bucket prefix.
6. **Exchange endpoint abuse**: `publicCard.exchange` is unauthenticated with no rate limit. Add a simple per-IP limit (e.g. Upstash Ratelimit or a DB-backed counter) and a honeypot field.
7. **`createContact` / `createReference`** re-select the row by name after insert — returns the wrong row if names repeat. Use `.returning()` (Postgres supports it): `const [row] = await db.insert(contacts).values(input).returning();`. Same for `createCard`.
8. **Chunk size**: main JS bundle is 620 KB. Lazy-load `PublicCardPage` separately so the public page (the one strangers open on phones) stays small: `const PublicCardPage = lazy(() => import("./pages/PublicCard"))`.

---

## Phase 6 — Rebuild (optional, after everything above works)

`Home.tsx` is 551 lines holding the entire app. Once bugs are fixed and verified, split it:
```
client/src/pages/
  Dashboard.tsx        (layout, sidebar, routing between views)
  Overview.tsx
  Cards.tsx
  Builder/ index.tsx, PortfolioEditor.tsx, ChannelsEditor.tsx, ReferencesEditor.tsx
  Contacts.tsx
  PublicCard.tsx       (lazy-loaded)
client/src/lib/card.ts (parse*, toDraft, toHref, buildVCard, theme options)
```
Use wouter's `useParams` / route components instead of parsing `window.location.pathname`. Do this as a pure move-and-extract refactor with no behavior change, verified by the checklist below.

---

## Verification checklist (run on the preview URL before each `--prod`)

- [ ] `pnpm check` clean
- [ ] `/api/trpc/auth.me` returns JSON, not 500; `vercel logs` shows no errors
- [ ] Sign in with Google → back on `/`, signed in
- [ ] Create card → reload → card still there (DB write works)
- [ ] Edit card via direct URL `/app/cards/<id>/edit` after reload → form is filled; save updates, no duplicate
- [ ] Add channel → row appears → fill URL → save → shows on public page
- [ ] Viber/Telegram channel opens the app scheme, not `https://viber://`
- [ ] Upload image → shows in builder and on public page
- [ ] Add reference → reload builder → reference still listed → shows on public page
- [ ] "Publish & copy link" → clipboard holds `/c/<slug>` → opening it in a private window shows the card
- [ ] Unpublish → private window shows "This card moved"
- [ ] Public page: "Save contact" downloads a working `.vcf` (import on a phone)
- [ ] Public page: exchange form with empty name is blocked; valid submit → contact appears in dashboard Contacts
- [ ] Share sheet on an unpublished card shows "Publish first", no dead QR
- [ ] Delete → Undo → card restored
- [ ] Signed-out view shows no fake people
- [ ] No 404 for `%VITE_ANALYTICS_ENDPOINT%` in browser devtools network tab
- [ ] Mobile width (~400px): public page and builder usable

---

## Issue index

| # | Severity | Area | Phase |
|---|---|---|---|
| Backend `ERR_MODULE_NOT_FOUND` | Critical | Deploy | 1 |
| Stale MySQL migration files / pooler URL check | High | DB | 1 |
| OAuth redirect URI / trust proxy | High | Auth | 1 |
| No save-contact / QR on public page | High | Public page | 2.1 |
| Exchange fake success / empty name | Medium | Public page | 2.2–2.3 |
| `https://` forced on app schemes | Medium | Public page | 2.4 |
| Dead QR in share sheet | Medium | Share | 2.5 |
| Add channel broken | High | Builder | 3.1 |
| Publish & copy link doesn't copy | High | Builder | 3.2 |
| Edit via URL duplicates card | High | Builder | 3.3 |
| References not loaded / fake success | Medium | Builder | 3.4 |
| "Use email instead" misleading | Low | Auth UI | 3.5 |
| Dead buttons (⋯, avatar) | Low | Dashboard | 3.6 |
| Placeholder nav items | Low | Dashboard | 3.7 |
| Delete copy vs Undo | Low | Dashboard | 3.8 |
| Auto-publish on create | Medium | API | 3.9 |
| Fake preview data, blob uploads | Medium | Preview mode | 4 |
| Analytics 404, TS errors, upload limit, rate limit, `.returning()`, bundle size | Low–Medium | Hardening | 5 |
