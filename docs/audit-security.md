# Security Audit — Resonance (read-only)

_Date: 2026-07-11 · Scope: `~/my-app` only (agentic_finance + idaho-fishing-dashboard explicitly excluded). No code modified._

## Bottom line

**No Critical or High findings. The April 2026 hardening is fully intact.** All
user-data and paid-AI API routes are auth-gated, the Supabase service-role key
is server-only (3 routes), all security headers are present, and RLS on
`recordings` / `analyses` / `journeys` is owner-only with explicit public
exceptions.

## Resolved — 2026-07-11

- **#1 (Medium) — FIXED.** `dream/_shared/api-guard.ts` now requires an
  authenticated session (`getUser()` → 401 for anon) before any paid handler
  runs, and rate-limits per **user id** via the KV-backed `checkRateLimit`
  (8/60s burst + ~40/day quota) instead of the bespoke spoofable in-memory
  per-IP maps. Origin check retained as defense-in-depth.
- **#2 (Medium) — FIXED (non-breaking variant).** The `ai-image/token` POST
  master-key proxy now forwards to compute hosts **only** when the path names
  an allowlisted fal app (`fal-ai/flux/schnell`, the same set the JWT is scoped
  to). Closes "any fal model on our credentials" without gating the anon
  installation-kiosk realtime path (which legitimately needs anon POST).
- **#3 (Low) — FIXED.** `journeys/[id]` GET now carries an explicit
  `.or(user_id.eq…,is_public.eq.true)` app-layer scope mirroring the RLS
  policy — defense-in-depth without regressing public-journey reads.

_Still open (infra, not code): #4 provision Vercel KV / Upstash in prod so the
limiter is global rather than per-instance (code already supports it); #5–7
remain accepted/intentional._

---

## Findings (Medium and lower)

| # | Severity | Area | Summary |
|---|----------|------|---------|
| 1 | Medium | Dream paid-AI routes | Weak cost controls on fal.ai/ElevenLabs proxies |
| 2 | Medium | `ai-image/token` | Auth-optional credential-bearing proxy |
| 3 | Low | `journeys/[id]` GET | No explicit owner filter (RLS backstops) |
| 4 | Low | Rate limiter | Falls back to per-instance in-memory when KV unset |
| 5–7 | Low/Info | Misc | Broad `/room/*` allowlist; unauth fal warm-up; CSP `unsafe-inline/eval` |

### 1. Medium — Dream sandbox paid-AI routes have weak cost controls
All ~30 `src/app/dream/*/api/route.ts` handlers (fal.ai / ElevenLabs / video,
using the master `FAL_KEY`) rely on `src/app/dream/_shared/api-guard.ts`, which
enforces a **spoofable** Origin/Referer allowlist plus an **in-memory,
per-instance** rate limit (8/60s, 40/day) and no `getUser()` check.
_Mitigating:_ `/dream/*` requires a session via the middleware default rule, so
anonymous requests are redirected before the handler runs; residual risk is any
free-signup user, with the only hard backstop being the out-of-repo fal.ai
budget cap.
**Fix:** add an explicit `getUser()` check in `guard()` and move to the
KV-backed `checkRateLimit`.

### 2. Medium — `ai-image/token` POST is an auth-optional credential-bearing proxy
`route.ts:156` forwards to any `fal.*` host with the master key attached;
anon-allowed, rate-limited. The host allowlist prevents open-proxy abuse, but
any fal model can be invoked on our credentials within rate limits.
**Fix:** require a session, or allowlist specific fal app paths (as the GET path
already does).

### 3. Low — `journeys/[id]` GET omits an explicit owner filter
`route.ts:12`; backstopped by journeys RLS (`auth.uid()=user_id OR is_public OR
share_token`). Not a live IDOR.
**Fix:** add `.eq("user_id", user.id)` for defense-in-depth.

### 4. Low — Rate limiter falls back to per-instance in-memory when KV unset
`rate-limit.ts:210`; `.env.local` has no KV vars, so limits are weaker than
advertised under serverless fan-out.
**Fix:** provision Upstash/Vercel KV in prod (code already supports it).

### 5–7. Low / Info
- Broad `/room/*` entry in the middleware allowlist (harmless today).
- Unauthenticated fal warm-up in `ai-image/status`.
- Enforced CSP still uses `unsafe-inline` / `unsafe-eval` (intentional; a
  tighter nonce CSP runs in Report-Only).

## Confirmed holding (verified this pass)
- All API routes auth-gated; admin gate centralized and server-only
  (`ADMIN_EMAIL`; the only `NEXT_PUBLIC_ADMIN_EMAIL` hit is a comment).
- Dream voting admin-gated; service-role key in only 3 server routes.
- No secret in any `NEXT_PUBLIC_` var; `.env*` gitignored.
- Share tokens are full 32-char UUIDs.
- RLS owner-only with public exceptions on `recordings` / `analyses` /
  `journeys`.
- All 5 security headers present; middleware allowlist scoped to token routes.
- Zod / host / size validation on abuse-prone routes; no SQL string-building;
  no `dangerouslySetInnerHTML`.

_Prepared by an automated read-only audit agent; findings transcribed by the main session._
