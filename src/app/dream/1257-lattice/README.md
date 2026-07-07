# 1257 · Lattice

**The one question:** *What if the "living tissue / breathing membrane" quality of
the DMT realm could be grown in real time by a GPU reaction-diffusion field, warped
into psychedelic honeycomb geometry?*

An intense "breakthrough" ascent (~3.5-minute stateful loop). Instead of drawing a
membrane, this piece **grows** one — a Gray-Scott reaction-diffusion simulation
(Alan Turing's morphogenesis, made physical) runs on the GPU and the same
Turing-pattern math that produces spots, stripes, mazes and self-replicating
"mitosis" blobs becomes the living, spreading realm-membrane. It is warped through
log-polar honeycomb symmetry and rendered with thin-film iridescence on a luminous
nacre ground, so it reads as oil-on-water / nacre tissue rather than jewels on
black.

## Mechanism — reaction-diffusion on the GPU

Two float textures hold the two morphogen concentrations, **U** and **V**, in their
`.x`/`.y` channels. Each frame a **ping-pong** loop runs the Gray-Scott update
several sub-steps into the opposite framebuffer:

```
u' = u + (Du·∇²u − u·v² + F·(1−u))·dt
v' = v + (Dv·∇²v + u·v² − (F+K)·v)·dt
```

- `∇²` is a 9-point Laplacian read with `texelFetch` (filter-independent) and
  toroidal wrap, so the membrane is seamless.
- State textures are `RGBA16F` when `EXT_color_buffer_float` is available; if float
  rendering is unsupported the field **degrades to `RGBA8`** (lossier but functional)
  and the sim resolution drops from 512² to 384². The sim texture is capped
  regardless of screen size; the display is DPR-capped at 1.6.
- The display pass samples the **V** field through an N-fold mirror kaleidoscope and
  the shared log-polar cortical warp (`_shared/psych/logpolar`), then colours it with
  a thin-film interference palette. Structure blooms iridescent where the tissue is
  dense; the ground stays a bright pearl so mean luminance is high and stable.

## Phase arc — Pearson's regimes

A stateful arc sweeps feed (`F`) and kill (`K`) through the Gray-Scott / Pearson
parameter map via smoothstep keyframes, so minute 3 ≠ minute 1:

1. **Bloom** — `F≈0.030, K≈0.062`: sparse spots seed from the centre.
2. **Growth** — `F≈0.0367, K≈0.0649`: the **mitosis** regime; spots self-replicate
   and the membrane spreads outward.
3. **Saturation** — `F≈0.029, K≈0.0565`: a dense **maze/labyrinth** lattice fills the
   field; kaleidoscopic symmetry climbs (3 → 12) and iridescence peaks.
4. **Breakthrough** — `F≈0.030, K≈0.0545`: the field coheres into a bright organized
   realm and holds.

After ~208 s the field re-seeds and the ascent rises again. Feed/kill are ramped
slowly (over seconds) so regime switches never flash the whole field.

## Input — mic as neural gain

`useMicAnalyser` (shared) is opened on the Begin gesture. Overall energy raises the
number of reaction sub-steps per frame (louder room → **faster** reaction and more
growth) and adds to the audio drive; detected onsets inject local **seed pulses**
that spawn fresh replication. If the mic is denied or unavailable the membrane
**self-drives**: a slow internal timer auto-seeds new growth and the arc carries the
intensity. A `text-rose-300` line reports the fallback; the visuals never block.

## Audio — the rising ascent

Generated entirely from the shared psych toolkit:

- `startShepard(dir: +1)` — a real Shepard-Risset endless-rising glissando that
  intensifies with the arc drive (the "ascending, intensifying sound" of
  breakthrough).
- `startDroneBank` — a just-intonation drone bed whose lowpass opens with drive.
- `createVoidReverb` — a code-generated cavernous convolution tail; wet mix blooms as
  the realm coheres.

Both engines route through the reverb bus → master gain (**0.4**, ≤ 0.45 cap) →
`DynamicsCompressor` limiter → destination. The `AudioContext` is created only on the
Begin gesture and fully torn down on unmount.

## Safety (photosensitive epilepsy)

- **No strobe, no flashing.** Intensity comes only from smooth reaction-diffusion
  growth, spatial detail density, and slow luminance/saturation ramps over seconds.
- The display keeps a **luminous floor** and a high pearl ground, so the field never
  goes dark and the frame-to-frame mean luminance stays roughly stable — regime
  switches ramp the parameters slowly rather than cutting.
- The optional "Breathe" luminance pulse routes **only** through
  `createSafeFlicker({ maxHz: 3, defaultHz: 1.2, floor: 0.6 })` — OFF by default, soft
  sine (never a hard strobe), honours `prefers-reduced-motion`, and `.kill()` on
  teardown.
- Audio master ≤ 0.45 with a compressor limiter.

## Named references

- Alan Turing, *"The Chemical Basis of Morphogenesis"* (1952) — reaction-diffusion
  as pattern formation.
- The **Gray-Scott** reaction-diffusion model; John Pearson, *"Complex Patterns in a
  Simple System"* (Science, 1993) — the feed/kill map of spots / stripes / mitosis /
  mazes this arc walks through.
- *"Mapping a Discrete Psychedelic Dimension: Convergent Neuronal Signatures and
  Phenomenology of the DMT Realm"* — the living/growing "realm-membrane"
  phenomenology.
- Heinrich Klüver's four form constants (the **lattice / honeycomb**), realised via
  the shared Bressloff–Cowan log-polar cortical warp.

## Next-cycle deepening

- Multi-scale RD (a coarse field modulating a fine field) for tissue-within-tissue
  depth.
- Anisotropic diffusion steered by the honeycomb gradient so growth follows the
  lattice veins.
- A second morphogen channel driving hue directly (true 2-species colour) instead of
  a single V→palette mapping.
- BPM-locked seeding: use the mic BPM estimate to phase onset seeds with the drone.
