# heyitsme

A free digital business card and professional presence MVP built as a standalone React + tRPC web app. The product focuses on the card builder, browser-first public card, QR/link sharing, contact exchange, and a personal contact list.

## Run locally

```bash
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm check
pnpm test
pnpm build
```

## Backend

The project uses the initialized fullstack runtime database for its working server-side path. The schema and tRPC procedures are intentionally shaped around the Supabase entities described in `PRODUCT.md`, so the data layer can be moved to an active Supabase project without changing the core UI contract.

The currently connected Supabase project is inactive and did not provide a usable publishable key during this build. No fake Supabase connection is claimed in the product UI.

## Plans

Free includes one card, 10 contact exchanges per calendar month and 7-day analytics. Pro costs PHP 299/month and includes five cards, unlimited exchanges, premium design, advanced QR, campaigns, CRM export and 365-day analytics. See `docs/billing.md` for launch flags and payment verification.
