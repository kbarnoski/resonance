# 4032 — Formflight

## The one question

**What if you took no drug and watched no strobe — and the MUSIC itself walked
your visual cortex through Klüver's four form constants (tunnels · radial
spokes · spirals · honeycomb lattice)?**

This is the intense pole — peak-LSD liquid-light melt / DMT-threshold — not calm
cosmic ambient. A built-in evolving drone plays on **Begin**, so it self-demos
with zero devices; an optional **Use mic** toggle lets your own music (or room
sound) drive it.

## The technique

The retina→V1 cortical map is (approximately) a complex logarithm — the
**Bressloff–Cowan** analysis of **Klüver's** four form constants. Because of
that log-polar map, all four constants are *one* periodic pattern seen through a
warp: concentric rings ↔ tunnels, radial rays ↔ spokes, diagonals ↔ spirals, a
hex Turing lattice ↔ honeycomb. So the shader generates plane waves and a
hexagonal lattice in **cortical `(log r, θ)` space** and applies the inverse
`exp()` warp back to the screen — one raw WebGL2 `#version 300 es` full-screen
fragment shader (single full-screen triangle), no three.js, no point cloud.

It does **not** re-derive the warp: it splices in the shared
`_shared/psych/logpolar` engine and calls its `screenToCortex`, `formConstant`
(φ = 0 tunnels, π/2 spokes, π/4 spirals) and `honeycomb`.

Lineage worth name-dropping: **Gysin & Sommerville's _Dreamachine_ (1959)** —
form constants from flicker alone; the **2026 bioRxiv stroboscopic-hallucination
CV-map** that measured how strobe frequency maps onto cortical pattern; and
**Bressloff–Cowan / Klüver** for the geometry itself.

## The audio → form-constant mapping

A single Web Audio `AnalyserNode` yields three live features each frame:

| Feature | Meaning | Drives |
| --- | --- | --- |
| **Spectral centroid** | brightness | Position on the form axis `[0..3]` — tunnel ↔ spoke ↔ spiral ↔ honeycomb. Adjacent constants **cross-blend** (`smoothstep`), never a hard cut. Dark/sustained → tunnels; bright → honeycomb. |
| **Spectral flux** | rate of spectral change | Morph/motion speed **and** a symmetry-loosening term: an fBm domain-warp in cortical space so the lattice *melts* at high flux (the REBUS "entropy rises at peak" idea). |
| **Loudness (RMS)** | overall level | Colour saturation / neural gain, and the depth of the optional safe luminance flicker. |

The built-in drone is a shared just-intonation `droneBank` whose lowpass is
walked open/closed by three slow deterministic LFOs (so the centroid sweeps the
whole axis over minutes), plus a periodic high-passed **shimmer** swell that
spikes the flux → visible honeycomb-melt. The mic, when enabled, is summed into
the **analysis bus only** (never to the speakers) so there is no feedback loop;
if the mic is denied, the drone keeps running.

## The safety design

Photosensitive-epilepsy is a real hazard, so **every** luminance flicker is
routed through the shared `createSafeFlicker`:

- **Off by default** — the default experience is slow luminance *drift*, not
  flicker. Flicker is an opt-in intensifier via a visible toggle.
- Hard **8 Hz wall**, 3 Hz max / 1.5 Hz start, **never blacks out** (floor 0.55).
- Honours `prefers-reduced-motion` (downgraded to sub-perceptual drift).
- A visible **current-Hz readout** and an instant **Stop flicker** kill control.
- RMS scales only the *dip depth* of the SafeFlicker output — it can never
  breach the engine's floor.

## Determinism

No `Math.random` / `Date.now` / `new Date` (the lab replays deterministically).
Randomness comes from an inlined `mulberry32(0x4032)`; time comes from
`performance.now()` / `AudioContext.currentTime` / the AnalyserNode.

## Degrades gracefully

- No WebGL2 (or context lost) → on-brand `text-destructive` notice.
- Mic denied → built-in drone keeps driving the shader + an on-brand note.
- Fully self-demos headless: no mic and no interaction needed — the drone alone
  sweeps the form constants.

## Next-cycle deepening

Add a **binocular-rivalry / stereo split**: drive the left and right halves of
the field from the L/R channels of the stereo mix (or two mics), so a wide stereo
image literally *tears* the form constant down the meridian — mirroring how the
cortical hemispheres each own one visual hemifield, and letting a panning mix
walk a spiral into a tunnel across your two eyes.
