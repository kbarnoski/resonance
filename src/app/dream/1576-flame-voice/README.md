# 1576 · Flame Voice

**The one question:** what if a fractal flame were a two-way instrument — you
sing INTO it and it sings BACK, so the shape you SEE is exactly the chord you
HEAR?

This is the lab's first-ever **fractal flame** (Scott Draves & Erik Reckase,
_The Fractal Flame Algorithm_, 2003 — the algorithm behind _Electric Sheep_).
The angle here is the tightest possible **see = hear weld**: the flame's live
structure is not merely driven by audio, it is also **sonified**, so the
organism you watch _is_ the chord you hear.

## The fractal flame (implemented for real)

A fractal flame is an **IFS rendered by the chaos game with nonlinear
variations and log-density tone-mapping**. See `flame.ts` and `variations.ts`.

- **Xforms** (`flame.ts`): four affine transforms `(a,b,c,d,e,f)`, each with a
  weight, a palette colour coordinate in `[0,1]`, and a blend of nonlinear
  **variations**.
- **Variations** (`variations.ts`): 21 of Draves' standard `V_j` functions —
  `linear`, `sinusoidal`, `spherical`, `swirl`, `horseshoe`, `polar`,
  `handkerchief`, `disc`, `spiral`, `hyperbolic`, `diamond`, `julia`, `waves`,
  `fisheye`, `eyefish`, `bent`, `power`, `rings`, `fan`, `cylinder`, `ex` — all
  built from `r = hypot(x,y)`, `r2 = x²+y²`, `theta = atan2(y,x)`.
- **Chaos game:** a single point wanders the plane; each iteration picks an
  xform by weight, applies its affine map, sums its weighted variations, folds
  the result through a voice-steered **final rotation**, averages in the xform's
  colour (`c = (c + xform.color)/2`), and — after ~20 warm-up iterations — plots
  into an accumulation buffer. ~74k points/frame (34k under reduced-motion).
- **Accumulation buffer:** two `Float32Array`s (density + accumulated palette
  coordinate), decayed ~0.92/frame so the organism continuously refreshes and
  morphs rather than freezing.
- **Log-density tone-map** (Draves' innovation): `alpha = log(d+1)/log(max+1)`,
  then a gamma lift (γ ≈ 2.6). This is what turns a sparse point cloud into a
  glowing organism instead of scattered dots. A decaying running-max avoids a
  full-buffer scan and keeps luminance drift smooth (≤ 3 Hz, no strobe).

Rendered entirely **off-GPU**: typed-array accumulation → `ImageData` →
`putImageData`. No WebGL/WebGPU/three.js. The palette (violet → magenta → cyan)
is the only place raw hex appears.

## The see = hear weld (the distinctive core)

Each frame the engine computes an 8-element **feature vector** = how dominant
each of eight sonified variations (`linear, spherical, swirl, horseshoe,
handkerchief, disc, spiral, julia`) is right now. It is the **hit-weighted
average of the exact per-xform variation gains used to draw every plotted
point** — the same numbers that shaped the image, not a separate analysis.

`audio.ts` maps those eight numbers to the amplitudes of eight **Just-Intonation
partials** — ratios `1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2` over a 110 Hz (A2)
fundamental, plus a sub octave for warmth. When a variation swells on screen its
partial swells in your ears. The chord you hear is literally the flame's
structure.

**Voice IN** (`voice.ts`): pitch is found by **autocorrelation** on
`getFloatTimeDomainData` (not FFT). Pitch sweeps a Gaussian "focus" across the
eight variations and steers the final-xform rotation; energy sets brightness and
how hard the focus excites the organism. So: your voice reshapes the flame → the
reshaped flame re-voices its own drone → you sing with it. The loop is kept
stable with one-pole smoothing everywhere, clamped gains, a per-variation floor
(the drone never fully silences), and a mic noise floor. The analyser is a
dead-end node (never routed to the destination) and the drone is never routed
into the analyser, so it cannot howl even with both live.

**Idle self-demo (always on):** with no mic, a deterministic seeded synthetic
carrier (`SmoothNoise` in `voice.ts`) slowly drives pitch and energy, so from
mount the flame is always morphing and — once you press Begin — the drone is
always singing its own structure. Never blank, never silent.

## Audio safety

Gesture-gated `AudioContext`. ≤ 10 partials + sub = 9 oscillator voices. Master
gain ≤ 0.18 behind a `DynamicsCompressor`. Full teardown on unmount: oscillators
stopped, nodes disconnected, mic tracks stopped, rAF cancelled, `ctx.close()`.

## Determinism

All randomness is seeded `mulberry32`; all time is `performance.now()`. No
wall-clock or platform-RNG calls anywhere.

## Reference

Scott Draves & Erik Reckase, **"The Fractal Flame Algorithm"** (2003); the
algorithm behind **Electric Sheep** (Draves, 1999–). The chaos game / IFS lineage
traces to Barnsley's _Fractals Everywhere_ (1988); the log-density tone-map and
nonlinear-variation blend are Draves' contributions.

## Next-cycle deepening

Swap the synthetic exciter for **Karel's real piano** as the physical driver —
onset detection lighting up specific variations, sustained notes holding an
xform dominant — and widen the chord to more partials (11-limit JI, a moving
tonic) so the flame can voice richer harmony as it morphs.

## Files

- `page.tsx` — client component: canvas, render loop, gesture-gated audio, mic,
  live weld readout, design-notes overlay.
- `flame.ts` — flame engine: xforms, chaos game, accumulation, log-density
  tone-map, feature-vector weld, `mulberry32`, palette LUT.
- `variations.ts` — the 21 nonlinear variation functions.
- `voice.ts` — autocorrelation pitch/energy from the mic + deterministic idle
  carrier.
- `audio.ts` — the Just-Intonation partial drone (the flame's voice).
