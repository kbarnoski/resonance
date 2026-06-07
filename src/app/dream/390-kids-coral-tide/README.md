# Coral Tide 🪸

## The ONE question
**What if a child grew a coral reef by shaking the tablet, and the reef's GROWING
SHAPE was a chord that gets richer the taller it grows — so you can HEAR the reef
get bigger?**

Same core toy as a singing DLA coral, but the **audio design is the
differentiator**: the reef's height literally maps to how full a chord sounds.

## How it works

### DLA — the reef shape
The coral is a genuine **Diffusion-Limited Aggregation** (Witten & Sander,
*Phys. Rev. Lett.* **47**, 1400, 1981) with a downward settling bias so it grows
**upward from a seabed**:

- A **stuck-particle set** is seeded along the seabed row.
- **Brownian walkers** spawn near the top and random-walk with a downward drift
  (the "current"); shake/stir intensity scales drift, jitter, and walker count.
- A walker **freezes** the instant it lands within a **stick radius** of any
  stuck particle (or reaches the seabed).
- A **spatial-hash grid** (Map of bucket → particles, 3×3 neighbourhood lookup)
  keeps the adjacency test fast as the reef fills in.
- The natural **screening effect** of DLA — outer tips catch walkers before they
  reach the interior — produces real branching coral, not a solid blob.

Each frozen particle records the **horizontal depth band** it locked in. That
band index is the bridge to the audio.

### Harmonic band-stacking — the hook
The reef is divided into `BANDS = 6` horizontal depth bands. Each band that
contains coral **sustains one held voice** of a **D-Dorian** stack, bottom → top:

| Band | Pitch | Role |
|------|-------|------|
| 0 (seabed) | D2 | root drone (always faintly on — never silent) |
| 1 | A2 | fifth |
| 2 | D3 | octave |
| 3 | E3 | ninth |
| 4 | F3 | minor third (up) |
| 5 (top) | A3 | fifth (up) |

As the reef climbs into higher bands, each band's voice **fades in** with a slow
gain ramp — so the chord **stacks and thickens**: a short reef is a bare
root + fifth; a tall, full reef is a shimmering **Dm11**-coloured chord. Every
newly-locked branch also rings a **soft transient bell** pitched to its band
(an octave up, short triangle envelope). The child hears the reef grow taller as
the chord fills in. Higher bands sit slightly quieter so the result stays warm,
not shrill.

Safety: a `DynamicsCompressor` acts as a **brick-wall limiter** (ratio 20,
threshold −14 dB) on the master bus, so the output can **never** blast. The
AudioContext is created and resumed **inside the Start gesture** (autoplay-safe,
with a silent catch).

### Input doors (degrade gracefully)
1. **Devicemotion shake** — primary. iOS `DeviceMotionEvent.requestPermission()`
   is called inside the Start gesture; jerk (change in acceleration magnitude),
   not tilt, drives intensity. Provenance: emerald **"Shaking 🌊"**.
2. **Pointer-drag swish** — fallback; drag speed adds stir. Provenance: amber
   **"Touch mode ✋"**.
3. **3s-idle synthetic current** — if no real input, a slow breathing current
   keeps the reef self-growing, so a reviewer sees + hears it fill in **within
   ~2s of Start without touching anything**.

If motion is unavailable or denied, a readable `text-rose-300` notice explains
the fallback. If Canvas 2D is missing, a readable notice is shown instead.

## Tags
- **Input:** shake (devicemotion) — pointer + idle current as fallbacks
- **Output:** Canvas 2D (deliberate — no WebGL/WebGPU)
- **Technique:** DLA with harmonic-band-stacking
- **Vibe:** kids-warm-reef, D-Dorian

## Palette & accessibility
- Warm reef: deep amber/coral background gradient, sandy seabed glow, branches
  drift **coral → gold → cream** by band height, soft drifting sunbeams from
  above. Seizure-safe (slow, low-contrast motion; no strobing).
- Typography: hero `text-2xl`, body/labels `text-base`, primary `text-white/95`,
  secondary `text-white/80`, tertiary `text-white/55`. Errors `text-rose-300`.
- Kids: no reading required to play; tap target ≥ 64px; immediate response;
  warm, soft, limited sounds.
- The **chord-stack indicator** (lit pips + "N of 6 voices") gives a legible,
  literal read of which voices are sounding — the "hear it grow" cue made visible.

## Build-verified, not browser-verified — unverified surface
This was built and type-checked (`npx tsc --noEmit`) but **not run in a real
browser**. Honestly unverified:

- **Does the chord-stacking read as "the reef getting bigger"?** This is the
  central bet. The mapping is correct (more height → more voices + bells), but
  whether the *perceptual* effect lands — i.e. a listener clearly hears the chord
  thicken as the reef climbs, rather than just "more notes" — needs real ears.
  Voice levels, ramp times, and bell loudness are first-guess and likely need
  tuning.
- **Devicemotion** behaviour (iOS permission prompt, jerk threshold of 0.6,
  intensity scaling) is untested on hardware; thresholds may need adjustment.
- **DLA tuning:** stick radius, walker count, and drift may make the reef grow
  too fast/slow or too sparse/dense on a given screen size.
- **Performance:** the per-frame full redraw of all stuck particles is fine for a
  modest reef but unmeasured on low-end tablets as the particle count grows.

## Files
- `dla.ts` — `CoralSim`: grid, stuck set, settling-biased walkers, stick-radius
  freeze, spatial-hash buckets, per-particle band index. `step(intensity)`
  returns `{ locked, activeBands, height01 }`.
- `audio.ts` — `ReefAudio`: the D-Dorian band-chord engine, per-lock bells,
  always-on faint root, master gain + `DynamicsCompressor` limiter.
- `page.tsx` — `"use client"` UI: title, Start button, three input doors,
  Canvas2D renderer (DPR/resize aware, full teardown), chord-stack indicator.
