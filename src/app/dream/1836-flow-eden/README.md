# 1836 · Flow Eden

**The one question:** _Can a piece of music be a living thing you tend rather than a
track you play — evolving over minutes because its **population**, not a script, is
changing?_

Flow Eden is a long-form, stateful, emergent sonic ecology. A finite budget of matter
lives on a WebGL2 grid under a **mass-conserving Flow-Lenia** rule. Three species compete
for that matter; they spread, collide, and drift. Sound and image are two views of **one**
simulation — so the music at minute five is genuinely different from second five, because
the population has evolved. No loop, no arc, no timeline.

Click **Start** (audio needs one gesture) and then just watch and listen. It runs and
evolves on its own with zero further input and zero permissions. Tapping the field to drop
a blob of a species is an enhancement, not a requirement.

---

## How it works, by subsystem

### 1. The simulation — faithful Flow-Lenia (`sim.ts`)

A continuous cellular automaton rendered to texture and ping-ponged, entirely on a WebGL2
grid (`RGBA16F`, `EXT_color_buffer_float`). One field texture carries:

- **R = m** — local **mass**, the finite conserved resource.
- **G = q = m·s** — the mass-weighted **genome** `s ∈ [0,1]`, the species parameter
  **embedded in the matter**. Wherever mass flows, its rule parameters (kernel ring radius,
  growth μ/σ) flow with it; where two populations mix, their genomes blend by mass. This is
  the Flow-Lenia mechanism that produces drift and speciation.

One tick is three fragment-shader passes:

1. **Perceive (A).** A radial growth-kernel convolution gives each cell a potential `U`,
   then a Gaussian growth `G(U)` — both using *that cell's* genome, so the rules travel
   with the matter.
2. **Flow (B).** `F = kA·∇U − kM·∇m`: mass climbs the affinity gradient (organisms
   cohere and move) minus a concentration/pressure term (so nothing piles up to white).
   The displacement `dt·F` is clamped to under one cell.
3. **Transport (C).** **Reintegration tracking**: every source cell deposits its mass into
   a unit box shifted by `dt·F` and hands each overlapping destination its share. The
   overlaps of a unit box sum to exactly 1, so **total mass is conserved** — the finite
   resource that forces competition. A tiny genome mutation is folded in here so the
   ecology keeps evolving rather than settling.

Because mass is conserved it can neither die to black nor explode to white; the pressure
term and displacement clamp keep the field a living, slowly-evolving thing.

### 2. Sonification — the ecology _is_ the score (`audio.ts`)

A 48² downsample pass is read back (`readPixels`) every few frames into cheap per-species
statistics — mass, center of mass, motion. Then:

- **Each species → one voice**, a distinct timbre in its own register (low warm triangle /
  mid soft sawtooth / high airy sine), pitch-quantized to a shared **D major-pentatonic**
  scale, so the aggregate is always harmony.
- **Population mass → presence** (that voice's amplitude).
- **Center of mass → gentle pan and pitch drift.**
- **Discrete events → note onsets** so the ear hears the ecology *changing*: a species
  **blooming** rings a bright bell, a **dominance takeover** (collision) rings a small
  chime, a **near-extinction** tolls a low soft pluck. Field motion adds a breath of
  filtered-noise shimmer.

Every voice → a master `DynamicsCompressor` → master gain (capped **0.18**) → destination,
with a 2 s fade-in and a clean teardown (`ctx.close()`).

### 3. Safety & fallback

- Deterministic: all seeding, the mutation-noise field, and audio jitter come from
  **mulberry32 seeded `0x1836`** — no bare `Math.random`/`Date.now` in the loops.
- Honors `prefers-reduced-motion` (smaller grid, slower stepping; audio keeps running).
- No strobe — slow luminance drift, peak clamped below full white.
- If WebGL2 float render targets are unavailable, an on-brand notice appears over a minimal
  WebGL2 plasma fallback with a gentle evolving pad, so the screen is never blank and there
  is always both sound and image. WebGL2 only — no WebGPU (runs on iOS Safari).

---

## References

- **Bert Wang-Chak Chan — _Lenia_** (continuous cellular automata). The smooth
  kernel-convolution + Gaussian-growth substrate this builds on.
- **Plantec, Hamon, Etcheverry, Chan, Oudeyer & Moulin-Frier — _Flow-Lenia_**
  (arXiv:2506.08569, _Artificial Life_ 2025). The load-bearing idea: **conservation of
  mass** makes organisms compete for a finite resource, and **embedding each organism's
  rule-parameters into the moving matter** yields emergent evolution/speciation.
- **_Simulacra Naturae_** (generative-ecosystem installation, arXiv:2509.02924, 2025). The
  framing of a self-organizing ecology as a long-form audio-visual work.

---

## Honest limitations

- This is a compact, **single-kernel** Flow-Lenia, not the paper's full multi-channel /
  multi-kernel model. Species differ by a few smoothly-varying parameters, not full
  independent rule sets.
- "Evolution" here means **genome drift** under mutation plus competition for the conserved
  mass budget — not Darwinian selection over discrete reproducing agents. Over minutes the
  species balance genuinely wanders and the harmony reshapes; it does not narrate a story.
- Half-float storage means total mass can drift by a small amount over very long runs; it
  stays within a healthy band rather than being renormalized each frame.
- Solitons/gliders emerge as moving, merging blobs rather than the crisp textbook gliders of
  tuned single-species Lenia — the trade for having three genomes share and contest one
  field.
