# 2482 · Collide — a bowl that composes itself

**The question:** *What if a room full of physical objects composed its own music
by colliding?*

Collide is a 3D physics playpen, not a watched simulation. You drop or throw
objects made of four **materials** — glass, wood, metal, stone — into a
paraboloid bowl. The bowl funnels everything toward the centre, so the pile keeps
colliding on its own, and **every impact excites a physically-flavored modal
ring at the impact velocity**. Harder hits are louder and brighter. Nudge the
pile with **shake** to keep it ringing; keep dropping objects to thicken the
texture. The space becomes a self-playing generative percussion sculpture — a
musical Rube-Goldberg toy.

## Three subsystems

1. **Physics solver** (`modal.ts`) — a small owned impulse/collision solver.
2. **Modal-synthesis engine** (`modal.ts`, `ModalSynth`) — additive decaying
   partials excited by collision impulses.
3. **three.js renderer + interaction** (`page.tsx`) — real lit 3D geometry, a
   gently orbiting camera, pointer-throw and shake, with a Canvas2D fallback.

## Physics step + collision → strike mapping

Each body is a sphere with position, velocity, radius, mass, restitution and a
fundamental pitch. The world integrates at a **fixed 1/120 s substep** (a real
frame is split into as many substeps as it covers) so the solve is deterministic
regardless of frame rate.

Per substep:

- **Gravity + air drag** integrate velocity, then advance position.
- **Sphere–sphere collisions:** overlap when `dist < r1 + r2`. Resolve with a
  positional de-overlap split by inverse mass, then an impulse along the contact
  normal: `j = -(1 + e)·vₙ / (1/m1 + 1/m2)`, with `e = min(restitution)`.
- **Bowl surface:** the floor is a paraboloid `y = k·(x² + z²)`; contact when the
  sphere dips below it, resolved along the analytic surface normal
  `(-2kx, 1, -2kz)` with restitution, plus tangential friction so piles settle.
- **Rim:** a soft cylindrical wall at radius `R` keeps hard throws in.

**Strike emission.** On any resolved collision whose relative normal speed
exceeds `0.42`, each participating body emits a *strike event* carrying its
material, its fundamental, and the impact speed. A per-body `0.05 s` gate stops a
single object machine-gunning. The impact speed maps through a curve to an
expressive `0..1` **strike velocity**, which drives both the visual flash/scale
pulse and the synth's loudness + brightness. Object count is capped at **24** so
the pair loop and the voice bank stay real-time.

**Pitch.** Object size maps *inversely* onto a two-octave **just-intonation
scale** (`1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2`, base 174.6 Hz) — larger objects
ring lower, and because everything is on the just scale, random collisions stay
consonant.

## Modal-synthesis model

A struck object's sound is a **sum of exponentially-decaying sinusoidal modes**.
Each strike spins up one `OscillatorNode` per partial into its own gain node
running a scheduled exponential decay envelope
(`0.0001 → amp` in 4 ms, then `amp → 0.0001` over the partial's decay time).
Strike velocity scales the overall level **and** the high-partial amplitudes
(`gainᵢ ∝ brightness · velocity^0.6` for `i > 0`), so a harder hit is
audibly brighter. Voices are **pooled and capped at 24 simultaneous rings**; past
the cap the oldest voice is stolen with a fast fade so a busy pile never blows up
the graph. A synthesized **convolution reverb** (decaying noise impulse response,
generated deterministically from the seeded PRNG) plus a soft limiter give the
room one shared tail and keep peaks in check.

### Material presets (ratios relative to the struck fundamental)

| Material | Ratios | Decays (s) | Character |
| --- | --- | --- | --- |
| **Glass** | 1, 2.76, 5.4, 8.9 | 3.4–1.1 | bright inharmonic highs, long ring |
| **Wood** (marimba bar) | 1, 3.9, 10.7 | 0.55–0.16 | warm, stretched 3.9× overtone, fast decay, strong fundamental |
| **Metal** (bell/aluminium) | 1, 2.7, 4.2, 5.4, 6.6, 8.0 | 5.2–1.6 | dense inharmonic partials, very long bright shimmer |
| **Stone/ceramic** | 1, 2.3, 3.7 | 0.32–0.13 | dull short thunk + brief pitched tail, rolled-off highs |

Visual identity tracks the same presets — geometry (faceted crystal / bar /
sphere / rock), surface metalness+roughness, and brightness — all inside the
dream-lab violet/indigo/neutral ramp rather than foreign hues.

## Determinism & degradation

- On mount, a seeded auto-demo (`mulberry32(0x2482)`) drops objects on a fixed
  schedule so a silent screenshot already shows the sculpture composing and
  looping. No `Math.random` / `Date` anywhere — all randomness is PRNG, all
  timing is `performance.now()` deltas + a frame counter.
- `AudioContext` is created only inside the Start gesture. No WebGL → a
  `text-destructive` notice + a top-down Canvas2D physics view that still
  collides and rings. No `AudioContext` → visuals continue silently.
- Full teardown on unmount: oscillators stopped, nodes disconnected,
  `ctx.close()`, `cancelAnimationFrame`, three.js geometries/materials/renderer
  disposed, `ResizeObserver` and pointer listeners removed.

## References

- **K. van den Doel & D. K. Pai**, *The sounds of physical shapes* / modal
  synthesis for contact sound — the additive decaying-mode model this engine
  implements.
- **K. van den Doel, P. G. Kry & D. K. Pai**, *FoleyAutomatic: Physically-Based
  Sound Effects for Interactive Simulation and Animation*, SIGGRAPH 2001 — driving
  modal resonators from contact/collision events in a physics loop.
- **J. F. O'Brien, C. Shen & C. M. Gatchalian**, contact-sound-from-collision
  work — impact force → excitation mapping.
- *Sonify Anything* (arXiv **2508.01789**, 2025) — recent material-aware modal
  contact-sound synthesis, motivating the per-material partial/decay presets.

## Next-cycle deepening ideas

1. **Contact-point excitation & spatialisation.** Excite modes by the strike
   location on the object (nodes/antinodes) and pan/HRTF each ring to its world
   position for a truer sense of a room of objects.
2. **Rolling & scraping, not just strikes.** Sustained low-velocity contact
   should drive a filtered-noise rolling/friction sound (continuous excitation),
   so the bowl murmurs between impacts instead of going silent.
3. **Shape-derived modal banks.** Replace hand-tuned ratios with modes solved
   from actual mesh geometry (FEM / eigenanalysis) so a bar, a plate and a bowl
   each get their real spectra, and size/shape edits retune the instrument.
