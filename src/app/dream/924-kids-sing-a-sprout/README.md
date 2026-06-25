# Sing a Sprout

**Route:** `/dream/924-kids-sing-a-sprout`

## What it is

A long-form, stateful kids' garden. A child hums or sings into the microphone.
Each sung phrase plants a glowing **sprout**, placed on a **Vogel phyllotaxis
spiral** (golden angle ≈ 137.5°), so the garden fills outward in the natural
sunflower-seed pattern. Sprouts grow and bloom **slowly over minutes**, shifting
from cool violet to warm amber as they age.

The piece has **memory**. Every sung pitch is stored in a small rolling bank — a
**stigmergic trace** (a "scent" the garden leaves for itself). That trace does
two things:

1. It **biases later growth**: new sprouts are nudged toward the running average
   of remembered notes, so the garden's accumulated history pulls its future
   shape.
2. It is **re-sung back**: every ~14 seconds the garden gently re-voices an
   earlier 4-note phrase as soft bells (and grows faint echo-sprouts from it),
   making the memory audible.

So the garden at minute 5 is genuinely *different* from minute 1 — it is a slowly
accumulating, evolving piece, not a loop.

## How to play

1. Tap **"Sing to your garden"** (a ≥64px target). This starts the audio engine
   and asks for the microphone.
2. Hum, sing, or say "laaa". Every note instantly plants a sprout and rings a
   soft chime (immediate cause → effect, the bar that keeps a 4-year-old
   engaged).
3. Keep going. Over a few minutes the spiral fills, sprouts mature and warm, the
   camera slowly drifts out, and the garden begins singing your earlier phrases
   back to you.

No reading is required to play. There are **no wrong notes** — every detected
pitch snaps to a C-major pentatonic ladder across ~3 octaves, so everything is
consonant.

### If there is no microphone

If the mic is denied or unavailable, a **synthetic "humming child"** takes over
and sings a slow rising-and-falling melody on its own. The first sprout blooms
within **~0.4 s**, so an unattended iPad still sounds and grows. A readable
`text-rose-300` notice appears.

## Audio safety (the "sleeping toddler in the next room" bar)

- Master gain capped at **0.26**, routed through a **lowpass (~6 kHz)** then a
  **DynamicsCompressor** limiter before the speakers — no shrill or sudden loud
  transients.
- An always-on soft ambient pad (a slow-filtered C/G drone) means it is **never
  silent**.
- The mic is connected to an **AnalyserNode only**, never to the speakers — no
  feedback.

## Technique notes

- **Pitch detection:** RMS-gated autocorrelation, clamped 120–900 Hz, snapped to
  a warm pentatonic ladder. Loudness (RMS) → sprout size + brightness.
- **Visuals:** three.js (`InstancedMesh`, additive blending) on a dark luminous
  background. Idle-alive via a breathing animation, slow color drift, and the
  drifting camera. Full teardown on unmount (mic tracks stopped, AudioContext
  closed, RAF cancelled, geometries/materials/renderer disposed).

## Named references

- **H. Vogel (1979)** — phyllotaxis model, golden-angle (137.5°) sunflower
  spiral, the layout used for every sprout's position.
- **Brian Eno** — generative / long-form ambient music; the always-on pad and
  slow, non-looping accumulation are in that lineage.
- **Children's-movement sonification** — Frontiers / PMC5104747, mapping a
  child's expressive input to sound.

## RESEARCH citation

Anchored on RESEARCH §544 (2026-06-25): MusicSwarm (Buehler, Advanced
Intelligent Systems, 2026) — long-form musical coherence emerging from a
*stigmergic* swarm where agents leave traces in a shared field that guide later
behavior; here the child's own sung phrases ARE the stigmergic traces that grow
and re-voice the garden. Plus DIS 2025 plant-photosynthesis sonification
(evolving generative music from living growth).

## What's unverified / honest limitations

- **Pitch detection** is plain autocorrelation. It is fine for a clear sung hum
  but will mis-track on noisy rooms, whispered/breathy voices, or two voices at
  once. `autoGainControl` is on, which can make the loudness→size mapping less
  faithful than a calibrated meter would be.
- The **"sings back" memory** is a simple rolling bank + averaging bias, not a
  learned model of the child's melody. It recalls *real* earlier phrases, but it
  does not detect motifs or phrase boundaries — recall windows are picked by a
  light heuristic, not by musical structure.
- The **long-form evolution** is driven by ageing curves and the accumulating
  trace; it has been reasoned through and the timing constants chosen for a
  minutes-long arc, but the full multi-minute drift has not been wall-clock
  observed end-to-end in this build — it has only been compile/type/lint
  verified. The math is deterministic, so it should hold, but treat the exact
  minute-5 look as a designed intention rather than a measured result.
- The synthetic fallback's first-bloom timing (~0.4 s) is set by a constant and
  verified by reading the code path, not by stopwatch.
- Performance is bounded (max 240 live sprouts, oldest retired) but has not been
  profiled on a low-end iPad.
