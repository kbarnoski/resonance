# Particle system performance audit — 2026-10-07

Karel: "do an insane intense deep dive on performance of the particle system
across all journeys and log it then identify issues and fix them … professional
grade and ready for the event."

## Verdict

After the fixes, the particle system adds **no measurable frame cost anywhere**
in the Tramokyo loop:

- 117 journey records (every setlist entry) × 3 windows = 351 samples. Every one held 60 fps with p95 ≤ 16.8 ms and **zero frames over 100 ms**. The worst single frame anywhere was 34 ms.
- Particles were on screen in 346 of the 351 samples; all 19 programs were warm and none failed. So this measured the real thing.
- **12 consecutive real journey handoffs** in one continuous page: zero frames over 50 ms, heap flat, particle textures constant.
- The fixed build is frame-for-frame identical to the **particles-off** reference.

The one real problem was a **~430 ms burst of long frames at the start of a page's first journey**: Snowflake's opening title on the kiosk, while its particles gather. It is fixed, along with three smaller costs.

## Method

**Hardware.** The kiosk Mac (M4 Pro), installed Chrome headless on the real GPU (`channel:"chrome"`, `--use-angle=metal`), 1440×900 at DPR 1, as on the kiosk. The visible kiosk Chrome was never touched.
- The probe stubs `/api/pack/remote`, `/api/review/glitch-log` and `/api/pack/log`, so it never posts kiosk status or pollutes the forensic log.
- **Contention guard:** before each journey the harness waits until no other GPU rig is running (the kiosk Chrome, the journey-review recorder). Any sample during which one started is flagged. Contended samples are excluded; best-of-2 otherwise.

**Builds.**

| Label | Build | Port |
|---|---|---|
| **before** | HEAD 40c07b9b without these changes (separate git worktree) | 3200 |
| **after** | HEAD 40c07b9b + these changes | 3100 |
| **off** | after, with `?particles=0` | 3100 |

**Harnesses** (`scripts/.perf/`, untracked):

| Script | What it does |
|---|---|
| `sweep.mjs` | Per journey, fresh page `?loop=1&start=<id>`, three windows: **opening** (first 16 s: title resolve, opening emblem, first forms), **mid** (12 s from 0.42 × duration, usually a morph or peak), **closing** (13 s from duration − 19 s, the closing emblem). Records rAF intervals (fps, p50/p95/p99, max, gaps over 50/100 ms), Long Animation Frames with script attribution, long tasks, per-rAF-callback CPU (mean/max/calls), WebGL calls over 6 ms, JS heap, live WebGL textures and the particle probe. `REPS`, `PARTICLES=0`. |
| `handoffs.mjs` | One continuous page from Snowflake, each track seeked to 8 s before its end so the loop hands over naturally. Measures 24 s around each of N real handoffs, plus heap, textures and canvases. |
| `align.mjs` | Lines up every long frame with the app's own flight-recorder events, captured from the stubbed upload. `BLOCK=<glob>` ablates a resource. |
| `uvbench.mjs` | Importance sampler, old vs new, in Chrome on a real pack still. |
| `agg.py` | Best-of-N aggregation, excluding contended reps. |

**Contamination (disclosed).** The first passes ran while the kiosk was playing and while another agent's journey-review recorder used the GPU. Those results were discarded. They had produced two false conclusions, corrected below: an apparently catastrophic sampler and a "Kinetic Lab GPU sag". Every number in this report comes from the idle machine. Headless rAF is vsync-capped at 60 Hz, so this proves "never drops a frame at 60 Hz". It cannot show headroom. Uncapped runs (`--disable-gpu-vsync`) and GPU timer queries both proved unusable under ANGLE/Metal.

**Real-kiosk evidence (before fixes).** Today's `docs/glitch-events.jsonl` sessions, with frame gaps correlated to events within ±400 ms; hidden-window and deploy-restart gaps excluded:

| Co-occurring event | Count |
|---|---|
| Shader primary/dual/tertiary switches | 54 |
| Still arrivals | 59 |
| Journey change | 24 |
| Particle events | 16 |
| No event | 20 |

## Issues found and fixes

### 1. Motif library flood at the first journey's start (the real offender)
- **Where:** `src/components/audio/particle-lead-layer.tsx`, `loadMotifLibrary().then(…)` in the main layer effect.
- **Cause:** the layer decoded and drew **all 54 motif designs at once** into 54 GPU-backed canvases when the first journey mounted. That is ~54 MB of GPU raster and upload in a burst.
- **Measured** with `align.mjs` on Snowflake: four consecutive long frames (50 + 83 + 133 + 167 ms) starting right after `journey-change`, under the opening title. The particles are invisible then, but the title's particle resolve, the shaders and the opening imagery all hitch.
- **Ablation:** blocking `**/motif-forms/**` removes all four. With `?particles=0` there are none.
- **When it happens:** once per page load (the cache is module-level), so on the kiosk it's Snowflake's opening after every load, reload or deploy. Later journeys were already clean; see the baseline handoffs.
- **Fix:** the library **trickles in**, one design per idle slot (≥160 ms apart), starting 6 s after mount. Motifs are first needed after a full form hold (16 s+), and `startMotif` already uses only decoded designs. The timer is cleared on unmount.
- **Result:** zero long frames in the opening of every journey (table below).

### 2. GPU readback in every importance-sampling pass
- **Where:** `particle-lead-layer.tsx`, the motif, emblem, echo and moment loaders and the dissolve brightness probe.
- **Cause:** the source canvases were default (GPU-accelerated) 2D canvases. `computeUv` draws them into a `willReadFrequently` canvas, and the dissolve path calls `getImageData`. Both force a **synchronous GPU→CPU readback** for every arriving still (echo), emblem and motif.
- **Fix:** every particle-side image canvas is created CPU-backed (`getContext("2d", { willReadFrequently: true })`). These canvases only feed `getImageData` and texture uploads, so this costs nothing.

### 3. Synchronous image decode on the frame
- **Where:** `particle-lead-layer.tsx` (motif, emblem, echo and moment loaders); `src/components/audio/flash-angel.tsx` `warmFlashAngel`.
- **Cause:** `img.onload` → `drawImage` decoded the JPEG synchronously on the main thread.
- **Fix:** `img.decode()` first (off-thread), with a guard for failed loads.

### 4. Importance sampler (`computeUv`), a minor win
- **Change:** one linear sweep of the CDF replaces 160k binary searches (the stratified targets are already sorted). The output distribution is identical.
- **Clean measurement** (six runs, sorted, ms): old 6.9, 7, 7, 7, 11.3, 23.9 → new 4.6, 4.9, 5, 5, 5.2, 5.9. The worst case drops from 24 to 6 ms.
- **Correction:** the 140–490 ms "old" figures from the first pass were contamination.

### 5. ParticleResolve (title and logo particles), CPU
- **Where:** `src/components/audio/particle-resolve.tsx`.
- **Cause:** up to 7,000 `fillStyle` + `beginPath` + `arc` + `fill` calls per frame, each building an rgba string. It was the most expensive rAF callback on the page during every title: **2.25–2.58 ms avg, up to 9.6 ms**.
- **Fix:** motes are batched into 8 alpha levels, one path and one fill per level, with the fill strings precomputed.
- **After:** **1.28–1.69 ms avg, ≤ 8.7 ms max**. The `?particles=0` runs keep ParticleResolve active and show zero long frames, so the batched fill has no GPU-side cost either.

### 6. Program warm-up burst (preventive)
- **Where:** `particle-lead-layer.tsx` `warmParticleSouls`.
- **Change:** this used `warmBurst(80)` every 400 ms, building every compiled program's GPU pipeline inside one or two frames. That was written when the cold open was a static black screen; it now animates the particle logo. It now warms **one program per 120 ms step**, finishing in ~2.3 s (`particle-warm: 11 souls warm in 2282 ms`), still long before the first journey.
- **Ablation:** this alone did not remove the opening long frames (that was issue 1), so its benefit is unproven by these measurements. It only spreads already-required work into smaller pieces.

## Before → after (12 journeys across every set, best of 2, uncontended)

Format: fps / p95 ms / max frame ms / frames over 100 ms. Mid and closing: fps/max.

| Journey | Opening 0–16 s: before | Opening: after | Opening: particles off | Mid: before → after | Closing: before → after |
|---|---|---|---|---|---|
| Snowflake | 58.7 / 16.8 / 117 / 2 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60/17 → 60/17 | 60/17 → 60/17 |
| Realized | 58.6 / 16.7 / 117 / 2 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60/17 → 60/17 | 60/17 → 60/17 |
| Ghost | 58.6 / 16.8 / 117 / 4 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60/17 → 60/17 | 60/17 → 60/17 |
| Chemiluminescence 1 | 58.6 / 16.8 / 117 / 2 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60/17 → 60/17 | 60/17 → 60/17 |
| Stand 10 | 58.6 / 16.8 / 117 / 3 | 60 / 16.7 / 17 / 0 | — | 60/17 → 60/17 | 60/17 → 60/17 |
| Vespers 3 | 58.7 / 16.7 / 117 / 3 | 60 / 16.8 / 17 / 0 | — | 60/17 → 60/17 | 60/17 → 60/17 |
| Lantern | 58.7 / 16.7 / 117 / 3 | 60 / 16.8 / 17 / 0 | — | 60/17 → 60/17 | 60/17 → 60/17 |
| First Light | 58.6 / 16.7 / 117 / 3 | 60 / 16.8 / 17 / 0 | — | 60/17 → 60/17 | 60/17 → 60/17 |
| Surrounded by Light 6 | 58.6 / 16.8 / 117 / 3 | 60 / 16.7 / 17 / 0 | — | 60/17 → 60/17 | 60/17 → 60/17 |
| Yellow Bird 3 | 58.6 / 16.8 / 117 / 2 | 60 / 16.8 / 17 / 0 | — | 60/17 → 60/17 | 60/17 → 60/17 |
| Chemiluminescence | 58.6 / 16.8 / 117 / 2 | 60 / 16.7 / 17 / 0 | — | 60/17 → 60/17 | 60/17 → 60/17 |
| The Summit | 58.7 / 16.7 / 117 / 1 | 59.9 / 16.7 / 33 / 0 | — | 60/17 → 60/17 | 60/17 → 60/17 |

## Real journey handoffs — continuous play, 12 consecutive handoffs

| # | Arriving at | Baseline: fps / max ms / gaps >50 | Fixed: fps / max ms / gaps >50 | Heap MB (fixed) | Live textures |
|---|---|---|---|---|---|
| 1 | Realized | 60 / 17 / 0 | 60 / 17 / 0 | 96.2 | 14 |
| 2 | Ghost | 60 / 17 / 0 | 60 / 17 / 0 | 102.9 | 14 |
| 3 | Title card — the Kinetic Lab | 60 / 17 / 0 | 60 / 17 / 0 | 97.1 | 14 |
| 4 | Rolling 2 | 60 / 17 / 0 | 60 / 17 / 0 | 97.2 | 14 |
| 5 | Stand 10 | 60 / 17 / 0 | 60 / 17 / 0 | 98.5 | 14 |
| 6 | Cabin Soul 8 | 60 / 17 / 0 | 60 / 17 / 0 | 98.9 | 14 |
| 7 | Cabin Soul 5 | 60 / 17 / 0 | 60 / 17 / 0 | 97.8 | 14 |
| 8 | Title card — Vigil | 59.8 / 117 / 1 | 60 / 17 / 0 | 97.7 | 14 |
| 9 | Vespers 2 | 60 / 17 / 0 | 60 / 17 / 0 | 97.6 | 14 |
| 10 | Lantern | 60 / 17 / 0 | 60 / 17 / 0 | 94.2 | 14 |
| 11 | Open Jam | 60 / 17 / 0 | 60 / 17 / 0 | 94.5 | 14 |
| 12 | Testimony 3 | 60 / 17 / 0 | 60 / 17 / 0 | 90.8 | 14 |

Baseline handoffs were already nearly clean; the motif flood only hits a page's first journey. Heap stays within 91–103 MB with no growth, and particle-context textures stay at 14 throughout. WebGL contexts ever created reach 18 by the second set, then level off, with 7–10 live canvases. Contexts are being recycled, not leaked.

## Full sweep — every Tramokyo journey, fixed build

**351 samples:** fps min 59.9, median 60; p95 ≤ 16.8 ms; frames over 100 ms: 0; worst frame 34 ms; heap 87.6–127.5 MB (per fresh page); particle textures 14 in every sample; page errors 0.

<details><summary>Per-journey table (fps / p95 / max / frames over 100 ms)</summary>

| Journey | Opening 0–16 s | Mid | Closing | Heap MB |
|---|---|---|---|---|
| Snowflake | 59.9 / 16.7 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 101.8 |
| Realized | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 104.1 |
| Ghost | 59.9 / 16.7 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 118.6 |
| Chemiluminescence 1 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 104 |
| Rolling 2 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 106.8 |
| Stand 10 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 101.9 |
| Cabin Soul 8 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 107.7 |
| Cabin Soul 5 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 104.6 |
| Vespers 3 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 110.4 |
| Vespers 2 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 101 |
| Lantern | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 126.2 |
| Open Jam | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 98.7 |
| Testimony 3 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 120.1 |
| Calling | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 115.2 |
| First Light | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 122.6 |
| Surrounded by Light 6 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 112 |
| Nothing 30 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 120.5 |
| Night Wind 2 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 119.3 |
| The Other Side 10 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 121.6 |
| Northern Plane 5 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 118.1 |
| No question 8 | 59.9 / 16.8 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 100.9 |
| Loire 2 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 124.7 |
| Chenin 5 | 59.9 / 16.8 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 111 |
| Tranquility 3 | 59.9 / 16.8 / 34 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 97.2 |
| Bells 1 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 126.2 |
| Rise 1 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 118.8 |
| Surrounded by Light 3 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 116.3 |
| Amboise 1 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 102.9 |
| Night Wind 9 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 109.9 |
| Tranquility 8 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 96.5 |
| Never Forget 4 | 59.9 / 16.8 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 101.7 |
| Torraine 5 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 99.9 |
| Tranquility 30 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 109.3 |
| Yellow Bird 3 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 103.7 |
| Roll Away 8 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 109.9 |
| Singular 4 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 110.2 |
| The Other Side 9 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 97.7 |
| Chenin 3 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 120.3 |
| Tranquility 11 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 113.5 |
| Night Wind 5 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 102.7 |
| Cabin Soul 6 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 101 |
| Torraine 6 | 59.9 / 16.8 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 109.9 |
| Tranquility 17 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 103.1 |
| Redwoods Sway 2 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 113.3 |
| Horses 1 | 59.9 / 16.7 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 97.7 |
| Northern Plane 3 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 100.5 |
| Chemiluminescence | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 122.1 |
| Tranquility 33 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 123.4 |
| Amboise 2 | 59.9 / 16.8 / 33 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 97.8 |
| Night Wind 11 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 107.7 |
| Velvet Tears 1 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 105.9 |
| Tranquility 34 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 105.4 |
| Yellow Bird 6 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 117.9 |
| Rattler 2 | 59.9 / 16.7 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 101.6 |
| Tranquility 21 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 112.1 |
| Loire 5A | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 100.2 |
| Night Wind 4 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 113.9 |
| Tranquility 35 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 121.6 |
| No question 7 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 119.8 |
| Sancerre Cry 4 | 59.9 / 16.8 / 33 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 97.1 |
| Tranquility 36 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 104 |
| Torraine 7 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 106.2 |
| Surrounded by Light 19 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 112 |
| Tranquility 38 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 120.3 |
| The Summit | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 105 |
| The Ascension | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 99.7 |
| The Bloom | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 101 |
| Cosmic Drift | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 103.8 |
| Mycelium Dream | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 105.8 |
| Interplay | 59.9 / 16.7 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 101 |
| Bath | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 110.3 |
| Welcome Home | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 101.4 |
| The Knife | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 100.6 |
| 2019 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 104.8 |
| The Knife | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 98 |
| Playa | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 100 |
| Isolation | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 111 |
| Rebound | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 111.1 |
| Stir Crazy | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 96.7 |
| Rolling | 59.9 / 16.8 / 33 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 98.1 |
| Quarantine | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 101 |
| All Together | 59.9 / 16.7 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 116.3 |
| Rise | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 107.1 |
| Surrender | 59.9 / 16.7 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 111.4 |
| Openings | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 104.7 |
| Surrounded By Light | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 104.1 |
| Drift | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 99.7 |
| Self | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 107.1 |
| Message | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 111.4 |
| Grace | 59.9 / 16.8 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 104.8 |
| Complete | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 98.7 |
| Held | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 111.6 |
| Sway | 59.9 / 16.8 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 100 |
| Mystic | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 118.7 |
| The First | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 100.3 |
| The First | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 110.4 |
| Dad's Song II | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 110.2 |
| Yellow Bird | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 114.8 |
| Spectre | 59.9 / 16.7 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 124.7 |
| Surrounded By Light | 59.9 / 16.8 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 101 |
| Mexican Boy | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 98.7 |
| Afterglow | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 109 |
| Grasshopper | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 98 |
| Love Again | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 111.6 |
| COSMIC HOMECOMING | 59.9 / 16.7 / 33 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 114 |
| PULLED 2026-09-19 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 101.6 |
| PULLED 2026-09-19 | 59.9 / 16.7 / 33 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 100.5 |
| PULLED 2026-09-19 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 100.8 |
| storm | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 99.4 |
|  to first light. Recline. | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.8 / 17 / 0 | 101.5 |
| driving a layer of light. Meditative and kinetic | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 102 |
|  together. | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 102 |
| Recline. | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 101.8 |
| Again\u0027s bloom in the burned forest. Recline. | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 101.7 |
| out of darkness. Recline. | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.7 / 17 / 0 | 99.9 |
| home during lockdown. A journey for every track. Recline. | 59.9 / 16.8 / 33 / 0 | 60 / 16.8 / 17 / 0 | 60 / 16.8 / 17 / 0 | 100.5 |
| Tightened from the original five-journey cycle | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 60 / 16.7 / 17 / 0 | 100 |

</details>

## Checked and found sound
- **GPU readbacks in the engine:** probe-only (`AsyncRead`, fenced); none in production, enforced by `no-sync-gpu.test.ts`. No WebGL call over 6 ms appeared in any sample.
- **Engine idling:** stops 2.5 s after the field goes invisible; the canvas leaves the compositor 1 s after reaching zero opacity.
- **Per-frame pipeline:** sim (400², 160k motes), full-res fade, points (≤24 px, hidden motes culled before rasterising), mip-based exposure every 4th frame, composite. DPR 1.0.
- **Particle tick CPU:** 0.06–0.25 ms per frame on average.
- **Caches:** `uvCache` is a WeakMap; `motifCanvas` is bounded at 54 designs (≤512 px); emblem and echo canvases are collected.

## Open items (outside the particle system, or Karel's call)
1. **Shader switches** (primary/dual/tertiary compile and first draw) are the largest remaining source of real-kiosk frame gaps (54 co-occurrences today, concentrated in the Kinetic Lab). That's the shader system. Recommend compile-ahead plus an offscreen first draw before each scripted switch, and the same rig (`align.mjs`) to verify.
2. **Still arrivals** co-occur with kiosk gaps. The particle share (echo decode and sample) is fixed above; the remainder is the collage still push and depth-parallax upload in `ai-image-layer`. Next step: measure with `align.mjs` on the kiosk build.
3. The headless rig cannot measure GPU headroom above 60 Hz. If the kiosk display runs at 120 Hz, re-run `sweep.mjs` headed on the kiosk (with Karel away) for a headroom figure.
4. `.next-perf` is not in `.gitignore`. Add it so an audit build can never be committed by accident.
