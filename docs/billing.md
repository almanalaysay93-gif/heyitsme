# Billing and Pro launch

Free is PHP 0 forever: one card, 10 contact exchanges per calendar month in Asia/Manila, seven-day analytics and heyitsme branding. Pro is PHP 299/month: five cards, unlimited exchanges, 365-day analytics, premium design, branded QR, QR campaigns, contact management and CSV export.

`shared/plans.ts` owns prices, limits and capability flags. New checkout accepts only `pro`, `monthly` and an enabled payment channel. The server charges 29900 PHP centavos. Browser amounts and extra checkout fields are rejected.

## Launch flags

Design, QR campaigns and advanced analytics default on for this release. Payments and plan limits default off until merchant checkout is verified. Explicit environment values override these defaults. The browser reads public flags through billing endpoints.

| Variable | Effect |
|---|---|
| `PAYMENTS_ENABLED` | Opens verified 2C2P checkout. |
| `PLAN_LIMITS_ENABLED` | Enforces one/five-card limits, Free monthly quota and analytics retention access. |
| `PRO_DESIGN_ENABLED` | Enables Pro design and advanced QR writes. Paid entitlement is still required. |
| `QR_CAMPAIGNS_ENABLED` | Enables campaign creation and scan recording. Creation requires Pro and an owned card. |
| `PRO_ANALYTICS_ENABLED` | Enables additional charts and campaign analytics for Pro. |
| `GOOGLE_PAY_ENABLED`, `GCASH_ENABLED` | Enables the corresponding hosted checkout channel. |
| `TEAMS_BILLING_ENABLED` | Sells Teams at checkout. Needs `TEAMS_ENABLED`, `PAYMENTS_ENABLED` and a payment channel. Default off. |
| `PAYMENT_PROVIDER_ENV` | Defaults to sandbox. Set production only after sandbox verification. |
| `PAYMENT_GATEWAY_MERCHANT_ID`, `PAYMENT_GATEWAY_SECRET` | Server-only 2C2P credentials. |
| `COMPLIMENTARY_EMAILS` | Preserves the existing owner/admin complimentary entitlement. |

The existing adapter sells a monthly access period. Renewal is manual through Billing. No automatic recurring debit is scheduled. Subscription cancellation keeps access through the paid period. Historical payment records still settle against their stored amount and billing term.

## Teams plan

Teams is bought for a team, not for an account. `TEAMS_PLAN` in `shared/plans.ts` holds the price and the seats: PHP 1,499 a month for each team, 10 seats included. Change the price there and nowhere else. More seats are set by heyitsme staff for a team. They are not sold at checkout.

While `TEAMS_BILLING_ENABLED` is off, starting a team is free and the team has no end date. Turning it on changes only teams started after that:

1. `teams.create` makes the team unpaid: its plan date is the moment it was made, so it can be viewed but not changed.
2. The owner pays from the Billing page or the team's Billing tab. `billing.createTeamCheckout` takes a team id and a channel, checks ownership, and charges the server's price. The payment row has `purpose` and `planCode` `teams`, and names the team in `metadataJson`.
3. Settlement follows the same rules as Pro: signed callback, direct inquiry, amount and currency compared to the stored row, settled once. It moves the team's plan date on one month, from its current end if still running, from today if not. Seats are raised to the included number, never lowered. The team's activity log records `plan.paid`.

A team with no end date is free for good. Checkout refuses it, and settlement never gives it an end date. Renewal is manual. A lapsed team is read-only and nothing is deleted. A Teams payment does not change the owner's personal plan. No schema change was needed.

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
