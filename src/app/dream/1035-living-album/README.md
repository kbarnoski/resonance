# 1035 · Living Album

## The one question

**What if the human is not a *player* but a *gardener* — you drop a few seeds into
a living, self-evolving piece of music that REMEMBERS, and the music at minute 6
still audibly carries the genetic memory of your minute-1 gesture?**
(Minute 5 ≠ minute 1, and it never loops.)

## What it is

An adult, long-form, generative-with-memory ambient piece. A small **population
of melodic agents** drifts through a slowly-modulating **diatonic** harmony. Each
agent carries a tiny **genome** — register, rhythmic density, timbre brightness, a
short interval-motif, and a lifespan. Agents are **born, age, reproduce, and
die**. When two agents breed, the child inherits a **mutated blend** of both
parents' genomes, so the motifs alive at minute 6 are literal descendants of
those alive at minute 1. That lineage is the audible **memory**.

You don't trigger notes. You **tend** the garden:

- **Tap** anywhere → **plant a seed**. The seed's genome is biased by *where* you
  tapped (left/right → low/high register, top/bottom → bright/dark). It then
  lives and breeds like any agent, so a single tap echoes forward through its
  descendants for minutes.
- **Climate buttons** (warm / cool / modulate key) → nudge a global field the
  whole population slowly adapts toward over the next ~minute. The key glides to
  a new tonic; brightness and register drift.

Neither is note-on-tap. The effect is *felt over time*.

## Subsystems

- **`evolve.ts`** — the pure deterministic core. No DOM / Web-Audio / Canvas
  imports. Holds: seeded RNG (mulberry32), genome representation,
  mutation + crossover (heredity), agent birth/aging/death, functional-harmony
  model (a diatonic I–vi–IV–V–iii–IV progression over a climate-modulated
  tonic), and `pickPitch` (voice-leading that always returns a **diatonic** pitch
  and snaps to chord tones on strong steps). `step(world)` advances one tick and
  returns the note events emitted that tick.
- **`page.tsx`** — turns world state into sound and visuals.
  - **Audio (Web Audio API):** a soft always-on generative **bed** (breathing low
    root + fifth with slow amplitude LFOs) plus one short **filtered voice per
    emitted note** (sine/triangle by brightness, lowpass cutoff by brightness,
    soft attack/release, fed through a master compressor/limiter).
  - **Visual (Canvas2D):** an aurora-organic **lineage field**. Each agent is a
    glowing body positioned by genome (register → vertical, brightness →
    horizontal); **threads** draw each child back to its parents (heredity made
    visible); note emissions bloom as colored trails. Color hue is inherited with
    drift, so a lineage stays recognizable.
- **`evolve.test.ts`** — headless assertions (see below).

## How the heredity / memory works

1. Founders start with random genomes.
2. Each tick, pairs of living agents occasionally **reproduce**. `crossover()`
   blends the two parents' scalar genes by a random weight and inherits motif
   steps gene-by-gene, then applies a **small bounded mutation**. Children carry
   a `parents` list and a `generation` depth.
3. Because new material is always a *blend of currently-living material* (plus
   small mutation), the genome pool **drifts continuously** rather than being
   replaced — descendants at minute 6 are statistically near their minute-1
   ancestors but never identical. That is the "memory," and it is audible as
   recurring-but-evolving register/motif/brightness tendencies.
4. Your **seed** injects fresh, biased genetic material that then propagates the
   same way. Your **climate** nudge biases what every agent slowly adapts toward,
   so it reshapes the whole pool's evolutionary pressure for the next minute.

Population is kept **bounded** (min 3, max 14, reproduction pressure eases above a
soft cap of 9) so it never explodes or goes extinct — the piece is endless.

## Named reference

Brian Eno's generative **_Reflection_** (long-form, ever-different, non-looping
ambient) and the 2026 evolving long-form ambient wave; evaluation framing from
**arXiv:2506.05104 "Survey on the Evaluation of Generative Models in Music."**
Heredity model inspired by artificial-life genetic inheritance.

## Controls

- **Tap / click the garden** — plant a seed (also wakes audio on first tap).
- **Wake the garden** — start audio without planting (visuals + sim already run).
- **Warm / Cool climate** — nudge global brightness + register (felt over ~1 min).
- **Modulate key** — glide the tonic up a fourth / back home (~20s glide).
- **Read the design notes** — in-page explainer.

## Fallbacks / degrade-gracefully

- Visuals and the simulation start **on load** with an auto-demo population — a
  glancing reviewer sees life immediately. Audio is gesture-gated (first tap or
  "Wake the garden") per browser autoplay policy.
- With **zero interaction** the piece evolves on its own forever.
- Full teardown on unmount: sim timer cleared, rAF cancelled, pad stopped,
  AudioContext closed. No errors thrown if audio is unavailable.
- Deterministic core is seeded, so behavior is reproducible for testing.

## Verification

Run headlessly:

```
npx tsx src/app/dream/1035-living-album/evolve.test.ts
```

**Result: 13/13 checks PASS.** Asserts: children's genes are blends of parents
(±mutation); child motif steps derive from parent motifs; mutation stays within
genome bounds over 5000 generations; population never exceeds the cap and never
goes extinct over 8000 ticks; **every** emitted note is diatonic to the active
key (tested over ~6000 ticks); `pickPitch` returns in-range diatonic pitches;
chord tones exist and are diatonic; the late population (≈6 simulated minutes)
contains inherited descendants (gen > 0); seed `x`→register and `y`→brightness
mappings hold; and the world is deterministic for a fixed seed.

## What's unverified / honest caveats

- The test proves the *structural* memory (lineage continuity, bounded drift,
  diatonic correctness). It does **not** prove the memory is *perceptually*
  salient to a human listener over 6 minutes — that's a subjective claim the
  evaluation survey explicitly flags as hard. Anecdotally the register/motif
  tendencies do persist and recur, but I have not run a listening study.
- Audio voice-leading is per-agent and greedy (nearest chord tone); it avoids
  wrong notes but does not enforce no-parallel-fifths-style counterpoint across
  agents.
- Tilt input was left out (tap + climate already cover the sparse-perturbation
  brief); the code path is tap/pointer only.
- Mobile audio voice count is modest by design (population ≤14) but not profiled
  on low-end devices.
