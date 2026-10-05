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

---

## 2026-09-28 — Buildme run: monetization phases 0–5

### Design Read (confirmed via Grill Me)
Freemium billing, pricing, upgrade and billing screens for heyitsme.fyi professionals, in the existing Apple-glass
language (lilac paper, navy ink, violet/aqua/coral, DM Sans + Instrument Serif), on React 19 + tRPC + Drizzle/Supabase on Vercel.
Source spec: `D:\Downloads\heyitsmepayment.txt` (v1.0).

### Decisions
- D1: The free-only product rule is dropped. CLAUDE.md, PRODUCT.md, DESIGN.md and marketing copy are rewritten.
- D2: Checkout runs on the 2C2P hosted payment page (PGW v4.5, JWT HS256). Channels: Google Pay (`GOOGLEPAY`) and GCash (`DPAY`). All payment flags stay off until the owner confirms 2C2P capability for the merchant account.
- D3: Accounts listed in env `COMPLIMENTARY_EMAILS` get Pro + Teams entitlements with no expiry. The address is never in the repo.
- D4: Free = 1 card total. Cards above the limit stay usable and editable. Only new card creation is blocked.
- D5: Free limits are enforced only when `PLAN_LIMITS_ENABLED=true`, so users are never limited while checkout is off.
- D6: Monthly checkout is disabled until `GOOGLE_PAY_RECURRING_ENABLED=true`. Annual is a one-time charge that sets `currentPeriodEnd`.
- D7: A founding slot is taken only in the verified-payment transaction, by one conditional UPDATE on a single-row counter. A payer who loses the race still gets the paid term, without founding status.
- D8: Scope is spec phases 0–5. Teams, NFC store and admin screens come in a later run. Ship as branch + PR, no deploy, no migration applied.

### Work units (single owner each)
- Contract: `shared/plans.ts` (plans, prices in centavos, limits, entitlement resolver, period keys).
- Data: `drizzle/schema.ts`, `drizzle/0009_billing.sql`, `ensureSchema` in `server/db.ts`, `server/billing/*.ts`.
- Payments: `server/billing/provider.ts`, `server/billing/twoc2p.ts`, `server/billing/paymentRoutes.ts`.
- API: `billing` router, enforcement in `cards.create`, `publicCard.exchange`, `publicCard.bySlug`, `insights.summary`.
- UI: pricing page, upgrade dialog, billing view, plan badge, usage lines, locked insight ranges, public exchange pause.
- Copy/docs: landing, FAQ, terms, privacy, CLAUDE.md, PRODUCT.md, DESIGN.md, PROJECT_MEMORY.md, runbook.
- Gates: `pnpm check`, `pnpm test`, `pnpm build`, browser pass, anti-slop and a11y review.

### Result (2026-09-28)
- Gates: `pnpm check` clean, `pnpm test` 313 passed / 3 skipped, `pnpm build` clean. Public card chunk unchanged in size (payment code loads only in the workspace and on /pricing).
- Bug hunt (browser, local PGlite harness) found and fixed: B1 plan chips stretched on /pricing, B2 lost bullets on /pricing facts, B3 nav narrower than content on /pricing, B4 yearly savings showed the standard amount beside the founding price, B5 Pro chip stretched in the upgrade dialog, B6 check icon wrapped in the comparison table, B7 toggle caption contrast 4.4:1 (now 5.6:1), B8 Insights first requested a 30-day range the Free plan refuses, B9 `/app/billing` missing from the server SPA route list.
- Deviation from spec: no "Upgrade with Google Pay" button. The 2C2P hosted page shows the official wallet buttons; ours reads "Continue to secure checkout", because Google brand rules forbid custom Google Pay buttons and GCash is also offered.
- Skipped from spec in this run: NFC section on the landing page and /pricing (NFC store not built), Teams checkout, admin screens, monetization analytics events (the analytics table is per card), renewal reminder emails.

## 2026-10-04 — Buildme run: event landing page

### Design Read (confirmed via Grill Me and Brainstorming)
The public team event page (`/event/:slug`) becomes a full landing page in the Business card-template look
(`lx-` glass system, themes Tide / Sunset / Midnight, one accent), with event sections and the RSVP form as the last block.
Admins edit it in a new "Page" tab under Team > Events.

### Decisions
- D1: Same look as the Business card page, own component. `CardLanding.tsx` is not touched.
- D2: Sections: Details, Schedule, Speakers, Gallery, Sponsors, Questions and answers, Resource links. Each can be hidden and moved. RSVP is always last and cannot be hidden. A mobile dock holds the RSVP button.
- D3: Speakers (brainstorm approach A): one flat list, up to 12. Up to 3 can be "featured" (large block with photo and bio); the rest sit in a grid. A speaker is typed by hand or filled once from a team card, with an optional link to that card.
- D4: Look: card themes plus one accent. Accent falls back to the team brand color, then the theme accent. Old events keep their font and button color (now the accent); the old page background is not used.
- D5: Images only, capped (12 gallery photos, 12 sponsor logos, 3MB each). Stored under the event's own folder; the server refuses any image path outside it.
- D6: Hero extras: Add to calendar (Google link and .ics file), Directions, Share, Countdown.
- D7: Preview: `/event/:slug?preview=<workspaceId>-<eventId>`, team admins only, works for drafts, replies turned off.
- D8: v1 is flat. Phase 2: multi-day agenda, sponsor tiers, several speakers per agenda row.

### Work units (single owner each)
- Contract: `shared/eventPage.ts` (schema, limits, defaults, legacy mapping, section order, calendar and countdown helpers).
- Data: `workspaceEvents.page` jsonb, `drizzle/0022_event_page.sql`, `TEAM_EVENT_PAGE_SCHEMA_STATEMENTS`, `ensureSchema`.
- API: `server/teams/eventsRouter.ts` (`uploadImage`, `speakerCards`, `copyCardPhoto`, `savePage`, `preview`; `page` added to `get` and `publicEvent.get`).
- UI: `EventLanding.tsx`, `eventLanding.css`, `PublicEvent.tsx`, `EventPageEditor.tsx`, `TeamEvents.tsx`, `team.css`.
- Gates: `pnpm check`, `pnpm test`, `pnpm build`, browser pass, anti-slop and a11y review.

### Result (2026-10-04)
- Gates: `pnpm check` clean, `pnpm test` 496 passed (52 files), `pnpm build` clean. 18 new tests (`server/eventPage.test.ts`, `server/teams/teamEventPage.test.ts`).
- Browser pass on a throwaway in-process PGlite harness (deleted after): public page in all three themes at 1280 and 390 wide, calendar menu, gallery lightbox, FAQ, RSVP submit, mobile dock, draft preview, editor (open section, change theme, save). No console errors, no sideways scroll, no control under 44px in the new UI.
- Bug hunt found and fixed: B1 image path could contain `..` and climb out of the event folder (a later save could then delete another team's file); B2 the required mark on RSVP questions dropped to its own line; B3 link error text named https only while http is also accepted.
- Anti-slop: no banned words, no gradient text, no glass inside glass (rows inside panels are flat fills), reduced motion covered.
- Not done: real uploads were not exercised in the browser (the harness has no storage; covered by server tests with storage mocked). Post-launch monitor not run (nothing deployed).
- Known gap: an image uploaded in the editor but never saved stays in storage; no sweep covers event files yet.

## 2026-10-04 — Buildme run: event page phase 2

### Design Read
Same page, same `lx-` system. Three additions the owner deferred from v1: a schedule split by day, sponsors split by tier, and the speakers on each schedule row.

### Decisions
- D1: Days and tiers are lists of names on the page; a row holds the position of its name. No new table, no migration.
- D2: Speakers get a short random id so a schedule row can name them. The server assigns and repairs ids; the browser is not trusted.
- D3: Removing a day or tier moves its rows to the first one left. Nothing is deleted.
- D4: A day name is an h3 set larger than a row title; rows under it step down to h4. A tier name is a small label.
- D5: Only the first tier in the admin's list gets larger tiles.
- D6: The Day and Tier pickers appear on a row only when there are two or more to choose from.

### Work units
- Schema and helpers: `shared/eventPage.ts`.
- API: `savePage` in `server/teams/eventsRouter.ts` runs `normalizeEventPage`.
- UI: `EventLanding.tsx`, `eventLanding.css`, `EventPageEditor.tsx`, `team.css`.

### Result (2026-10-04)
- Gates: `pnpm check` clean, `pnpm test` 502 passed (52 files), `pnpm build` clean. 6 new tests.
- Browser pass on a throwaway in-process PGlite harness (deleted after), Tide theme, 1280 and 390 wide: day headings, row speakers, tiers, editor (remove a day, add a day, move a day, take a speaker off a row, add one, save), then the public page again. No console errors, no sideways scroll, no control under 44px.
- Bug hunt found and fixed: B1 the row-speaker list and group names lost their spacing to the `.lx ul` and `.lx h3` resets; B2 `.ev-agenda li` rules reached the nested speaker list.
- Anti-slop: no banned words, no gradient text, no glass inside glass.
- Not done: Sunset and Midnight not looked at for the new blocks; sponsor logos inside tiers not seen in a browser.

## 2026-10-04 — Buildme run: event builder

### Design Read
Owner: "i want it like the card builder interface when making the event". Same frame as the card builder: pinned toolbar with tabs and save actions, folds, live preview beside the form, Preview tab on phones, step buttons at the foot of each tab.

### Decisions
- D1: One builder for both making and editing an event. Owner did not confirm this scope.
- D2: Reuse the card builder's global classes; event-only rules live in `eventBuilder.css`. `Home.tsx` and `CardLanding.tsx` untouched.
- D3: One save covers details, page and RSVP form. No server change.
- D4: The preview is the real `EventLanding`, made inert, with the phone reply bar hidden.
- D5: Pictures wait until the event exists, because uploads need an event id.
- D6: The builder title is an h2; the team page already has the h1.

### Result (2026-10-04)
- Gates: `pnpm check` clean, `pnpm test` 502 passed (52 files), `pnpm build` clean. No new tests (client components are outside the vitest include).
- Browser pass on a throwaway PGlite harness (deleted after), 1280 and 390 wide. No console errors, no sideways scroll, no control under 44px.
- Bug hunt found and fixed: B1 publishing with no start date saved, then failed on the server with a 400; now stopped in the builder first. B2 tabs 40px and primary button 42px tall; now 44px.
- Not done: real image upload, Discard changes and the leave prompt not exercised in a browser. Committed `2d77a43`, merged to `main` as `aff0ec2` and pushed.

## 2026-10-04 — Buildme run: drag to reorder in the event builder

### Design Read
Owner: "i want this to be a drag and drop no arrow up and arrow down", with screenshots of the Page section tools and the RSVP question rows.

### Decisions
- D1: Every reorder in the event builder is a drag, not only the two in the screenshots. Owner did not confirm this scope.
- D2: Own small `SortList` on pointer events instead of framer-motion `Reorder`: section rows are keyed by position and re-made on every edit, and folds change height, which `Reorder` handles badly.
- D3: The grip is the keyboard alternative: up and down arrow keys, with a spoken position.

### Result (2026-10-04)
- Gates: `pnpm check` clean, `pnpm test` 502 passed (52 files), `pnpm build` clean. No new tests (client components are outside the vitest include).
- Browser pass on a throwaway PGlite harness (deleted after), 1280 and 390 wide. No console errors, no sideways scroll, no control under 44px, no arrow buttons left.
- Bug hunt found and fixed: B1 on phones the grip sat alone on a line above its row. B2 day name boxes squeezed on phones; Remove now wraps under.
- Not done: real finger drag on a phone not exercised.

## 2026-10-04 — Buildme run: card builder design parity in the event builder

### Design Read
Owner: "analyze whats missing in the design in the events builder thats present in the card builder then add it to the events builder". Compared `Home.tsx` `BuilderView` and `PageDesigner.tsx` with `EventBuilder.tsx` and `EventPageEditor.tsx`.

### Decisions
- D1: Only gaps the event page schema already supports are built. No server or schema change.
- D2: Reuse the card builder's global classes (`image-picker`, `pd-block-head`, `pd-accent`, `pd-swatch`, `icon-button`, `publish-copy-button`) with 44px overrides scoped to `.event-builder`. `Home.tsx` untouched; its `ImagePicker` is not exported, so the event builder has its own `EventImagePicker` with the same markup.
- D3: The copy-link button stays after publish, as on the card builder.

### Result (2026-10-04)
- Gates: `pnpm check` clean, `pnpm test` 504 passed (53 files), `pnpm build` clean. No new tests (client components are outside the vitest include).
- Browser pass on a throwaway PGlite harness (deleted after), 1280 and 390 wide. No console errors, no sideways scroll, no control under 44px.
- Bug hunt found and fixed: B1 an empty heading block left a double divider in Details; removed. B2 on phones the picture tile squeezed its text into a thin column; the text now wraps under a wide tile.
- Not done: template picker, photo shape, background photo, gradients, custom colors, QR styling, Google Reviews, branding toggle. Real upload into the tiles, publish from draft through the new button, and the live tab dot not exercised in a browser.

## 2026-10-04 — Buildme run: event page background image

### Design Read
Owner: "bellow the banner should be a upload background image option".

### Decisions
- D1: The background is a field of the page JSON, not a new column, so no migration and the existing file ownership check and cleanup cover it.
- D2: Drawn like the card page background (`lx-bg` with a veil of the theme's paper color), replacing the aurora.
- D3: Saved with the page on Save, not at once like the banner; the hint says so.

### Result (2026-10-04)
- Gates: `pnpm check` clean, `pnpm test` 505 passed (53 files), `pnpm build` clean. One new server test.
- Browser pass on a throwaway PGlite harness (deleted after), 1280 and 390 wide, upload mocked. No console errors, no sideways scroll, no control under 44px.
- Not done: real upload to storage and the Sunset and Midnight themes not exercised in a browser.

## 2026-10-04 — Buildme run: event page colors, QR look, animation, two-dimensional style

### Design Read
Owner: "add custom colors, QR styling and animation in the templates add an option for a Two-Dimensional Style website look". Read as the event builder's Design tab; not confirmed.

### Decisions
- D1: All four options live in the page JSON with defaults. No migration, older pages unchanged.
- D2: One shared function (`eventLook`) decides the drawn colors, so the builder preview, the public page and the tests agree. Unreadable picks are replaced, never drawn, and the builder says which.
- D3: The QR code falls back to black on white when the picked pair could fail to scan. Corner squares stay square with rounded dots.
- D4: "Two-dimensional" is a page style beside Glass, not a fourth theme, so it works with every theme and color.
- D5: Animation has three levels. The device's reduced-motion setting still wins.
- D6: No plan gating added. Events have no entitlements; billing untouched. Left for the owner.

### Result (2026-10-04)
- Gates: `pnpm check` clean, `pnpm test` 517 passed (54 files), `pnpm build` clean. Twelve new tests.
- Browser pass on a throwaway PGlite harness (deleted after), 1280 and 390 wide. No console errors, no sideways scroll, no control under 44px.
- Not done: real phone scan of a styled code, Sunset with the flat style, background image together with own colors.

## 2026-10-04 — Buildme run: Teams capability for event colors and QR styling

### Design Read
Owner: "custom colors/QR build", then chose "New Teams capability" when asked what the gate should be.

### Decisions
- D1: `canStyleEventPages` joins the Teams capabilities and is resolved on the server only.
- D2: A launch flag (`TEAM_EVENT_STYLING_ENABLED`, on by default) makes the capability switchable today. Per-workspace switching needs a column; left for later.
- D3: Covers custom colors and the QR look, the two things named. Style and animation stay open.
- D4: Off never deletes: saved looks stay live, only new picks are refused, reset is allowed.

### Result (2026-10-04)
- Gates: `pnpm check` clean, `pnpm test` 519 passed (54 files), `pnpm build` clean. Two new tests.
- Browser pass on a throwaway PGlite harness (deleted after) with the flag off, 1280 and 390 wide. No console errors, no sideways scroll.
- Not done: per-workspace switch, an admin screen for it.

## 2026-10-05 — Buildme run: event QR logo upload

### Design Read
Owner: "in the events builde add a option to add and upload a logo to the qr code".

### Decisions
- D1: The logo is stored on the event page as `qr.logoUrl`, uploaded through the existing `teamEvents.uploadImage`.
- D2: It counts as QR styling, so the existing Teams capability covers it. No new flag.
- D3: Without an event logo the code keeps using the company logo from Brand.

### Result (2026-10-05)
- Gates: `pnpm check` clean, `pnpm test` 520 passed (54 files), `pnpm build` clean. One new test.
- Browser pass on a throwaway PGlite harness (deleted after), 1280 and 390 wide. No console errors, no sideways scroll.
- Not done: cropping or resizing the logo in the builder; it is fitted into a square as uploaded.

## 2026-10-05 — Buildme run: event QR logo, card-builder style

### Design Read
Owner: "i ment i want to upload my logo and integrate it to the qr like the card builder".

### Decisions
- D1: Reuse the card builder's QR editor layout and its "Center logo" row, wording included, in the event Design tab.
- D2: Offer the heyitsme icon as the card builder does; it is stored as `/favicon.svg`, never as an uploaded file.
- D3: The card builder's Frame and Caption selects are not copied: events already have a frame color and the caption is set in Share.

### Result (2026-10-05)
- Gates: `pnpm check` clean, `pnpm test` 520 passed (54 files), `pnpm build` clean.
- Browser pass on a throwaway PGlite harness (deleted after), 1280 and 390 wide. No console errors, no sideways scroll.
- Not done: uploading a logo before the event exists.

## Run: event QR caption field (branch `feat/event-qr-caption`)

### Design Read
Owner: "i want an option to edit this" (the line under the event QR code).

### Decisions
- D1: One saved text field, "Line under the code", in the Design tab QR block, next to the other QR settings. Replaces D3 of the previous run.
- D2: 24 characters at most so the line fits the frame; empty falls back to "Scan to view event".
- D3: Share keeps its own field, pre-filled from the saved line, for a one-off download.

### Result (2026-10-05)
- Gates: `pnpm check` clean, `pnpm test` 521 passed (54 files), `pnpm build` clean.
- Browser pass on a throwaway PGlite harness (deleted after), 1280 and 390 wide. No console errors, no sideways scroll, no control under 44px.
