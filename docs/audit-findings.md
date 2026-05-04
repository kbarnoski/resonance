# Resonance audit — Phase 0/1 findings + Phase 2-5 hardening

This document captures the security + posture audit performed on the
Resonance codebase, what was fixed in this branch, and what remains as
explicit follow-ups.

## Phase 0 — discovery (read-only)

The audit walked every API route under `src/app/api/`, the Supabase
auth pattern, the Tauri sidecar (`src-tauri/`), and the dependency
manifest. Fixtures: 28 API route files, ~17 of which talk to paid
upstream services (OpenAI, Anthropic, fal.ai). Three classes of issue
appeared repeatedly:

1. **Routes that hit paid upstreams without auth.** Two were entirely
   unauthenticated (`poetry/speak`, `ai-image/validate`); one was
   auth-gated but had no rate limit and would leak the master fal.ai
   key on demand (`ai-image/token`).
2. **Free-text inputs without size caps** on the routes that forward
   strings to LLMs / TTS engines. A single client could request a
   max-length 4096-char TTS call repeatedly for trivially low cost on
   their end.
3. **Duplicated admin-email check** copy-pasted across 3 routes with
   subtle inconsistencies (`NEXT_PUBLIC_ADMIN_EMAIL` vs `ADMIN_EMAIL`,
   case normalization on/off).

## Phase 1 — security hardening (this branch)

### New foundations
- **`src/lib/rate-limit.ts`** — in-memory token-bucket rate limiter
  keyed per identity (Supabase user id, fallback to forwarded IP).
  Single-instance only; multi-region deploys would need Redis or
  Vercel KV (see "Future work" below).
- **`src/lib/api/validate-input.ts`** — small predictable validators:
  `requireString` (length-bounded), `requireHttpUrl` (with optional
  host allowlist), `requireEnum`, `requireStringArray`, etc. Each
  returns either a typed value or a Response the route can return
  directly.
- **`src/lib/auth/require-admin.ts`** — single-source-of-truth admin
  gate. Compares against the server-only `ADMIN_EMAIL` env var,
  case-normalized, and fails closed if `ADMIN_EMAIL` is unset.

### Route fixes

P0s closed:
- **`src/app/api/poetry/speak/route.ts`** — added auth gate,
  per-user rate limit (10 burst, 1 every 6s), `MAX_TEXT_CHARS = 1500`
  cap, validated voice/phase against allowlists, validated language
  string length.
- **`src/app/api/ai-image/validate/route.ts`** — added auth gate,
  per-user rate limit (30 burst, 0.5/s), allowlisted image hosts to
  `fal.media`/`fal.run`/`fal.ai`/`v3.fal.media`, capped checks array
  at 8 items × 240 chars (closes "open prompt fan-out" abuse).
- **`src/app/api/ai-image/token/route.ts`** — added rate limits to
  both GET (5 burst, 1/30s — bounds key-extraction loops) and POST
  (60 burst, 1/s — bounds inference relay). Forwarded URL must be
  on a fal.* allowlist; previously any HTTPS URL would be relayed
  with our credentials.

Tightenings:
- **`src/app/api/recordings/[id]/analysis/route.ts`** — anon fallback
  now positively confirms the recording is `is_featured` or attached
  to a shared journey before returning data. Previously a user-client
  RLS error fell through to the anon client unconditionally.
- **`src/app/api/admin/backfill-all-journeys/route.ts`**,
  **`src/app/api/journey-feedback/route.ts`** (GET),
  **`src/app/api/shader-prefs/route.ts`** — replaced inline
  duplicated admin-email checks with `requireAdmin()` from the new
  helper.

### Dependency hygiene
- Added explicit declarations for `zod` and `@dnd-kit/utilities` in
  `package.json`. Both were used in source but only present
  transitively via other packages — a parent dep tree change could
  silently break the build.

## Known limitations / Phase 2-5 follow-ups

### ~~P1 — fal.ai master key still flows to authenticated clients~~ **RESOLVED**
The GET `/api/ai-image/token` endpoint now mints a short-lived
(5-minute) JWT scoped to `fal-ai/flux/schnell` via fal's REST auth
endpoint and returns that to the client. The master `FAL_KEY` no
longer leaves the server. The endpoint also returns a `scheme` hint
("Bearer" for JWTs) so the client knows which auth header format to
use; the realtime image service was updated to read it. If the
upstream JWT mint fails, the route returns 502 — fail-closed, never
falls back to the master key.

### ~~P1 — multi-region rate limiter~~ **RESOLVED**
`src/lib/rate-limit.ts` now supports an optional KV backend.
- Default (no env vars): in-memory token bucket — correct for
  single-region or desktop deploys.
- KV backend: when `KV_REST_API_URL` + `KV_REST_API_TOKEN` are set
  (Vercel KV) or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
  are set (Upstash direct), the limiter uses an atomic lua-script
  token bucket via Redis. Cross-region buckets stay coherent and a
  hostile client can't fan out across regions to bypass caps.
- KV failures (network, 5xx from the REST endpoint) gracefully fall
  back to the in-memory bucket so a flaky KV doesn't lock everyone
  out. Logged via `console.warn` for visibility.

### ~~CSP — currently lenient (web app)~~ **REPORT-ONLY ACTIVE**

The web app already enforced a CSP (this was missed in the original
audit walk — `next.config.ts` has had `Content-Security-Policy` set
since before this engagement). The enforced policy is loose
(`https:` and `wss:` wildcards in `connect-src` and `https:` in
`img-src`/`media-src`). A tighter policy now ships in
`Content-Security-Policy-Report-Only` mode with specific upstream
allowlists — Supabase, fal.*, OpenAI, Anthropic, Google Fonts. The
`/api/csp-report` endpoint accepts violation reports in both legacy
(`report-uri`) and modern (`report-to`) formats and logs structured
summaries via the standard logger.

**Promotion path:** monitor `/api/csp-report` logs for a release
cycle. When the report stream is quiet, swap `CSP_DIRECTIVES` in
`next.config.ts` to point at the tighter set, drop the Report-Only
header. The historical text on this section is preserved below.

---
The current Next.js middleware sets standard X-Frame-Options /
X-Content-Type-Options / Referrer-Policy / Permissions-Policy
headers, but no Content-Security-Policy. The app inlines styles
through tailwind, loads Google Fonts, and connects to fal.media,
Supabase, Anthropic and OpenAI — a CSP would lock those down.

**Recommended rollout (web app):**

1. Add a `Content-Security-Policy-Report-Only` header in
   `src/middleware.ts` — same value as the desktop CSP committed in
   `src-tauri/tauri.conf.json` (which was tightened from `null`
   in commit 6 of this branch). Run for at least a week.
2. Wire `report-uri /api/csp-report` (or the `report-to` directive)
   into a small server-side log sink and watch what fires. The
   installation kiosk pulls AI imagery from many fal.media subdomains
   in production; some of those probably need explicit allowlisting.
3. Once the report-only stream is quiet for a release cycle, promote
   to enforcement by switching the header name to
   `Content-Security-Policy`.
4. The desktop Tauri app's CSP is already enforced (commit 6).

**Starting CSP for the web app (mirrors the desktop one):**

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' data: https://fonts.gstatic.com;
img-src 'self' data: blob: https://*.supabase.co https://*.fal.media https://fal.media;
media-src 'self' data: blob: https://*.supabase.co;
connect-src 'self' https://*.supabase.co https://*.fal.run https://fal.run https://*.fal.ai https://api.openai.com https://api.anthropic.com wss://*.fal.run wss://*.fal.ai;
frame-ancestors 'none'
```

Both `'unsafe-inline'` and `'unsafe-eval'` are present as a
pragmatic concession to Next.js + the AI SDK. A subsequent pass
with nonce-based scripts would tighten this further; tracked as
P2 because the practical attack surface (XSS) is small in this
codebase given there's no user-supplied HTML rendered raw anywhere.

### Backend posture

**Supabase service-role usage**
- `SUPABASE_SERVICE_ROLE_KEY` appears in
  `src/app/api/admin/backfill-all-journeys/route.ts` and
  `src/app/api/journeys/share-builtin/route.ts`. Each call bypasses
  RLS, which is correct for the use case (cross-user backfill,
  marking a recording shared) but each instance should keep an
  explicit comment naming why RLS is bypassed and what bounds the
  blast radius (e.g. `requireAdmin()` already gating the route).
- A weekly grep for `SUPABASE_SERVICE_ROLE_KEY` is a cheap check —
  a new file appearing in the results without a justifying comment
  is the signal to review.

**ffmpeg sandbox (audio transcode path)**
- `src/app/api/audio/[id]/route.ts` runs `ffmpeg` on user-supplied
  recordings. Already safe against shell injection: invocation is
  `execFile` not `exec`, the input is a tempdir-scoped path that
  the route just wrote, and the transcode arguments are static.
- Defense-in-depth ideas (not yet implemented):
  - Stricter timeout (`{ timeout: 120000 }` is set; could drop to
    60s for typical track lengths).
  - Cap output file size (currently unbounded — a malicious input
    could produce a multi-GB output).
  - Run inside a containerized worker rather than the Next.js
    serverless function process.

**Tauri sidecar**
- Path traversal in `src-tauri/src/cache.rs` (recording_id wasn't
  validated before being concatenated into a file name) — closed
  in commit 6.
- Open URL fetch in `cmd_audio_load` (any HTTPS URL would be
  downloaded and written to disk) — closed in commit 6 with a
  Supabase-storage allowlist.
- `tauri.conf.json` had `csp: null` — closed in commit 6 with a
  CSP enumerating the actual upstreams.

**Auth flow**
- Out of scope for this audit. Supabase magic-link auth is the
  load-bearing mechanism; a follow-up audit should review the
  email-template configuration, session-rotation behavior, and
  the `/login` redirect-to surface for open-redirect risk.

**Rate limiting at the edge**
- The token-bucket rate limiter in `src/lib/rate-limit.ts` is
  in-process. For deployments that run multiple Vercel regions
  simultaneously it would need a Redis or Vercel KV backend so
  cross-region bursts can't bypass it. Tracked as P1; not
  exploitable today (single region in prod).

**Logging + redaction**
- Commit 2 routes all `console.*` in API code through
  `src/lib/logger.ts`. The logger today is a pass-through; the
  reason for adding the seam is so a future commit can add token
  redaction and Sentry shipping in one place. Tokens that should
  never appear in logs: `FAL_KEY`, signed Supabase URLs (which
  contain time-limited credentials in the query string), session
  cookies. None of these are currently logged but a redactor
  pass would prevent regression.

## Phase 2-5 — code health (this branch)

- **Phase 2** — Replaced 30 `console.*` calls in `src/app/api/` with
  a scoped `logger` so production logs go through one channel and can
  be filtered/redacted centrally.
- **Phase 3** — Added vitest harness + tests for the three new lib
  modules (rate-limit, validate-input, require-admin). Added a GitHub
  Actions workflow that runs lint + tests + build on every PR.
- **Phase 4** — Lifted timing constants and the `distributedTrackIndex`
  helper out of `installation-loop-client.tsx` into a tested module
  (`src/components/audio/installation-machine.ts`). The existing loop
  client is already an explicit timed FSM; no useReducer rewrite was
  necessary.
- **Phase 5** — First slice of decomposing the 2500-line
  `visualizer-client.tsx`: extracted the speech-recognition browser
  shim and the global keyframe styles into separate files.
- **Tauri** — Validated `recording_id` against a UUID regex in
  `src-tauri/src/cache.rs` (closes path traversal); added a fal-host
  allowlist to `cmd_audio_load`; tightened `tauri.conf.json` CSP
  away from `null`.

## Threat model — what this audit DID and DID NOT cover

**Covered:**
- API route auth + rate limiting
- Server-side input validation
- Tauri sidecar command argument validation
- Admin-gating consistency
- Open-proxy / SSRF surface area on the fal proxy

**NOT covered:**
- Client-side XSS (no audit of `dangerouslySetInnerHTML` use)
- Supabase RLS policy correctness (relies on what's in the DB)
- Auth flow itself (Supabase magic-link, session management)
- Dependency CVE scan (recommend running `npm audit` separately)
- Content moderation on user-uploaded audio

A follow-up engagement should pick up these in priority order. The
RLS policies in particular are the load-bearing security boundary
for cross-user data isolation; their correctness is asserted, not
verified, by this audit.
