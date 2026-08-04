# 6360 · Honeycomb

**Titrate your own psychedelic breakthrough.** One continuous dial — `dose ∈ [0,1]` —
driven by your thumb, moves the whole piece together from calm boundlessness up to
a full jeweled hyperbolic-lattice breakthrough, and back down. This is a *played
instrument*, not a passive meditation and not a self-playing generative piece.

Route: `/dream/6360-honeycomb`

## What it is

You fly forward, forever, through a non-Euclidean honeycomb tunnel. A single scalar
`dose` drives **both** the geometry and the sound at once:

| dose | word | look | sound |
|------|------|------|-------|
| ~0.0 | drift | a slow, sparse honeycomb far away | soft sub drone, near-still |
| ~0.4 | approach | the lattice nears, more cells ignite | upper partials open |
| ~0.7 | multiply | radial symmetry multiplies, tunnel twists | Shepard glissando climbs |
| ~1.0 | breakthrough | dense, fast, kaleidoscopic jeweled flight | bright, saturated wall |

## How to play it

1. Press **Begin** (one gesture unlocks the AudioContext).
2. On load an **auto-breath** slowly oscillates the dose up and down (a seeded
   ~48 s sine) so the piece is alive, luminous and audible with nothing touched —
   it climbs and descends on its own.
3. **Press and hold anywhere, then drag** — drag **up** to climb toward
   breakthrough, **down** to drift back. You take over the instant you press; the
   auto-breath resumes ~3 s after you let go.
4. The slim meter on the right shows the current dose plus a one-word state label
   (drift → approach → multiply → breakthrough).

## Technique (what makes this build distinct)

A **real 3D honeycomb tunnel you fly THROUGH** — the geometric-object road, not a
fragment-shader field or a raymarched fractal. It is a single
`THREE.InstancedMesh` of glowing **hexagonal rings** (a 6-segment `TorusGeometry`
per cell) arranged in nested radial layers, repeated across 16 z-planes and
scrolled toward the camera forever (planes recycle behind the camera). As `dose`
rises:

- **forward speed** climbs (`~1.6 → 26` units/s, eased on dose²),
- **radial mirror-symmetry order** multiplies (`3 → 18` angular copies), with
  counter-rotating and half-step-staggered layers for the kaleidoscopic fold,
- **more nested layers** ignite (`1 → 5`),
- **tunnel twist** folds harder (per-plane rotation ∝ z),
- **jewel colours** saturate and shift **indigo → gold → magenta**,
- **UnrealBloom** glow intensifies and fog thins (you see further at breakthrough),
- the camera FOV widens slightly and slowly rolls (tunnel turn), no bob.

Post-processing is `EffectComposer` → `RenderPass` → `UnrealBloomPass` →
`OutputPass`, with ACES tone mapping. All per-cell matrices and colours are
recomputed each frame from the dose (≤1440 instances — cheap).

**Audio** reuses the shared psych helpers (read-only): a just-intonation
`droneBank` (root 55 Hz; ratios 1, 9/8, 5/4, 3/2, 15/8, 2, 5/2) whose lowpass and
level open with dose; an endless-rising `shepard` glissando whose ascent rate and
brightness rise with dose; both washed through the code-built `convolutionVoid`
reverb (wet rises with dose). Master is capped at 0.18 through a
`DynamicsCompressor` limiter — no clipping.

## Safety & robustness

- **Photosensitive-safe by construction**: intensity rides camera speed, geometry
  density and slow colour/luminance drift — **never strobe**. No fast full-screen
  flashing anywhere.
- **`prefers-reduced-motion`** slows everything: speed cap, twist, bloom and the
  dose-smoothing time constant are all reduced.
- **No WebGL** → an on-brand `text-destructive` notice, and the audio keeps
  playing (the dose loop and meter stay live so you can still titrate the sound).
- **Deterministic**: all randomness comes from a `mulberry32(0x6360)` seeded PRNG;
  no `Math.random`, `Date.now`, or `new Date` (time comes from the rAF clock /
  `performance.now`).
- **Cleanup** on unmount disposes geometry, material, InstancedMesh, bloom and
  renderer, stops the audio nodes, closes the AudioContext and cancels the rAF.

## Named references

- **Klüver form constants** (1926) — "honeycomb / lattice" is literally one of the
  four recurring hallucinatory forms.
- **Bressloff, Cowan, Golubitsky, Thomas & Wiener** (2001) — geometric visual
  hallucinations and the architecture of the visual cortex.
- **M. C. Escher**, *Circle Limit* series — hyperbolic tessellations.
- **Rick Strassman**, *DMT: The Spirit Molecule* — the jeweled hyperbolic
  "breakthrough" phenomenology.

## Known rough edges

- The "hyperbolic" honeycomb is an *approximation* — Euclidean nested rings with
  rising angular symmetry and twist, read as a hyperbolic {6,4}-ish mandala rather
  than a mathematically exact hyperbolic tessellation.
- Cells at `dose ≈ 1` can sweep very close to the camera as they rush past; this is
  intentional flow, but on small phones the nearest cells briefly dominate frame.
- The kaleidoscope is achieved by radial instancing + counter-rotating layers, not
  by a true mirror post-process, so the symmetry is rotational (Cₙ) with a
  half-step mirror stagger rather than full dihedral reflection.
- Dose handoff from user back to auto-breath is smoothed by the dose lerp, so it
  glides rather than snapping — deliberate, but it means the auto-breath doesn't
  resume from *exactly* where you left off.
