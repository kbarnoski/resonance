# Deep Memory

_Route: `/dream/1135-deep-memory`_

## The one question

**What if you could watch a mind dream?** Not read a chart of a mind — be
transported _into_ one: a piece of music that learns from every note it plays,
its memory drifting and re-firing, while you steer it from inside the field.
This is a long-form generative machine with **memory**, not a loop. Minute five
is genuinely different from minute one.

## How it works

### The engine (`engine.ts` — `SlowMachine`)

- A live **Markov transition matrix** `M[i][j]` over the degrees of a chosen
  scale (Dorian, Pentatonic, or Phrygian). All randomness comes from a seedable
  **mulberry32** PRNG — never `Math.random` / `Date.now` — so a given seed +
  motif is fully deterministic.
- `step()` does three things every note:
  1. **Tension-weighted sampling** of the next degree from the current row.
  2. **Hebbian reinforcement** — the transition actually taken gets bumped
     (`M[prev][next] += reinforce`). The path walked becomes a stronger memory.
  3. **Decay + steered mutation** — every row leaks back toward a neutral
     baseline (forgetting) and is nudged by steered noise (drift).
- Reinforcement, forgetting, drift, and your live steering all feed back into
  the sampling distribution, so the exact matrix state **provably never
  recurs**. It is a drifting attractor, not a cycle.
- `seedMotif(notes)` writes your tapped phrase in as the first memories;
  `perturb()` throws a jolt through the whole field; `snapshot()` reports
  `{ matrix, entropy, consonance, density, currentDegree, ... }`.
- Steerable in real time: **Density, Tension, Register, Mutation**.

### The audio (`audio.ts` — `MemoryAudio`)

Warm and ambient, not clinical. A lush sine/triangle **pad bed** (register →
pitch, tension → lowpass brightness) plus a soft **2-op FM bell** per note
event, with a short feedback `DelayNode` for a gentle reverb-ish tail (no
external impulse response). Everything is routed through a
`DynamicsCompressor` limiter. A **25 ms look-ahead scheduler** fires notes
~120 ms ahead (the Chris Wilson pattern). Audio is gesture-gated (starts only on
the Begin tap) and fully torn down in `dispose()`.

### The rendering (`page.tsx`, Canvas2D)

A **neural mind-space**, drawn with additive blending
(`globalCompositeOperation = "lighter"`) and soft radial-gradient glow:

- **Nodes** are the scale degrees, laid out as an organic luminous
  constellation (the tonic tinted violet).
- **Synaptic threads** are the reinforced transitions — an edge only glows once
  its weight rises above the neutral baseline, and it brightens/thickens with
  strength. You can literally _see memory forming_: some threads become
  permanently brighter.
- The active transition **fires a pulse of light** travelling smoothly along its
  thread (slow, never a strobe).
- A **comet** traces the current note, leaving a fading trail (the canvas fades
  rather than clears).
- The whole field **breathes and slowly drifts/rotates**.

Before you press Begin the field is already alive — dim, breathing nodes — so it
is never blank or silent-looking on load.

## References / lineage

- **Hopfield associative memory / neural fields** — reinforced attractors and
  content that re-fires from partial cues.
- **Refik Anadol** — data treated as living pigment, immersive rather than
  charted.
- **Brian Eno** — generative ambient music that evolves without repeating.
- The long tradition of **Markov + Hebbian composition**.

## Honest caveats

- The "provably never repeats" claim is about the continuous matrix state and
  the feedback loop, not a formal proof of aperiodicity of the audible surface —
  with mutation at zero and no steering it can settle into a strong, slowly
  wandering attractor that _feels_ repetitive. Nudge Mutation or Perturb to keep
  it dreaming.
- Rendering is Canvas2D additive glow (chosen for reliability), not a true bloom
  shader — the "volumetric" feel is faked with layered radial gradients and a
  trailing fade.
- With 5–7 nodes the graph stays legible on purpose; a much larger alphabet
  would read as a denser nebula but lose the "it remembers" clarity.
- Visual pulses are scheduled at note-generation time (~120 ms of look-ahead
  ahead of the audio); for slow ambient events this desync is imperceptible.
- If Web Audio is unavailable the piece degrades to a silent, still-animating
  visual driven by a fallback timer, with a `text-rose-300` notice.
