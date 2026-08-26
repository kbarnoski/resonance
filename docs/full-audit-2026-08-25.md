# Resonance Full-System Audit — 2026-08-25

**Method:** Eight parallel deep-dive agents, each owning one domain, all reading actual code
(read-only). Domains: Studio, The Room, Paths/Welcome Home, Journeys/Shaders,
Installation/Tramokyo, Dream Lab (all 1,153 protos swept, ~150 read at code level),
UI/Aesthetics (full-surface sweep), Architecture/Security (including live production probes).
Findings below are deduplicated and cross-referenced; items confirmed independently by two or
more agents are marked **[×2]/[×3]**.

**Caveat:** the local checkout (HEAD `52e421c8`) is ~7 days behind production (`246daf1`).
Code findings are against the local snapshot; production was probed directly where behavior
mattered.

---

## Executive summary

The core architecture is in strong shape: the audio engine singleton was rated
"textbook-correct," the visual transition system "genuinely sophisticated," the installation
FSM's watchdog design "excellent," the offline pack "genuinely desert-grade," and dream-lab
governance "unusually mature" (rule 10 hit 100% compliance within one cycle). The problems
cluster in five cross-cutting themes:

1. **Protection that never existed.** `middleware.ts` has never executed — it sits at repo
   root while Next 15 only scans `src/`. Empty `middleware-manifest.json`, no CSP headers on
   any production response, anon `/room` returns 200. Every past claim of "middleware
   allowlist" and "security headers in middleware" described fiction. Layered auth
   (studio layout, per-route `getUser()`, RLS) carried the load — but anon RLS is itself
   wide open: the entire catalog (paths, journeys, recordings, **including quarantined
   17th St/Folsom titles and storage file names**) is enumerable via the anon REST API.
   Rate limits are per-lambda until Upstash KV is connected.

2. **The "never abrupt" law was only applied to pixels.** The visual layer is exemplary
   (2.5s eased crossfades, 3s intro fades). The audio layer got none of it: every
   pause/stop/track-switch/volume change is an instant cut or gain step. The chrome layer
   also contradicts it: `duration-75` is the de-facto interaction default (52 uses), and
   four hand-rolled Room modals pop with zero transition.

3. **Dormant ≠ dead.** Film grain — the banned effect — is a live-but-dormant pipeline: six
   journeys declare non-zero `filmGrain`, the engine interpolates it, the renderer draws it;
   one hardcoded prop is the only enforcement **[×2]**. The removed `nebula` shader still
   sits in `AI_BACKDROP_SHADERS`, causing deterministic black backdrops + 3s crossfade
   stalls **[×3]**. `depths` is missing from the safety-net blocklist its test claims to
   cover. The dead middleware is the extreme case of the same disease.

4. **The share moment is undercooked.** Stock create-next-app favicon, zero OG/social
   metadata **[×2]**, no custom 404 — a Welcome Home link unfurls imageless with a Next.js
   logo in the tab. Worse: the Cosmic Homecoming culmination is effectively unreachable for
   shared-link visitors (completion only on `ended`, no partial credit, one device's
   localStorage), and the culmination CTA only appears if track 13 is finished last.

5. **Tramokyo rests on one unsupervised process on a Mac allowed to sleep.** The in-page
   resilience is excellent and the offline story passes an 8-hour zero-network test — but
   `nohup npm run start &` with no LaunchAgent, no auto-login, and no `caffeinate` means a
   generator blip = black projector until a human intervenes, and a node crash mid-show =
   watchdog reloads Chrome into a dead server = permanently dead screen.

---

## P0 — Tramokyo-critical (do before the desert)

| # | Item | Source |
|---|------|--------|
| 1 | **Supervise the stack**: launchd LaunchAgent with `KeepAlive` for the OFFLINE_PACK server, macOS auto-login, Chrome relaunch/retry wrapper (or local static bootstrap page that polls :3000 and redirects) | Installation SEV-1 |
| 2 | **Kill sleep**: `caffeinate -disu` (or pmset) in `tramokyo-kiosk.sh`; pre-show power checklist (auto-login, screensaver off, notifications off, brightness) | Installation SEV-1 |
| 3 | **Full dress rehearsal** on the real laptop + projector: 65-min two-program offline cycle, all three hotkeys (never browser-tested), phone remote over hotspot (never phone-tested), forced mid-journey power pull, Wi-Fi-off pass | Installation SEV-2 |
| 4 | **Fix the blob-URL leak**: `resolve-audio-url.ts` never revokes object URLs — an 8-hour loop accretes hundreds of MB; also stop persisting `blob:` URLs to sessionStorage (dead after reload → error cycle exactly when the kiosk recovers) | Security N2 |
| 5 | **Port the 3D force-remount fallback to the 2D visualizer** (`visualizer.tsx`): 8s timer after `webglcontextlost` with no `restored` event → bump epoch. The 2D path is what the installation route actually uses | Installation SEV-2 |
| 6 | **Add a `reload` command to the phone remote** (`use-kiosk-remote.ts` + `/remote` UI) — the one recovery that fixes most wedges, currently requires physically reaching the laptop | Installation SEV-3 |
| 7 | **`git fetch` before any laptop work** — local is ~7 days behind the dream agent's prod; any kiosk build/hotfix from this checkout targets stale code | Security N4 |
| 8 | **DECISION NEEDED: quarantined tracks in the offline pool.** All 34 pack recordings (incl. `17th St 64`, 18:40) are in the fallback/DJ pool; the 18-min track also exceeds the 8-min journey cap and will be cut mid-piece | Installation SEV-3 |
| 9 | **Update the runbook** (`docs/installation-venue-setup.md`): stale date, 5-journey-cycle framing, fallback-library claims for an empty feature, no power/sleep checklist, missing restart-after-reharvest gotcha; copy the 4-phase plan into docs/ (it exists only in Claude memory) | Installation SEV-3 |
| 10 | **Re-export + re-harvest the pack right before the event**, restart server after (manifest is cached for process lifetime), re-run offline smoke | Installation SEV-4 |
| 11 | Fallback image library (`public/installation-fallback/`) is **empty** — populate (~30 imgs/journey) or strip the runbook claims; affects online `/installation` as venue backup | Installation SEV-2 |
| 12 | De-risk the build path: keep a known-good `.next` backup or second pre-built laptop; fix hardcoded nvm v22 path in `tramokyo-kiosk.sh` (rebuild needs Node 20) | Installation SEV-3 |

## P0 — Safety (photosensitivity)

- **`typhoon` strobes at 15 Hz unconditionally** (`typhoon.ts:116`) — not audio-gated,
  smoothMotion does not suppress it, on no blocklist, pickable by any journey. Fix (slow
  seeded, enveloped flash) or blocklist.
- **`monsoon` has a full-frame additive flash at up to 30 Hz** (`monsoon.ts:36,48`) —
  dormant in journeys (synthetic bass too low) but live in audio-reactive mode. Squarely
  in the photosensitive-seizure band. Fix or blocklist.
- These are the only two genuine strobe sources among 234 registered frags; the
  lightning family and other scary-named shaders verified smooth. Note 39 orphan shader
  files on disk are unregistered — `storm` and `R2_THUNDERHEAD` would be strobe risks if
  ever re-registered.
- **Ghost white flash fires on every auto-detected `bass_hit`**, not just curated cues
  (`journey/[token]/client.tsx:622-631` + visualizer-client mirror) — busy analyses become
  repeated white strobes and break the two-beat dark→white angel narrative. Also
  single-frame 0→0.95 onset; add a 100–150ms eased attack.

## P1 — Security

1. **Lock down anon RLS** — the headline. Replace blanket anon `SELECT` on
   `journey_paths`/`journeys`/`recordings` with token-matched policies, or move public
   reads behind server routes filtering by token. At minimum stop returning `file_name`,
   `user_id`, and unreleased titles to anon. (Keeps dream lab + path links fully
   login-free — this is about row filtering, not auth.)
2. **Decide the middleware question deliberately**: (a) delete `middleware.ts` and codify
   "protection lives in layouts + routes + RLS," or (b) fix its allowlist (simplest: pass
   all `/api/*` through) and `git mv` to `src/middleware.ts`. **Do not naively move it** —
   as-is it would break anon Welcome Home playback and the Tramokyo kiosk. If (b),
   smoke-test anon `/path/d2c79111528a46cf`, heartbeat POST, kiosk first. Add a tripwire
   test: middleware-manifest must be non-empty if a middleware file exists.
3. **Connect Upstash KV on Vercel** — makes per-IP limits, global fal caps, and
   shader-prefs durable in one move. Highest security-value-per-minute item left.
4. **`/api/ai-image/token` (GET+POST) and `/validate`: add `checkOrigin` + global daily
   cap** — currently the largest open FAL_KEY exposure (~1,800 req/hr/IP, no aggregate
   ceiling; fal budget cap is the only backstop). Parity with `generate`, no login needed.
5. **Rate-limit `/api/audio/[id]`** (esp. `?transcode=1` — full storage download + ffmpeg
   per anonymous request) and validate the Range header (`parseInt` NaN slice) **[×2]**.
6. **Close C1 (agent→prod gate)**: Vercel Ignored Build Step keyed on CI status. The agent
   ships ~12×/day; CI currently runs after push — detection, not prevention.
7. `?view=app` on path pages grants in-app context to any signed-in user, not just the
   owner (`path/[token]/page.tsx:97`).
8. Minor: heartbeat status GET carries token in query string; error pages render raw
   `error.message` to guests (`error.tsx:40`, `room/error.tsx`).
9. Recording IDOR (H1/M1): **still open by explicit owner ruling** — accepted risk,
   unchanged, do not silently re-harden. A skip-marked regression test is recommended.

## P1 — The share moment (Welcome Home arc)

1. **Brand icons + OG**: replace stock `favicon.ico` with the ResonanceMark (exists,
   unused), add `apple-icon`, dark `opengraph-image` (ideally dynamic per-path: Cormorant
   title + gold gradient), `openGraph`/`twitter` metadata + `metadataBase` in root layout
   and `path/[token]/generateMetadata`. Delete `next.svg`/`vercel.svg` leftovers **[×2]**.
2. **Make the culmination reachable**: mark tracks complete at ≥90% listened (not only
   `ended`), and/or a discreet "continue" affordance. Today an anonymous visitor must play
   all 13 tracks to their natural end on one device — the album's payoff is effectively
   dead on shared links.
3. **Decouple the culmination CTA from play order** (`journey/[token]/client.tsx:1741`):
   gate on `allDone` alone, not `currentIndex === last && allDone`.
4. **Custom 404** (`not-found.tsx`) in the quiet error-page voice — a mistyped share token
   currently lands on Next's unstyled system 404.
5. Durable progress: mirror path progress to DB for signed-in users; "you're 8 of 13 in"
   resume banner for anon.
6. Cache the public path payload (identical for all anon viewers; currently
   `force-dynamic` + double query on every hit).
7. Record-keeping: Welcome Home tokens are **16 hex chars** (builder slice), Snowflake is
   full UUID — either regenerate or update the docs; 64 bits is fine once RLS is fixed.

## P1 — Audio abruptness (the other half of the law)

1. **Gain envelope on every stop/start**: ~200ms `linearRampToValueAtTime` on the engine
   gainNode before `pause()`/src-swap (`audio-provider.tsx:184,343`;
   `audio-store.ts:514`) and for volume/mute (`audio-provider.tsx:355` — mute currently
   snaps 0.8→0 and can click).
2. **Journey-start session token**: increment a ref at the top of
   `startCustomById`/`handleContinuePath`/`handleReplayJourney`, check after each
   await/timeout, abort if stale — replaces the fragile 50/60/80ms setTimeout choreography
   that lets two rapid path-dot clicks interleave (journey A's visuals over journey B's
   audio).
3. **Fade the journey selector** (250–400ms) and ramp the pause when opening it — the
   most-touched abrupt transition in The Room; same treatment for visualizer library,
   create-journey dialog, shader picker, and the mobile nav scrim **[×2]**.

## P2 — Rendering & engine hygiene

1. **Null dual-layer modes when fade-out completes** (`visualizer.tsx:853-873`) so the
   canvases unmount — currently invisible WebGL contexts render full-screen frag passes
   forever; likely the root cause of iOS context-loss pressure (5–6 live GL contexts
   possible) **[×2]**. Add a `paused` prop to suspend drawing at opacity≈0.
2. **Purge `nebula` from `AI_BACKDROP_SHADERS`** (`visualizer.tsx:27-30`) and
   `LIGHT_SHADERS` (`visualizer-client.tsx:1339`); have the black-div branch call
   `onReady`; add a dev assertion that every listed id exists in `SHADERS` **[×3]**.
3. **Abort crossfade on compile failure** instead of completing into a dead layer
   (currently 2.5s crossfade to stale frame/black for 10–16s) **[×2]**.
4. **Freeze shader switching while paused** (`use-journey.ts:94-125` polls wall-clock
   regardless of `isPlaying` — a long pause silently exhausts journey-wide shader variety).
5. **Kill film grain for real**: zero the six `filmGrain` values
   (`journeys.ts:365,393,422,449,476,503`), strip the grain path from
   `post-processing-layer.tsx`, blocklist grain in dream steering docs (~19 protos ship
   it) — or rename fields `deprecated_` so the law can't silently regress **[×2]**.
6. Apply the tier frame cap + cached canvas size to `PostProcessingLayer` (uncapped 60fps
   rAF + per-frame gradient allocations); move compositor bass-hit detection out of render
   (StrictMode double-counting flips the Ghost variant sequence); disconnect the live-mode
   mic source node on cleanup; add `depths` to `GLOBAL_SHADER_BLOCKLIST` (test claims it's
   there — it isn't); fix compounding event-impulse decay (`journey-engine.ts:381`).
7. **DECISION NEEDED — Ghost face/eyes**: the dark-variant prompt ("eyes wide OPEN, jet
   black orbs") and both PuLID reference portraits (face visible, eyes open) contradict the
   recorded rules (eyes closed, no faces). `flash-angel.tsx` documents it as deliberate
   ("the only moment the figure's face is shown"). Bless the exception or fix the prompts.

## P2 — Studio correctness

1. **Delete the forked URL resolver in `waveform-player.tsx:45-128`** — it re-introduces
   the fixed 50-min-TTL stale-URL bug through the same sessionStorage key that
   `resolve-audio-url.ts` deliberately cut to 5 min. Import the shared resolver.
2. **`interact: false` on WaveSurfer when `!isCurrentTrack`** — clicking a non-current
   recording's waveform currently seeks the globally playing track.
3. **Fix the no-peaks branch** (`waveform-player.tsx:331-339`): decode peaks off a
   detached fetch instead of loading the shared element — currently first-visit recordings
   are unplayable while anything else plays (dead-end), and a paused-track src swap can
   play B's audio under A's title.
4. Fallback `<audio>` points at the JSON endpoint (`waveform-player.tsx:495`) — can never
   play.
5. **Delete-cleanup helper**: pause/clear store when deleting the current track, purge URL
   cache, one consistent storage-then-DB error policy (card and detail currently differ).
6. **Harden the upload loop**: disable Upload + per-row remove during a batch, stable row
   keys (not indices), read fields from latest state, delete storage object on DB-insert
   failure.
7. Move AnalyzeButton's completion pickup into `useEffect` (setState-during-render).
8. Fix chat auto-scroll (`scrollTop` set on Radix Root, not the viewport) in chat-panel +
   compare.
9. Unify "analyzed" semantics (`status === "completed"`) across library/insights/compare;
   fix `/recording` → `/upload` dead link; trim compare's full-notes over-fetch.
10. **Add a persistent now-playing bar to studio chrome** — engine survives navigation by
    design but there is no pause/indicator anywhere outside recording detail.

## P2 — Design system unification

**Three highest-leverage systemic fixes** (each collapses many findings):

1. **Tokenize motion**: `--duration-instant: 150ms / fast: 250ms / surface: 400ms /
   scene: 2500ms` + `--ease-enter: cubic-bezier(0.16,1,0.3,1)` (the app's proven curve).
   Retire `duration-75` (52 uses). Makes "never abrupt" enforceable — including by the
   dream agent — instead of aspirational.
2. **Canonize the glass dialect**: the white-alpha-on-black language is the product's best
   look but is unowned. Promote it: `glass` Button/Input/Card variants in `ui/`, a named
   alpha ladder (`--ink-faint: 45% / --ink-mute: 60% / --ink: 85%`), and extracted
   `<Eyebrow>`/`<DisplayTitle>`/`<MonoLabel>` components (the Cormorant/mono voice is
   currently inline-style literals — 11+ core files, 388 copies in the dream lab).
3. **Make share-readiness first-class** (see P1 above — favicon/OG/404/metadata).

**Punch list:** unify the two purples (WaveSurfer `#6366f1` → `--primary` violet); raise
the text-alpha floor to `/45` for readable text (39× `/30`, 24× `/35` fail WCAG at 10–11px);
normalize radius (cards `xl`, controls `md`, pills `full`; fix `rounded-[7px]` pair);
`focus-visible` rings on the ~113 raw buttons (installation/operator surface is
keyboard-invisible); `prefers-reduced-motion` support (zero in core; pattern proven in
`floatwell.module.css:229`); global `::selection` + real scrollbar styling (`scrollbar-thin`
is a dead class — no plugin); 44px touch targets (path dots 24px, remote volume ~34px) +
`env(safe-area-inset-*)` on `/remote`; theme the operator cluster (raw emerald/red/amber
dots with no transition; 4-operator's six-color rainbow vs the single-hue identity);
consolidate the two blacks as named tokens (`--void` pure black for projection surfaces,
violet-black `--background` for chrome); one skeleton language; segmented Room control
needs a visible disabled state; `text-[9-11px]` floor.

## P2 — Dream lab governance

1. **Close the drug-language regex gap at the root**: AGENT.md rule-9 prose bans "come-up"
   but the enforcement regex (lines 39, 108) doesn't include it — exactly how the three
   stragglers shipped. Add `\btrippy\b|\bcome-?up\b|mescaline|peyote|salvia|entheogen` +
   a judgment check for dose/titrate-as-state-dial metaphors.
2. **Scrub the three stragglers** (Karel-directed, protos immutable to the agent):
   `2332-lock` "trippy"→"earned bloom"; `1770-visionary-hyperbolic` "come-up"→"rise";
   `6360-honeycomb` "dose/titrate"→"intensity/depth". Archives otherwise clean (initial
   k-hole "hits" were `black-hole` regex false positives).
3. **DECISION NEEDED — safeMaster retrofit** (explicit immutability exception) for six
   unlimited-output protos: `13040-spectralhold` (worst — gain 0.9 straight to
   destination, no limiter), `7720-mandelbulb`, `8952-tensegrity`, `6296-flowbody`, kids
   100/164/216. Also decide `13168-preparedchance` (the one rule-10 breach, shipped ~6h
   after the rule landed, 100% synthesized): retrofit a catalog buffer or log as
   sanctioned exception.
4. Fix `VISIONARY.md:20` ("30-recording catalog" → 16 verified tracks) so no future cycle
   is steered toward quarantined audio (welcomeHome.ts would still block it, but fix the
   doc).
5. **Feature shelf** — 1,153 flat entries bury the portfolio. Tramokyo/YC demo set:
   16032-headnave, 16000-morphonate, 15824-canon (jury's lone 5/5), 15536-antiphon,
   15440-spheres, 13904-unmixer, 13840-hallofsongs, 14784-nave, 700-welcome-home,
   703-harmonic-bloom, + 11680-corridor and 1081-singularity-fall from the visionary era.
6. Retire/de-emphasize: 15920-duetlink (jury 2/5, false "first multi-user" claim), the
   four `/api/featured` stragglers (308/321/323/327 — silently play synth while claiming
   real music), the four near-duplicate EDM build-drop pieces.
7. Refresh stale `/dream` chrome: "autonomous hourly cycles" → twice-daily; repoint links
   off the retired `dream/sandbox` branch; extend FAL-badge detection beyond `@fal-ai/client`.

---

## Decisions needed from Karel

1. **Quarantined tracks** in the Tramokyo offline DJ/fallback pool — allow or exclude?
2. **Ghost face/eyes** — bless the "face only at flash moments" exception or fix prompts?
3. **Middleware** — delete (codify layout/route/RLS model) or fix allowlist + move to `src/`?
4. **safeMaster retrofit** — authorize the immutability exception for the six protos?
5. **13168-preparedchance** — retrofit real music or log as sanctioned exception?

## Corrections to the record (found during audit)

- "Security headers in middleware" / "`/path/[token]` in middleware allowlist" — **fiction;
  middleware never executed.** Real protection: studio layout + per-route auth + RLS.
- "Share tokens: full 32-char UUID" — Welcome Home path + journey tokens are **16 hex**;
  only Snowflake uses full UUID.
- "No film grain — disabled globally" — **dormant, not removed**: six journeys declare
  values, pipeline intact, one hardcoded prop enforces the law.
- "LOW_TIER_BLOCKED_SHADERS in device-tier.ts" — the shader blocklist lives **only in
  journeys.ts**; device-tier.ts holds profile knobs.
- Memory said `/demo` route exists — there is no `/demo` route file; it's a rewrite to
  `/room/installation?loop=1&once=1` (`next.config.ts:99-101`).
- The Tramokyo 4-phase plan exists only in Claude memory, not in `docs/`.
