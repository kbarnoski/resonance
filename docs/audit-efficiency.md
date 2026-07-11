# Resonance — Efficiency / Performance Audit

_Read-only audit. Date: 2026-07-11. Scope: `~/my-app` source + the checked-in `.next/` build output. Out of scope (untouched): `~/agentic_finance/`, `~/idaho-fishing-dashboard/`, `node_modules`, `.git`, `src-tauri/target`._

Method: read `package.json`, `next.config.ts`, `tsconfig.json`; mapped `src/`; sampled dream routes and shared libs; and — importantly — verified bundle behavior against the actual committed `.next/` build manifests and chunk files (`app-build-manifest.json`, `build-manifest.json`, `react-loadable-manifest.json`, `static/chunks/*`). Findings marked **[measured]** are backed by build output, not inference.

---

## Resolved — 2026-07-11

- **A-1 / R-1 (Medium, highest ROI) — FIXED.** `visualizer-client.tsx` no longer subscribes to raw `currentTime`. Completion detection now reads a floored `Math.floor(currentTime)` selector (re-renders ~1 Hz instead of 15 Hz), and the two fine-grained consumers (`AnalysisHUD`, `TonnetzOverlay`) self-subscribe to raw `currentTime` from the store, so only they reconcile at frame rate — not the ~1400-line parent subtree.
- **D-1 (Low) — FIXED.** Added `prefetch={false}` to the 547-card dashboard grid `<Link>`s (`dream/page.tsx`). The two single history links are left prefetch-on (not a fan-out).

_Still open (not code-only): S-1/S-2 shader lazy-loading + meta split, S-3 dead-shader deletion, N-1 jsonl archival, I-1 PNG→WebP. These need judgment/tooling and are deferred._

---

## Executive summary — top 5 by impact

1. **The 547-route dream lab is already well-optimized [measured] — the feared "550-route bundle bloat" is NOT happening.** All dream pages are `force-static` prerendered (1679 static entries in `prerender-manifest.json`). Each dream page ships only its own 5–8 KB chunk on top of a ~350 KB shared baseline (`react-dom` + framework in chunks `4bd1b696`, `31255`). three.js (1.06 MB, chunk `12179`) is code-split and loaded by only ~7 page entries; TensorFlow (2 MB, chunks `74783`/`61064`) is lazy `import()`-ed and lives in `react-loadable-manifest`. **No heavy dep leaks into the shared bundle.** This is the biggest *potential* issue and it's handled well. (Low severity — see D-1/D-2 for the residual items.)

2. **`visualizer-client.tsx` (the room's main client component) re-renders ~15×/second during playback.** It subscribes to raw `currentTime` via `useShallow` (`src/components/audio/visualizer-client.tsx:306-314`), and the provider pushes `currentTime` into the global store at ~15 Hz (`src/lib/audio/audio-provider.tsx:358-379`). Shader rendering is unaffected (it's on its own rAF/canvas), but a 1400-line React subtree reconciles 15×/sec on the primary experience. **Medium.**

3. **The entire shader source set (175 shaders, ~1.4 MB of GLSL strings) is eagerly imported by anything that touches `@/lib/shaders`, including the root-level audio store.** Tree-shaking currently rescues this — the `SHADERS` object is confirmed absent from the shared chunks **[measured]** — but the safety net is fragile: it depends on `SHADERS` staying unreferenced in the store's import graph. One accidental reference would dump 1.4 MB into the app-wide bundle. **Medium (latent).**

4. **The `/room` route bundles all 175 shaders up-front (~1.4 MB source) even though only 1–3 render at a time.** `visualizer.tsx` imports `SHADERS` from `@/lib/shaders`, which statically pulls every fragment string (`src/lib/shaders/index.ts:1-252`). There's no lazy/per-shader loading. **Medium** for `/room` first-load on weak hardware.

5. **Repo/build weight from dead code & assets:** ~42 shader files exist on disk but are never imported (e.g. `nebula.ts`), a 1.05 MB legacy `journey-feedback.jsonl` is committed and pulled into serverless tracing, and unoptimized PNGs (`flash-angel-1.png` 518 KB) load via raw `new Image()`. None hit the hot client bundle (tree-shaken), but they inflate repo size, CI, and cold-deploy weight. **Low.**

---

## 1. Build / bundle cost of the 547 dream routes

**Verdict: healthy. [measured]**

- 547 dream route dirs; `dynamic = "force-static"` on the dream index/history; every dream page is a client component that prerenders to static HTML. `prerender-manifest.json` has 1679 static entries.
- Shared baseline per dream page (from `app-build-manifest.json`): `webpack` + `4bd1b696` (173 KB) + `31255` (173 KB) + `main-app` (575 B) + `52619` (8.5 KB) + the page's own chunk.
- **Per-page chunks are tiny:** most 5–8 KB; the largest (`454-piano-caption-loom`) is 40 KB. Total across all 548 page chunks = 8.5 MB, i.e. ~15 KB avg, and only the visited page's chunk downloads.
- **Heavy deps are correctly split [measured]:**
  - three.js → chunk `12179` (1.06 MB), referenced by ~7 page entries only.
  - TensorFlow → chunks `74783` + `61064` (~2 MB), in `react-loadable-manifest.json` = lazy `import()` (`src/lib/audio/transcribe.ts:9,70-71`).
  - ffmpeg-static externalized server-side (`next.config.ts:112`).
- `520/547` dream pages use `requestAnimationFrame`; **all 520 also call `cancelAnimationFrame`** — no systemic rAF-leak pattern. Shared `AudioCleanup` (`src/app/dream/_shared/audio-cleanup.tsx`) monkey-patches `AudioContext` to close contexts + pause media on every in-`/dream` navigation, covering prototypes that don't self-clean.
- Shared vote/admin state is fetched **once** for the whole zone via `DreamVotesProvider` (`votes-provider.tsx:32-54`) — no N+1 per card.

### Findings
- **D-1 (Low) — dashboard renders 547 default-prefetch `<Link>`s.** `src/app/dream/page.tsx:484-531` maps every prototype to a `<Link>` with no `prefetch={false}` (0 occurrences found). In App Router prefetch is viewport-gated, so it's not catastrophic, but scrolling the index can fan out many prefetch requests. **Fix:** add `prefetch={false}` to the grid `<Link>`s (detail nav already jumps via `PrototypeNav`).
- **D-2 (Low) — 31 dream pages create a raw `THREE.WebGLRenderer`; 40 import three.** These correctly land in the split `12179` chunk, so no shared-bundle cost. Spot-check whether each disposes its renderer on unmount (grep shows 166 dream pages call some `.dispose()`; the WebGLRenderer subset should be audited for `renderer.dispose()` + `forceContextLoss()` to avoid GPU-context exhaustion when hopping between 3D prototypes). **Fix:** add a lint/codemod ensuring every `new THREE.WebGLRenderer` has a matching `dispose()` in cleanup.

## 2. Audio engine & Web Audio

**Verdict: strong.**

- `audio-engine.ts` is a textbook module-level singleton: one `AudioContext`, one `HTMLAudioElement`, `createMediaElementSource()` called exactly once (`:50-62`), guarded resume (`:83-87`), and priming race-guards (`:122-169`). No multi-context creation, node graph built once.
- `startAmbient`/`stopAmbient` (`:175-195`) disconnect the oscillator/gain on stop.
- Provider cleans up its rAF, `pagehide`/`beforeunload`, and media-session handlers on unmount.

### Findings
- **A-1 (Medium) — 15 Hz global store writes drive app-wide re-renders.** `audio-provider.tsx:358-379` calls `useAudioStore.getState().setCurrentTime(...)` every ~66 ms during playback. Any component subscribing to raw `currentTime` reconciles 15×/sec. Known subscribers: `visualizer-client.tsx:306-314`, `journey-feedback.tsx:304,371`, `installation-debug-hud.tsx:101`. **Fix:** keep the high-frequency `currentTime` out of the React store — expose it via a ref/`useSyncExternalStore` with a coarse (1 Hz, rounded) selector for UI, or split it into a separate lightweight store that only the transport/progress subscribes to. The transport bar already rounds (`visualizer.tsx:568`); the fix is to stop the *large* `visualizer-client` subtree from subscribing to the raw value.
- **A-2 (Low) — `getDataArray()` allocates a new `Uint8Array` per call** (`audio-engine.ts:77-80`). Fine if called once, but any per-frame caller would thrash GC. Confirm callers cache the array (the room's `ShaderVisualizer` correctly receives `dataArray` as a prop and reuses it).

## 3. Three.js / WebGL / shaders

**Verdict: the room's raw-WebGL path is excellent; r3f dream pages need spot disposal checks (D-2).**

- `ShaderVisualizer` (`visualizer.tsx:178-458`) is a model implementation: async `KHR_parallel_shader_compile` to avoid main-thread freezes, **full GPU cleanup on unmount** (`deleteBuffer`/`deleteProgram`/`deleteShader`, `disableVertexAttribArray`, `:437-448`), `webglcontextlost`/`restored` recovery with an epoch to re-arm (`:205-231`), device-tier resolution scaling (0.55/0.75/1.0×) and frame caps (30/45/uncapped fps) (`:284-290`). This directly matches `device-tier.ts` and the memory notes.
- A/B/tertiary crossfade layers reuse persistent canvases (no remount, no context churn) and clear all fade rAFs + timeouts on unmount (`:689-695`, `:785-791`, `:875-881`, `:948-953`).
- `Visualizer3D` (three.js) is lazy-loaded via `next/dynamic({ ssr:false })` so three's parse cost is deferred until a 3D shader is picked (`visualizer.tsx:17-19`).

### Findings
- **S-1 (Medium) — `/room` eagerly loads all 175 shader sources.** `SHADERS` (`index.ts:253`) statically imports 175 `FRAG` strings (~1.4 MB source). Only 1–3 render at once. **Fix:** convert the registry to lazy per-shader loaders (`() => import('./fog').then(m => m.FRAG)`) resolved on demand at crossfade time, keeping only `MODE_META`/`MODES_3D` eager. Cuts `/room` first-load JS substantially on low-tier hardware.
- **S-2 (Medium, latent) — `SHADERS` co-located with `MODE_META` in one module.** Because `audio-store.ts:12`, `journey-engine.ts`, and `journeys.ts` import lightweight metadata from `@/lib/shaders`, they transitively pull the module that defines the 1.4 MB `SHADERS`. Tree-shaking currently drops it **[measured: shader source absent from `main-app`/`31255`/`52619` shared chunks]**, but this is a single accidental reference away from shipping 1.4 MB to every page. **Fix:** move `MODE_META`, `MODES_3D`, `MODE_CATEGORIES` into a separate `shaders/meta.ts` with zero FRAG imports, and have the store/journey libs import only from there. Makes the win structural instead of luck.
- **S-3 (Low) — dead shader files.** 217 shader `.ts` files on disk, 175 imported → ~42 unimported (e.g. `nebula.ts`, per `index.ts:24` comment). Tree-shaken from the bundle but they inflate repo/CI/typecheck. **Fix:** delete the confirmed-dead files (cross-check against `blocked-shaders.md`) or move them to a `_disabled/` folder excluded from `tsconfig`.

## 4. React render efficiency

**Verdict: good discipline overall; one hot subtree (A-1) is the main issue.**

- Consistent `useShallow` batched selectors and stable action selectors (`visualizer-client.tsx:306-329`). Transport rounds `currentTime` to whole seconds in its selector to avoid 15×/sec churn (`visualizer.tsx:566-568`) and relies on CSS transitions for progress-bar smoothness — good pattern.
- Root provider tree is minimal (`providers.tsx`): `ThemeProvider` → `AudioProvider`. Splash-screen import is lazy and iOS-gated.

### Findings
- **R-1 (Medium) — see A-1:** `visualizer-client.tsx` subscribing to raw `currentTime` is the one place the good rounding discipline breaks, and it's the largest component in the app. Highest-value single React fix.
- **R-2 (Low) — `visualizer.tsx` is 2080 lines / `visualizer-client.tsx` ~1400 lines.** Monolithic components re-run large render bodies on any subscribed change. Not a correctness bug, but splitting the mode-picker panel and transport bar into memoized children would shrink each re-render's reconciliation cost (compounds with A-1 until A-1 is fixed).

## 5. Data / network

**Verdict: no N+1 / waterfall issues found.**

- 33 app API routes + 31 dream API routes; no `await supabase` inside `for`/`.map` loops detected (grep found none). Batch inserts use a single `.insert(rows)` (`journey-feedback/route.ts:35`).
- `DreamVotesProvider` batches votes + admin into one `Promise.all` (`votes-provider.tsx:36-43`).
- Analysis is deferred/queued (`analysis-queue.ts`, `analysis-runner.ts`) rather than blocking.

### Findings
- **N-1 (Low) — 1.05 MB legacy `journey-feedback.jsonl` is committed and read at runtime** (`journey-feedback/route.ts:10`, GET path). New writes go to Supabase; the file is legacy-read-only but is pulled into the route's serverless file tracing, adding cold-deploy weight. **Fix:** migrate the historical rows into Supabase and drop the file from the route (and repo), or move it behind an admin-only, on-demand fetch from object storage.

## 6. Dead code / unused deps / duplicate logic

### Findings
- **DC-1 (Low) — ~42 unregistered shader files** (see S-3).
- **DC-2 (Low) — verify unused heavy deps.** `package.json` lists `@spotify/basic-pitch`, `@tensorflow/tfjs`, `@ffmpeg/ffmpeg`, `recharts`, `gsap`, `openai`, `@ai-sdk/*`. All are legitimately used or lazy-loaded, but a `depcheck`/`knip` pass would confirm none are fully orphaned now that TF transcription is one path. **Fix:** run `npx knip` and prune.

## 7. Images / assets

**Verdict: minor; no oversized bundled assets.**

- `public/` is 12 MB total. Largest: `Resonance-Installation-Deck.pdf`, `journey-reel.webm`, `flash-angel-1.png` (518 KB), `flash-angel-2.png` (327 KB), and the TF model `group1-shard1of1.bin` (742 KB) + `model.json` (174 KB).
- **0 uses of `next/image`** anywhere in `src/components`/`src/app`. Images render via CSS `backgroundImage` or raw `new Image()` (e.g. `flash-angel.tsx:62`).

### Findings
- **I-1 (Low) — `flash-angel` PNGs (518 KB / 327 KB) are unoptimized and hand-loaded** (`flash-angel.tsx:30,62`). On the immersive room path these decode a large PNG. **Fix:** convert to WebP/AVIF (likely <100 KB each) and/or preload at correct display size. `next/image` isn't usable for `new Image()`-driven canvas compositing, so optimize the source files directly.
- **I-2 (Low) — large static PDF/webm in `public/`** ship to the CDN. Fine if intentionally shareable; otherwise move behind object storage to trim the deploy.

---

## Quick wins (low effort, real payoff)

1. **Split `currentTime` out of the room's big subtree (A-1/R-1).** Stop `visualizer-client.tsx` from subscribing to raw `currentTime`; read it from a ref or a dedicated coarse selector. Eliminates 15 Hz reconciliation of a 1400-line component. _Highest ROI._
2. **Add `prefetch={false}` to the 547 dashboard `<Link>`s** (`dream/page.tsx:484`). One-line change, cuts prefetch fan-out.
3. **Delete the ~42 dead shader files** (cross-check `blocked-shaders.md`) — repo/CI/typecheck weight.
4. **Convert `flash-angel-*.png` to WebP/AVIF** — ~700 KB → <200 KB on the room path.
5. **Drop / archive `journey-feedback.jsonl`** (1.05 MB) from the repo + route tracing.
6. **Run `npx knip`** to confirm no orphaned heavy deps.

## Larger refactors (higher effort, structural)

1. **Lazy-load shaders per-mode (S-1).** Turn `SHADERS` into on-demand `import()` loaders resolved at crossfade time; keep only metadata eager. Cuts `/room` first-load ~1.4 MB of GLSL on low-tier devices.
2. **Split `@/lib/shaders/index.ts` into `meta.ts` (eager, tiny) + `registry.ts` (lazy FRAG loaders) (S-2).** Makes the current tree-shaking win structural, not accidental — protects every page from a future 1.4 MB regression.
3. **Decompose `visualizer.tsx` (2080 lines) and `visualizer-client.tsx` (1400 lines) (R-2)** into memoized subcomponents (shader layers / mode palette / transport) so high-frequency store updates only re-render the piece that changed.
4. **Codemod/lint for three.js disposal in dream prototypes (D-2):** enforce `renderer.dispose()` + `forceContextLoss()` for every `new THREE.WebGLRenderer` to prevent GPU-context exhaustion when browsing 3D prototypes.

---

### What's already excellent (don't touch)
- Audio engine singleton and node-graph lifecycle (`audio-engine.ts`).
- `ShaderVisualizer` GPU cleanup, async compile, context-loss recovery, device-tier gating, frame caps.
- Dream-lab static generation + per-route code splitting + lazy heavy deps (**the feared bundle-bloat is not present** [measured]).
- Shared dream infra: single votes fetch, global audio cleanup on navigation, prev/next nav.
