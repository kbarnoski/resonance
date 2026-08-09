# 7672 — Dissolve

**The one question:** can you watch (and hear) your own bodily boundary
*un-form* — hold still long enough that your felt self / not-self edge dissolves
outward into a boundless hyperspace field, and snap it back sharp the instant you
move?

`concept: DISSOLVE — watch your own bodily boundary un-form into hyperspace`
`input: camera / body · output: WebGL2 fullscreen fragment shader`
`technique: silhouette-edge-precision → log-polar form-constant dissolution`
`state: ego-dissolution · pole: intense ↔ cosmic-ambient`

## The research anchor

Predictive-processing accounts of the bodily self hold that the brain constantly
**attenuates its own body signals** — and that sustained stillness and attention
can push that self-attenuation until the felt self / not-self boundary paradoxically
*dissolves*. This piece makes that arc literal and interactive: a running
**edge-precision** scalar models the boundary, and the dissolution is staged as a
Bressloff–Cowan geometric hallucination.

- **Motion → high precision (INTENSE pole).** Your silhouette outline snaps back
  sharp and present; the surrounding field intensifies into a fractal breakthrough
  melt. The audio focuses to a bright present tone.
- **Stillness → precision decays toward 0 (COSMIC-AMBIENT pole).** The silhouette
  edge dissolves *outward* through an `exp()` log-polar warp into a form-constant
  tunnel / honeycomb; you merge into a boundless field (ego-dissolution). The
  audio opens into a wide, detuned wash. Over ~2–3 min of stillness a separate
  long-form **depth** value keeps deepening the dissolution — an evolving state,
  not a short loop.

## How it works

- **Silhouette sensor** (`silhouette.ts`). The front camera is drawn (mirror-
  flipped) into a small 256×192 grab canvas. On the CPU, a **silhouette mask** is
  built from a running-**background** foreground term (`|luma − slow-mean|`, a
  standing body) blended with an **instantaneous frame-difference** (the crisp
  moving edge). The mean frame-difference gives a scalar **motion energy**. No
  segmentation model, no network — just arithmetic on luma. The mask is handed to
  the renderer as an RGBA `Uint8Array`.
- **Edge-precision dynamics** (`page.tsx`). Precision snaps sharp on motion
  (τ ≈ 0.22 s) and decays slowly in stillness (τ ≈ 9 s). A second **depth** scalar
  accrues only under sustained stillness (τ ≈ 55 s → ~2–3 min to full) and
  collapses fast on any real motion.
- **The shader** (`scene.ts`). A WebGL2 fullscreen fragment shader splices the
  shared **`LOGPOLAR_GLSL`** engine. The mask is sampled twice: once **sharp**
  (present body) and once pulled from a smaller **log-radius** so the edge blooms
  outward through the inverse log-polar `exp()` warp. A **tunnel + spokes →
  honeycomb** form-constant field (mixed by depth) takes over as precision falls.
  **Ping-pong FBO feedback** drifts the previous frame outward down the tunnel
  with a hue twist for visionary persistence trails. Violet → magenta → near-white
  art ramp; raw hex lives only inside the shader/canvas.
- **Audio** (`audio.ts`). Built on the shared `startShepard` (a Shepard–Risset
  present-tone ascent that brightens with precision) and `startDroneBank` (a
  just-intonation bed whose filter opens with precision), plus a bespoke **wide
  detuned wash** (root + fifth + octave sines) that swells in stillness and whose
  detune spread widens as depth deepens.

## Camera fallback (silent-review path)

If `getUserMedia` is missing, denied, or errors, the piece runs a **deterministic
virtual performer** (seeded `mulberry32` + `performance.now()`, never
`Math.random` / `Date.now`): a breathing, orbiting body+head blob on a scripted
~60 s loop — a short movement burst (intense pole) then a long stillness
(precision decays → cosmic dissolution) — so the entire concept and its full arc
self-demo with zero camera.

## Safety

No hard strobe. Luminance is a slow (≤3 Hz) sine drift via `safeFlicker`; the
form-field drift is sub-1 Hz; the feedback trail is a bounded brightest-wins IIR.
Respects `prefers-reduced-motion`.

## Named references

- **Becattini, Lifshitz & Miller (2026)**, *"Learning to attenuate myself"*,
  **Neuroscience of Consciousness** — predictive-processing self-attenuation; the
  paradox that sustained stillness/attention dissolves the bodily boundary.
- **Bressloff & Cowan** cortical model of geometric hallucinations — the
  retina→V1 map as a complex logarithm; stripes/hexagons in cortex become tunnels,
  spirals and honeycombs on the retina under the inverse (`exp`) warp.
- **Heinrich Klüver's four form constants** — lattices/honeycombs, cobwebs,
  tunnels/funnels, and spirals; the invariants this dissolution renders.

## Design notes

- The **race**: this is the WebGL2 fragment-shader take on DISSOLVE (a Canvas2D
  and a WebGPU sibling exist). The wager: doing the whole un-forming as one warp
  in the fragment shader — sharp-vs-warped mask sampling plus a spliced log-polar
  form-constant field plus FBO feedback — keeps the dissolution continuous and the
  edge genuinely *bleeding* outward rather than cross-fading two layers.
- **Energy is bounded on purpose.** The feedback is a brightest-wins-with-decay
  IIR (`max(col, feed*persist)`), so trails can never runaway-bloom to white and
  there is no accidental strobe from accumulation.
- **Honest scope.** The silhouette is a motion + background-foreground field, not
  a true body segmentation — an art signal, not a matte. The fresh move is the
  staging: stillness-driven edge-precision decay → outward log-polar un-forming
  into a Klüver form-constant field, as an ego-dissolution arc rather than a
  filter.
