# Frontend Architecture Recommendation — heyitsme MVP

## Scope

Phase 1 only: email auth, multi-card builder, public browser card, QR/share helpers, contact save/exchange, personal contacts with notes/tags/search/CSV export, and minimal `view`/`save` events. All implemented features are free. No billing, upgrades, paid limits, teams, CRM, NFC hardware, native apps, or advanced analytics. This follows `/home/ubuntu/upload/pasted_content.txt` lines 495–615 and `/home/ubuntu/heyitsme/ORCHESTRATOR.md` lines 7–32.

The current app is a Vite/React app using Wouter in `/home/ubuntu/heyitsme/client/src/App.tsx`; the backend currently exposes auth-only tRPC in `/home/ubuntu/heyitsme/server/routers.ts` and a users-only Drizzle/MySQL schema in `/home/ubuntu/heyitsme/drizzle/schema.ts`. Supabase is the requested target, but the connected project is inactive. Keep UI/data access behind typed API boundaries so Supabase can be wired without putting credentials or persistence logic in components.

## Recommended structure

```text
client/src/
  App.tsx
  lib/{api,auth,routes,validators}.ts
  layouts/{MarketingLayout,AppLayout,PublicCardLayout}.tsx
  components/
    auth/{AuthGate,AuthForm}.tsx
    cards/{CardPreview,CardFieldForm,CardListItem,ThemeEditor,LinksEditor,PublishStatus,ShareSheet,QrCodePanel}.tsx
    contacts/{ContactForm,ContactTable,ContactFilters,ContactExportButton}.tsx
    public-card/{PublicCard,ExchangeForm}.tsx
  pages/
    marketing/{Home,FeaturesDigitalCards,FeaturesShare,FeaturesNfcQr,FeaturesContacts,FeaturesAnalytics,SolutionsEventRoi,SolutionsBrandAtScale,Pricing,About,FAQ,Security,GettingStarted}.tsx
    auth/{Login,Signup}.tsx
    app/{Dashboard,Cards,CardNew,CardEdit,CardShare,Contacts,ProfileSettings}.tsx
    public/PublicCardPage.tsx
```

Keep `App.tsx` as provider/error-boundary/router composition. Move route implementations out of it. The existing Wouter dependency is sufficient; do not introduce another router. Put path constants and safe `id`/`slug` builders in `client/src/lib/routes.ts`.

## Routes

Use shared `MarketingLayout` for `/`, `/features/digital-cards`, `/features/share`, `/features/nfc-qr`, `/features/contacts`, `/features/analytics`, optional `/solutions/event-roi`, `/solutions/brand-at-scale`, `/pricing`, `/about`, `/faq`, `/security`, and `/getting-started`. Pricing must say everything implemented is free forever; never show checkout, billing, plan comparisons, or upgrade CTAs. `/login` and `/signup` are email-only; Google/Microsoft SSO is later.

Wrap `/app`, `/app/cards`, `/app/cards/new`, `/app/cards/:id/edit`, `/app/share/:cardId`, `/app/contacts`, and `/app/settings/profile` with `AuthGate` and `AppLayout`. Redirect unauthenticated users to `/login?next=...`, then return after auth. `/app` summarizes cards, recent contacts, and optional compact view/save counts. Cards must support multiple records, independent editing, publish/unpublish, and sharing. `/app/cards/new` and `:id/edit` share one editor implementation. The share route provides canonical public URL, copy, QR, SMS, and email helpers. Contacts provides search/filter, tags, notes, edit, and CSV export. Profile is basic account data plus an always-free label; do not expose a paid plan field.

Keep `/c/:slug` outside the auth shell. `PublicCardPage` fetches only a published card, renders a mobile-first `PublicCard`, records a `view`, and offers Save Contact plus a simple exchange form. Recipients need no account or app install. Record `save` only after successful save/exchange. Not-found and unpublished responses should not reveal owner data.

## State boundaries

Use one current-user/auth query at the app root. Use TanStack Query through tRPC (or a Supabase adapter) for server state; invalidate list/detail queries after mutations. Keep modal state, selected card, filters, editor step, dirty flags, and toasts local. Do not put form fields in global state.

The card editor should use `react-hook-form` and Zod (already in `/home/ubuntu/heyitsme/package.json`). Keep one typed draft containing display name, title, contact fields, links, theme, logo URL placeholder, media placeholders, slug, and published state. `CardPreview` derives from that draft and is never a second source of truth. Save draft and publish are separate explicit mutations: editing must not expose an unfinished card. On publish, navigate to `/app/share/:cardId`. Validate slug uniqueness server-side; client checks are advisory. Keep logo/media as placeholders or URLs unless existing storage is actually configured.

`ShareSheet` and `QrCodePanel` are presentational. Use Clipboard API with a fallback and URL-encode `sms:?body=` and `mailto:?subject=&body=` links. Do not generate a misleading QR for an unpublished card. `ExchangeForm` owns local validation and requires a name plus email or phone, then resets to a success state. Contacts owns filter state and composes table/filter/edit components; owner scoping must be backend-enforced.

## Backend/Supabase touchpoints

Suggested phase-1 tables: `profiles` (auth user id, name, email, preferences, timestamps); `cards` (owner id, display name, title, contact fields JSON, links JSON, theme JSON, logo/media placeholders, unique slug, public URL/QR payload, published, timestamps); `contacts` (owner id, contact fields, tags, notes, source, timestamp); and `analytics_events` (card id, `view`/`save`, metadata, timestamp). Enable RLS: owners can CRUD their records; public card reads are published-only; public exchange uses a narrow server procedure/edge function that resolves a published slug to its owner and inserts a contact without accepting arbitrary owner IDs. Public analytics writes should likewise use a narrow endpoint, not broad table insert permissions. Service-role keys stay server-only.

Expose typed operations, whether through `server/routers.ts` or a Supabase adapter:

```text
auth.me, auth.logout
profile.get, profile.update
cards.list, cards.getOwned(id), cards.getPublishedBySlug(slug)
cards.create(input), cards.update(id, patch), cards.publish(id, published)
contacts.list({search, tag}), contacts.update(id, patch), contacts.createManual(input)
contacts.exchangeFromPublicCard({slug, payload}), contacts.export()
analytics.recordPublicEvent({slug, type}), analytics.summaryForOwnedCards()
```

Every owner query derives `userId` from server auth context, never a client-supplied owner id. If Supabase Auth replaces the current auth, translate `supabase.auth.getUser()` into the existing `ctx.user` shape in one adapter. If Supabase remains unavailable, extend the existing protected tRPC pattern and document the environment limitation rather than pretending persistence succeeded. `/home/ubuntu/heyitsme/server/db.ts` currently depends on `DATABASE_URL` and has an explicit feature-query TODO, making this boundary important.

## Loading, accessibility, and acceptance

Use route-level skeletons, distinct auth/loading/not-found/unpublished/error states, retryable mutation errors that preserve drafts, keyboard focus, and reduced-motion fallbacks. Browser-only Clipboard, QR, and export code must run in effects/event handlers. Marketing pages must not fetch authenticated data.

Acceptance: a user can create two cards, publish one, open `/c/:slug` without login, use QR/copy/SMS/email helpers, save/exchange a contact, see it in contacts with search/tags/notes/export, and record view/save events. No paywall, upgrade, checkout, paid comparison, unsupported certification, or later-module UI should appear. Defer teams, templates, CRM, signatures, backgrounds, NFC, wallets, scanners, enrichment, SSO, directory sync, lead forms beyond simple exchange, and detailed analytics.

## References

* `/home/ubuntu/upload/pasted_content.txt` lines 94–364, 432–615: entities, MVP modules, routes, flows, and phase-1 done criteria.
* `/home/ubuntu/heyitsme/ORCHESTRATOR.md` lines 7–44: confirmed decisions, scope, and expected files.
* `/home/ubuntu/heyitsme/client/src/App.tsx` lines 1–42: current Wouter routing/providers.
* `/home/ubuntu/heyitsme/drizzle/schema.ts` lines 1–28, `/home/ubuntu/heyitsme/server/db.ts` lines 1–92, `/home/ubuntu/heyitsme/server/routers.ts` lines 1–28: current backend extension points.

> **Principle:** React owns composition, draft/UI state, and presentation; the backend owns identity, ownership, slug uniqueness, publication visibility, contact capture, and event writes.
