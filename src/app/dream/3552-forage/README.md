# 3552 · Forage

## The one question

> What if you don't PLAY an instrument and don't WITNESS one — but CULTIVATE a
> living, autonomous swarm that composes a long-form piece on its own, and your
> only verb is to seed where it grows?

You never play a note. Your single verb is **plant food**. Everything you hear is
decided by a swarm of thousands of Physarum (slime-mould) agents that forage
toward the food you place. It is not passive-witness — it is genuinely two-way:
you seed, the swarm decides what to connect, thicken, and abandon.

## The stigmergy → topology → sonification chain

**1. One agent rule (stigmergy).** Each agent senses the chemo-trail at three
points ahead (front / left / right), turns toward the strongest, moves one step,
and deposits its own trail at its new cell. The trail field then diffuses (3×3
box blur) and decays every frame. No agent knows the global picture — coordination
is entirely *through the shared field* (stigmergy). This is the classic Jones
(2010) Physarum transport model.

**2. Food attractors = resource nodes.** Each tap plants a food well (cap 6, 2–3
seeded at start). A well continuously deposits chemo-attractant into the field, so
agents forage toward it. **Food strength decays** (half-life ~42 s), so wells
exhaust; the tubes feeding a dead well lose reinforcement and **prune**. That decay
is the engine of long-form evolution — minute 5 is not minute 1, and the piece
keeps reorganising after you stop touching it.

**3. The network self-organises.** From the one rule, tubes thicken between food,
redundant paths get pruned, and the transport topology continuously reorganises —
no explicit graph is ever built; it *emerges* in the trail density.

**4. The network sings its topology.** Each frame the trail field is cheaply
reduced to a topology readout (a WebGPU compute pass writing a 22-float buffer,
read back async; the CPU path samples the field directly):

- **local trail density at each food node → that voice's amplitude / presence.**
  A well the network hasn't reached is silent; a well fed by thick tubes is loud.
- **total trail mass / active agents → overall density + low-pass filter brightness.**
  A sparse field is dark and dull; a rich network opens up.
- **thick tube bridging two nodes → a shared harmonic interval between their two
  voices.** Connectivity is measured as the *minimum* trail density along the
  segment between two foods (a real tube must be continuous). When it's high, the
  higher voice bends toward a **just interval** (1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2)
  of the lower voice's field pitch. The network's topology literally becomes the
  harmony; as the tube prunes, the interval relaxes back toward the drone.

Pitches sit on a slowly-rotating soft harmonic field (Dorian ↔ Lydian morph plus a
drifting root transpose). Pitch is **continuous** — bends, vibrato and root drift
are all glided with `setTargetAtTime`; nothing is hard-snapped (a protected lab
value). The just-interval target is a *destination the voice glides toward*, never
a quantiser.

## Human relationship = cultivation, not performance

There is no score, no win/lose, no fail-state. You place food and the swarm chooses.
A **seeded deterministic autopilot** plants 3 wells immediately and 4 more over the
first ~40 s so a hands-off reviewer sees the network grow and hears it compose. The
**first human tap hands control over** (the badge flips `auto → you`). After that,
whatever you plant keeps evolving on its own as food exhausts.

## Output substrate — WebGPU compute with mandatory Canvas2D fallback

- **Primary — WebGPU compute.** Agent positions/headings live in a storage buffer.
  Per frame: (1) a diffuse+decay+food-deposit compute pass ping-pongs the trail
  field (u32 fixed-point buffers, `@workgroup_size(8,8)`), (2) an agent
  sense-rotate-move-deposit compute pass (`@workgroup_size(64)`, atomic deposits),
  (3) a reduce compute pass that writes the topology readout, (4) a fragment render
  pass drawing the trail on the **violet ramp** with bilinear upsampling. Target
  ~65k agents on a 512² field. Structure mirrors the device/buffer/bindgroup setup
  of `75-houdini-particle-flock` (read-only reference).
- **Mandatory fallback — Canvas2D.** If `navigator.gpu` is absent, or if WebGPU
  device/shader creation throws (caught via `pushErrorScope`), the **identical**
  agent model runs on the CPU at ~2.6k agents on a 240² field, drawn to a
  `willReadFrequently` offscreen buffer scaled to the canvas. **The sonification
  runs in both paths** — the CPU path samples the trail field directly.
- No strobe: only a slow ≤0.2 Hz luminance drift. `prefers-reduced-motion` damps
  agent motion by half.

## Determinism

One seeded `mulberry32` PRNG drives agent spawns, food degrees and autopilot
positions. **No `Math.random`, no `Date.now`, no argless `new Date()`** anywhere —
all time is derived from `requestAnimationFrame` timestamps and `AudioContext.currentTime`.
Both the `AudioContext` and the WebGPU device are created inside the Start
user-gesture handler.

## Ambition criteria hit (≥3 target — hits all 3)

1. **Novel technique:** stigmergic / Physarum agent-transport **topology → score**
   sonification (connectivity-as-harmony), which does not otherwise exist in this
   lab.
2. **≥3 subsystems:** agent sim + trail diffuse/decay field + food-attractor
   seeding & exhaustion + topology→score mapper + multivoice continuous-pitch synth
   (five).
3. **Named reference:** MusicSwarm (Buehler 2026, arXiv:2509.11973); "Swarm-Inspired
   Generation of Collective Behaviors in Graph Dynamical Systems" (arXiv:2606.24958,
   2026); Jones 2010, "Characteristics of pattern formation and evolution in
   approximations of Physarum transport networks."

## Honest self-assessment — what is / isn't verifiable headless

- **Verified:** ESLint clean, `tsc --noEmit` clean, no forbidden patterns
  (`Math.random` / `Date.now` / off-brand chrome). Determinism, house-style tokens,
  teardown, and the fallback wiring are readable from source.
- **Not verifiable headless:** neither the WebGPU compute path nor the Canvas2D
  render/audio can be exercised without a GPU + Web Audio + real rAF loop, so the
  *musical* result and the WGSL shader compilation are unproven here. Mitigations:
  the GPU path validates itself with `pushErrorScope` and **auto-falls-back to the
  CPU model on any WebGPU error**, so a WGSL bug degrades gracefully rather than
  going dead; the CPU path is plain TypeScript with no exotic APIs.
- **Risks to flag to the curator:** (1) sonification tuning constants (mass/density
  thresholds, deposit/decay rates) were set by reasoning, not by ear — they may need
  a listening pass to balance loudness and how legibly connectivity reads as
  harmony. (2) CPU fallback at 240²/2.6k agents may run ~20–30 fps on weak hardware;
  the network still forms and sings, just more slowly. (3) The async GPU readback
  gives the audio ~1–2 frames of latency, which is inaudible for this slow material
  but is a real coupling between render and sound.
