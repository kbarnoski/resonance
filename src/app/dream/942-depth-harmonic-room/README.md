# Depth Harmonic Room

Route: `/dream/942-depth-harmonic-room`

## The one question

**What if the distance and position of your body in the room — read live as a
per-pixel depth field by an ML model in the browser — placed you inside a
neo-Riemannian _Tonnetz_ of harmony, so that simply moving through space glides
you through smooth, voice-led chord changes? Harmony is the instrument; you walk
it.**

This is a deepening of the lab's earlier depth-camera piece (`927-depth-room`).
There, pitch was deliberately frozen and the music lived in proximity/space.
Here the headline _is_ harmony: real major/minor triads, real parsimonious
voice-leading. You don't trigger notes — you inhabit a chord and walk to its
neighbours.

## How depth → Tonnetz → voice-leading works

### 1. Depth (input)

- **Live:** [Depth Anything V2 (small)](https://depth-anything-v2.github.io/)
  runs in-browser on **WebGPU** via **Transformers.js** (`@huggingface/transformers`,
  loaded from CDN at runtime — no npm install). A 256×192 webcam frame →
  per-pixel depth (larger = nearer), throttled to ~8 fps. Averaged into a 16×12
  grid (`depth.ts`).
- From the grid we read **nearEnergy** (proximity → brightness + chord
  openness), **centroidX** (lateral position of the nearest region), a
  **depthBand** (near-zone depth), and **motion** (frame-to-frame change →
  shimmer/attack).

### 2. The Tonnetz (the core — `harmony.ts`)

A 2D lattice where every cell is a major or minor **triad** and adjacent cells
differ by a single **parsimonious neo-Riemannian transform**, each holding two
of the three chord tones fixed:

| Op | Name            | Example                      | What moves            |
|----|-----------------|------------------------------|-----------------------|
| P  | Parallel        | C major ↔ C minor (C E G ↔ C E♭ G) | third by a semitone |
| L  | Leittonwechsel  | C major ↔ E minor (C E G ↔ B E G)  | root down a semitone |
| R  | Relative        | C major ↔ A minor (C E G ↔ A C E)  | fifth up a tone     |

Each transform is an **involution** that retains **exactly 2 common tones** —
verified across all 24 triads. That common-tone retention _is_ the smooth
voice-leading.

**Body → lattice mapping:**

- **centroidX → column.** Stepping right of centre walks a descending-thirds
  chain led by R (C→Am→F→Dm→B♭→Gm→E♭…); stepping left walks the mirror chain
  led by L. So lateral motion rotates you through related keys, one parsimonious
  step at a time.
- **depthBand → row.** Lean in (near band) brightens toward **major**; pull back
  (far band) darkens to **minor** — that vertical axis is the **P** transform.

When your rounded lattice cell changes, the engine picks the transform the move
implies, names it (HUD shows `voice-lead: P/L/R`), and re-voices.

### 3. SATB voicing (`harmony.ts` → `voiceTriad`)

The triad is voiced for four voices (Bass / Tenor / Alto / Soprano). The bass
takes the root low; each upper voice takes the octave of a chord tone **nearest
to where that voice already sits** (all 6 assignments tried, minimum total
semitone motion chosen — Tymoczko's minimal voice-leading made concrete). On a
change, common tones literally don't move; the one changed tone slides the
shortest distance. `openness` (from nearEnergy) gently widens the spacing as you
lean in.

### 4. Sound (`audio.ts`)

Four warm pad voices (detuned sine + triangle → soft per-voice lowpass + slow
vibrato) over a root **drone bed**. When re-voiced, only changed voices move and
every voice **glides (portamento, ~120–300 ms)** — smooth, never clicky. Master
chain per house rules: `gain (≤0.28) → lowpass (~7 kHz) → DynamicsCompressor →
destination`. Soft attacks; never harsh, never sudden-loud. Synthesis is
additive/subtractive (not granular).

### 5. Visuals (`gpu.ts`, primary)

**Raw WebGPU / WGSL** full-screen fragment shader: a candle-warm volumetric room
(amber / rose / deep-teal) with a triangular Tonnetz lattice of glowing pitch
nodes. The **currently-sounding triad triangle** glows brightest and blooms with
nearEnergy; a bloom transient fires on each transform; a warm **focal glow**
marks where you stand. Pixel ratio capped at 2 for phones.

## Degrade paths (never blank, never a crash)

| Failure                          | Fallback                                                                 |
|----------------------------------|--------------------------------------------------------------------------|
| No camera / permission denied    | **Synthetic** presence-blob on a slow Lissajous path keeps walking the Tonnetz on its own (auto-demo within ~1 s of Start). `text-rose-300` notice. |
| Camera ok, model/WebGPU compute fails | Synthetic field; distance still walks harmony. Notice shown.        |
| Laptop, no camera                | **Pointer** over the room drives the lattice (x → column, y → depth band). |
| No WebGPU (render)               | **Raw WebGL2** GLSL port of the same lattice room (`webgl-fallback.ts`). |
| No WebGL2 either                 | **DOM** chord view — glowing node + live chord name + last move. Audio still plays. |
| No audio                         | `text-rose-300` notice; visuals continue.                                |

All sensor/model code is wrapped in try/catch; the camera is processed
on-device, live, never recorded or uploaded. Full teardown on unmount:
cancelAnimationFrame, remove listeners, stop webcam tracks, stop/disconnect all
oscillators, `audioCtx.close()`, destroy GPU device/buffers.

## References

- **Neo-Riemannian theory / Tonnetz** — Hugo Riemann (original lattice); modern
  formalization of P/L/R in **Richard Cohn, _Audacious Euphony_ (Oxford, 2012)**.
- **Dmitri Tymoczko, _A Geometry of Music_ (Oxford, 2011)** — voice-leading
  geometry; the "move each voice the smallest distance" voicing.
- **Edward Aldwell & Carl Schachter, _Harmony and Voice Leading_** — SATB
  spacing/doubling conventions.
- **Depth Anything V2 (small)** (Yang et al., NeurIPS 2024) via
  **Transformers.js / onnx-community** running on WebGPU for realtime monocular
  depth.

## Next-cycle deepening

1. **Seventh chords & the cube dance.** Extend the lattice to dominant/half-
   diminished sevenths and Douthett–Steinbach _Cube Dance_ / _Towers_ graphs for
   richer parsimonious motion.
2. **Two-body harmony.** Track two near-regions (two people) → independent
   lattice walkers whose triads must voice-lead _against each other_
   (counterpoint of presence).
3. **Hexatonic colour fields.** Tint the WGSL room by hexatonic system (Cohn's
   four hexatonic cycles) so the visual hue encodes _which_ harmonic region you're in.
4. **Voice the bass line too.** Currently bass = root; add inversions driven by
   horizontal velocity for genuine bass-line counterpoint.
5. **Depth-history rubato.** Use motion to bend glide times — fast moves snap,
   slow drifts smear — so tempo of harmonic change tracks the speed of the body.
