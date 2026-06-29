# 1038 — Form Constant

> The geometry your visual cortex draws on the dark — tunnels, spirals, funnels,
> honeycomb lattices — sung out of sound through a log-polar warp. No drug.

**The one question:** _What if Resonance could turn your music into the actual
geometry your visual cortex hallucinates — tunnels, spirals, funnels, honeycomb
lattices — with no drug?_

This is the lab's first psychedelic / altered-states prototype and the
foundational **log-polar / form-constant engine** the rest of the direction
builds on.

## Tags

`state: DMT/LSD-form-constant · pole: intense · input: mic (non-pointer) · output: WebGL2 fragment shader · technique: log-polar form-constant warp · palette: neon-iridescent`

## Design notes — the log-polar form-constant engine

Klüver classified drug- and flicker-induced geometric hallucinations into four
recurring **form constants**: (1) lattices / honeycombs / chequerboards,
(2) cobwebs, (3) tunnels / funnels / cones, (4) spirals. The key insight
(Bressloff & Cowan) is that these are **not four patterns but one** — a simple
periodic pattern of cortical activity, seen through the retina→V1 cortical map,
which is approximately a **complex logarithm**. A stripe pattern in flat cortex
becomes rings, spokes, or spirals on the retina depending only on its
orientation.

The shader implements that map directly:

1. Take centered, aspect-corrected screen UV.
2. Compute **cortical coordinates** via the forward log-polar map:
   `lr = log(length(uv))`, `theta = atan(uv.y, uv.x)`. `(lr, theta)` is the
   flat cortical sheet.
3. Synthesize **plane-wave stripes** and a **hexagonal lattice** (sum of three
   plane waves at 60° apart) in cortical space, with a traveling-wave phase
   `+ time * speed` for motion.
4. **Orientation selects the form constant**, and `formMix` sweeps between them:
   - stripes along `theta` → concentric rings → **tunnel**
   - diagonal (lr & theta coupled) → **spiral**
   - stripes along `lr` → radial spokes → **funnel**
   - hex lattice → **honeycomb**
5. **N-fold kaleidoscope folding** on `theta` (fold count animates) blooms a
   chrysanthemum; entropy loosens the symmetry at peak.
6. Color is a **neon-iridescent** IQ cosine palette
   `a + b*cos(2π(c*t + d))`, hue driven by the field value plus a slow phase
   cycle, with high contrast/saturation, **chromatic aberration** (the field is
   sampled at three slightly offset radii for R/G/B) and a low-alpha
   **blue-noise visual-snow** grain.

### Audio

Primary input is the **microphone** (non-pointer): an inline `AnalyserNode`
(`getByteFrequencyData`) splits the spectrum and maps it to shader uniforms —
**bass → flow / warp amplitude**, **mids → form-constant morph & fold count**,
**highs → fine detail & grain**, **overall loudness → saturation / neural
gain**. If the mic is denied or unavailable, a **Shepard–Risset-style drone**
(a bank of octave-spaced detuned sine oscillators under a slow Gaussian
amplitude window, for an endless-ascent feel) is routed through the same
analyser so the piece is always audio-visual.

### The journey arc

A JS **entropy controller** drives one global 0→1 parameter on a ~5-minute arc
(it loops): Onset → Come-up → Peak/breakthrough → Plateau → Return. Entropy
feeds octave count, flow speed, fold bloom, saturation and symmetry-looseness,
so minute 5 never looks like minute 1. Everything is lerped — transitions are
never abrupt. A small unobtrusive phase label + progress bar are shown.

## Named references

- **Klüver, H.** — the four form constants of geometric visual hallucinations.
- **Bressloff, P. & Cowan, J.** — cortical log-polar (complex-log) model of
  geometric hallucinations; see "Uncoiling the spiral" (plus.maths.org) for an
  accessible account of the retina→V1 conformal map producing rings, spirals
  and lattices.
- **ENTHEA** (github.com/elder-plinius/ENTHEA, 2026) — a recent open-source
  real-time GPU form-constant synthesizer that implements the same retina→V1
  complex-log transform driven by audio; the contemporary reference for this
  technique.
- **Carhart-Harris et al.** — the entropic-brain hypothesis / REBUS, used here
  as the parameterization for the rising-entropy journey arc.

> Phenomenology only — this evokes the look of these states; it makes no
> medical or neuroscience claims about your brain.

## Files

- `page.tsx` — client component: WebGL2 setup, render loop, entropy arc wiring, HUD.
- `shader.ts` — GLSL ES 3.00 vertex + fragment shader (the log-polar engine).
- `audio.ts` — inline Web Audio engine (mic analyser + Shepard–Risset drone).
- `arc.ts` — entropy / journey-arc controller.

## Stack

Web Audio API + WebGL2 only. No three.js, no extra npm dependencies. Degrades
gracefully: a readable notice if WebGL2 is missing; the generative drone if the
mic is denied. All audio nodes, the `requestAnimationFrame` loop, and the WebGL
context are cleaned up on unmount.
