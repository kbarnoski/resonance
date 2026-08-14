# 12976 · Dream Medley

## The one question
*What if the melodies you sang became a long, slow dream that recalls each of them
exactly, wanders the space between, develops fragments, and returns — a five-minute
piece made entirely of your own songs?*

## What it is
A single genuine Echo-State Network holds several sung phrases at once — one trained
readout per phrase — and a slow cursor auto-navigates the latent memory space over a
five-minute-plus arc. It visits each song exactly (faithful recall), drifts through
the edge-of-chaos hybrids between them, develops a fragment, sinks into a deep dream,
and finds the long way home. Warm ember phosphor on charcoal, Canvas2D: a memory map
(songs as glowing anchors, a wandering cursor, live attention filaments, accumulating
warmth), a scrolling voice-ribbon of the actual notes, and a segmented journey
timeline so the whole long-form structure is legible even on a muted screen.

## The technique — genuine ESN + multi-readout long-form journey
- **One real Echo-State Network** (`reservoir.ts`, no ML libraries): state `x ∈ R^150`
  evolves under a fixed sparse random recurrent matrix `W` rescaled to spectral radius
  ρ (power iteration), driven only by a phase clock. Fading-memory dynamics turn the
  clock into a rich, high-dimensional limit cycle.
- **Many memories, one mind.** Each sung phrase becomes its own readout, trained by
  **ridge / Tikhonov regression** `Wout = (XᵀX + λI)⁻¹ XᵀY`, solved by Cholesky on the
  *converged* clock cycle — so each phrase is reproduced **exactly**.
- **Attention over slots.** An attention vector over the memory readouts forms the
  effective readout `Wblend = Σ_k a_k · Wmemory_k`. Because all readouts were trained
  on the same clock cycle, a convex blend of two readouts is, at every phase, the
  convex blend of the two melodies — a **genuine musical hybrid** (measured: a 50/50
  blend tracks the mean of both songs to MAE 0.015 while sitting MAE 0.35 from either).
- **Recall ⟷ dream.** `Weff = (1-d)·Wblend + d·Wrandom`; dream `d` also pushes ρ past
  the edge of chaos and injects state noise. At a memory with `d≈0` → exact recall; in
  the between-space with `d>0` → wandering reverie.
- **The journey** is a scripted keyframed path through the 2-D memory field
  (exposition → betweens/recalls → development → deep dream → the long way home →
  return), sampled purely from a step counter, so the muted demo is deterministic and
  builds in ~70 ms.

## Why minute 5 differs from minute 1 (real state, not a loop)
1. **The arc genuinely progresses** — the cursor is at exposition (one song, faithful)
   at minute 1 and deep in development / deep-dream / return at minute 5.
2. **Warmth accumulates.** Each memory's glow grows with every visit and cools only
   very slowly, so late in the piece several anchors are lit at once — the map is
   visibly different from the single-lit opening.
3. **The reservoir is never reset.** In the between-space it runs supercritical
   (ρ up to ~1.2) with injected noise, so its trajectory is genuinely path-dependent
   and never repeats (measured: loop-to-later-loop pitch MAE ≈ 4.5 under dream). When
   the cursor returns to a memory and dream falls, the echo-state property washes the
   perturbation out and recall snaps back to exact — the mind re-focuses.

## Controls
- **Begin (sound on)** — gates real audio behind a user gesture (FM voice + a swelling
  just-intonation drone bed through the shared safe-master bus).
- **Recall ⟷ dream depth** — biases how far the between-space strays into chaos vs.
  faithful recall.
- **Click the map** — steers the dream toward the nearest song (a decaying nudge).
- **Sing / play a song** — records ~4 s from the mic and trains it as a new memory
  slot (up to four); the journey re-forms to weave it in.
- Muted / no-permission fallback: three built-in phrases are seeded and the dream
  auto-runs immediately, fully deterministic (fixed seed + step counter).

## Lineage (cycle 3 of the reservoir line)
`10984-echofold` (fixed-random readouts — could only drift) →
`11376-recallorbit` (one phrase, ridge-trained, exact recall + a dream knob) →
**`12976-dreammedley`** (many songs held at once as attended memory slots, one long
self-navigating dream between them).

## References
- **Echo State Transformer** — arXiv:2507.02917 (multiple reservoirs/readouts as
  finite memory slots with attention/interpolation over them; the architectural anchor
  for the multi-memory attention here).
- **Jaeger 2001** — the Echo-State Network (reservoir computing; fixed random recurrent
  network + trained linear readout).
- **Lukoševičius & Jaeger 2009** — reservoir-computing training practice; ridge/Tikhonov
  readout regression.
