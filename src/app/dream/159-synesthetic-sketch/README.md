# 159 — Synesthetic Sketch

**Route**: `/dream/159-synesthetic-sketch`
**Cycle**: 187 (adult build)
**Status**: demoable

## The idea

Every audio feature maps to a *different visual dimension* — not just color.
The 158 prototypes before this one map audio to color, fluid, particles, or
geometry. None map audio to **morphological shape** in a multi-dimensional way.

A pure 440 Hz sine tone leaves a violet **circle**. A C major chord (multiple
harmonics active) leaves a **hexagon** with inner rings. Pink noise leaves a
white **star**. Low bass leaves a large violet circle; high treble a small red
circle. The canvas accumulates these objects across the session — the shape of
the cloud IS the acoustic record.

## Feature → dimension mapping

| Audio feature | Visual dimension | How computed |
|---|---|---|
| Spectral centroid (Hz) | Object **hue** | log-mapped 40 Hz → violet, 20 kHz → red |
| Spectral spread (std dev of band energies) | Object **shape** | 0–0.10 = circle, 0.10–0.20 = triangle, 0.20–0.30 = square, 0.30–0.40 = hexagon, >0.40 = 8-pt star |
| Active band count (bands > 0.28) | Inner **ring count** | 0–4 concentric rings inside the shape |
| Amplitude | Object **scale** | 7–33 px radius |
| Onset / beat | **Spark burst** | 22 particles + 4 extra objects |

Spread is `sqrt(variance of 6-band energies)`. A pure tone concentrates all
energy in one band → low spread → circle. Broadband noise distributes energy
evenly → high spread → star. Chords fall in between.

## Visual behavior

- Objects deposit every 4 frames (≈15/sec at 60 fps), amplitude-gated.
- Additive blending (`globalCompositeOperation = "lighter"`) makes
  overlapping shapes brighten rather than cover each other.
- A 0.3% per-frame background fade prevents permanent burn-in;
  the canvas takes ~3 min to fully clear after the session ends.
- Download at any time as PNG.

## Demo mode

6 incommensurable LFOs (0.023, 0.054, 0.109, 0.242, 0.630, 1.407 rad/s)
cycle independently through the 6 frequency bands, producing slowly evolving
shapes that pass through all five types over about 90 seconds. No mic needed.

## What to try

- Play a single sustained piano note → violet circles accumulate.
- Play a full chord → hexagons with inner rings appear.
- Strum or play percussively → star bursts on every onset.
- Hum a low note vs. a high note → watch the hue shift.
- Let demo run for 5 min → canvas fills into a nebula of morphological history.

## Live performance notes

On a projector, the accumulating canvas would show the arc of a live
performance as a spatial record — early explorations (scattered shapes) vs.
later dense passages (overlapping brightness clusters). The "star" cluster
always marks percussion-heavy or harmonically complex moments.

## Research basis

Inspired by `musicolors` (arxiv 2503.14220, CHI-adjacent 2025): multi-
dimensional synesthetic visualization where each feature controls a distinct
visual property. Previous Resonance prototypes use audio for color (1-live),
geometry (cymatics), fluid (3-fluid, 15-webgpu-fluid). This is the first to
use audio for *morphological classification*.
