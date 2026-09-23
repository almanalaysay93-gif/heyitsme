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
