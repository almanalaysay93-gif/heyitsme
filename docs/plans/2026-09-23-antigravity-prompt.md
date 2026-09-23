# Prompt for Google Antigravity

Paste this as the task brief.

---

You are working in the repo `heyitsme` (Node/TypeScript, Express + tRPC
backend, React/Vite frontend, Drizzle ORM on MySQL). Full design doc is at
`docs/plans/2026-09-23-remove-manus-design.md` — read it first, it is the
source of truth for scope and decisions. Do not re-derive architecture
choices already made there; implement them.

## Task

Remove all dependency on the "Manus" platform (a BaaS gateway called
"Forge") and replace it with self-hosted equivalents, per the design doc's
table. Concretely:

1. **Auth**: Replace `server/_core/sdk.ts`'s calls to Manus's
   `webdev.v1.WebDevAuthPublicService` with direct Google OAuth2
   authorization-code flow. Keep the existing JWT session mechanism
   (`jose`, `COOKIE_NAME` cookie) unchanged. Remove the `cron_` openId
   special case and `buildCronUser`. New env vars: `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. Remove
   `OAUTH_SERVER_URL`, `VITE_APP_ID` from `server/_core/env.ts` and all
   references.

2. **LLM**: Replace `server/_core/llm.ts`'s fetch to
   `{forge}/v1/chat/completions` with `@anthropic-ai/sdk`'s
   `messages.create`. Keep the file's exported types
   (`Message`, `Tool`, `InvokeParams`, `InvokeResult`, etc.) as the stable
   internal contract — write an adapter inside this file that translates
   to/from Anthropic's request/response shape, so no caller elsewhere in
   the codebase needs to change. Default model `claude-sonnet-5` unless
   caller passes an explicit `claude-*` id. New env var:
   `ANTHROPIC_API_KEY`.

3. **Storage**: Replace `server/_core/storageProxy.ts`'s redirect to
   Manus's presign endpoint with a direct S3 presigned URL using
   `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (both already
   in `package.json`, currently unused elsewhere — confirm before
   assuming). Route path changes from `/manus-storage/*` to `/storage/*`;
   update the matching constant in `shared/const.ts` and
   `client/src/const.ts`. Add an upload-side presigned-PUT helper —
   before writing it, grep the client for whatever upload contract
   currently exists and match it. New env vars: `S3_BUCKET`, `S3_REGION`,
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

4. **Stub the rest**: `server/_core/notification.ts`, `heartbeat.ts`,
   `imageGeneration.ts`, `voiceTranscription.ts`, `map.ts`, `dataApi.ts` —
   keep exported function signatures and types intact (so callers still
   compile) but replace bodies with a thrown `Error("[stub] ...")` message
   naming the suggested real provider and required env var, per the
   design doc's "Stubs" section. Do not implement real providers for
   these in this pass.

5. **Cleanup**: Delete `client/src/components/ManusDialog.tsx`,
   `client/public/__manus__/`, `server/_core/types/manusTypes.ts` (move
   its 3 type definitions into `sdk.ts` or a new
   `server/_core/types/googleAuthTypes.ts`). Update
   `client/src/main.tsx` and `client/src/_core/hooks/useAuth.ts` to drop
   any Manus-dialog wiring. Check `package.json`, `template.json`,
   `buildme-ensemble/02-02-frontend.md`, `.gitignore` for Manus references
   and remove/update as appropriate — read each before deleting, some
   content may still be relevant under a new name.

## Constraints

- Don't add features or abstractions beyond what's listed. No speculative
  provider-selection layers for the stubbed features.
- Match existing code style (no comments unless explaining a genuinely
  non-obvious constraint, e.g. why the `cron_` branch is being removed).
- After each numbered section, run `tsc --noEmit` (`npm run check`) and
  fix type errors in that section before moving to the next.
- Update `server/auth.logout.test.ts` to match the new Google-OAuth
  session shape; keep its JWT assertions.
- Add a unit test for the LLM adapter (mock the Anthropic client,
  assert OpenAI-shaped input produces the expected Anthropic call and the
  mocked Anthropic response round-trips to the expected `InvokeResult`).
- Add a unit test for the S3 presign route (mock `getSignedUrl`).
- When finished, grep the repo case-insensitively for "manus" — every hit
  outside `docs/plans/` and git history should be gone or justified
  (e.g. a changelog entry).

## Verification

Run `npm run check` and `npm test`. Then manually: start the dev server,
complete a Google OAuth login, send one chat message through the LLM
endpoint end-to-end, and upload+fetch one file through the storage route.
Report any of the three that can't be verified without live credentials,
rather than claiming success.

## Out of scope

Do not implement real notification/heartbeat/image-gen/voice/map/dataApi
providers — stubs only, tracked as follow-up work.
