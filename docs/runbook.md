# heyitsme operations runbook

Free product, no billing. Stack: React 19 + Vite 7 client, Express + tRPC 11 server as one Vercel function
(`api/index.js` → `dist/server/app.mjs`), Supabase Postgres via Drizzle, uploads in Supabase Storage or S3.

## 1. Environment variables (Vercel → Project → Settings → Environment Variables)

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Supabase Postgres (pooler URL). Without it public cards 404 and `/api/health` = 503. |
| `JWT_SECRET` | yes | Session signing. Long random string. Rotating it signs everyone out. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes | Google OAuth web client. |
| `GOOGLE_REDIRECT_URI` | prod | `https://heyitsme.fyi/api/oauth/callback`; must be listed in the Google console. |
| `SITE_URL` | build | `https://heyitsme.fyi` (no trailing slash). Canonicals, sitemap, OG URLs. Previews get `noindex`. |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | uploads | Supabase Storage (bucket `SUPABASE_STORAGE_BUCKET`, default `uploads`, auto-created). Vercel integration names also work. |
| `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | alt | Set `S3_BUCKET` to use S3 instead of Supabase Storage. |
| `SUPABASE_ANON_KEY` | tests | Only for `server/rls.test.ts`. Server never uses it. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` (or `KV_REST_API_URL` / `_TOKEN`) | recommended | Shared rate limits across function instances. Without them each instance counts alone. |
| `RESEND_API_KEY` | optional | New-contact emails to card owners. Missing → mail skipped + logged. |
| `MAIL_FROM` | optional | Must be on the Resend-verified domain `send.heyitsme.fyi`. |
| `VITE_SUPPORT_EMAIL` | optional | Shown on legal/FAQ pages and account menu (build time). |
| `OWNER_OPEN_ID` | optional | Google openId granted the admin role. |

Wallet passes: not shipped; required credentials listed in `docs/wallet.md`.

## 2. Deploy
1. `pnpm check && pnpm test && pnpm build` locally (or CI). All green before merge.
2. Push to `main` → Vercel builds (`pnpm run build`) and deploys.
3. Schema: no migration step. `ensureSchema` adds columns/indexes on first request. RLS is manual — see `docs/database.md`.
4. Post-deploy smoke (read-only, uses the demo card only):
   `node scripts/smoke.mjs https://heyitsme.fyi` → must print `all checks passed`.
5. Old host `heyitsme-ecru.vercel.app` must 301 to `https://heyitsme.fyi` (vercel.json redirect).

## 3. Rollback
- Vercel → Deployments → previous good deploy → *Promote to Production*. Instant, no rebuild.
- Schema changes are additive only (`ADD COLUMN IF NOT EXISTS`), so old code runs on the newer schema. Never drop columns during a rollback.
- Never delete user data to "undo" a release.

## 4. Monitoring
- Uptime: poll `GET /api/health` → 200 `{ok:true, db:"up"}`; 503 = DB down or unset.
- Logs (Vercel → Logs): JSON lines. Watch `level:error` with msg:
  - `unhandled request error` — server 5xx.
  - `card page render failed` — public card 503s (usually DB).
  - `client error` — browser crashes (ErrorBoundary / window). Emails, phone numbers, tokens and query strings are redacted server-side before logging.
  - `[Uploads] could not remove unused files` — storage sweep failure (non-fatal).
  - `[Mail] RESEND_API_KEY is not set` — notifications off.
- 429s are expected under abuse. Limits: card read 120/min/IP, exchange 10/10min/IP, upload 30/10min/user,
  vCard 60/min/IP, client-error 20/10min/IP, OAuth callback 20/10min/IP, analytics track 60/min/IP.

## 5. Routine maintenance
- **Uploads**: files no card links to are deleted when a card changes; a per-owner sweep (max hourly) removes never-saved uploads older than 24h. Owners at the 500-card cap are skipped (safety).
- **RLS**: after any deploy that adds a table, run its `ENABLE ROW LEVEL SECURITY` in the Supabase SQL Editor.
- **Secrets**: rotate `JWT_SECRET` only when compromised (logs everyone out). Rotate Google/Resend/Supabase keys in their consoles, then update Vercel and redeploy.
- **Backups**: Supabase backups; users self-export via account menu (*Download my card data*, JSON) and Contacts (*Export CSV*).

## 6. Security headers (T26)
Set in both `vercel.json` (static files) and Express (`server/_core/app.ts`); `server/_core/securityHeaders.test.ts`
fails if the two CSPs drift. CSP, HSTS (2y, no subdomains), nosniff, `X-Frame-Options: DENY`, strict referrer,
camera/mic/geo disabled. `connect-src` allows `api.microlink.io` for website tiles — add hosts there in both places.

## 7. Performance baseline (T29, build of 2026-09-26)
| Chunk | min | gzip |
|---|---|---|
| main `index-*.js` (React, tRPC, router, Radix) | 373 kB | 117 kB |
| `CardVisual-*.js` (framer-motion) | 176 kB | 56 kB |
| `Home-*.js` (dashboard) | 87 kB | 26 kB |
| `PublicCard-*.js` | 45 kB | 16 kB |
| `Landing-*.js` | 28 kB | 9 kB |
| CSS | 193 kB | 36 kB |

- Routes are lazy chunks; `ShareDemo` and the marquee load on viewport; marketing pages are pre-rendered HTML.
- Fonts self-hosted (@fontsource), 6 woff2 files, all `font-display: swap`.
- Vercel serves static assets with gzip/brotli and `immutable` 1-year cache on `/assets/*`.
- Next wins if LCP/INP regress: split vendor chunk out of main for better cache reuse; trim unused CSS (193 kB is mostly Tailwind + one stylesheet).
- Real Web Vitals: run Lighthouse / PageSpeed Insights on `/` and `/c/demo` (mobile) after each release and log the scores here.

## 8. Release acceptance checklist (T30, run on staging/prod with a test Google account)
Automated coverage: `pnpm test` (validation, idempotency, slugs, export, demo, vCard, OAuth, sessions, rate limits,
upload sweep, contrast, headers) + `scripts/smoke.mjs`. Manual, needs real OAuth + DB:
- [ ] Guest: `/app/cards/new`, fill card, reload → draft persists ("Saved on this browser").
- [ ] Guest publish → *Sign in to publish* → Google → returns to the editor with the draft imported once (no duplicate card).
- [ ] Publish → open `/c/<slug>` in a private window; QR opens same URL; `.vcf` downloads.
- [ ] Rename card → old `/c/<slug>` still works (slug unchanged); name field hint says link stays the same.
- [ ] Exchange details from the private window → contact appears in Contacts as *New*; owner email arrives if Resend set.
- [ ] Account menu → *Download my card data* → JSON has `format`, `version: 1`, `mediaScope: "urls-only"`, all cards, links, portfolio, references.
- [ ] Unpublish → `/c/<slug>` returns 404 immediately (no cached copy).
- [ ] Delete card → contacts stay; uploads only it used disappear.
- [ ] Mobile (≤760px): menu sheet, Edit/Preview toggle, share sheet.
- [ ] OS "increase contrast" on → card text solid white.
