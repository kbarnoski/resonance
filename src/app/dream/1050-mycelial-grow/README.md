# 1050 · Mycelial Grow

**The question it answers:** *What if you could watch mycelium actually GROW —
branching gold filaments colonizing the dark in real time, never the same twice,
each tip ringing a soft tone as it splits — a long-form piece that's genuinely
different at minute 5 than at minute 1?*

A living, gold fungal network that grows in front of you and keeps reaching new
territory for as long as you leave it running. Candle-warm, microscope-organic.

## Tags

- **state:** psilocybin
- **pole:** intense-warm (organic)
- **INPUT:** mic-breath (analysis-only, NON-pointer)
- **OUTPUT:** Canvas2D growing-network
- **TECHNIQUE:** Space Colonization Algorithm (organic branching growth) +
  long-form evolving state
- **PALETTE:** warm-organic (brown → rust → amber → ochre → gold)

## How it works — the Space Colonization Algorithm

The growth math lives in its own pure module, `growth.ts` (no React/DOM imports),
so it stays clean and testable.

1. **Scatter attractors.** A cloud of attractor points is scattered into the field.
2. **Influence.** Each growth *node* looks for attractors within an *attraction
   radius*; for every attractor, only its single nearest node is selected.
3. **Step.** Each influenced node averages the normalized directions to all the
   attractors that picked it, steps one *segment length* in that average
   direction, and spawns a child node (with a little jitter so filaments wander
   organically).
4. **Consume.** Any attractor within the *kill radius* of a node is removed.
5. **Branching emerges naturally** — a node pulled in divergent directions
   spawns multiple children in one step, which the engine reports as a *fork*.

> **Prior use in the lab (honest):** the algorithm itself is **not** lab-first —
> `322-kids-voice-garden` already used space colonization (voice/touch plant a
> light, a decorative plant grows toward it and blooms a chime). The fresh axis
> here is the *register and lifecycle*: an adult psychedelic, **autonomously
> long-form** mycelial network that reseeds its own colonization fronts forever
> (minute 5 ≠ minute 1), with **breath-driven growth rate** and **fork-triggered
> just-intonation** — growth *is* the instrument, not a garden you tend.

### Long-form evolution (the point)

- Fresh attractor clouds **reseed in slow waves** (~every 5.5 s) into new regions
  of the field, so the network keeps colonizing **NEW territory** and never
  freezes. The structure visibly accumulates — minute 5 is denser and more
  complex than minute 1.
- The whole field is faded a hair every frame, so the **oldest filaments dim**
  to make room — a slow breathing recolonization that lets it run indefinitely.
- Node count is capped (`maxNodes`, default 4200) with a ring-buffer recycle of
  the oldest non-root slots, so the main thread never grinds.

## The look

Dark loam / near-black background (`#0a0705`). Filaments are drawn with
`globalCompositeOperation = "lighter"` (additive) for a soft bloom: growing
**tips glow brightest** (pale gold + a bloom dot), while older/inner branches
**thicken with depth** and **dim toward rust/ochre/brown**. Warm-organic palette
only — no blue, no violet, no neon.

## Audio (Web Audio API)

- A warm sustained **drone bed**: root 55 Hz + a just fifth (82.5 Hz) + soft
  partials through a slowly-moving lowpass (a ~20 s LFO on cutoff).
- Each **branch/split** triggers a soft bell/pluck from a **fixed A-minor
  pentatonic set** (no wrong notes), **panned by x** and **pitched by depth**
  (tips → higher, deep/old → lower body). A fraction of non-fork splits also ring
  so it shimmers.
- **Voice-steal:** simultaneous voices are capped (7) so dense growth shimmers
  instead of clipping.
- Master chain: `gain (≤0.26) → lowpass → DynamicsCompressor → destination`.

## Mic reactivity (analysis-only)

`getUserMedia → MediaStreamSource → AnalyserNode` only. Breath/voice RMS drives
**growth rate** (so note density / how fast the mycelium surges) and **tip
brightness** — breathe and the network blooms faster.

**MIC SAFETY:** the mic source is **never** connected to `destination`, so there
is no feedback path. Nothing is recorded or uploaded. If the mic is denied or
unavailable, it grows autonomously at a calm default rate, still sounding, and
shows a `text-rose-300` notice that it's running in self-drive.

## Teardown

On unmount: `cancelAnimationFrame`, all mic tracks stopped, the audio master
gain faded then the `AudioContext` closed, and all timers/refs cleared. No
post-unmount draws, no leaks.

## Files

- `page.tsx` — the client component: canvas render loop, audio gesture-gate,
  mic analysis, UI.
- `growth.ts` — pure space-colonization engine (`Mycelium` class, `makeRng`).
- `audio.ts` — `MyceliumAudio` engine (drone + branch bells + master chain).
- `growth.test.ts` — plain `console.assert` sanity checks. **Not** auto-run at
  import (guarded by `require.main`); run with `npx tsx growth.test.ts`.

## Named references

- Runions, Lane & Prusinkiewicz, *Modeling Trees with a Space Colonization
  Algorithm* (2007, algorithmicbotany.org) — the algorithm.
- Jason Webb, *Modeling organic branching structures with the space colonization
  algorithm and JavaScript* (Medium) — the canonical creative-coding port.
- Paul Stamets, *Mycelium Running* — mycelium as a living branching network;
  the growing organism is literally the subject.

## Honest notes on what's unverified

This was built in a headless container with **no GPU, microphone, or audio
device**, so it could not be ear-verified or eye-verified live. What *is*
verified: `growth.ts` passes its `console.assert` suite under `tsx` (network
grows past its roots, real branching to depth ≥ 2, attractors consumed by the
kill radius, node cap respected under heavy reseeding, low breath → fewer events
than full speed); the whole project passes `tsc --noEmit` and `eslint` with zero
errors/warnings.

Reasoned-but-not-heard/seen:

- Exact loudness balance of drone vs. branch bells, and whether the voice-steal
  cap of 7 fully prevents clipping under very dense bursts (master gain 0.26 +
  compressor should keep headroom, but the precise feel is unverified).
- The visual density/fade balance — the per-frame `rgba(...,0.018)` fade rate vs.
  growth rate was tuned by reasoning; on a real display the recolonization pace
  may want adjusting.
- Mic RMS scaling (`rms * 6`) for a comfortable breath→bloom response is an
  estimate; real rooms vary.
- One harmless edge case in node recycling: when a slot is overwritten at the
  cap, a child segment may briefly reference reused parent data; the draw loop
  guards against nulls and negative parents so it cannot crash, and the age-fade
  hides any stray segment within a frame or two.
