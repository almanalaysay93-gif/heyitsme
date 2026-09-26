# PROJECT_MEMORY

## 2026-09-26: Planning review & workspace setup

- Cloned repository `almanalaysay93-gif/heyitsme` to `D:\ai mem\heyitsme` at commit `380f5f0dc5f3d3479f0d615f57a1745856dc1b17` (main).
- Reference plan: `D:\download\heyitsme-antigravity-fix-and-improvement-plan.md` (31 tasks, PH0-PH5, mapped across 23 QA findings).
- Source reports: `D:\download\heyitsme-full-report.pdf`, `D:\download\heyitsme-QA-Report-2026-09-26.pdf`.
- Status: Fresh working tree ready. Next step: T00 baseline verification and execution of Phase 1 tasks (T01-T10).

## 2026-09-26: Phase 1 (P0/P1 Critical Integrity) Completed

All tasks T00 through T10 completed and verified with 100% test pass rate (155 tests passing, 3 skipped):

- **T00 (Baseline Verification)**: Clean `pnpm check`, `pnpm test`, and `pnpm build` baseline established.
- **T01 (Validate Card Input)**: Created `shared/cardValidation.ts` for display name, title, company, bio, channels, links, and portfolio validation. Wired accessible field errors, focus-on-error, and preview fallbacks.
- **T02 (Idempotency)**: Added `creationKey` with owner-scoped unique index to schema and `createCard` deduplication. Wired `createClientDraft()` and `isSavingRef` to prevent double-click duplicates.
- **T03 (Separate Loading/Error/Empty)**: Prevented premature 404 navigation while cards load or on network error; database unavailability returns error instead of false `[]`; skeleton loaders and retry states in Overview and Cards view.
- **T04 (Publication State & Immediate Revocation)**: Server returns NOT_FOUND for inaccessible cards on mutation; immediate revocation via `no-cache, no-store, must-revalidate` on mutable `/c/:slug` and `/c/:slug.vcf` routes.
- **T05 (Production Domain Consistency)**: Configured canonical production origin to `https://heyitsme.fyi`; legacy `heyitsme-ecru.vercel.app` host permanent redirect with query/path preservation in `vercel.json` and Express middleware. Excluded preview deployments from search indexing.
- **T06 (Mobile Homepage Navigation & Sign-in)**: Added accessible Radix `Sheet` mobile menu trigger on small screens (<=760px) in `Landing.tsx` with Sign in / Open my cards, section links, and legal links.
- **T07 (Guest Editing & Predictable OAuth Handoff)**: Guests can edit local drafts without forced sign-in; persistent `Saved on this browser. Sign in to publish and sync.` explanation; guest publish triggers `Sign in to publish` modal with Google OAuth and Keep editing options; returnTo path encoded in OAuth state and sanitized; post-login imports draft once and redirects to restored editor.
- **T08 (Protect Unsaved Edits & Verify Feedback)**: Baseline dirty-state tracking; `beforeunload` browser unload guard; in-app discard confirmation when dirty; visible save state indicator.
- **T09 (Overview Active Card Precedence)**: Extracted and tested `resolveActiveCard`: explicit selection -> first published card -> first non-deleted draft -> fallback. Deleting a card clears selection and falls back cleanly.
- **T10 (Clarify Contact Freshness vs Follow-Up)**: Renamed tab to `Newly received`; independent badges for `New` (this visit) and `Followed up` so contacts can show both without contradiction; verified filtering behavior with unit tests.

## 2026-09-26: Phase 2 (P1/P2 User Experience & Polish) Completed

All tasks T11 through T20 completed and verified with 100% test pass rate (166 tests passing, 3 skipped):

- **T11 (Normalize Action Labels & Publication Semantics)**: Normalized CTAs to "Create your card" and "View demo card" (`/c/demo`) across hero, nav, mobile menu, and footer. Clarified overview share vs publish options.
- **T12 (Builder Sections & Mobile Preview)**: Numbered builder sections (01 Essentials, 02 Links, 03 Portfolio, 04 Contact buttons, 05 Client references, 06 Appearance) with distinct portfolio heading helpers. Added mobile segmented control (`Edit` / `Preview`) with floating pill toggle preserving form DOM state and cursor focus.
- **T13 (Account Menu & Guest Sample Views)**: Accessible Radix dropdown menu for user identity, email, free tier status, support link, and sign-out. Removed disabled "Soon" sidebar links. Added non-persisted fixture samples with banner notice in Contacts and Insights for guest previews.
- **T14 (Contact & Sharing Interoperability)**: URI-encoded `mailto:` and `tel:` links without blank tabs, with one-click copy fallbacks. Described analytics accurately as contact saves and downloads rather than asserting OS address book saves.
- **T15 (Safe Functioning Demo Card `/c/demo`)**: Created static `DEMO_CARD` fixture in `shared/demoCard.ts` using RFC 2606 example domain and reserved slug `demo`. Supported `/c/demo.vcf`, OpenGraph SSR metadata, and simulated contact exchange without DB write or email dispatch.
- **T16 (Marketing Metadata without JS)**: Build-time Vite plugin generates static pre-rendered HTML for `/`, `/about`, `/faq`, `/pricing`, `/privacy`, and `/terms` with distinct titles, descriptions, canonical links, absolute OpenGraph/Twitter tags, and schema.org WebSite JSON-LD.
- **T17 (Privacy Claims, Limits & Feature Copy)**: Replaced "see who tapped what" with "see what gets tapped" in `index.html` and `site.webmanifest`. Replaced "No limits" with "All current features are free" in `Landing.tsx` and `VOICE.md`. Added Bento tiles for Insights and Email signatures; documented 3MB upload, 20 portfolio items, 12 tags, and 500 cards limits.
- **T18 (Factual Trust & Information Pages)**: Created `client/src/pages/Info.tsx` rendering `/about`, `/faq`, and `/pricing` with verified support email plumbing and comprehensive FAQs on compatibility, exchange, limits, privacy, and unpublishing.
- **T19 (Mobile Main-Thread Performance Optimization)**: Lazy-loaded `ShareDemo` in `Landing.tsx` with intersection observer deferral, viewport-guarded `VelocityMarquee` animations with reduced motion fast paths, and eliminated heavy offscreen bundle work from the initial critical render path.
- **T20 (Complete Regression Coverage)**: Added comprehensive unit and integration tests across demo cards, vCard Unicode and multiline escaping, marketing route SSR, split headings, and contact flows. Full test suite passing (166 passed, 3 skipped).

## 2026-09-26: Handoff to Claude (Phase 3 - Phase 5 Continuation Plan)

### Current Working Tree & State
- **Location**: `D:\ai mem\heyitsme`
- **Environment**: Node `v24.19.0`, pnpm `10.4.1`, Windows.
- **Verification Status**: `pnpm check` (0 errors), `pnpm test` (166 passed, 3 skipped), `pnpm build` (clean client + SSR HTML + `dist/server/app.mjs`).
- **Reference Documents**:
  - Primary Plan: `D:\download\heyitsme-antigravity-fix-and-improvement-plan.md`
  - Source Reports: `D:\download\heyitsme-full-report.pdf`, `D:\download\heyitsme-QA-Report-2026-09-26.pdf`
  - Local Guidance: `CLAUDE.md` and `PROJECT_MEMORY.md`

### Strict Product Rules
1. **100% Free Product**: Zero paywalls, subscriptions, or Stripe/LemonSqueezy integration.
2. **Stack Preservation**: React 19, Vite 7, tRPC 11, Drizzle ORM, PostgreSQL (Supabase), Radix UI, Tailwind CSS, Framer Motion.
3. **Verification**: Always run `pnpm check; pnpm test; pnpm build` after every task.

### Remaining Execution Scope

#### Phase 3: Advanced Features & Refinements (T21–T25)
- **T21 (Slug Quality While Preserving Shared Links)**:
  - Target files: `server/routers.ts`, `server/db.ts`, `drizzle/schema.ts`, `server/_core/seo.ts`.
  - Requirements: Generate human-readable slug prefixes from display names + random entropy. Ensure existing published cards NEVER have their slugs altered automatically.
- **T22 (Portable Card Recovery / Data Export)**:
  - Target files: `client/src/pages/Home.tsx`, `client/src/lib/cardKit.ts`, `server/routers.ts`.
  - Requirements: Add an authenticated "Download my card data" JSON export containing structured card fields, portfolio items, links, and avatar URL references.
- **T23 (Apple & Google Wallet Sharing)**:
  - Target files: `client/src/components/ShareSheet.tsx`, `server/routers.ts`.
  - Requirements: Check Apple Pass Type ID and Google Wallet Issuer ID setup. Document credential requirements or provide safe placeholder flows if credentials not present.
- **T24 (Automated Cleanup of Stale Unlinked Uploads)**:
  - Target files: `server/uploadSweep.ts`, `server/storage.ts`, `server/uploadSweep.test.ts`.
  - Requirements: Verify sweep worker flags unreferenced uploads past grace period without purging active avatar/portfolio media.
- **T25 (Accessible Color Contrast & High-Contrast Mode)**:
  - Target files: `client/src/index.css`, `client/src/components/CardVisual.tsx`.
  - Requirements: WCAG AA compliance across Midnight, Tide, Sunset themes and high-contrast toggle.

#### Phase 4: Production Hardening & Operations (T26–T30)
- **T26 (Security Headers, Rate Limiting & Storage Isolation)**: Audit CSP, HSTS, X-Content-Type-Options in `vercel.json` and Express. Confirm rate limiting on auth, exchange, uploads, and vCard routes.
- **T27 (Structured Error Logging & Client Telemetry)**: Validate `/api/client-error` telemetry endpoint and sanitize client crash reports.
- **T28 (Database Maintenance & RLS Documentation)**: Document manual Supabase execution steps for `drizzle/0003_enable_rls.sql`.
- **T29 (Performance Profiling & Web Vitals Audit)**: Verify bundle chunk splitting, compression, and font display.
- **T30 (Comprehensive E2E / Integration Verification)**: Validate full flows (Guest draft -> OAuth handoff -> Published card -> Contact exchange -> Data export).

#### Phase 5: Final Documentation & Launch Handover (T31)
- **T31 (Final Architecture & Operations Runbook)**: Compile deployment documentation, environment variables checklist, and operational runbook.



## 2026-09-26: Phases 3–5 (T21–T31) completed by Claude

Verification: `pnpm check` clean, `pnpm test` 208 passed / 3 skipped (25 files), `pnpm build` clean. Work is uncommitted on top of Antigravity's uncommitted Phase 1–2 changes.

- **T21 Slugs**: `makeCardSlug` in `shared/routes.ts` (NFKD accent folding, 48-char prefix cap, placeholder/reserved/non-Latin → `card`). Used only in `cards.create`; update input schema has no `slug`, so published links never change. Editor name field hint on saved cards. Tests: `server/slug.test.ts`.
- **T22 Export**: `cards.export` (protected, owner-scoped) → `server/cardExport.ts` `buildCardExport` (format `heyitsme.card-export` v1, `mediaScope: "urls-only"`, excludes ids/ownerUserId/creationKey/deleted cards). Account menu → "Download my card data". FAQ entry in `Info.tsx`. Tests: `server/cardExport.test.ts`. No import/restore (export-only scope stated).
- **T23 Wallet**: no credentials exist → no code/button shipped. Prerequisites + design rules in `docs/wallet.md`.
- **T24 Upload sweep**: audited `server/uploadSweep.ts` (24h grace, unknown-age kept, owner-prefix scoped, cap guard). Reference avatars not user-uploadable, so not at risk. Added cross-owner/path-escape/portfolio test.
- **T25 Contrast**: card text alphas raised (role .86, bio .84, bottomline .8 + shadow, eyebrow .9); `@media (prefers-contrast: more)` → solid white. `client/src/lib/contrast.test.ts` computes WCAG ratios per theme from `index.css` + `themeOptions`. Native `prefers-contrast` used instead of an in-app toggle. Light dashboard grays (#9c9fad etc.) not audited.
- **T26 Security**: Express now sends HSTS in prod (matches vercel.json); OAuth callback rate-limited 20/10min/IP; `server/_core/securityHeaders.test.ts` fails if vercel.json CSP drifts from Express.
- **T27 Telemetry**: `/api/client-error` redacts emails, phone runs, JWTs, long tokens, query strings (`redactClientText` in `seo.ts`); path stripped of query/hash. Tests: `server/_core/clientError.test.ts`.
- **T28 DB/RLS**: `docs/database.md` (manual RLS steps, verify SQL, rls.test usage, migration model). Added `drizzle/0007_card_creation_key.sql`. Note: `_journal.json` stops at 0004; 0005–0007 are manual idempotent SQL.
- **T29 Perf**: baseline chunk table in `docs/runbook.md` §7. Fonts self-hosted + swap; routes lazy. No code changes.
- **T30 E2E**: `scripts/smoke.mjs <baseUrl>` read-only public smoke (passes locally except expected no-DB health/404). Authenticated flow (OAuth → publish → exchange → export) NOT run — no `.env`/DB locally; manual checklist in runbook §8.
- **T31 Runbook**: `docs/runbook.md` (env table, deploy, rollback, monitoring, rate limits, maintenance). `.env.example` gained `RESEND_API_KEY`, `MAIL_FROM`, `OWNER_OPEN_ID`.

### Next steps
1. Review + commit (Phase 1–2 and 3–5 are both uncommitted).
2. Run runbook §8 checklist on staging with real OAuth/DB; run `scripts/smoke.mjs https://heyitsme.fyi` after deploy.
3. Apply RLS SQL + `0005`–`0007` in Supabase if not already.
4. Lighthouse mobile on `/` and `/c/demo`; record in runbook §7.

## 2026-09-26: Released to production
- `main` fast-forwarded to `24387ca` (commits `9f6903c` Phase 1–2, `24387ca` Phase 3–5); Vercel deployed in ~45s.
- `node scripts/smoke.mjs https://heyitsme.fyi`: all 15 checks pass (pre-release baseline failed /about, /faq, /pricing, /c/demo, /c/demo.vcf). HSTS present; legacy host 308 → heyitsme.fyi.
- Rollback target: `380f5f0` (Vercel → promote previous deployment).
- Supabase verified (2026-09-26): RLS on for all 5 public tables, no policies (by design); columns of all tables match `schema.ts`; all 7 named indexes present (incl. `cards_owner_creation_key_idx` unique). 0005–0007 effects confirmed live.
- Still open: runbook §8 signed-in checklist, Lighthouse scores, GitHub PR not opened (gh CLI not logged in).

## 2026-09-26: Supabase Agent Skills Cross-Agent Installation & DB Verification
- Installed official Supabase skills (`supabase` and `supabase-postgres-best-practices`) from `supabase/agent-skills` across all agent platforms:
  - Antigravity: `C:\Users\AlAi\.gemini\config\skills\`
  - Claude: `C:\Users\AlAi\.claude\skills\`
  - Codex: `C:\Users\AlAi\.codex\skills\`
  - Grok: `C:\Users\AlAi\.grok\skills\`
  - Hermes / Universal: `C:\Users\AlAi\.agents\skills\` and `%LOCALAPPDATA%\hermes\skills\`
- Verified DB migration behavior: `server/db.ts` (`ensureSchema`) auto-applies 0005–0007 columns/indexes on first connection.
- `drizzle/0003_enable_rls.sql` must be run manually as `postgres` in Supabase SQL Editor. Consolidated SQL query prepared to verify RLS and migrations 0005–0007.


## 2026-09-26: Landing-page templates for /c/:slug (buildme v4 run)
- Owner picks Professional / Business / Services template, reorders/hides sections, sets accent, adds headline (Services), CTA, highlights, services + prices, hours + address. Stored as JSON in new `cards.page` column (`shared/pageConfig.ts` contract; `drizzle/0008_card_page.sql`, also added at runtime by ensureSchema). Existing cards default to Professional.
- Public render: `client/src/components/CardLanding.tsx` + `cardLanding.css` (editorial: Instrument Serif display, DM Sans body, container queries so the builder preview shows the phone layout). Builder editor: `PageDesigner.tsx` (first builder section) + live `LandingPreview`.
- Demo shows each template: `/c/demo?template=professional|business|services`.
- Gates (anti-slop, bug hunt, perf/a11y) run by review subagents; all blocker/P1/major findings fixed. Dead `.pl-*` CSS pruned (-16 KB).
- Follow-up: throttled mobile LCP ~5.5s locally (SPA + data fetch); inline card JSON into SSR HTML next.

## 2026-09-26: Glass redesign of card pages + photo frames (buildme 5-agent run)
- User: page "looks flat", wants Apple-grade glass + animation; arch photo frame "looks like a tombstone".
- Shipped: aurora backdrop + frosted panels (`cardLanding.css`, from Agent 2 spec adjusted by Agents 1/3/4), motion primitives `client/src/components/cardMotion.tsx` (Agent 5), owner "Photo shape" picker (circle / rounded square / portrait / organic) stored as `page.frame` (default per template).
- Demo overrides: `/c/demo?template=…&theme=midnight|tide|sunset&frame=circle|squircle|portrait|blob`.
- Verified: contrast on sampled pixels 7.6–8.4:1 (muted text), CTA white on accent, 0 running animations under reduced motion, no page errors.
