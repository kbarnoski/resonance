# Ink Garden

**Why open this:** Drop a fingertip of magic ink and watch living Turing-pattern
spots grow and spread across the screen by themselves — and the more the pattern
blooms, the fuller the music gets.

A 4-year-old can use it unsupervised: the whole screen is the instrument, every
touch makes glowing ink and a soft sound, four big color orbs pick the ink hue,
and there are no wrong notes. The twist for this lab: **the simulation IS the
resonating body.** A real GPU reaction-diffusion field is the thing that sings —
not a particle cloud, not a Canvas2D doodle.

---

## Tags

- **INPUT:** touch / pointer — tap and drag anywhere on the screen to seed ink.
- **OUTPUT:** **GPU compute** — a WebGL2 ping-pong float-texture fragment shader
  runs the Gray-Scott update every frame (`gl.ts`). Display is a second GPU pass
  that turns the field into bioluminescent ink (`render.ts`). Audio is Web Audio.
- **CORE TECHNIQUE:** Gray-Scott reaction-diffusion (Turing patterns) on the GPU,
  sonified live as it grows.
- **PALETTE / VIBE:** glowing bioluminescent ink on dark water — inky, organic,
  magical. Dark near-black field, soft cyan/violet/rose/lime ink, tonemapped so
  it never blows out.

---

## How the simulation works (Gray-Scott, explained simply)

Two invisible "chemicals" live in every pixel of a 256×256 grid:

- **A** — a substrate, fed everywhere.
- **B** — an activator. Where B exists *and* A exists, B eats A to make more B.

Each frame, on the GPU, every cell updates by this rule (explicit Euler):

```
A' = A + (Da·∇²A  −  A·B²  +  f·(1 − A)) · dt
B' = B + (Db·∇²B  +  A·B²  −  (k + f)·B) · dt
```

- `∇²` is a 9-point Laplacian (diffusion — chemicals bleed into neighbors).
- `A·B²` is the autocatalytic reaction.
- **`f` (feed)** replenishes A everywhere; **`k` (kill)** removes B.

The tuning used here (`INK_GARDEN_PARAMS` in `sim.ts`):

| param | value | meaning |
|-------|-------|---------|
| dA    | 1.0   | substrate diffuses fast |
| dB    | 0.5   | activator diffuses slower (this is what makes *patterns*) |
| f     | 0.0367 | feed rate |
| k     | 0.0649 | kill rate |
| dt    | 1.0   | time step (14 steps run per animation frame) |

This `(f, k)` pair sits in the soft "coral / mitosis" zone of Pearson's
reaction-diffusion zoo: seeded spots grow, bulge, and split into more spots that
spread outward — a blooming garden of ink rather than rigid stripes.

A fingertip is a **splat pass** that paints `B ≈ 0.9` (and dips A) inside a soft
circular brush, kicking off growth at that point.

### Named reference

Alan Turing, *The Chemical Basis of Morphogenesis* (1952) predicted that simple
diffusing reactants could spontaneously form spots and stripes. John Pearson
(1993) catalogued the Gray-Scott regimes. The GPU recipe here follows **Karl
Sims' "Reaction-Diffusion Tutorial"** (karlsims.com) — the 9-point Laplacian
weights and the A/B feed-kill formulation are his. The ambition hook, "the
simulation is the resonating body," echoes the lab's friction/plate
physical-instrument lineage: instead of bowing a string model, the child grows a
chemical field and the field's shape is the sound.

---

## Readback → sonification (the field IS the instrument)

`readPixels` stalls the GPU, so we do **not** read every frame. Instead, ~10×/sec
(`READBACK_MS = 110`):

1. A GPU blit pass downsamples the live 256×256 field into a tiny **32×32**
   float texture; we `readPixels` that once and pull out the B channel.
2. `summarizeField()` (pure, in `sim.ts`) turns those 1024 values into a coarse
   summary: total **coverage**, recent **activity** (growth rate), horizontal
   **centroid**, and per-region growth across 5 horizontal bands.
3. That summary drives audio, fully decoupled from the 60fps sim:

| field measure | → | musical control |
|---------------|---|-----------------|
| **coverage** | → | chord-bed **gain** (`coverageToBedGain`) and **voice count** (`coverageToVoiceCount`) — sparse ink = root+fifth, full bloom = 4-note voicing |
| **activity** (spread rate) | → | gentle lowpass **cutoff** on the bed (`activityToCutoff`, 700–3900 Hz) — brightens as it grows, mellows as it settles |
| **centroid** | → | soft stereo **pan** of the chord bed (`centroidToPan`, ±0.5) |
| **per-region new growth** | → | soft **bell notes** (`pickBellTriggers`), pitched higher and panned to the region where new spots are forming, capped at 2 at a time |

### The harmony is real, not pentatonic mush

Underneath everything is an always-on ambient pad plus a **functional chord
progression** — a slow I–vi–IV–V loop in C (`CHORD_PROGRESSION`), each chord held
~7.5s and crossfaded — so thirds and fifths are always present and the harmony
actually moves. Bell notes come from a C-major scale chosen to stay consonant
over the whole loop: no wrong notes, but genuine warmth, not bare random pings.

---

## Kids-safety chain (mandatory, in `audio.ts`)

```
sources → master gain (0.26) → lowpass 6500 Hz → DynamicsCompressor
                                                  (thresh −10, ratio 20:1)
                                                → destination
```

- Soft attacks everywhere (bells ramp in over ~20 ms, long gentle tails).
- Bed and ink display are tonemapped/limited so nothing spikes.
- **Always-on ambient pad** (~0.05 gain) so it is never silent.
- **Auto-demo:** after 2 s with no touch, the garden drops its own seeds at
  random so the screen is never empty or dead.
- Every touch produces visible ink + a soft blip within ~50 ms.

---

## Graceful degradation & robustness

- If `EXT_color_buffer_float` (float render targets) is unavailable, we show an
  amber notice and fall back to a **Canvas2D Gray-Scott** running the *same*
  `stepCell` rule on a coarse 96×96 CPU grid (`makeCpuRdSim` in `render.ts`). It
  still grows real Turing patterns, still reads back, and still sings.
- WebGL **context loss** is caught (`webglcontextlost`) with a clear notice.
- Full teardown on unmount: cancel rAF, clear the readback timer, dispose all GL
  programs/textures/FBOs, `loseContext()`, and close the AudioContext.

---

## Files

| file | role |
|------|------|
| `sim.ts` | **pure, testable** — Gray-Scott params, `stepCell`, `summarizeField`, and every readback→audio mapping |
| `gl.ts` | WebGL2 ping-pong float-texture RD sim + splat + downsampled readback |
| `render.ts` | GPU bioluminescent-ink display shader + Canvas2D RD fallback |
| `audio.ts` | kids-safe master chain, warm chord bed, ambient pad, soft bells |
| `page.tsx` | touch input, the 60fps sim loop, the 10Hz readback loop, UI, cleanup |
| `sim.test.ts` | unit tests for the pure math (the runner is scoped to `src/lib/**`, so run ad hoc — see the file header) |

---

## Subsystems (ambition: ≥3)

1. **Touch seeding** — pointer → normalized splat into the field.
2. **GPU RD simulation** — ping-pong Gray-Scott fragment shader.
3. **Sonification logic** — readback + `summarizeField` + musical mapping.
4. **Audio synthesis** — bed / pad / bells through the kids-safe chain.
5. **Visualization** — bioluminescent display shader (+ CPU fallback).
