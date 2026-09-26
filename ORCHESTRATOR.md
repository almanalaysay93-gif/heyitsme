# heyitsme — Buildme Orchestration Checkpoint

## Phase

Phase 0–3: orchestration complete; implementation begins.

## Confirmed decisions

- Product: heyitsme, an original digital business card / professional presence platform.
- MVP priority: card builder, public browser-first card, contact details exchange.
- Delivery: standalone web app.
- Backend: Supabase requested by the user; existing connected project is inactive, so Supabase-backed integration should be treated as the target and any environment limitation documented.
- Visual language: professional Apple-inspired glass morphism with high-energy animation.
- Pricing: all implemented features are free; no billing, checkout, trial, upgrade, or paid-plan UI.
- Out of scope for phase 1: team admin, CRM sync, NFC hardware sales, analytics beyond minimal view/save events, native mobile apps.

## Product contract

1. Signed-in user can create and edit multiple digital cards.
2. Card fields include name, title, contact details, links, theme, logo/media placeholders, slug, and published state.
3. Public `/c/:slug` card opens in a browser without an app install.
4. Recipient can save contact details or submit a simple exchange form.
5. Owner can see captured contacts in a personal contact list.
6. QR/share sheet exposes copy link, QR, and SMS/email helpers.

## Build units

- Data: cards, contacts, analytics event schema and backend procedures.
- Product UI: dashboard shell, cards list, builder/editor, share sheet, public card, contacts.
- Interaction: animated glass system, responsive states, keyboard/focus behavior, reduced-motion fallback.
- Copy: original heyitsme voice, privacy-minded trust language, no unsupported certifications.
- Quality: typecheck, build, tests, responsive browser verification, anti-slop/a11y review.

## Files expected to change

- `drizzle/schema.ts`
- `server/db.ts`
- `server/routers.ts`
- `client/index.html`
- `client/src/App.tsx`
- `client/src/index.css`
- `client/src/pages/Home.tsx`
- Additional feature components/pages under `client/src/`
- `PRODUCT.md`, `DESIGN.md`, `VOICE.md`, `public/llms.txt`

## Tiebreaker hierarchy

User brief → original-brand / anti-slop rules → cited implementation principle → ask user.

## Next dispatches

- Design/copy/motion/accessibility/audit agents write independent recommendations.
- Parent agent integrates recommendations into the fullstack project.
- Quality gates run after the first end-to-end implementation.

## Run: landing page + personal card page

- Grill answers: landing at `/` (dashboard stays at `/app/*`, OAuth returns to `/app`); avatar + cover images on cards; keep glass + lilac, refined; high-energy motion.
- Schema: `cards.avatarUrl`, `cards.coverUrl` (migration `drizzle/0001_concerned_devos.sql`). Server accepts only http(s) or same-origin paths for both.
- Gates run: `tsc --noEmit`, `vite build`, `vitest run`, copy scan for invented claims. Visual browser pass still pending.

## Run: video, animation and motion graphics

- Grill answers: videos from Google Flow plus code-made motion; users can upload a video cover.
- Flow cannot be driven from this environment, so the slots ship with code-made fallbacks and `docs/flow-shots.md` holds prompts plus ffmpeg export settings. Drop clips into `client/public/media/` under the listed names.
- New: `client/src/components/LoopVideo.tsx`, `client/src/components/ShareDemo.tsx`, `client/src/lib/media.ts`. `ImagePicker` takes `allowVideo` for the cover. No schema change: `coverUrl` holds the video URL, and the file extension selects video rendering.
- Gates run: `tsc --noEmit`, `vite build`, `vitest run`. Visual browser pass still pending.

## Run: share kit, insights, contact follow-up

- Grill answers: build the email signature + QR kit, an insights dashboard, and contact follow-up. New leads show as an in-app badge only (no email or push). Delivery is one pass, then push.
- Schema: `contacts.followedUp` (boolean, default false) and `contacts.seenAt` (timestamp). `ensureCardMediaColumns` in `server/db.ts` adds them at runtime because Vercel deploys run no migrations.
- Server: `insights.summary` (7/30/90 days, built by `server/insights.ts`), `contacts.update` (tags, notes, followedUp), `contacts.markSeen`, and public `publicCard.track` for `vcard`, `link`, and `share` events on published cards.
- Client: `ShareSheet` (QR PNG/SVG downloads, copy-paste email signature), `InsightsView` at `/app/insights` (tiles, daily views chart with table view, per-card table, top links), `ContactsView` (status tabs, tag/card filters, detail sheet with tags, notes, and a follow-up switch). The overview sparkline now shows real 7-day views. The public page stops refetching on window focus, so switching tabs no longer logs extra views.
- Known limit: `publicCard.track` and views are unauthenticated, so anyone can inflate the counts. Treat insights as directional.
- Gates run: `tsc --noEmit`, `vite build`, `vitest run` (17 tests), copy scan. Browser check of the insights chart at desktop width using mocked data; mobile widths not checked visually.

## Run: pre-launch checklist fixes

- Trigger: audit against the "Website Pre-Launch, Architecture & UX Checklist (v3)", then "fix it". Items that need an owner decision shipped with a default and are listed under follow-ups.
- Security: CSP, HSTS, frame, referrer, and permissions headers (Express in production and `vercel.json` for static files); session and OAuth-state cookies moved to `SameSite=Lax`; JSON bodies capped at 100 KB (6 MB for tRPC uploads); tRPC masks internal errors in production; upload types resolved against an allow-list (`resolveUploadType`, no SVG or HTML).
- Abuse controls: `server/_core/rateLimit.ts` (per-instance memory window, shared through Upstash REST when `UPSTASH_REDIS_REST_*` or `KV_REST_API_*` is set; IPs hashed before use). Limits on uploads, public card reads, exchange, track, and client error reports. Card views are deduped per hashed IP for 30 minutes.
- SEO and sharing: `/c/:slug` is server-rendered with per-card title, description, canonical, Open Graph, Twitter, and Person JSON-LD (`server/_core/meta.ts`, `server/_core/seo.ts`); missing cards return 404 + noindex. `robots.txt`, `sitemap.xml` (landing and legal pages only), default OG image, favicons, and web manifest. Unknown paths return a real 404 (`dist/public/404.html` on Vercel, `isSpaRoute` in Express). `SITE_URL` makes OG image URLs absolute at build time.
- Reliability: `/api/health` (DB round trip), `/api/client-error` receiving ErrorBoundary and window error reports, structured JSON logs. `ensureSchema` in `server/db.ts` adds the contact columns and four indexes at runtime; `drizzle/0002_indexes_and_contact_flags.sql` is the same change, idempotent. Contacts list is paginated by keyset.
- UX and performance: route-level code splitting, self-hosted fonts, client-side image downscaling to WebP before upload, skip link, focusable `main`, labelled mobile menu, branded 404 and error pages, print styles for legal pages, `/privacy` and `/terms` linked from every footer.
- Removed unused scaffolding: LLM, image generation, voice, maps, and data API helpers plus their client components; `@anthropic-ai/sdk`, `streamdown`, `@types/google.maps`.
- Gates run: `tsc --noEmit`, `vitest run` (39 tests, new: `meta`, `rateLimit`, `uploadTypes`, `card`), `pnpm build`. Local production-mode browser pass without a database: landing, legal, 404, app shell, skip link, security headers, robots, sitemap, health, body limit; no console or CSP errors. `/c/:slug` server rendering was not exercised against a live database.
- Follow-ups for the owner: set `SITE_URL`, `VITE_SUPPORT_EMAIL`, and Upstash env vars in Vercel; remove `ANTHROPIC_API_KEY`; point an uptime monitor at `/api/health`; run a Supabase restore drill; add privacy and homepage URLs to the Google OAuth consent screen; review the legal text; decide on the name clash with heyitsme.app, on listing published cards in the sitemap, and on an account-deletion feature.

## Run: photo carousel & description gallery

- Grill answers: swipeable interactive photo carousel with expandable lightbox showing full image and rich descriptions; both card builder editor and public `/c/:slug` cards supported; stored in existing `cards.portfolio` JSON payload; powered by `embla-carousel-react`.
- Components created:
  - `client/src/components/PhotoCarousel.tsx`: touch/swipe carousel, dot indicators, prev/next navigation, keyboard accessibility.
  - `client/src/components/GalleryLightbox.tsx`: full-screen modal lightbox, image containment, title and full description view, keyboard shortcuts (`Esc`, `ArrowLeft`, `ArrowRight`), slide counter.
- Updates:
  - `client/src/pages/PublicCard.tsx`: enhanced `PublicPortfolio` to filter photo items into `PhotoCarousel` with click-to-expand lightbox, while preserving non-image work items in the grid.
  - `client/src/pages/Home.tsx`: upgraded `PortfolioEditor` to support photo descriptions, inline description editing, and slide reordering (Move Up / Move Down).
  - `client/src/index.css`: tactile glassmorphic styling, responsive layout (mobile to desktop), fluid transitions, and reduced motion compliance.
  - `client/src/lib/card.test.ts`: added test suite for gallery items with descriptions.
  - `client/public/llms.txt`: updated AI discoverability content.
- Gates run: `tsc --noEmit`, `vitest run` (64/64 tests passed), `pnpm run build` (clean Vite + esbuild).


---

## 2026-09-26 — Buildme v4 run: premium landing-page templates for /c/:slug

### Design Read (confirmed via Grill Me)
Premium per-owner landing pages at `/c/:slug` for businesses, professionals and service providers, in an
**editorial-luxury** language (serif display type, generous whitespace, restrained color), on the existing
React 19 + Vite + tRPC + Drizzle stack. Owner picks a template, shows/hides and reorders sections, sets an accent,
and adds services with prices, hours + address, a primary CTA and stats. Existing cards default to Professional.
Ship live after gates pass.

### Contract (produced first, read by all units)
- `shared/pageConfig.ts`: `PageConfig`, `TEMPLATES`, `SECTION_IDS`, `SECTION_LABELS`, `PAGE_LIMITS`,
  `parsePageConfig`, `resolveSections`, `switchTemplate`, `defaultPageConfig`, `mapLink`, `readableOn`.
- Stored as JSON string in `cards.page` (`CardDraft.page`); empty = Professional default.

### Work units (one owner each)
| Unit | Owner | Files |
|---|---|---|
| Contract + data layer | main | shared/pageConfig.ts, schema, db ensureSchema, 0008 SQL, validation, card.ts, export, demo |
| Public landing templates | main | client/src/pages/PublicCard.tsx, client/src/components/CardLanding.tsx, `pl-*` rules in client/src/index.css |
| Builder page designer | subagent A | client/src/components/PageDesigner.tsx, client/src/components/pageDesigner.css, client/src/pages/Home.tsx (builder only) |
| Gates (slop → bugs → perf/a11y) | review subagents | read-only reports |

### Status
- [x] Contract + tests (server/pageConfig.test.ts)
- [x] Data layer (216 tests green)
- [x] Builder designer (subagent A): PageDesigner + helpers + tests
- [x] Public templates: CardLanding (container queries, 3 hero signatures, per-template section treatments)
- [x] Gates round 1: anti-slop PASS (conditional, 4 majors), bug hunt FAIL (1 P1 hidden-address leak, 8 P2), perf/a11y FAIL (CTA contrast 2.87:1, LCP 6.1s)
- [x] Fixes applied and re-verified: CTA 4.5:1+ (white on accent), ticket hidden with Visit, no 320px overflow, CardVisual chunk off public route, LCP 6.1s -> 5.5s local; 227 tests
- [ ] Deploy + post-launch smoke

### Open follow-ups
- LCP still > 2.5s on throttled mobile: client-rendered SPA + data round trip. Next: inline card JSON in the server-rendered /c/:slug HTML (type="application/json", CSP-safe) as query initialData, or prerender the hero.
- Guest (signed-out) builder preview shows no references (local-only references are not passed to the preview).
