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

### P1 — fal.ai master key still flows to authenticated clients
The GET `/api/ai-image/token` endpoint hands the master `FAL_KEY`
directly to authenticated callers because the fal realtime SDK opens
its WebSocket with the credential client-side. This is auth-gated and
rate-limited, but the proper fix is to mint short-lived, scoped fal
tokens server-side. The fal SDK doesn't currently expose a clean
helper for this; we'd need to call fal's REST API to mint a JWT and
return that instead. **Tracked as a P1 in this audit; not blocking.**

### P1 — multi-region rate limiter
`src/lib/rate-limit.ts` is a per-instance in-memory token bucket.
That's correct for the current single-region Vercel deploy and any
single-process desktop kiosk. If the app ever runs behind a
multi-region edge with sticky-session-less routing, an attacker could
fan out their requests across regions and bypass per-user caps. The
fix is a Redis or Vercel KV backend, with the bucket math unchanged.
**Tracked as a P1; not currently exploitable.**

### CSP — currently lenient
The current Next.js middleware sets standard X-Frame-Options /
X-Content-Type-Options / Referrer-Policy / Permissions-Policy
headers, but no Content-Security-Policy. The app inlines styles
through tailwind, loads Google Fonts, and connects to fal.media,
Supabase, Anthropic and OpenAI — a CSP would lock those down.
Recommended path: add CSP in `Content-Security-Policy-Report-Only`
mode first, gather a week of violation reports from real users
(installation kiosk uses many remote image hosts), then promote to
enforcement.

### Backend posture
- Supabase service-role key (`SUPABASE_SERVICE_ROLE_KEY`) appears in
  `src/app/api/admin/backfill-all-journeys/route.ts`. It bypasses
  RLS — used here intentionally to write across users — but each
  service-role usage should be reviewed for the narrowest possible
  scope and an explicit comment noting why RLS is bypassed.
- The audio API (`src/app/api/audio/[id]/route.ts`) has a transcode
  path that runs `ffmpeg` on user-supplied files. ffmpeg is invoked
  via `execFile` (not `exec`) and the input path is in a tempdir —
  parameter injection is blocked. Resource limits (`-timeout`, max
  output size) would be a defense-in-depth improvement.
- The Tauri sidecar (`src-tauri/`) had path-traversal and URL-allowlist
  gaps that are addressed in commit 6 of this branch.

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
