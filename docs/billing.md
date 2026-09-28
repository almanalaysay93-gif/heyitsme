# Billing and paid plans

This document describes the paid-plan system and the steps to switch it on.
The source specification is `heyitsmepayment.txt` v1.0 (phases 0 to 5).
Teams workspaces, the NFC store and admin screens are not built yet.

## Plans

| Plan | Price (PHP) | Cards | New leads | Insights | Branding |
|---|---|---|---|---|---|
| Free | 0 | 1 | 10 a month | 7 days | Shown |
| Pro | 149/month or 1,290/year | 3 | Unlimited | 365 days | Removable |
| Pro, founding | 99/month or 999/year | 3 | Unlimited | 365 days | Removable |
| Teams | 499/month or 4,990/year, 5 seats | 3 (seat rules come with the Teams build) | Unlimited | 365 days | Removable |

`shared/plans.ts` holds every price and limit.
The server resolves prices from plan and cycle codes only.
The browser never sends an amount.

## Feature flags

All flags are server environment variables.
None of them use a `VITE_` prefix.
The browser reads the non-secret flags through `billing.offer` and `billing.me`.

| Variable | Default | Effect |
|---|---|---|
| `PLAN_LIMITS_ENABLED` | `false` | Turns on the Free limits: 1 card, 10 leads a month, 7 days of insights. |
| `PAYMENTS_ENABLED` | `false` | Opens checkout. |
| `GOOGLE_PAY_ENABLED` | `false` | Offers Google Pay (2C2P channel `GOOGLEPAY`). |
| `GCASH_ENABLED` | `false` | Offers GCash (2C2P channel `DPAY`). |
| `GOOGLE_PAY_RECURRING_ENABLED` | `false` | Allows monthly checkout. Keep it off until 2C2P confirms recurring billing for the merchant account. |
| `TEAMS_ENABLED` | `false` | Allows Teams checkout. Keep it off until the Teams build ships. |
| `NFC_STORE_ENABLED` | `false` | Reserved for the NFC store build. |
| `FOUNDING_MEMBER_OFFER_ENABLED` | `true` | Offers the founding price while slots remain. |
| `PAYMENT_PROVIDER` | `2c2p` | The only adapter so far. |
| `PAYMENT_PROVIDER_ENV` | `sandbox` | Set `production` for the live 2C2P gateway. |
| `PAYMENT_GATEWAY_MERCHANT_ID` | empty | 2C2P merchant ID. |
| `PAYMENT_GATEWAY_SECRET` | empty | 2C2P merchant secret key. Server only. |
| `GOOGLE_PAY_MERCHANT_ID`, `GOOGLE_PAY_MERCHANT_NAME`, `GOOGLE_PAY_ENV` | empty, `heyitsme`, `TEST` | Reserved for an on-page Google Pay button. The 2C2P hosted page does not need them. |
| `COMPLIMENTARY_EMAILS` | empty | Comma-separated Google account emails that get every feature with no plan and no end date. |

Keep `PLAN_LIMITS_ENABLED` off while `PAYMENTS_ENABLED` is off.
If limits are on and checkout is off, Free users meet limits with no way to upgrade.

## Payment flow

1. The signed-in user picks a cycle and a payment method in the upgrade dialog.
2. `billing.createCheckout` receives `planCode`, `billingCycle` and `channel` only.
3. The server quotes the price, including founding eligibility, and stores a `payments` row with status `created`.
4. The server asks 2C2P for a payment token (`/payment/4.5/paymentToken`, JWT HS256).
5. The browser goes to the 2C2P hosted page, which shows the official Google Pay and wallet buttons.
6. 2C2P posts a signed result to `/api/payments/2c2p/callback`.
7. The server verifies the signature and the merchant ID, then asks 2C2P directly (`/payment/4.5/paymentInquiry`).
8. `settlePayment` applies the inquiry result in one transaction. It locks the payment row, so a repeated callback changes nothing.
9. The browser returns to `/api/payments/2c2p/return`, which only redirects to `/app/billing?payment=<invoice>`.
10. The billing page polls `billing.paymentStatus`, which can also ask 2C2P directly while the payment is pending.

A browser return never grants a plan.
Only a verified gateway result with the quoted amount and currency activates Pro.

## Founding members

The `offerCounters` row `founding_pro` holds `used` and `maximum` (500).
A slot is taken only inside the settlement transaction, by one conditional `UPDATE ... WHERE used < maximum`.
A buyer who pays the founding price after the last slot is gone keeps the paid term without founding status.
A lapsed founding member pays the standard price on a new subscription.

## Lead quota

The Free quota is 10 new leads per calendar month in Asia/Manila time.
`reserveLead` takes one lead in a single `INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit` statement.
The exchange procedure reserves a lead before it saves the visitor's details.
If the save fails, the lead goes back to the quota.
At the limit, `publicCard.bySlug` returns `acceptsDetails: false`, and the public page hides the exchange form.
Visitors still see Save contact, the QR code and the owner's links.

## Downgrade rules

Cancel sets `cancelAtPeriodEnd`. Pro stays on until `currentPeriodEnd`.
An expired plan returns the account to Free.
No card, contact, reference or analytics row is deleted.
Cards above the Free limit stay live and editable. Only new card creation is blocked.
A card that already hides branding keeps it after a downgrade. Turning it on again needs Pro.

## Activation checklist

1. Apply `drizzle/0009_billing.sql` in the Supabase SQL Editor, or let `ensureSchema` create the tables on first use.
   A Vercel preview deploy of this branch also runs `ensureSchema` on the Preview `DATABASE_URL`. The PR #1 preview did this on 2026-09-28, and the owner kept the tables.
2. Run the RLS check in `docs/database.md` and confirm the six billing tables show `true`.
3. Set `COMPLIMENTARY_EMAILS` for the owner account.
4. Get 2C2P sandbox credentials. Set `PAYMENT_GATEWAY_MERCHANT_ID` and `PAYMENT_GATEWAY_SECRET` with `PAYMENT_PROVIDER_ENV=sandbox`.
5. Confirm with 2C2P that Google Pay and GCash (`DPAY`) are active for PHP on the merchant account.
6. In 2C2P, set the backend notification URL to `https://heyitsme.fyi/api/payments/2c2p/callback`.
7. Turn on `PAYMENTS_ENABLED` and `GOOGLE_PAY_ENABLED` on a preview deployment. Run one sandbox payment end to end.
8. Write the refund policy in `client/src/pages/Legal.tsx` and `client/src/pages/Info.tsx`. Both files mark the gap with `[Owner: ...]`.
9. Switch to production credentials and `PAYMENT_PROVIDER_ENV=production`.
10. Turn on `PLAN_LIMITS_ENABLED` only after a production payment succeeds.

## Open items

- Monthly billing needs 2C2P recurring payments for the channel. The adapter refuses it until then.
- Refunds run from the 2C2P merchant portal. The adapter has no refund call.
- There is no renewal reminder email or expiry job yet. Access ends on `currentPeriodEnd` without a job, because entitlements read the date directly.
- The card-creation advisory lock is not tested against parallel Postgres sessions. PGlite has one connection.
- Assumption: channel `DPAY` lists GCash for PHP on the hosted page. 2C2P must confirm it.
- 2026-09-28 sandbox check: the public demo merchant `JT01` with its published SHA key returns `9042 Invalid Request`, also for the documented sample request.
- Our JWT signing is byte-identical to the sample token in the 2C2P JWT docs, so the adapter signs correctly. Merchant sandbox keys must come from 2C2P.
- The 2C2P Philippines test page lists test cards and a GrabPay wallet only. It lists no GCash or Google Pay test account.
