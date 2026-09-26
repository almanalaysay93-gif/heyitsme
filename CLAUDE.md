# CLAUDE.md - heyitsme Engineering Instructions

## Project Overview
- **Repository**: `heyitsme` (free digital business card platform)
- **Path**: `D:\ai mem\heyitsme`
- **Current State**: Phase 1 (T01–T10) & Phase 2 (T11–T20) completed by Antigravity.
- **Your Mission**: Execute Phase 3 (T21–T25), Phase 4 (T26–T30), and Phase 5 (T31).
- **Core Plan**: `D:\download\heyitsme-antigravity-fix-and-improvement-plan.md`
- **Unified Memory**: Read `PROJECT_MEMORY.md` before starting any work. Update it after each phase milestone.

## Strict Product & Architectural Rules
1. **100% Free Product Model**: Zero billing, subscriptions, paywalls, or feature gating. Do NOT introduce Stripe, LemonSqueezy, or paid tiers.
2. **Stack Preservation**: React 19, Vite 7, tRPC 11, Drizzle ORM, PostgreSQL (Supabase), Radix UI, Tailwind CSS, Framer Motion.
3. **Verification**: Run `pnpm check`, `pnpm test`, and `pnpm build` after every task/milestone. Keep all 166+ tests passing.
4. **Caveman Mode**: Terse, fragment-based responses. High signal, low token overhead. Drop pleasantries.

## Remaining Roadmap

### Phase 3: Advanced Features & Refinements (T21–T25)
- **T21**: Slug Quality & Preservation (`server/routers.ts`, `server/db.ts`, `drizzle/schema.ts`, `server/_core/seo.ts`). Use validated display name prefix + random suffix. Do not rename existing published slugs.
- **T22**: Data Export / Card Recovery (`client/src/pages/Home.tsx`, `client/src/lib/cardKit.ts`, `server/routers.ts`, `server/db.ts`). Add authenticated JSON card export with full fields and portfolio metadata.
- **T23**: Digital Wallet Sharing (`client/src/components/ShareSheet.tsx`). Evaluate Apple/Google Wallet requirements; document credential prerequisites.
- **T24**: Storage Cleanup Sweep (`server/uploadSweep.ts`, `server/storage.ts`). Verify automated sweep of unlinked uploads past grace period.
- **T25**: Accessibility & Color Contrast (`client/src/index.css`, `client/src/components/CardVisual.tsx`). WCAG AA compliance across Midnight, Tide, Sunset themes and high-contrast toggle.

### Phase 4: Production Hardening & Operations (T26–T30)
- **T26**: Security headers (CSP, HSTS, X-Content-Type-Options) in `vercel.json` & Express, rate limiting audit.
- **T27**: Client error telemetry & crash reporting sanitization (`/api/client-error`).
- **T28**: Supabase RLS documentation & migration guide (`drizzle/0003_enable_rls.sql`).
- **T29**: Performance profiling & Web Vitals audit (chunks, compression, font display).
- **T30**: Full E2E & integration verification across guest draft -> OAuth -> publish -> exchange -> export.

### Phase 5: Final Documentation & Launch Handover (T31)
- **T31**: Operational runbook, environment variable checklist, and deployment docs.
