# Billing and Pro launch

Free is PHP 0 forever: one card, 10 contact exchanges per calendar month in Asia/Manila, seven-day analytics and heyitsme branding. Pro is PHP 299/month: five cards, unlimited exchanges, 365-day analytics, premium design, branded QR, QR campaigns, contact management and CSV export.

`shared/plans.ts` owns prices, limits and capability flags. New checkout accepts only `pro`, `monthly` and an enabled payment channel. The server charges 29900 PHP centavos. Browser amounts and extra checkout fields are rejected.

## Launch flags

All new flags default off. The browser reads public flags through billing endpoints.

| Variable | Effect |
|---|---|
| `PAYMENTS_ENABLED` | Opens verified 2C2P checkout. |
| `PLAN_LIMITS_ENABLED` | Enforces one/five-card limits, Free monthly quota and analytics retention access. |
| `PRO_DESIGN_ENABLED` | Enables Pro design and advanced QR writes. Paid entitlement is still required. |
| `QR_CAMPAIGNS_ENABLED` | Enables campaign creation and scan recording. Creation requires Pro and an owned card. |
| `PRO_ANALYTICS_ENABLED` | Enables additional charts and campaign analytics for Pro. |
| `GOOGLE_PAY_ENABLED`, `GCASH_ENABLED` | Enables the corresponding hosted checkout channel. |
| `PAYMENT_PROVIDER_ENV` | Defaults to sandbox. Set production only after sandbox verification. |
| `PAYMENT_GATEWAY_MERCHANT_ID`, `PAYMENT_GATEWAY_SECRET` | Server-only 2C2P credentials. |
| `COMPLIMENTARY_EMAILS` | Preserves the existing owner/admin complimentary entitlement. |

The existing adapter sells a monthly access period. Renewal is manual through Billing. No automatic recurring debit is scheduled. Subscription cancellation keeps access through the paid period. Historical payment records still settle against their stored amount and billing term.

## Verification and migration

1. Apply billing migration `drizzle/0009_billing.sql` and Pro tools migration `drizzle/0010_pro_tools.sql` in staging. Runtime schema setup is idempotent. Apply RLS as the table owner and verify `qrCampaigns` has RLS enabled without public policies.
2. Enable design/campaign/analytics flags on staging and grant a test Pro entitlement.
3. Verify Free cannot save premium designs, create card two, export CSV, edit CRM metadata or read long analytics ranges. Existing cards above plan limits stay live and editable.
4. Confirm Google Pay / GCash availability for PHP with the merchant. Verify one sandbox checkout and signed callback, failed payment, duplicate callback and amount mismatch.
5. Enable payment channels in production only after merchant verification. Enable plan limits after checkout succeeds.

The callback is a hint, never proof of payment. The server checks the callback signature and merchant, queries 2C2P directly, compares amount/currency to the stored invoice and settles idempotently. Browser returns never grant Pro.

Visual configuration lives in existing `cards.page` JSON. Server validation checks allowed fonts/animations/colors, contrast, QR contrast and entitlement changes. Existing premium settings can be retained on an unchanged card after downgrade. New premium changes require Pro. Campaign scans store campaign/card/time without visitor identifiers.

CSV export queries only the authenticated owner's contacts and escapes spreadsheet formulas. Contact statuses are New, Contacted, Follow-up, Converted and Archived. Public QR links retain `/c/:slug` with a `campaign` query parameter.

Run `pnpm check`, `pnpm test` and `pnpm build` before release. Unit/integration verification uses PGlite and a fake gateway. A live merchant payment remains a separate launch requirement.
