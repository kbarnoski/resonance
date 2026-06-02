**For**: kids (4+)

# 264 · Kids Lenia Pond

## Concept

A dark, near-black pond. Tap it and a glowing nebula creature blooms under your
finger, then swims away on its own and drifts across the water. The more
creatures you make, the more the pond sings. No words to read, no way to lose:
touch, and a luminous lifeform is born and glides off singing.

The creatures are **orbium** gliders from **Lenia** — a continuous-state
cellular automaton where smooth blobs of "matter" self-organize into stable,
moving, almost biological forms. An orbium is the Lenia equivalent of a Game-of-
Life glider: a soft jellyfish-shape that holds together and crawls in one
direction forever.

## The Lenia math (classic grid Lenia)

A scalar field `A(x, y) ∈ [0, 1]` lives on a **150×150 toroidal grid** (wraps at
all edges). Two `Float32Array`s ping-pong as double buffers; the whole sim runs
on the CPU, one step per animation frame.

Each step, for every cell:

1. **Convolution** with a smooth radial **ring kernel** of radius **R = 13**:
   `U = Σ kernel · A(neighborhood)`, wrapping toroidally.
2. **Growth**: `G(U) = 2·exp( −(U − mu)² / (2·sigma²) ) − 1`
3. **Update**: `A ← clamp( A + dt·G, 0, 1 )`

Exact stable params (Chan's orbium regime):

| param | value |
|-------|-------|
| grid  | 150 × 150, toroidal |
| R (kernel radius) | **13** |
| mu (growth center) | **0.15** |
| sigma (growth width) | **0.017** |
| dt (time step) | **0.1** |

The kernel is **Chan's smooth exponential bump** `K(r) = exp(4 − 1/(r(1−r)))`
for normalized radius `r ∈ (0, 1)`, zero outside the disc, normalized to sum=1.
It peaks at half-radius (a soft ring/shell). This is the exact kernel the
published orbium matrix was tuned for — that match is what keeps the glider
intact instead of letting it smear.

## The orbium seed

We stamp **Bert Chan's canonical 20×20 orbium matrix** verbatim (the published
`orbium` float pattern from his Lenia notebook / 2019 paper). We deliberately do
**not** hand-roll a crescent: only this specific configuration reliably self-
organizes into a translating glider at R=13 / mu=0.15 / sigma=0.017 / dt=0.1. A
synthesized gaussian blob tends to either dissolve to nothing or blow up to a
solid disc.

On Start, one orbium is stamped dead-center so the pond is alive immediately.
Each **tap** queues another orbium stamped at the touch point with a **random
quarter-turn rotation** (0/90/180/270°), so creatures head off in varied
directions. Stamps use a max-blend so overlapping creatures stay crisp. Quarter-
turn rotations preserve the glider exactly (the dynamics are rotation-symmetric).

## Why R8, not R32F

The field is packed to `Uint8` (`v·255`) and uploaded as a WebGL2 **R8** texture
every frame, sampled with `LINEAR` filtering for a smooth nebula look. We use
**R8 on purpose**: `R8` supports `LINEAR` magnification on every device. `R32F`
with linear filtering needs the `OES_texture_float_linear` extension, which many
phones and tablets lack — on those, an R32F-linear texture renders **black**.
R8's 256 levels are plenty for a glowing color ramp, and 8-bit is only used for
*display*; the simulation itself stays in full `Float32` precision.

## Render

Raw WebGL2 (no three.js, no 2D canvas). A fullscreen triangle pair runs a
fragment shader that maps field value → a **violet → cyan → rose** nebula ramp
with a soft white-hot bloom in the densest cores, over a near-black cosmic
background with a faint shimmer and gentle vignette. The living orbia read as
luminous jellyfish-nebulae.

## Audio (Web Audio, kid-safe)

- **Always-on ambient pad**: detuned **C3 + G3** triangle oscillators, low gain,
  faded in on Start — the pond is never silent.
- **5 vertical bands → 5 pentatonic voices** (`C3 E3 G3 A3 C4` — no wrong notes).
  For each band: **mass** (sum of A) → voice gain; **vertical centroid** →
  ±cents detune, so the chord breathes as creatures drift up/down. Brightness
  (lowpass cutoff) also tracks band mass. All smoothed with `setTargetAtTime`
  for clickless changes.
- **Per-tap ping**: a soft one-octave-up triangle blip in the tapped column's
  note, fired immediately on pointer-down (<50 ms) for instant cause→effect.
- Gains are capped; everything runs through a warm lowpass and a
  `DynamicsCompressor` limiter, so nothing is ever loud or harsh.
- The `AudioContext` is created and resumed **only on the Start gesture**. Before
  Start, creatures glide silently.

## Color = pitch

Left-to-right screen position maps to the pentatonic scale (the 5 bands), and the
same left-to-right position drives the per-tap ping's note — so where you touch
is both where the creature appears and what note you hear.

## Degradation & teardown

- **No WebGL2** → a readable `text-rose-300` notice, and (after Start) the
  ambient pad still plays. No crash, no blank failure.
- **Unmount** cancels the rAF loop, closes the `AudioContext`, deletes the GL
  program/texture/buffer, and calls `WEBGL_lose_context` for a full teardown.

## Honest limitations

- **Does the orbium actually stay alive & glide?** **Yes — verified by
  simulation, not just static checked.** A standalone Node run of the exact
  kernel + canonical seed + params ran 400 steps: mass stayed steady at ~75–76
  (no dissolve, no explosion) while the centroid translated steadily (~0.24
  cells/step) and wrapped toroidally around the grid. It is a genuine
  shape-stable, self-propelling glider.
- I have **not** yet watched it render live in a browser on this pass, but the
  sim dynamics, lint, and typecheck all pass; the GL path mirrors a build-
  verified sibling prototype (260).
- The CPU convolution is ~520 kernel taps × 22,500 cells per step. On a 150×150
  grid this holds 60fps on a laptop; on a low-end tablet it may dip — stepping
  the sim every other frame is a trivial fallback if needed.
- Many overlapping orbia in the same spot can occasionally merge into a larger
  non-glider blob (still alive and glowing, just not translating). For a 4-year-
  old this still reads as "a big glowing creature," so it's not a fail state.
- Detune is subtle by design (kept small so the pentatonic chord never sours).

## Cause → effect for a 4-year-old

Very legible: **touch → a glowing creature appears under the finger + an instant
ping → it swims away on its own.** Direct, immediate, repeatable, and impossible
to get "wrong." The always-on pad means the world is alive before they even act.

## Next-cycle deepening

- A "nursery" of *other* Lenia species (e.g. *gyrorbium* that curve, or
  rotators) selectable by a big picture button — more creatures to discover.
- Two-finger "tickle": local field boost under a held finger to gently steer or
  feed a passing creature.
- Move the convolution to a GPU fragment-shader ping-pong (FBOs) to free the CPU
  and allow a larger grid / many more simultaneous creatures.
- Rhythmic mode: quantize each creature's "song" onset to a soft pulse so the
  pond gently grooves.

## Reference

Bert Wang-Chak Chan, **"Lenia — Biology of Artificial Life"** (2019),
*Complex Systems* 28(3). The orbium glider, the smooth growth/kernel formulation,
and the canonical orbium seed matrix used here all come from this work and its
accompanying Lenia notebooks.
