# Apple & Google Wallet passes (T23) — not shipped, prerequisites only

Status: **blocked on provider credentials.** No wallet code or button ships until the items below exist.
The share sheet keeps QR, link, SMS, email and `.vcf` as the sharing paths.

Re-check both vendors' current docs when this is picked up; requirements change.

## What a pass would contain
- Owner's display name (and title if set) plus a QR code for the stable `https://heyitsme.fyi/c/<slug>` URL.
- No email, phone or other contact PII on the pass. The QR resolves through the normal public-card lookup,
  so an unpublished or deleted card stops resolving even if an old pass stays on a phone.
- Slugs never change after creation (T21), so a pass never needs reissuing because of a rename.

## Apple Wallet (`.pkpass`)
Needs:
- Apple Developer Program membership (paid by the operator; the feature stays free for users).
- A **Pass Type ID** (`pass.fyi.heyitsme.card` or similar) and its **pass signing certificate** (`.p12`).
- Apple **WWDR intermediate certificate**.

Server work: build `pass.json` + images, write `manifest.json` (SHA-1 of every file), sign the manifest
(detached PKCS#7 with the pass cert + WWDR), zip as `application/vnd.apple.pkpass`. Owner-only route.

Env to add: `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT_P12_BASE64`, `APPLE_PASS_CERT_PASSWORD`, `APPLE_WWDR_CERT_BASE64`.
Certificates expire yearly; add a calendar reminder.

## Google Wallet (Generic pass)
Needs:
- Google Wallet API **issuer account** (Google Pay & Wallet Console) and its **Issuer ID**.
- A Google Cloud **service account** with Wallet API access and a JSON key.

Server work: define one Generic pass class; per card, sign a JWT (RS256, service-account key) holding the
pass object and link to `https://pay.google.com/gp/v/save/<jwt>`. Owner-only route.

Env to add: `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON`.

## Rules when building it
- Signing happens on the server only; keys never reach the client bundle.
- Show each "Add to Wallet" button only when its env vars are set and only on the matching platform. Otherwise no button.
- Signing failure → toast + QR-download fallback, never a broken download.
- Acceptance needs real-device tests: install, scan, unpublish, scan again (must not show the card).
