# 1300 · Carrier Bloom

**The one question:** *What if Karel's own recorded piano were the carrier wave
for a drug-free psychedelic melt you can push your hands into?*

A personal, single-performer echo of **Refik Anadol — _DATALAND / Machine Dreams_**
(opened LA, June 2026), where data and music are melted into a kaleidoscopic
pigment field. Here the "data" is not a museum's archive — it is one man's real
solo piano, _Welcome Home_. His recording is the **carrier wave**; everything you
see is that audio, refracted through visual cortex.

## The visual: a log-polar form-constant melt

The engine is the single most load-bearing finding in psychedelic-geometry
research (Bressloff–Cowan, on Klüver's four "form constants"): **all psychedelic
geometry is one stripe/hex pattern seen through a log-polar warp.** The
retina→V1 cortical map is a complex logarithm, so:

- concentric rings ↔ vertical cortical stripes → **tunnels / funnels**
- radial spokes ↔ horizontal stripes → **spokes**
- diagonals → **spirals**
- a hex lattice → **honeycomb**

So we generate plane-wave stripes (and a hex Turing lattice) in _cortical_ space
`(u, v) = (log r, θ)`, then apply the inverse `exp()` warp back to the screen.
One WebGL2 fragment shader yields all of them. The math is imported read-only
from `../_shared/psych/logpolar.ts` (its GLSL prelude drives the GPU path; its JS
mirrors drive the Canvas2D fallback so the two agree). If WebGL2 is unavailable
the piece drops to a real Canvas2D melt (coarser, identical geometry) and posts a
notice.

## FFT → visual mapping (the carrier drives everything)

Karel's piano runs through an `AnalyserNode` (fftSize 2048) read every frame and
split into three log-spaced bands:

| Band | Range | Drives |
|------|-------|--------|
| **bass** | 20–250 Hz | global inward flow speed **+** warp amplitude ("bass → global flow") |
| **mid** | 250–2000 Hz | stripe frequency `k` (domain-warp density) |
| **high** | 2000–8000 Hz | fine grain / turbulence, saturation, chromatic aberration |
| **onset** | rising broadband | a center-out **bloom pulse** (expanding bright ring) |

## The entropy arc (REBUS "priors relax")

`entropy.ts` holds one scalar `e ∈ [0,1]` that ramps slowly across the piece
(come-up → peak near ~2.5 min → gentle settle) — Carhart-Harris & Friston's
_RElaxed Beliefs Under pSychedelics_. It reorganizes the geometry: at low entropy
a tight **tunnel** (a strong prior); as `e` rises it blends **tunnel → spiral →
honeycomb**, loosens symmetry (adds warp jitter), and folds in more turbulence
octaves. **0:20 and 3:00 look genuinely different** — that is the arc, not the
beat.

## The perturbation model (this is what makes it _played_)

Pointer drag (and DeviceOrientation tilt on mobile) is not a camera — it is a
hand pushed into the field:

- **position** moves the warp **center** under your finger, so the tunnel origin
  follows you;
- **drag speed → push energy** that (a) deepens the entropy arc, (b) bumps the
  warp amplitude, and (c) lifts a faint **Shepard-riser undertow**
  (`../_shared/psych/shepard.ts`) scaled by that energy;
- **vertical position** biases which form constant dominates — up for honeycomb,
  down for tunnels.

Let go and the center drifts on a slow Lissajous so a hands-off (or headless)
view still melts. The always-on render loop and the synthesized fallback mean the
piece animates before Begin and runs with no network.

## Safety (photosensitive epilepsy — non-negotiable)

There is **no full-screen high-contrast strobe.** All luminance change is smooth
continuous drift, and the color is soft-rolled-off (`col/(1+col*0.6)`) so no
frame blows to full white. The only flicker is an **opt-in** toggle routed
entirely through `../_shared/psych/safeFlicker.ts`: hard-clamped to ≤3 Hz, a soft
sine with a luminance floor (never a 0↔1 switch), reduced-motion honored, and an
**instant kill** on the same tap. When in doubt: drift, don't flash.

## Audio hygiene

Gesture-gated (audio only starts on **Begin** — no autoplay). Graph:
`AudioBufferSourceNode` (loop) → `AnalyserNode` → master `GainNode` (≤0.3, 1.2 s
fade-in) → `DynamicsCompressorNode` (limiter) → destination. On unmount the piece
tears down fully: cancels rAF, stops the Shepard engine, stops/disconnects every
node, and closes the `AudioContext`.

## Files

- `page.tsx` — the `"use client"` component: Begin gate, render loop, perturbation
  listeners, teardown.
- `audio.ts` — `fetchPianoBuffer` (real recording, 4 s timeout) + synthesized
  fallback carrier + `computeBands` FFT band extraction.
- `gl.ts` — WebGL2 log-polar melt + Canvas2D fallback (`createMeltScene`).
- `entropy.ts` — the REBUS arc + form-constant blend + noise/jitter mapping.
