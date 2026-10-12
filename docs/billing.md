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
| `CRON_SECRET` | Shared with Vercel Cron for the daily plan run. Empty: the run is refused, so no notices are sent and free teams keep no end date. |
| `PAYMENT_PROVIDER_ENV` | Defaults to sandbox. Set production only after sandbox verification. |
| `PAYMENT_GATEWAY_MERCHANT_ID`, `PAYMENT_GATEWAY_SECRET` | Server-only 2C2P credentials. |
| `COMPLIMENTARY_EMAILS` | Preserves the existing owner/admin complimentary entitlement. |

The existing adapter sells a monthly access period. Renewal is manual through Billing. No automatic recurring debit is scheduled. Subscription cancellation keeps access through the paid period. Historical payment records still settle against their stored amount and billing term.

## Holds

Owner decision, 2026-10-06. A hold pauses what a plan paid for once the plan has ended and `HOLD_GRACE_DAYS` (3) have passed. Nothing is deleted, and paying lifts the hold at once. Holds are worked out from the dates on every request (`server/billing/hold.ts`, `teamHeld` in `server/teams/entitlements.ts`). There is no stored flag to get out of step.

**Personal cards.** A card is on hold when its owner had a paid plan (a subscription that was paid, or a plan override that expired), the plan ended 3 or more days ago, the account is on Free now, and the card still uses a Pro feature: a custom accent color, a Pro design, a Pro QR style or hidden branding. While `PLAN_LIMITS_ENABLED` is on, more than 2 photos and every card after the owner's oldest also count. An owner who never paid is never put on hold. Complimentary accounts are never put on hold. QR campaigns and Google review pages alone do not put a card on hold.

On hold, `publicCard.bySlug`, `review` and `exchange` answer `FORBIDDEN` with `PAUSED_MESSAGE`, the contact file and QR image answer 404, the card page is served without the card's name or photo, and no view is counted. The visitor sees a paused page. The owner sees, on every workspace page, which cards are paused and what each one uses (`billing.me.cardHolds`), with a Renew Pro button. Taking the Pro features off a card brings it back without paying.

**Teams.** Teams has no free tier once `TEAMS_BILLING_ENABLED` is on. A team never paid for is on hold from the start. A team whose plan ran out is read-only for 3 days, then on hold. On hold: its company cards, event pages, RSVP forms and review pages are paused, and every Team call answers `FORBIDDEN` with `TEAM_HOLD_MESSAGE`, downloads included. Only the calls marked `whileHeld` still work: `teams.get`, `teams.billing`, closing, removing a person, leaving. Paying (`billing.createTeamCheckout`) is outside the Team procedures and is never blocked. Members see a hold screen with a Leave button. The owner sees the same screen with the Pay buttons.

**The daily run.** `GET /api/cron/plans` runs once a day from Vercel Cron (`vercel.json`), guarded by `CRON_SECRET`. Without the secret set it refuses every call. It does three things, each at most once:

1. While Teams is sold, a team with no end date gets one `FREE_TEAM_NOTICE_DAYS` (14) away, and its owner is emailed. Its hold then starts 3 days after that date.
2. A team whose plan ended in the last 3 days: one email to its owner with the hold date.
3. An account whose paid Pro ended in the last 3 days: one email with the hold date. A plan override that expires sends no email.

Sent notices are remembered as `appSettings` rows named `notice:<kind>:<id>:<end time>`.

Staff note: `teams.adminSetPlan` with an empty date no longer means free forever while Teams is sold. The next daily run gives that team a date 14 days away. To give a team free time, set a far date.

## Teams plan

Teams is bought for a team, not for an account. `TEAMS_PLAN` in `shared/plans.ts` holds the price and the seats: PHP 1,499 a month for each team, 10 seats included. Change the price there and nowhere else. More seats are set by heyitsme staff for a team. They are not sold at checkout.

While `TEAMS_BILLING_ENABLED` is off, starting a team is free and the team has no end date. Turning it on makes Teams paid for every team. Teams that already exist get 14 days of notice from the daily run (see Holds). For a team started after that:

1. `teams.create` makes the team unpaid: its plan date is the moment it was made, so it is on hold until it is paid (see Holds).
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
