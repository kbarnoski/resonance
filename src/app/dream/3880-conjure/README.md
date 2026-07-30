# 3880 · Conjure

> *What if you could **conjure a chord out of thin air** with your hand — hold
> a coherent hand-shape and it voices a rich chord; let the shape go sloppy
> and it decoheres into noise?*

Conjure is the dream lab's **first hand-landmark instrument**. Earlier
prototypes that read the body used MediaPipe **Pose** (full-skeleton, ~33
body points — see `2590-tremor`, `724-presence-drift`, etc.); several also
used MediaPipe **Hands**, but always to classify a hand into a small set of
discrete signs or shapes (Curwen solfège signs, piano-freeze poses, air-drum
hits). Conjure is the first piece to read the **raw 21-landmark geometry**
continuously — no discrete sign classifier, no snap-to-shape — and turn the
hand's own **stability and form** into the central mechanic.

## The one idea

You don't press keys and you don't wave for effect. You **hold a shape**.
Spread your fingers into an even, steady, open hand and a rich chord blooms
out of thin air — extensions voicing in, the timbre brightening, a luminous
particle field gathering into a glowing skeleton that tracks your hand. Let
your fingers curl unevenly, let your hand shake, or let it drift out of
frame, and the whole thing **decoheres**: every partial detunes away from the
chord, a noise band swells underneath, and the particle field scatters into
turbulence. **Coherence — the cleanliness of the shape itself — is the
stake**, not a discrete gesture ID.

## The mapping

| hand geometry | drives | continuous? |
| --- | --- | --- |
| **height** (wrist y in frame) | chord **root pitch** — exponential map, ~3.2 octaves | **yes — never snapped to a scale** |
| **finger spread + pinch** (thumb↔index) | chord **voicing** — how many of the 3 upper extensions (octave/10th/12th) are voiced in | yes |
| **palm openness** (fingertip↔palm-center distance) | filter **brightness** + FM modulation index | yes |
| **hand tilt** (index-mcp↔pinky-mcp knuckle line angle) | **stereo pan** + particle-field scatter bias | yes |
| **coherence** (see below) | how cleanly the chord voices vs. decoheres into noise; particle gather vs. scatter | continuous 0..1 |

**Continuous pitch is protected by design.** Root pitch is `65 * 2^(3.2 ×
height)` — a plain, unbroken exponential map from hand height. There is no
quantizer, no pentatonic ladder, no just-intonation snap anywhere in the
pitch path. The chord's *internal* intervals are a fixed composed voicing
(root · maj3 · 5th · octave · 10th · 12th — deliberately a designed
instrument, same as any real chord voicing), but the **root itself glides
continuously** with the hand.

## Coherence — how it's actually computed

`gesture.ts` scores coherence every frame as:

```
coherence = 0.5 × template-match + 0.5 × stability
```

- **template-match** — per-finger *straightness*: the cosine similarity
  between consecutive bone segments (mcp→pip→dip→tip) for the four
  non-thumb fingers, averaged; a fully extended finger is ~collinear
  (straightness ≈ 1), a curled or ambiguously bent one is not. Combined with
  *even fan*: the variance of the angular gaps between the four fingertip
  directions from the wrist — a deliberate, evenly-spread "conjure" shape has
  low variance; a random clump does not.
- **stability** — the average frame-to-frame displacement of every landmark
  in a wrist-relative, hand-scale-normalized frame (so it's translation- and
  scale-invariant), turned into a decay: `exp(-motionPerSecond × k)`. A held,
  steady hand scores near 1; a shaking or fast-moving one scores near 0.

The two combine and are eased toward (asymmetrically — decohering is faster
than blooming, so sloppy input reads as an immediate consequence, not a slow
fade) to produce the live `coherence ∈ [0,1]` that gates everything else.
Hand absence (no landmarks this frame) relaxes coherence toward 0.

## Audio — additive/FM chord synth (`synth.ts`)

Six partials in fixed ratios `[1, 1.25, 1.5, 2, 2.5, 3]` (root · major 3rd ·
5th · octave · 10th · 12th), each a 2-operator FM pair (sine carrier + sine
modulator, modulation index driven by palm openness). The three core tones
(root/3rd/5th) stay present even when sloppy so the instrument never goes
fully silent; the three extensions require **both** voicing (spread + pinch)
**and** coherence to bloom in — a sloppy hand literally cannot hold the rich
chord. Decoherence detunes every partial independently (deterministic
phase-seeded wandering noise, not per-frame `Math.random`) and swells a
bandpassed noise-loop bus. Master chain: partials → lowpass (brightness) →
master gain → `DynamicsCompressor` limiter → `StereoPannerNode` (hand tilt) →
destination.

## Visuals — WebGPU compute-shader particle field (`gpu.ts`)

~18,000 particles, each permanently assigned at spawn to **one of the 21
hand-landmark anchors**. A WGSL compute pass pulls each particle toward its
anchor with a strength that scales with `coherence²`, against a curl-noise
turbulence force that scales with `(1 − coherence)` — so the same GPU
simulation either **gathers into a luminous skeleton that tracks the live
hand** (high coherence) or **scatters into a turbulent cloud** (low
coherence / hand absent). Particles render additively into an `rgba16float`
trail texture that fades each frame, then a tonemap pass shows it — the same
trail-buffer technique used by the lab's other WebGPU pieces (e.g.
`3480-reverie`). Palette stays on the violet brand ramp.

**Mandatory Canvas2D fallback** (`fallback2d.ts`): when `navigator.gpu` is
unavailable, ~3,200 particles run the **identical** anchor-attraction +
curl-noise model on the CPU, drawn as additive arcs. The piece is never a
dead screen; only the particle count drops. If WebGPU device/adapter/context
creation throws for any reason, the failure is caught and the fallback is
used automatically with a small on-screen notice — it never throws to the
user.

## Headless self-demo (`demo.ts`)

No camera exists in the review environment. `createSyntheticHand()` builds a
plausible, fully-articulated 21-landmark hand whose motion is a **pure
function of `performance.now()`**, with per-landmark phase offsets drawn once
from `mulberry32(0x3880)` at construction — fully deterministic, replayable,
frame-rate independent. On a fixed 9-second loop it:

1. holds a clean, evenly-fanned, fully-extended "conjure" shape for ~3.2s
   while the height sweeps continuously (demonstrating the continuous pitch
   glide),
2. eases into a genuinely **sloppy** shape — fingers bend non-collinearly
   with independent per-finger curl + jitter, fan spacing goes uneven — for
   ~3.3s, including a **hand-absent window** (~450ms) that exercises the
   "hand left the frame" path,
3. eases back into the coherent hold.

Because the synthetic joints actually bend and jitter (not just "shrink
along the same ray"), the same `gesture.ts` coherence scorer that grades a
real hand genuinely scores the synthetic sloppy phase low — the self-demo
isn't a scripted coherence value, it's the real detector running on a fake
hand. A hands-off reviewer sees the particle field gather + scatter and
hears the chord bloom + decohere without touching anything.

**The first real detected hand flips the on-screen badge from `auto-pilot` to
`you`** — from then on the real camera's per-frame result (including "no hand
this frame") drives the instrument instead of the synthetic path.

## Degrades gracefully

- **No camera / permission denied** → auto-pilot keeps running, notice shown.
- **HandLandmarker fails to load** (offline, CDN blocked) → auto-pilot keeps
  running, notice shown; never throws.
- **No WebGPU / `navigator.gpu` undefined / device init throws** → Canvas2D
  fallback, small notice, same conceptual model, never a dead screen.
- **No Web Audio** → visuals still run; a `text-destructive` notice explains
  there is no sound (the one case that's a genuine loss, not a fallback).

## Technique + references

- **Input**: MediaPipe Tasks-Vision `HandLandmarker` (21-point hand
  landmarks), loaded from CDN at runtime via a dynamic `import()`
  (`webpackIgnore`, never bundled) — the same loading pattern already used by
  `862-kids-solfege-signs/handLoader.ts` elsewhere in this lab, pinned to
  `@mediapipe/tasks-vision@0.10.14`, zero new npm dependencies.
- **Named references** (per the brief): "A Novelty Real-Time Gesture
  Recognition Model for Air-Hand Piano Playing Using MediaPipe" (IEEE 2024,
  doc 10793028); the 2026 real-time gesture→virtual-instrument work (IJFMR
  2026); the browser **GestureSynth** lineage (MediaPipe + Tone.js +
  Three.js air-instruments) — hand-landmark tracking as an air-instrument
  controller, here made GPU-native (WebGPU compute) and coherence-gated
  rather than discretely gesture-classified.
- **Determinism**: only `mulberry32` (seeded) + `performance.now()` are used
  for any randomness or timing anywhere in this folder — no `Math.random`,
  no `Date.now()` / `new Date()`.

## Files

| file | role |
| --- | --- |
| `page.tsx` | UI shell, engine wiring, render loop, teardown |
| `handLoader.ts` | CDN MediaPipe HandLandmarker loader |
| `gesture.ts` | 21 landmarks → continuous controls + coherence score |
| `synth.ts` | 6-partial additive/FM chord synth, coherence-gated |
| `gpu.ts` | WebGPU compute-shader particle field (anchor-attraction model) |
| `fallback2d.ts` | Canvas2D fallback running the identical particle model |
| `anchors.ts` | landmark → particle-world-space anchor smoothing |
| `demo.ts` | seeded synthetic 21-landmark hand path (headless self-demo) |
| `noise.ts` / `rng.ts` | shared deterministic PRNG + phase-seeded noise helpers |

## Input / output / technique tags

`input: 21-point MediaPipe hand landmarks (CDN HandLandmarker)` ·
`output: WebGPU compute-shader particle field (Canvas2D fallback) + 6-partial additive/FM chord synth` ·
`technique: coherence-gated gesture instrument — template-match + stability scoring drives a continuous bloom/decohere arc`
