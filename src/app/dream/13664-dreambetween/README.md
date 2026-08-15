# 13664 · Dream Between

**Cycle 4 of the reservoir line.** A rule-10 resurrect of `12976-dreammedley`.

Lineage: `10984-echofold` → `11376-recallorbit` → `12976-dreammedley` → **`13664-dreambetween`**

## The one question

> What if a little mind held several of my real recordings at once and dreamed
> the space between them in my own piano sound — and I could steer that dream with
> my hand?

## What it is

An audio-visual prototype: a "memory constellation" (inline SVG, cool violet on
near-black) in which four of Karel's real recordings sit as glowing anchor nodes
around a ring. A roving light — the low-dimensional projection of a genuine
Echo-State Network — wanders the field between them. Filaments run from the light
to each recording, brightening with attention; sparks flow along them as grains
fire. It auto-dreams on mount; after **Begin (sound on)** you hear his real piano
immediately. Drag the light to **steer**; let go and the reservoir resumes.

Anchor recordings (all verified in `_shared/welcomeHome` `REAL_TRACKS`):
Welcome Home · Isolation · Snowflake · Ghost — four contrasting pieces so the
dream between them is audible.

## The technique

**The dreaming navigator — a real reservoir.** `reservoir.ts` is a hand-rolled
Echo-State Network (Jaeger 2001): a fixed sparse random recurrent matrix
`W∈R^{120×120}` rescaled to a target spectral radius by power iteration, a
leaky-integrator `tanh` update, and clock-harmonic input weights. It is driven
**only** by a phase clock — never by a melody. Its 2-D projection (a fixed random
2×N matrix) is the cursor that roams the "memory field." This is a genuine
dynamical system with fading memory, not a random walk. The **Recall ⟷ dream**
slider pushes the spectral radius past 1 (supercritical, past the edge of chaos)
and injects state noise, so the closed clock orbit unwinds into a path-dependent
wander through the between-space.

**Multi-source granular attention cloud — his REAL audio.** Each recording is
loaded via `loadRealTrackBuffer` into an `AudioBuffer` and played granularly:
short (~140 ms) windowed `AudioBufferSourceNode` slices read from seeded offsets,
enveloped with a small gain ramp, all routed through `createSafeMaster`. A softmax
**attention vector** over the recordings — computed from the cursor's distance to
each anchor (the Echo-State-Transformer read, arXiv:2507.02917: anchors are
memory slots attended over) — sets each source's **grain density**. Near one
anchor, that recording's grains dominate; in the between-space, overlapping real
grains from two or more recordings form a genuine hybrid. The dream slider also
widens the softmax temperature, so "dream" literally spreads attention across
more recordings.

## Why this fixes dreammedley's rule-10 gap

`dreammedley` wandered the same latent space beautifully, but it produced sound by
training linear readouts to reproduce **pitch contours** and then re-synthesizing
them through an **FM voice**. The output was therefore no longer Karel's real
piano — a rule-10 violation (audio must come from his real catalog). Here the
reservoir does **no resynthesis at all**: it is purely a navigator that decides
*where* we are and therefore *how much of each recording* we hear. Every sound is
a slice of his actual decoded audio — no oscillators, no FM, no generated tones.

## Controls

- **Begin (sound on)** — one gesture unlocks audio (`ctx.resume()`), loads his
  recordings, and starts the grain cloud. Visuals animate before this on frame 1.
- **Drag the light** — the primary verb: steer the dream. Your hand overrides the
  navigator (action-conditioned; on release the reservoir resumes from its live
  state).
- **Recall ⟷ dream** — pushes the reservoir past the edge of chaos and spreads
  the attention, so the between-space wanders and blends more.
- **Mute sound** · **Read the design notes** (with a back link to `/dream`).

Degrades gracefully: audio-load failure surfaces an on-brand `text-destructive`
message and the visuals keep drifting; partial loads dream with what arrived;
`prefers-reduced-motion` slows the navigator and freezes the sparks. Deterministic
throughout (`mulberry32` seeded once; time via `performance.now()` /
`ctx.currentTime`). Full teardown on unmount: `cancelAnimationFrame`, every grain
`AudioBufferSourceNode` stopped, `safe.disconnect()`, `ctx.close()`, SVG removed.

## References

- **Jaeger, H. (2001).** *The "echo state" approach to analysing and training
  recurrent neural networks.* GMD Report 148 — the Echo-State Network.
- **Echo State Transformer (arXiv:2507.02917)** — reservoirs/readouts as finite
  attention memory slots; here the anchors are the slots and the cursor→anchor
  softmax is the attention over them.
- **Music-JEPA (arXiv:2607.22000, Jul 2026)** — a world model of piano sound from
  action; the framing for making the dream *action-conditioned* (you steer → the
  world responds).

## Tags

- **Input:** catalog-playback (his real recordings) + pointer/drag steering
  (primary verb is STEER).
- **Output:** inline-SVG living memory constellation (anchors, roving reservoir
  light, attention filaments, grain sparks). Not Canvas2D, not a fullscreen shader.
- **Technique:** Echo-State Network reservoir navigator (fixed sparse recurrent
  matrix, spectral-radius rescaled) driving a multi-source granular attention
  cloud of REAL audio.
- **Palette/vibe:** cool violet on near-black.
