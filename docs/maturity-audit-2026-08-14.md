# Resonance Maturity Audit — 2026-08-14

Formal point-in-time audit of the entire Resonance system: core app, studio,
journeys/paths/viz, dream agent (~1,137 cycles), iOS (Capacitor), kiosk
(Tauri), installation mode, documentation, and repo hygiene. Conducted via
five parallel domain audits on Claude Opus. Every finding below is
evidence-cited; nothing is speculative unless marked.

---

## Status addendum (same day — post-fix)

Owner rulings (Karel, 2026-08-14):
- **H1/M1 (recording exfiltration): ACCEPTED RISK — will not fix.** "I don't
  care if people can download my tracks, it's essentially free anyways."
  Revisit only if Resonance ever gains real third-party users with private
  recordings.
- **M3 (rule 10 vs jury): RESOLVED — music beats mic.** Catalog-grounded
  protos take priority over mic-primary interaction; mic allowed as a
  secondary layer only. Steering docs reconciled.

Fixes shipped same day (see the fix commit for details): C1 revert runbook +
scope-fence exception + cadence + log-rotation policy (AGENT.md), JURY.md
owner-priority note, VALIDATION.md refresh (M4/M5), ai-image origin
allowlist on generate+status (H3 partial), error-message tightening,
nebula pool cleanup, dead modules removed, shader fallback, global-error +
per-route error boundaries, installation constants single-sourced +
tests aligned to live values (M6), heartbeat token → header (M2), iOS
plist mic/camera keys (H2), README + .env.example + blocked-shaders.md
(H4/H6), stale SQL + fix-dates.js deleted (M7/M8), one-off scripts
archived, decks untracked, offline plan moved to docs/, 3 unused deps
removed (M11), 48 new core tests seeded — suite now 124 (M10 partial),
stale branches pruned (M9), git gc run (H5 partial).

Update 2026-08-14 (later same day): fal.ai dashboard budget cap SET by
Karel (H3 hard backstop done). Global aggregate daily caps also shipped
in code (commit 89b19bb0): dream lab 1,500/day + ai-image 6,000/day,
env-overridable.

Second update (same day): Tauri kiosk download now streams to disk
with a 512MB cap (cache.rs, cargo check green — LOW closed);
shader-prefs persists to Upstash KV when provisioned, /tmp fallback
for local dev (LOW closed once KV is connected). Both
NEEDS-VERIFICATION items verified clean: enforced CSP + all five
security headers confirmed in next.config.ts AND live on production;
safe-redirect covers the only attacker-controlled redirect target
(auth/callback `next` param). Anonymous half of the runtime smoke test
passed against production: /, /path/d2c79111528a46cf (Welcome Home
content renders), /demo, /installation, /dream, /login all 200;
ai-image origin gate returns 403 for foreign/missing origins.

Still open: Upstash KV env vars on Vercel (H3 — confirmed missing;
connect via Vercel → Storage → Upstash Redis to make rate limits
cross-instance and shader-prefs durable), deploy-gating on CI green
(C1 — needs a Vercel settings decision), authenticated half of the
runtime smoke test (sign in → play → Room → journey), kiosk
end-to-end on real hardware.

## Baseline health (all green)

| Check | Result |
|---|---|
| `npm run build` (tsc + ESLint + compile) | PASS |
| `tsc --noEmit` | 0 errors |
| ESLint | 0 errors, 247 warnings (all unused-var class) |
| `vitest run` | 76/76 pass (13 test files; 5 core, 8 dream-proto) |
| Repo | 1,576 commits (67% dream-agent-authored), `.git` 194MB |

**Headline: the codebase is not rotted.** The core app is statically
coherent end-to-end, defensively hardened, and shows deliberate engineering,
not decay. The serious issues are (a) one real security hole, (b) systemic
risks around the autonomous agent's production coupling, and (c) growth/
hygiene drag.

---

## Verdicts by surface

- **Core app (library → recording → Room → journeys → paths): LIKELY WORKING.**
  Engine singleton, provider chain, store bridge, path anon access, WebGL
  recovery all verified intact at code level. Needs a runtime smoke test
  (see end) since live Supabase/env state can't be verified statically.
- **Installation web mode: SHIPPED & SUBSTANTIATED.** Every v1.3 claim
  spot-checked exists in code (pre-buffer, fallback pool, sleep/wake,
  watchdog, heartbeat/status/operator). 1,803-line loop client.
- **Tauri kiosk: VIABLE, most mature native target.** Real Rust audio engine
  (rodio/symphonia), disciplined security posture, releases through v0.1.1
  (2026-05-05).
- **iOS (Capacitor): VIABLE BUT DORMANT** — a one-commit remote wrapper
  (2026-04-04) that auto-tracks the web app, with one crash-grade config bug
  (H2 below). Distribution beyond TestFlight would face App Store 4.2.
- **Dream agent: BEHAVIORALLY EXCELLENT, SYSTEMICALLY EXPOSED.** 100% guard
  coverage (32/32 routes), 1 commit/cycle format held, zero drug-language
  residue, INDEX/STATE maintained, only 4 out-of-fence touches in 1,058
  commits (all human-directed). Risks are architectural, not behavioral.

---

## Findings — consolidated & severity-ranked

### CRITICAL

**C1. No preventive gate between the dream agent and production.**
Agent pushes to main every ~2h; Vercel deploys in ~30s (10 deploys on
2026-08-14 alone). `.github/workflows/test.yml` runs lint+tests+build but
*after* push — detection, not prevention. No branch protection, no canary,
no documented revert runbook. The only gate is the agent self-honoring
"run `npm run build` before commit." A build-divergence between the agent's
environment and Vercel's ships broken prod. Blast radius is the whole app
(shared build inputs). *Fix: 3-line revert runbook in AGENT.md at minimum;
consider deploy-on-CI-green (Vercel ignored-build-step keyed on CI status).*

### HIGH

**H1. Cross-user private-recording exfiltration (the one real vuln).**
`journeys/create` (route.ts:88-102) and `journeys/[id]` PATCH (route.ts:33-46)
never verify the supplied `recording_id` belongs to the caller. An
authenticated user can attach *any* user's private recording UUID to their
own journey, share the journey, then anonymously pull the victim's signed
audio URL via `/api/audio/[id]` (resolveRecording, lines 157-173) and their
MIDI/chords via `/api/recordings/[id]/analysis` (lines 56-65) — both anon
fallbacks gate on the *journey's* share_token, not the recording's own
public state. Exploit requires knowing the target UUIDv4 (not enumerable),
which lowers likelihood, but the authz flaw is real.
*Fix: ownership check on recording_id in create+PATCH; AND require the
recording itself to be `is_featured` or have its own `share_token` in the
anon fallbacks.*

**H2. iOS app hard-crashes on any mic/camera feature.**
`ios/App/App/Info.plist` has `UIBackgroundModes: audio` but **no
`NSMicrophoneUsageDescription` / `NSCameraUsageDescription`**. The wrapped
web app calls `getUserMedia` (visualizer-client.tsx:1049 + many dream
protos) — in a WKWebView without those keys, iOS kills the process (TCC
violation). *Fix: add both plist keys.*

**H3. FAL_KEY aggregate spend is bounded per-IP, unbounded across IPs — and
the two backstops are unverified.** Guard design is good (shared daily
bucket across all 32 routes: 40 calls/day/identity, 8/60s burst —
api-guard.ts:48-52,107), but: (1) rate-limit falls back to per-lambda
in-memory if Upstash `KV_REST_API_URL` env vars are absent
(rate-limit.ts:6-7,134-139) — limits reset on every cold start; (2) the
fal.ai account-level budget cap is listed only as "recommended next"
(VALIDATION.md:61) with no evidence it was set. Also `/api/ai-image/generate`
has **no origin allowlist** (unlike the dream guard) and upgrades to the
~8× more expensive model on a spoofable `Referer: .../installation`
(generate/route.ts:83-96,204-216). *Fix: confirm fal dashboard cap +
Upstash envs on Vercel; add origin allowlist to ai-image; stop deriving
cost tier from referer.*

**H4. README onboarding is wrong.** Says `pnpm install` (repo is
npm-locked, pnpm deliberately blocked), references non-existent
`.env.example`, omits required `OPENAI_API_KEY` (poetry TTS) and
`FFMPEG_PATH`, and self-contradicts on deploy method (README.md:53,56,57,97,101).

**H5. Unbounded repo growth from the agent.** `docs/dreams/` = 23MB of
tracked markdown (STATE 11.4MB, INDEX 4.9MB, IDEAS 4.3MB, RESEARCH 3.1MB);
head of an 11MB file rewritten every 2h → new blob per commit; `.git` 194MB
compounding ~12 commits/day; `src/app/dream` = 50MB / ~700 routes compiled
on **every** Vercel build. No rotation/archival policy exists. INDEX.md has
become a log, not an index. *Fix: rotation policy in AGENT.md (dated archive
files), one-time `git gc`.*

**H6. `docs/blocked-shaders.md` does not exist** (and never did, per git
history) despite being cited as canonical. Real blocklists live in
`src/lib/journeys/journeys.ts:145-182` + `device-tier.ts`. *Fix: create the
doc or fix the references.*

### MEDIUM

**M1. Journey `is_public` toggle is the pivot of the H1 chain**
(journeys/[id]/route.ts:44 + RLS policy in 20260318000000 migration).
Resolves with H1's ownership check.

**M2. Heartbeat token model:** any well-formed 16-64-hex token upserts a
row (no registration); token travels in query strings → server/CDN logs.
Low sensitivity data; still move token to a header + TTL-expire rows
(api/installation/heartbeat/route.ts).

**M3. Steering-doc contradiction, rule 10 vs the jury.** Rule 10
(2026-08-14: all audio from Karel's catalog, "synth-only unacceptable")
conflicts with JURY.md:32 ("live mic as primary instrument"), AGENT.md:265
(stage/mic ambition) and the mic-tag diversity machinery. The next
"audio-from-outside" cycle must either violate rule 10 or ignore the jury.
*Fix: reconcile — e.g. "catalog audio OR live user input; never
self-synthesized drones."*

**M4. Scope-fence violations, 4 in 1,058 dream commits** (middleware.ts,
next.config.ts, docs/content/, scripts/) — all Karel-directed, but AGENT.md
rule 2 says "no exceptions," so the written rule is broken. *Fix: amend
rule 2 with a "Karel-in-the-loop exception, logged in STATE.md."*

**M5. Stale steering content.** VALIDATION.md frozen at 2026-05-21 (still
describes retired sandbox flow, says 16 FAL routes — there are 32); AGENT.md
cadence drift ("every 2 hours" vs "hourly fire" at lines 3/56/150/446).

**M6. Installation test/code drift.** Loop client re-declares a local
`STALLED_THRESHOLD_MS` (installation-loop-client.tsx:1313) instead of
importing it; `MID_STALL_RELOAD_MS` + `CYCLE_INTRO_TIMINGS` are exported
and *tested* but have zero live consumers — the green tests validate values
the kiosk doesn't run.

**M7. Stale root SQL** (`supabase-schema.sql`, `supabase-v2-migration.sql`,
Feb 2026) predate `supabase/migrations/` (22 migrations) — someone could
run a stale baseline against the live DB. Delete.

**M8. `fix-dates.js`** tracked at root with hardcoded Supabase URL + anon
JWT (public-by-design key, so not a leak — but a one-off console script that
shouldn't be tracked). Delete.

**M9. Six dead branches** (evidence: `git cherry`): credits-polish-…,
smoother-credits-…, sync-progress-dots-…, claude/connect-… (all
merged-equivalent), dream/cycle-529-… (superseded digest), dream/sandbox
(local+remote, 121 commits, frozen 2026-05-21 — review for salvage, then
delete).

**M10. Zero tests on the actual core:** audio-engine.ts, audio-store.ts,
journey engine/phase interpolation, all API route handlers, path-progress
store. Current suite covers infra primitives + one state machine only.

**M11. Unused deps (verified zero imports):** `@wavesurfer/react`,
`@ffmpeg/ffmpeg`, `@ffmpeg/util`. Also duplicate stacks noted (openai used
for TTS only, alongside ai-sdk).

**M12. Tauri remote-frontend pattern:** getresonance.vercel.app *is* the
app origin with full IPC to 12 commands, and CSP allows
`unsafe-inline`/`unsafe-eval` (tauri.conf.json:8,25) — an XSS on the web
app escalates to native command execution. Blast radius genuinely small
(kiosk/cursor/audio-cache commands only; no fs/shell/http plugins).
Accept-as-designed, but document; keep the command surface small.

### LOW (abridged)

- Verbose error leakage: journeys/create returns raw Postgres
  message+code; audio/[id]:219; one dream upload route (`String(err)`).
- `shader-prefs` writes global state to `/tmp` (admin-only; ephemeral on
  serverless — silent data loss, not a security issue).
- `ai-image/status` fires an unauthenticated (tiny, 5-min-throttled) FAL
  warm-up render.
- Removed shader `nebula` still in 5 realm pools + vibe-detection map —
  defused by blocklist + MODE_META, but delete the stale entries.
- Unknown shader mode renders black (`visualizer.tsx:983-985`) — falls to
  `null` instead of a safe default; self-recovers via crossfade timeouts.
- No `global-error.tsx`; `/room` and `/recording/[id]` lack per-route
  error.tsx (root boundary + good loading.tsx coverage exist).
- Dead modules: `ambient-engine.ts`, `analysis-queue.ts` (imported nowhere).
- Kiosk audio download buffers whole file in RAM, no size cap
  (cache.rs) — robustness only, host-allowlisted.
- Capacitor `webDir: "public"` = zero offline story on iOS (coherent for a
  remote wrapper; just a known limit).
- Tracked binaries: 5 decks/docx (~800KB total, regenerable).
- react pinned exact 19.1.0 vs next ^15.5 float; eslint-config-next
  version ≠ next version.
- CSP is Report-Only (not enforced) — expected mid-rollout; static headers
  in next.config.ts NEEDS VERIFICATION.
- safe-redirect util is sound; call-site coverage NEEDS VERIFICATION.
- ~24 of 35 scripts are completed one-offs → `scripts/archive/`.

### Verified-clean (worth recording at this maturity point)

- All admin routes fail-closed via `require-admin` (sound, tested).
- SERVICE_ROLE_KEY: 3 server-only uses, all gated; never in client code.
- No secret exposure: no NEXT_PUBLIC_ misuse, no secrets in ios/ or
  src-tauri/ tracked files, ADMIN_EMAIL server-only.
- All 32 dream API routes call `guard()` first; guard order correct.
- RLS on recordings/analyses/markers: owner-only + explicit public
  predicates, correctly scoped.
- No raw SQL anywhere; ffmpeg via execFile array (no shell injection).
- Drug-language rule: zero hits across all 4,200+ dream files AND the 23MB
  logs (only the rule text itself and "black-hole" false positives).
- `.gitignore` correct (tsbuildinfo, target/, .next, .vercel, env, lockfile
  blocking); no build artifacts tracked; src-tauri = 29 source files.
- No hardcoded secrets in scripts/; destructive scripts env-guarded.
- Dream agent: honest self-accounting in STATE.md, kids-pause observed,
  mode alternation followed.

---

## Recommended fix sequence

**Phase 1 — security (do first):**
1. H1: recording_id ownership checks + tighten anon audio/analysis
   predicates to the recording's own public state.
2. H3: verify fal.ai budget cap + Upstash KV envs on Vercel; add origin
   allowlist to `/api/ai-image/generate`; kill the referer-based tier
   upgrade.

**Phase 2 — agent safety nets:**
3. C1: revert runbook in AGENT.md; evaluate deploy-gating on CI green.
4. M3/M4/M5: steering-doc sweep — reconcile rule 10 with jury, amend the
   scope-fence exception, refresh VALIDATION.md, fix cadence language.
5. H5: log rotation policy + one-time `git gc`.

**Phase 3 — correctness & native:**
6. H2: iOS plist keys.
7. M6: wire or delete the installation-machine constants.
8. M2: heartbeat token → header.
9. LOW cleanups: nebula pool entries, dead modules, shader fallback,
   global-error.tsx, error-message tightening.

**Phase 4 — hygiene:**
10. H4: README rewrite; H6: blocked-shaders doc.
11. M7/M8/M9/M11: delete stale SQL + fix-dates.js, prune branches, drop 3
    unused deps, archive one-off scripts, untrack decks.
12. M10: seed core tests (audio-store transitions, journey phase
    interpolation, the H1 authz regression test).

## What static analysis cannot confirm (runtime smoke test)

1. Live audio playback (signed URLs, ALAC transcode, key validity on Vercel).
2. Data presence: featured recordings, Welcome Home path row, enrichments.
3. Kiosk end-to-end over hours on real hardware.
4. fal.ai generation on auth-gated paths.
5. Shader visual quality per device tier.

Suggested pass: sign in → play from library → The Room → one journey →
`/path/d2c79111528a46cf` anonymously → one shared journey →
`/installation?loop=1&debug=1` for 10 minutes.
