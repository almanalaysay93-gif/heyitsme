# Remove Manus, rebuild self-hosted

## Why

App was scaffolded on Manus's "Forge" BaaS gateway: one HTTP backend
(`BUILT_IN_FORGE_API_URL` + `BUILT_IN_FORGE_API_KEY`) fronting OAuth, LLM
chat, image gen, voice transcription, S3-style storage presign, push
notifications, cron ("heartbeat"), Google Maps, and a generic 3rd-party
`CallApi`. Goal: cut the Manus dependency, own auth/LLM/storage directly,
deploy anywhere.

## Inventory (current Manus surface)

| File | Role | Manus endpoint |
|---|---|---|
| `server/_core/sdk.ts` | OAuth exchange + session JWT + user sync | `webdev.v1.WebDevAuthPublicService/*` |
| `server/_core/oauth.ts` | OAuth route glue | via sdk.ts |
| `server/_core/llm.ts` | Chat completions proxy | `{forge}/v1/chat/completions`, `/v1/models` |
| `server/_core/imageGeneration.ts` | Image gen proxy | `{forge}/...` |
| `server/_core/voiceTranscription.ts` | Whisper-style proxy | `{forge}/...` |
| `server/_core/storageProxy.ts` | Presigned GET redirect | `{forge}/v1/storage/presign/get` |
| `server/_core/notification.ts` | Push notification | `webdevtoken.v1.WebDevService/SendNotification` |
| `server/_core/heartbeat.ts` | Cron job registration | `webdevtoken.v1.WebDevService` |
| `server/_core/map.ts` | Google Maps proxy | `{forge}` + injected key |
| `server/_core/dataApi.ts` | Generic 3rd-party API passthrough | `webdevtoken.v1.WebDevService/CallApi` |
| `client/src/components/ManusDialog.tsx` | Branding/debug UI | — |
| `client/public/__manus__/debug-collector.js` | Debug script tag | — |
| `client/src/_core/hooks/useAuth.ts`, `client/src/const.ts`, `shared/const.ts` | Client wiring to above | — |
| `server/_core/types/manusTypes.ts` | OAuth response types | — |

## Target architecture

Core three get real, working replacements. The other five get typed stubs
(same exported function signatures, throw/no-op with a clear "not wired"
message + a `TODO(rebuild):` comment naming the env var to add) so nothing
else in the app breaks, and each can be wired for real later without
touching call sites again.

### 1. Auth — Google OAuth, own session
- Replace `sdk.ts`'s OAuth calls with direct Google OAuth2 (authorization
  code flow) using `arctic` (small, no-framework OAuth client lib) or raw
  `fetch` against Google's token/userinfo endpoints — no new heavy dep
  needed since it's 2 HTTP calls.
- Keep the JWT session mechanism as-is (`jose`, `SignJWT`/`jwtVerify`,
  `COOKIE_NAME` cookie) — that part was already self-contained, not Manus.
- `db.upsertUser`/`getUserByOpenId` unchanged (own Postgres/MySQL via
  Drizzle already).
- Drop the `cron_` special-case openId branch (`CRON_OPEN_ID_PREFIX`,
  `buildCronUser`) — that existed only to authenticate Manus's heartbeat
  callback. Heartbeat is being stubbed, so this path is dead; if heartbeat
  gets real cron later, secure its callback with a shared-secret header
  instead of a fake user session.
- New env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REDIRECT_URI`. Drop `OAUTH_SERVER_URL`, `VITE_APP_ID` (appId was
  Manus's project id, no longer meaningful).

### 2. LLM — Anthropic direct
- Replace `llm.ts`'s `fetch(forge/v1/chat/completions)` with
  `@anthropic-ai/sdk`'s `messages.create`.
- Keep the existing exported `Message`/`Tool`/`InvokeParams`/`InvokeResult`
  shape as the app's internal contract (call sites don't change) — add an
  adapter function that translates OpenAI-shaped `Message[]` +
  `tools`/`tool_choice` into Anthropic's `messages`/`system`/`tools`
  format, and translates Anthropic's response back into the existing
  `InvokeResult` (choices[0].message, tool_calls, usage). This isolates
  the provider swap to one file.
- Model id mapping: pass `model` through if it already looks like an
  Anthropic id (`claude-*`), else default to `claude-sonnet-5`.
- New env var: `ANTHROPIC_API_KEY`. Drop `BUILT_IN_FORGE_API_URL`/`_KEY`
  usage from this file.

### 3. Storage — AWS S3 direct
- Replace `storageProxy.ts`'s redirect-to-forge-presign with a direct
  presigned GET using `@aws-sdk/s3-request-presigner` +
  `@aws-sdk/client-s3` (already dependencies, currently unused — confirms
  this was the intended escape hatch).
- Route stays `GET /storage/*` (rename from `/manus-storage/*`), looks up
  `key` in the app's own bucket, returns a 307 to a presigned URL (same
  response contract as today, so client code needs zero changes beyond
  the URL prefix constant in `shared/const.ts`/`client/src/const.ts`).
- Add an upload-side helper (presigned PUT) since Manus likely handled
  uploads too — check current client upload call sites during
  implementation and mirror whatever contract they expect.
- New env vars: `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY` (or rely on default AWS credential chain).

### 4. Stubs (notification, heartbeat, image-gen, voice, map, dataApi)
Each keeps its current exported function signature and TypeScript types
(so any caller still compiles), but the body becomes:
```ts
throw new Error(
  "[stub] <feature> not wired since Manus removal. See docs/plans/2026-09-23-remove-manus-design.md — implement with <suggested provider> and set <ENV_VAR>."
);
```
Suggested real providers to note in each stub's comment (not implemented now):
- notification → web-push or OneSignal
- heartbeat → `node-cron` in-process, or platform cron (Vercel Cron/systemd timer) hitting the existing `/api/scheduled/*` paths
- imageGeneration → OpenAI Images or fal.ai
- voiceTranscription → Groq Whisper or OpenAI Whisper
- map → Google Maps API key direct (no proxy needed, just call Google directly with own key)
- dataApi → delete call sites if none exist after grep; otherwise inline the specific 3rd-party API directly

## Cleanup pass
- Delete `client/src/components/ManusDialog.tsx`, `client/public/__manus__/`, `server/_core/types/manusTypes.ts` (fold the 3 response types it defines into `sdk.ts` or a local `googleAuthTypes.ts`).
- Rename `server/_core/sdk.ts` → keep filename (still "the SDK layer") but strip Manus-specific naming inside (`SDKServer` class name is fine, drop `OAuthService`'s Manus RPC paths).
- Grep-sweep for the string "manus"/"Manus" after each phase; target: zero hits outside this design doc and git history.
- Update `.gitignore`, `package.json` (name/description if they mention Manus — check), `template.json` (likely Manus's own scaffold manifest — delete if unused post-migration), `buildme-ensemble/02-02-frontend.md` (doc reference, update or remove).

## Env var migration summary
Remove: `OAUTH_SERVER_URL`, `VITE_APP_ID`, `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`, `OWNER_OPEN_ID` (check if still meaningful — likely was Manus project owner concept).
Add: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ANTHROPIC_API_KEY`, `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
Keep: `JWT_SECRET`, `DATABASE_URL`, `NODE_ENV`, `PORT`.

## Testing
- `server/auth.logout.test.ts` already exists and references Manus session shape — update to Google-OAuth session shape, keep JWT assertions.
- Add a unit test for the LLM adapter (OpenAI-shape in → Anthropic call → OpenAI-shape out) using a mocked Anthropic client.
- Add a unit test for the S3 presign route (mock `getSignedUrl`).
- Manual smoke test: login via Google, send one chat message end-to-end, upload+fetch one file via storage route.

## Out of scope (this pass)
Real implementations of notification/heartbeat/image-gen/voice/map/dataApi — tracked as stub TODOs, separate follow-up designs when actually needed.
