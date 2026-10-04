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

## 2026-09-26: Profile photo +40%

Public card profile photo in `client/src/components/cardLanding.css`. Desktop `.lx-photo` 300→420px, portrait frame 320→448px, phone container 120→168px, business `.lx-logo` 34→48px. Initials clamp scaled the same. Desktop hero tracks widened (professional 34%→47.6%, services 1.2/0.8fr→11/14fr) so the max size is reachable. Playwright measure: desktop circle 420, portrait 448×560, phone 168, services 420, no hero overflow.
- Production: commit `a0b8d0b` on `main`. Live `CardLanding` CSS has `width:min(100%,420px)`, portrait `448px`, phone `168px`, logo `48px`, hero track `47.6%`. `node scripts/smoke.mjs https://heyitsme.fyi` — all 15 checks passed.

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

## 2026-09-26: Uploaded page background visibility fix
- Cause reproduced with a decoded local image: the 84% page veil plus the cover-derived aurora almost completely obscured `backgroundUrl`.
- `CardLanding.tsx`: explicit page backgrounds replace the blurred cover/aurora effects. The separate top cover from `13a6424` is preserved.
- `cardLanding.css`: use one 65% theme veil and full-ink secondary text for custom backgrounds. Default effects return when the background is removed.
- Verification: TypeScript check, 228 tests passed / 3 DB-dependent tests skipped, production build passed. Browser verified all 9 theme/template previews, default-effect restoration, desktop/mobile rendering and builder preview; repeated combined cover/background check after integrating `13a6424`.
- Worktree: `D:\ai mem\heyitsme-background-fix`, branch `fix/background-visibility`. No user card data or uploads changed. Pending production verification after push.
- Production confirmed: code commit `8f0d06f` pushed to main and deployed. Live CardLanding stylesheet contains the 65% veil. A local-only guest fixture on production verified decoded background, absent aurora overlay and retained top cover; fixture cleared. All 15 production smoke checks passed. User-specific uploaded asset was not inspected because no card URL was supplied.

## 2026-09-26: Rich vCard (.vcf) Export with Socials & Contact Providers
- Upgraded `shared/vcard.ts` `buildVCard` to serialize all card socials, contact channels, and portfolio links into the standard vCard 3.0 format.
- Multi-platform compatibility:
  - **Apple iOS / macOS**: Exports `X-SOCIALPROFILE;TYPE=<provider>;x-user=<handle>:<url>` and grouped URLs `itemN.URL:<url>` with `itemN.X-ABLabel:<label>`.
  - **Google / Android**: Imports `itemN.URL` and standard URLs into contact websites.
  - **Universal / Notes Fallback**: Appends a clean, formatted "Contact & Social Links:" section to `NOTE:` preserving bio and ensuring 100% visibility/clickability across Outlook, Gmail, and legacy contact managers.
  - **Location**: Maps `card.location` to `ADR;TYPE=WORK:;;;<location>;;;`.
- Shared logic: Exports `channelHref`, `channelLabel`, `parseChannelsSafe`, `parseLinksSafe` from `@shared/vcard`.
- Verified: `pnpm check` clean, `pnpm test` 230 passed / 3 skipped (28 test files), `pnpm build` clean.

## 2026-09-26: Fix iOS Contact Display Name (Company vs Person Name)
- **Problem**: When saved to iOS / Apple Contacts, card displayed company name as primary contact title instead of person's name.
- **Root Cause**: vCard was missing mandatory RFC 2426 `N` (Structured Name) property. In the absence of `N:`, iOS treats any vCard containing `ORG:` as an organization card and promotes company name to the header.
- **Fix**: Added `structuredName(displayName)` parser and explicit `N:<Family>;<Given>;<Middle>;;` to both `shared/vcard.ts` and `client/src/lib/cardKit.ts`. Handles "First Last", "Last, First", single names, and multi-word names.
- **Verification**: Added 5 unit tests in `card.test.ts` and route check in `vcfRoute.test.ts`. All 235 tests pass. Commit `6e4986d` deployed to production; verified live on `https://heyitsme.fyi/c/demo.vcf`.

## 2026-09-26: Claude regression handoff (Codex)
- Plan written, not implemented: `D:\download\heyitsme-claude-regression-fix-plan.md`. Reviewed `4350ae9`.
- F1 still open: raw marketing HTML canonical/OG/Twitter still emit `heyitsme-ecru.vercel.app` because `vite.config.ts` reads `SITE_URL` directly. Robots, sitemap, and `/c/demo.vcf` already use `heyitsme.fyi`.
- F2 guest save already rejects empty name, bad email, bad URL. Focus target mismatch remains (`field-displayname` vs `field-your-name`).
- F3 demo VCF domain correct on the sampled response. F4 demo booking still `https://example.com/book`. F5 Share uses native share, not a Copied toast. F6 `/privacy` crash not reproduced on a fresh load. F7 Support is `mailto:` with no in-browser fallback.
- Next code step if implementing here: A2, one origin policy shared by the Vite marketing build and runtime SEO.

## 2026-09-26: Purge Legacy Vercel Domain from vCard & Server Origins
- **Problem**: vCard exports contained `https://heyitsme-ecru.vercel.app/c/<slug>` instead of canonical `https://heyitsme.fyi/c/<slug>`.
- **Root Cause**: `ENV.siteUrl` and runtime `host` headers during serverless invocations on Vercel resolved to `heyitsme-ecru.vercel.app`.
- **Fix**:
  - `server/_core/env.ts`: Filtered `heyitsme-ecru.vercel.app` and production `.vercel.app` strings from `ENV.siteUrl`, enforcing `https://heyitsme.fyi`.
  - `server/_core/seo.ts`: Updated `siteOrigin(req)` to resolve legacy host headers directly to `https://heyitsme.fyi`.
  - `shared/vcard.ts`: Added multi-point `sanitizeHost` replacing legacy hosts across `cleanPageUrl`, `cleanOrigin`, `photoUrl`, `channels`, `links`, and `NOTE`.
  - `client/src/lib/cardKit.ts`: Added `sanitizeHost` to `buildContactVCard` for website and notes.
- **Verification**: Added test in `vcfRoute.test.ts`. All 236 tests pass.

## 2026-09-26: Regression plan F1–F7 implemented (Claude) — released `dffae7b`
| Task | Disposition | Evidence |
|---|---|---|
| A2 / F1 metadata domain | Reproduced, fixed | Live raw HTML of `/`, `/about`, `/faq`, `/pricing`, `/privacy`, `/terms` had `heyitsme-ecru.vercel.app` canonical/OG/Twitter. Cause: `vite.config.ts` read `SITE_URL` raw at build. Fix: `shared/publicOrigin.ts` used by build + runtime. Local build with legacy `SITE_URL` emits only `heyitsme.fyi`; production smoke metadata checks pass. Vercel `SITE_URL` env likely still legacy — harmless now, but set it to `https://heyitsme.fyi` when convenient. |
| A1 / F6 privacy crash | Reproduced (stale deploy), fixed | Old tab + removed `Legal-*.js` chunk (404) shows exactly "Something went sideways". `lazyRoute` reloads once (30s guard), repeat shows "heyitsme was just updated", boundary resets on route change. `__RELEASE__` commit SHA in client error reports. |
| A3 / F2 validation | Focus bug fixed; broad failure not reproduced | Stable `id="field-<key>"`; empty save focuses name, bad email focuses email, nothing persisted. Dead `cardFields` (required title) removed. Authenticated empty-save report still unverified (no test account). |
| A4 / F3 VCF | Verified working | `/c/demo.vcf` URL on `heyitsme.fyi`; smoke asserts no `vercel.app` in vCard. |
| A5 / F4 demo | Fixed | Demo booking + fictional phone open in-page explanations; real cards unchanged. |
| A6 / F5 share | Fixed | Copy link beside Share; "Link copied." only after real write; denied clipboard → manual-copy dialog; cancelled native share quiet. |
| A7 / F7 support | Fixed | Footer Support opens dialog: address, copy, Open email app. |
| A8 checks | Added | `scripts/smoke.mjs` metadata origin/share image/vCard assertions; `scripts/browser-checks.py` (14 checks, all pass on production). |
- Tests 251 passed / 3 skipped. Not tested: physical iPhone/Android share/tel handling, authenticated save flow.

## 2026-09-28: Paid plans, phases 0–5 (Claude, Buildme run)
- Owner decision: the free-only rule is dropped. Free stays free forever for the profile, QR code and NFC link. Pro and Teams are paid.
- Source spec: `heyitsmepayment.txt` v1.0. This run covers phases 0–5. Teams workspace, NFC store and admin screens are not built.
- Server: `shared/plans.ts` (prices in centavos, limits, entitlement resolver), `server/billing/` (service, gate, router, 2C2P PGW v4.5 adapter, payment routes), `drizzle/0009_billing.sql` (also run by `ensureSchema`).
- Every flag defaults off except the founding offer. Nothing changes for users until `PLAN_LIMITS_ENABLED` and `PAYMENTS_ENABLED` are set. Order and checklist: `docs/billing.md`.
- The owner account keeps every feature through `COMPLIMENTARY_EMAILS` (set in Vercel, never in the repo).
- Checks: `pnpm check` clean, `pnpm test` 313 passed / 3 skipped, `pnpm build` clean. PGlite tests cover settlement, idempotency, founding cap, lead quota, card limit and the checkout flow. 11 guard mutations were caught by the tests. Removing the card-creation advisory lock was not caught (PGlite has one connection).
- Browser check on a local in-process PGlite harness: pricing (desktop and 485 px), contacts lead bar, upgrade dialog, locked insight ranges, billing page (Pro founding member), paused public card, complimentary account. Fixed B1–B9 found there.
- Not tested: a real 2C2P sandbox payment (no credentials), production deploy, the migration on Supabase.
- Open owner actions: refund policy (marked `[Owner: ...]` in Terms and FAQ), 2C2P merchant capability for Google Pay and GCash (`DPAY`) in PHP, backend notification URL.

## 2026-10-03: Free and Pro PHP299 implementation
- [stated] Requested scope: Free plus Pro PHP299/month, premium design/motion, QR branding/campaigns, analytics, CRM, and server enforcement.
- Implemented locally on feat/pro-299 from origin/feat/monetization-phase-0-5. No commit, push, or deployment.
- Added migration 0010_pro_tools.sql and default-off design, campaign, and analytics flags. Existing provider supports manual monthly renewal. Live merchant payment verification remains outstanding.
- Verification: 330 tests passed, 3 skipped. TypeScript, production build, and git diff whitespace checks passed. Browser mobile widths, reduced-motion behavior, live Pro preview, and rounded QR decoding verified. Final logo/frame browser check interrupted by shared browser session.
- Temporary in-memory QA harness removed. Production migration and feature activation remain deployment steps.

## 2026-10-03: Production release authorized
- [stated] User requested push and live deployment.
- Integrated latest origin/main editor, contact validation and mobile fixes. Release checks: 336 tests passed, 3 skipped, TypeScript and production build clean.
- Pro design, campaign and analytics flags now default on, with explicit environment kill switches retained. Live billing.offer confirms PHP29900 Pro monthly and these three flags enabled.
- Payments and plan limits remain disabled until real merchant checkout is verified. No payment credentials changed.
- Production release 1ee6572 reached Vercel READY and public smoke checks passed, including health. Campaign editor restored in the combined Contacts view for final follow-up release.

## 2026-10-03: Teams plan, phase 1 of 8 (Claude)
- [stated] Source: the owner's 65-section Teams spec, pasted with no other text. [my reading] Treated as a build request, in the spec's own phase order.
- Built: team workspaces, membership, email invitations, the three roles (owner, admin, member), workspace switcher. Not built: phases 2–8 (company cards, departments, brand, templates, shared contacts, analytics, events, assets, seat billing).
- Server: `drizzle/0013_teams.sql` (4 new tables, no change to existing tables), `server/teams/` (`access.ts` holds the shared permission checks, `entitlements.ts`, `router.ts`, `schemaSql.ts` is the migration copied for `ensureSchema`), `shared/teams.ts`.
- Client: `client/src/pages/Team.tsx` (`/app/team`, `/app/team/:id`, `/app/team/join/:token`), `client/src/components/WorkspaceSwitcher.tsx` in the Home sidebar. Lazy-loaded, never on public card pages.
- Off by default behind `TEAMS_ENABLED`. Invitation links are stored as SHA-256 hashes, last 7 days, one use, and only work for the invited email address.
- Safety caps, not prices: 3 teams per owner, 50 people per team (`shared/teams.ts`). No Teams price is set anywhere in this work.
- Checks: `pnpm check` clean, `pnpm test` 374 passed, `pnpm build` clean. 20 new tests in `server/teams/teams.test.ts`.
- Not tested: any screen in a browser, the migration on Supabase, a real invitation email.
- Before switching on: run `drizzle/0013_teams.sql` in Supabase as the table owner so row-level security is enabled, then set `TEAMS_ENABLED=true`.
-

## 2026-10-03: Teams plan, phase 2 of 8 (Claude)
- [stated] Owner said "continue" after the phase 1 report.
- Built: company-owned cards (create, edit, publish, assign, pause, archive, restore), departments (create, rename, archive, lead, move people), card choice when removing a person (unassign, archive, transfer). Not built: phases 3–8.
- Server: `drizzle/0014_team_cards.sql` is the first Teams change to existing tables: nullable `cards.workspaceId`, `cards.assignedUserId`, `cards.teamStatus`, `contacts.workspaceId`, `contacts.capturedByUserId`, plus the new `workspaceDepartments` table. `server/teams/cardsRouter.ts` (`teamCards`, `teamDepartments`), `canManageWorkspaceCard` in `server/teams/access.ts`.
- Personal queries now filter `workspaceId is null`, so company cards never count toward a personal plan limit or show in the personal card list. Public card, exchange and tracking refuse paused or archived company cards. `publicCard.bySlug` no longer returns the team columns.
- Client: `client/src/pages/TeamCards.tsx` (Cards and Departments tabs), `Team.tsx` (department select, card count, removal panel, activity labels).
- [my choices, open to change] A company card's lead quota follows the team owner's plan until seat billing (phase 8). Members may publish their own company card. Department lead is a label with no extra access. Company cards have text fields only until brand and templates (phase 3). Leads from a company card go to the card holder's contacts, tagged with the team, until shared contacts (phase 4). The contacts half of the removal flow waits for phase 4.
- Safety caps, not prices: 200 cards and 50 departments per team.
- Checks: `pnpm check` clean, `pnpm test` 391 passed, `pnpm build` clean. 17 new tests in `server/teams/teamCards.test.ts`.
- Not tested: any screen in a browser, the migration on Supabase.
- Before switching on: run `drizzle/0013_teams.sql` then `drizzle/0014_team_cards.sql` in Supabase as the table owner. `ensureSchema` also adds the 0014 columns at server start, with or without `TEAMS_ENABLED`.
-

## 2026-10-03: Teams plan, phase 3 of 8 (Claude)

Brand, templates, locked details and change requests. Behind `TEAMS_ENABLED`, like phases 1 and 2.

- **Migration `drizzle/0015_team_brand.sql`**: adds `workspaces.lockedFields`, `cards.templateId` (both nullable) and tables `workspaceTemplates`, `workspaceChangeRequests` with RLS. `ensureSchema` applies it on first use (gated on `workspaceChangeRequests`); RLS may need the table owner, so run the file by hand in Supabase project `gomtjpaotoqnwskjqpgk`.
- **Server**: `server/teams/cardRules.ts` (lock union of team and template, template values written to a card), `server/teams/brandRouter.ts` mounted as `teamBrand` (get/save/uploadLogo/removeLogo), `teamTemplates` (list/create/update/setArchived/setDefault/applyTo), `teamRequests` (list/create/cancel/decide). `teamCards.update` refuses a member's change to a locked detail; admins are not held by locks. New cards take the default template and the team logo.
- **Logo storage**: `team-<workspaceId>/logo-…`, outside the `<userId>-portfolio` prefix so the personal upload sweep never removes it. Old logo files are not deleted when replaced.
- **Client**: `client/src/pages/TeamBrand.tsx` (Brand and Templates tabs, admins only), change-request panel and template picker on the Cards tab, member edits to locked details become a request.
- **Interim choices**: a template look is one of the 15 ready-made looks plus optional brand colors on buttons and highlights (no free-form design editor yet). Templates may use Pro-grade looks on company cards with no plan check; phase 8 (seat billing and entitlements) decides that. A card cannot be detached from a template, only moved to another. No email is sent for requests.
- **Checks**: `pnpm check` clean, `pnpm test` 406 passed (42 files), `pnpm build` clean. Not browser-tested.

## 2026-10-04: Teams plan, phase 4 of 8 (Claude)

Shared team contacts. Behind `TEAMS_ENABLED`, like phases 1 to 3.

- [stated] Owner said "done" after the phase 3 report (migration 0015 run).
- **Migration `drizzle/0016_team_contacts.sql`**: nullable `contacts.assignedUserId`, `contacts.departmentId`, index `contacts_workspace_idx`, and two updates that move contacts phase 2 filed under the card holder (holder stays assigned, row held in the team owner's name). `ensureSchema` applies it once, gated on the `contacts.departmentId` column. No new table, no RLS statement. Run by hand in Supabase project `gomtjpaotoqnwskjqpgk`.
- **Model**: a team contact mirrors a company card: `ownerUserId` = team owner, `workspaceId` set, `assignedUserId` = who looks after it now, `capturedByUserId` = who held the card at capture, `departmentId` = holder's department at capture. Archive = status `archived` (existing status), no new column.
- **Personal side**: `personalContact()` in `server/db.ts` adds `workspaceId is null` to personal list, update, delete, mark seen; `exportContactsForOwner` too. Team contacts never show in, or change through, anyone's personal contacts.
- **Server**: `server/teams/contactsRouter.ts` mounted as `teamContacts` (list, update, reassign, remove, exportCsv, duplicates, merge), `canViewWorkspaceContact` in `server/teams/access.ts`. Members see their own, admins all. Duplicates = same email or same phone digits; merge is manual, admin only, archives the other contact. `teams.removeMember` takes `contacts: keep | transfer | archive` (+ `contactsToMemberId`); `leave` unassigns; `transferOwnership` moves `ownerUserId`. `teams.members` returns `contactCount` for admins. New-contact email for a company card links to `/app/team/<id>`.
- **Client**: `client/src/pages/TeamContacts.tsx` (Contacts tab for everyone), contact choice in the removal panel in `Team.tsx`, activity labels.
- [my choices, open to change] Lead quota for a company card still follows the team owner's personal plan until phase 8. Department on a contact is fixed at capture and does not follow reassignment. Members get no duplicate hint about colleagues' contacts. Admin delete is permanent and logged, meant for "forget me" requests. Export capped at 10,000 rows. No bulk select in the UI (server reassign takes up to 200 ids).
- **Checks**: `pnpm check` clean, `pnpm test` 420 passed (43 files), `pnpm build` clean. 14 new tests in `server/teams/teamContacts.test.ts`. Not browser-tested.

## 2026-10-04: Teams plan, phase 5 of 8 (Claude)

Team analytics. Behind `TEAMS_ENABLED`, like phases 1 to 4.

- **Migration `drizzle/0017_team_analytics.sql`**: one column, `workspaces.leaderboardEnabled boolean default false not null`. `ensureSchema` applies it once, gated on that column. Run by hand in Supabase project `gomtjpaotoqnwskjqpgk`. No data copied: team numbers read the existing `analyticsEvents` rows of company cards.
- **Server**: `server/teams/analyticsRouter.ts` mounted as `teamAnalytics`, capability `canViewWorkspaceAnalytics`. `summary` (ranges 7/30/90/365 days from `TEAM_ANALYTICS_RANGES` in `shared/teams.ts`; totals for views, saves, exchanges, QR scans, link clicks, shares; conversion rate; daily views; by card, by person, by department). Admin filters: person or unassigned, department, card, template. A member always gets only cards assigned to them, filters ignored. `filters` and `adoption` (people, active, cards published or not, shared this month, never shared) are admin only. `setLeaderboard` is admin only and logged (`analytics.leaderboard_on` / `_off`).
- **Leaderboard**: off by default. When on, every member sees the top ten (views, exchanges, QR scans) for the chosen range, whole team, not the filtered view. The admin "By person" table is in name order, never ranked.
- **Client**: `client/src/pages/TeamAnalytics.tsx`, loaded only when the Analytics tab opens (it reuses `DailyViewsChart` from `InsightsView`). Analytics tab for everyone in `Team.tsx`.
- [my choices, open to change] Days are UTC, like personal insights. Sharing in adoption counts for whoever holds the card today; "this month" is the UTC calendar month. No QR campaign filter yet: team QR campaigns do not exist until the Team QR work. Deleted cards are left out.
- **Checks**: `pnpm check` clean, `pnpm test` 428 passed (44 files), `pnpm build` clean. 8 new tests in `server/teams/teamAnalytics.test.ts`. Not browser-tested.

## 2026-10-04: Teams plan, phase 6 of 8 (Claude)

Team events with RSVP. Behind `TEAMS_ENABLED`, like phases 1 to 5.

- **Migration `drizzle/0018_team_events.sql`**: new tables `workspaceEvents`, `workspaceEventFields`, `workspaceEventRsvps`, `workspaceEventRsvpAnswers`, RLS on. `ensureSchema` applies it once, gated on `workspaceEventRsvpAnswers`. Run by hand in Supabase project `gomtjpaotoqnwskjqpgk`. Touches no existing table.
- **Shared**: `shared/events.ts` holds statuses, RSVP statuses, question types, the ready-made questions, limits, `readAnswer` (per-type answer validation, used by the server) and the wall-time helpers.
- **Server**: `server/teams/eventsRouter.ts`. `teamEvents` (capability `canCreateEvents`; admins manage, checked by `canManageEvent` in `access.ts`; members can only `list` and only see public events, no counts): create, update, setStatus, saveFields, uploadCover, removeCover, rsvps, updateRsvp, deleteRsvp, checkIn, exportCsv. `publicEvent.get` and `publicEvent.rsvp` are open to visitors and return event details and the form only, never counts or attendees.
- **RSVP safety**: answers validated on the server per question type with length limits and control characters stripped; only enabled questions of that event are accepted, any other field id is refused; honeypot field `website`; rate limits 10 per 10 minutes per IP and 600 per hour per event; capacity checked under advisory lock 7018.
- **Client**: `client/src/pages/TeamEvents.tsx` (Events tab in `Team.tsx`, loaded only when opened): list, create, details, banner, status buttons, RSVP form builder, responses with search, filters, check-in, edit, delete and CSV download, share link and branded QR (PNG and SVG). `client/src/pages/PublicEvent.tsx` at `/event/:slug` (route in `App.tsx`, rewrite in `vercel.json`), `client/src/components/EventAnswerInput.tsx`, `client/src/pages/event.css`.
- [my choices, open to change] Times are typed and shown in the team's time zone. Capacity counts each person coming plus their guests; when full, people can still answer Maybe or Not attending. An event past its end time counts as ended. The same email can reply more than once. Admin edits skip required and capacity checks. Check-ins are stored on the response, not in the activity log. No event delete: Archive hides the page and keeps responses. Removing a question that has answers hides it. The QR logo is left out when the browser cannot read the logo file.
- **Checks**: `pnpm check` clean, `pnpm test` 438 passed (45 files), `pnpm build` clean. 10 new tests in `server/teams/teamEvents.test.ts`. Not browser-tested.

## 2026-10-04: Teams plan, phase 7 of 8 (Claude)

Company files, email signature, meeting background, scheduled banners. Behind `TEAMS_ENABLED`, like phases 1 to 6.

- **Migration `drizzle/0019_team_assets.sql`**: new tables `workspaceAssets`, `workspaceCardAssets`, `workspaceBanners` (RLS on) and two new nullable columns on `workspaces` (`signatureSettings`, `backgroundSettings`). `ensureSchema` applies it once, gated on `workspaceBanners`. Run by hand in Supabase project `gomtjpaotoqnwskjqpgk`. Changes no existing data.
- **Shared**: `shared/teamKit.ts` holds limits, banner targets, `CardTeamExtras`, the settings readers, and `signatureHtml` / `signatureText` (one table, inline styles, every value escaped, only http, https, mailto and tel links).
- **Server**: `server/teams/kitRouter.ts`. `teamAssets` (capability `canUseAssetLibrary`): admins `addLink`, `upload`, `update`, `replaceFile`, `setArchived`; any member `list` and `setOnCard` for a card they may manage (`manageableCard`). `teamBanners` (capability `canManageBrand`, admins only): `list`, `save`, `remove`. `teamKit`: `get` for members, `saveSignature` / `saveBackground` for admins. `cardTeamExtras(card)` adds `team` (running banners aimed at the card, attached non-archived files) to `publicCard.bySlug`; it returns null on any failure so the public card never breaks. New Express route `GET /api/qr/c/:slug.png` in `server/_core/app.ts` gives the QR picture a signature needs; it only encodes the link of a published card and is rate limited.
- **Uploads**: 3MB, same content checks as personal uploads, plus PowerPoint and Excel checked by first bytes. Stored under `team-<workspaceId>/file-...`. Cards reference the file row, so a new version or a rename reaches every card at once.
- **Client**: `client/src/pages/TeamAssets.tsx` (Assets tab in `Team.tsx`, loaded only when opened) with Files, Email signature, Meeting background, and Banners (admins). Background is drawn in the browser at 1920x1080 or 1280x720. `client/src/lib/teamFiles.ts` holds the helpers `TeamEvents.tsx` and `TeamAssets.tsx` share. `CardLanding.tsx` takes an optional `team` prop: banners under the hero, a "From the company" files section.
- [my choices, open to change] Files are archived, never deleted. A card shows up to 12 company files and 3 banners at once. Banner times are typed in the team's time zone. A banner aimed at a department reaches cards whose holder is in that department. Banners are removed for good (they hold no visitor data). One 16:9 background fits Zoom, Meet and Teams. Signature and background use published company cards only.
- **Not built** (in the spec, in no phase of its build order): Team QR management (section 21), CTA settings by template or department (47), translations (48), NFC device inventory (49).
- **Checks**: `pnpm check` clean, `pnpm test` 449 passed (46 files), `pnpm build` clean. 11 new tests in `server/teams/teamKit.test.ts`. The QR picture route has no automated test. Not browser-tested.

## 2026-10-04: Teams plan, phase 8 of 8 (Claude)

Seats and per-team entitlements. No Teams price, no checkout: the owner has not given price per seat, billing interval or minimum seats.

- Migration `drizzle/0020_team_seats.sql`: `workspaces.seatLimit` (empty = standard 50) and `workspaces.accessUntil` (empty = no end). Also applied by `ensureSchema`. Existing teams are unchanged.
- `server/teams/entitlements.ts` decides entitlements per workspace. A team whose `accessUntil` has passed is read-only: `requireWorkspaceMember` refuses every Team mutation, except leave, remove member, close, and the two CSV downloads (`teamProcedure(cap, { afterPlanEnd: true })`). Nothing is deleted, nobody is removed, public company cards and event pages stay online.
- Seats: invited, active and suspended people each hold one. Invites stop when seats are full; accepting an invitation is refused when the people already in fill the allowance. Lowering seats removes nobody.
- Only heyitsme staff (`users.role = 'admin'`) set seats and dates: `teams.adminList`, `teams.adminSetPlan`, page `/app/admin/teams`. Audit action `plan.updated`.
- Owner sees a Billing tab (`teams.billing`): seats used, allowed, free, plan date. No price shown.
- Tests: `server/teams/teamSeats.test.ts` (8).
- Not built: Teams checkout through 2C2P, per-seat price, renewals, receipts. Needs the owner's pricing first. Then `accessUntil` and `seatLimit` are what a settled payment should set.
- Known gap: a member editing their own company card through the personal card editor is not paused when the plan has ended.

## 2026-10-04 — Card builder rearranged into tabs (Claude, branch `feat/builder-tabs`, NOT merged)
- Builder is now four tabs: Profile, Contact, Page, Design (+ Preview tab on phones). Short heading, pinned toolbar with tabs and save buttons, Next/Back at the foot of each tab.
- Groups inside tabs are folds (`client/src/components/Fold.tsx`), closed by default, with counts and an "Unfinished" flag. All look controls live in Design; free choices first, Pro ones under one "More with Pro" label.
- `PageDesigner` panels are now `design(extras)`, `template`, `sections`, `accent`, `contact`, `content`. A failed save bumps `errorSignal`; the builder opens the tab with the first bad field and focuses it.
- `.app-frame` uses `overflow: clip` so pinned bars work (the preview's pinning was broken before).
- Checked: `pnpm check`, 461 tests, build, browser checks at 1440/1100/390 wide. Waiting for owner's OK before merge and deploy.
- Still open: `feat/teams` (PHP 899 checkout, pricing section) conflicts with the Teams build on main; owner to decide. Flow clips paused (owner disliked them).

## 2026-10-04 — Builder follow-ups and client reviews (Claude, branch `feat/builder-tabs`, NOT merged)
- Sections reorder by drag (framer-motion Reorder, grip handle; arrow keys on the handle). Layout corners now reach the card panels. PRO badge on every paid choice. Hover/press feedback across the builder.
- Professional template: no Google Reviews / reviews-heading block in the builder. Business and Services keep it; the button saves the card first when needed, then opens `/app/google-reviews?card=<id>`.
- Client reviews (owner decision): on Business and Services cards visitors leave a star rating and review on the public card (`publicCard.review`, 3 per hour per IP, honeypot, max 30 waiting per card). Stored in `references` with new columns `rating`, `fromVisitor` (migration `0021_client_reviews.sql`, also in `ensureSchema`), unapproved until the owner approves in the builder (`references.setApproved`). Professional cards keep owner-typed "Client references".
- Tests: `server/clientReviews.test.ts` (6). Total 467 pass. Local signed-in harness: `.harness/builder-harness.ts` (git-ignored).

## 2026-10-04 — Event landing page (Claude, branch `feat/event-landing`, merged to `main` and live)
- `/event/:slug` is now a landing page in the Business card look: hero (date, place, countdown, RSVP, Add to calendar, Directions, Share), then Details, Schedule, Speakers, Gallery, Sponsors, Questions and answers, Resource links, then RSVP (always last). Themes Tide / Sunset / Midnight plus one accent. `CardLanding.tsx` untouched.
- **Migration `drizzle/0022_event_page.sql`**: one column, `workspaceEvents.page jsonb`. `ensureSchema` applies it once (bootstrap version `0022_event_page`). Run by hand in Supabase project `gomtjpaotoqnwskjqpgk`. The old `design` column stays; its button color becomes the accent, its font is kept, its background is ignored.
- **Shared**: `shared/eventPage.ts` (schema, limits: 30 agenda rows, 12 speakers with up to 3 featured, 12 photos, 12 sponsors, 20 questions, 12 links, 40,000 characters of JSON; `parseEventPage` always returns a working page; `.ics` and Google Calendar helpers; countdown).
- **Server**: `teamEvents.uploadImage`, `speakerCards`, `copyCardPhoto`, `savePage` (audit `event.page_changed`, deletes images a save drops), `preview` (admins, any status). `teamEvents.get` and `publicEvent.get` return `page`. Images must sit under `/storage/team-<workspaceId>/event-<eventId>-`; `..` is refused. A speaker's card link must be a card of the same team and is blanked for visitors while that card is offline.
- **Client**: `client/src/components/EventLanding.tsx` + `eventLanding.css`, `EventPageEditor.tsx` (new "Page" tab in `TeamEvents.tsx`; the old design fields left the Details form), `PublicEvent.tsx` (preview via `?preview=<workspaceId>-<eventId>`, replies off in preview).
- **Checks**: `pnpm check` clean, 496 tests pass (18 new), build clean, browser pass on a local PGlite harness in all themes at 1280 and 390 wide. Real image upload not browser-tested.
- **Open**: unsaved editor uploads are never swept. Phase 2 (owner approved as later work): multi-day agenda, sponsor tiers, several speakers per agenda row.

## 2026-10-04 — Event page phase 2 (Claude, branch `feat/event-phase2`, commit `c380b34`, merged to `main` and live)
The three items the owner deferred from v1: multi-day schedule, sponsor tiers, speakers on schedule rows.
- Data: all in `workspaceEvents.page` JSON, every new field optional with a default. No migration; pages saved by v1 read as before.
  - `agendaDays: string[]` (up to 7) and `agenda[].day` (position in that list). Empty list means a one-day schedule.
  - `sponsorTiers: string[]` (up to 5) and `sponsors[].tier`. The first tier is shown largest. Empty list means one flat list.
  - `speakers[].id` and `agenda[].speakerIds` (up to 6 per row).
- `normalizeEventPage` in `shared/eventPage.ts` gives each speaker its own id, drops row speakers that do not exist, and pulls a row or sponsor back to the first day or tier when its own is gone. `savePage` runs it on every save; the editor runs it when it opens.
- Removing a day or tier in the editor never deletes rows: they move to the first one left.
- Public page: `agendaByDay`, `sponsorsByTier`, `rowSpeakers`. Empty days and tiers are not shown.
- Gates: `pnpm check` clean, `pnpm test` 502 passed (52 files), `pnpm build` clean. Browser pass on the throwaway PGlite harness at 1280 and 390 wide, Tide theme only.
- Not checked in a browser: Sunset and Midnight themes for the new blocks, and sponsor logos in tiers (harness has no storage, so tiles showed names).

## 2026-10-04 — Event builder (Claude, branch `feat/event-builder`, commit `2d77a43`, merged to `main` as `aff0ec2` and pushed)
Owner asked for event creation to look and work like the card builder.
- New `client/src/components/EventBuilder.tsx` + `eventBuilder.css`: one screen for making and editing an event. Reuses the card builder frame from `index.css` (`builder-page`, `builder-toolbar`, `builder-tabs`, `builder-layout`, `builder-panel`). Tabs: Details, Page, RSVP form, Design, plus Preview on phones. Folds inside Details and Page. Live preview renders `EventLanding` from the draft, inert.
- One save for everything: `create` or `update`, then `savePage`, `saveFields`, and `setStatus(published)` when publishing. A new event's ready-made questions are matched to the server's rows by `standardKey` before `saveFields`. No server change.
- `EventPageEditor.tsx` is now controlled: exports `EventPageSections`, `EventPageLook`, `eventPageProblem`. It no longer saves on its own.
- `TeamEvents.tsx`: "Create event" and the new "Edit event" button open the builder. The event screen keeps status actions, Responses and Share. `CreateEvent`, `DetailsForm`, `FormBuilder` and the old Details / Page / RSVP form sections are gone.
- Pictures (banner, gallery, speaker and sponsor images) need an event id, so they can be added only after the event is first created. The builder says so in place.
- Publishing without a start date is stopped in the builder with the server's own words.
- Gates: `pnpm check` clean, `pnpm test` 502 passed (52 files), `pnpm build` clean. Browser pass on the throwaway PGlite harness at 1280 and 390 wide: create, edit, publish, arrow-key tabs, Preview tab, no console errors, no sideways scroll, no control under 44px.
- Not checked in a browser: real image upload (harness has no storage), Discard changes, the leave-without-saving prompt.

## 2026-10-04 — Event builder: drag to reorder (Claude, branch `feat/event-drag`, merged to `main` and pushed)
Owner asked for drag and drop in place of the up and down arrow buttons.
- New `client/src/components/SortList.tsx`: a list reordered by dragging a grip. Pointer events only, no new dependency. A row swaps with its neighbor when the pointer passes the neighbor's middle; the page scrolls when the pointer is near the top or bottom edge. Keyboard: focus the grip, press the up or down arrow. Each move is announced in a live region. Exports `moveTo` and `movedPosition`.
- Used for every reorder in the event builder: page sections, rows inside each section (schedule, speakers, gallery, sponsors, questions, links), days and sponsor tiers, and RSVP questions. No arrow buttons remain. Remove and Hide from page stay as buttons.
- Moving a day or a tier still carries its rows with it (`movedPosition`).
- Grip is 44px, `touch-action: none`; styles in `eventBuilder.css`. No server change.
- Gates: `pnpm check` clean, `pnpm test` 502 passed (52 files), `pnpm build` clean. Browser pass on the throwaway PGlite harness at 1280 and 390 wide: mouse drag of sections, schedule rows, days and questions; arrow keys on the grip; order kept after save and reopen; no console errors, no sideways scroll, no control under 44px.
- Not checked: a real finger drag on a phone (the browser pass used a mouse at phone width).

## 2026-10-04 — Event builder: card builder design parity (Claude, branch `feat/event-drag`, merged to `main` and pushed)
Owner asked to find what the card builder's design has that the event builder lacks, and add it.
- Toolbar: second button "Publish & copy link" (draft) / "Save & copy public link" / "Copy public link" (published) with the share icon; it saves, publishes a draft, and copies `/event/<slug>`. Check icon on Save; Save reads "Save live changes" on a published event. Saved indicator has a tooltip. `save()` in `EventBuilder.tsx` now returns the slug or null.
- Pictures: `EventImagePicker` (exported from `EventPageEditor.tsx`) uses the card builder's `image-picker` tile for the banner, speaker photos and sponsor logos. The banner tile is shown disabled until the event exists.
- Page tab: eye button on each section row shows or hides it; the "Hide from page" button inside the fold is gone.
- Design tab: Theme, Font and Accent color have `pd-block-head` headings; accent is the `pd-swatch` chip with the hex value and a Reset button (empty accent = company color).
- Tab dot shows while the Page or RSVP tab has a problem, not only after a failed save. Error focus scrolls the field to the middle. Builder fades in.
- Left out, needs schema or server work: template picker, photo shape, page background photo, gradients and custom colors, QR styling, Google Reviews, branding toggle (billing).
- Gates: `pnpm check` clean, `pnpm test` 504 passed (53 files), `pnpm build` clean. Browser pass on the throwaway PGlite harness at 1280 and 390 wide: copy link (clipboard read back), eye toggle, accent set and reset, error focus, no console errors, no sideways scroll, no control under 44px.
- Not checked in a browser: real image upload into the tiles (harness has no storage), publish from draft through the new button, the live tab dot (code path only).
