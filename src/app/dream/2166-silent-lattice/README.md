# 2166 · Silent Lattice

*state: ketamine / dissociative k-hole · pole: intense (non-dissolution — structure re-assembles)*

## What it is

A played audio-visual instrument for the dissociative "k-hole," rendered entirely
in **real SVG-DOM vector line-work**. Two line-architectures share one viewBox: a
calm, legible **isometric grid** (the familiar, sensory-connected world) and an
**impossible Escher machine** of interpenetrating struts and Penrose "tribar"
beams (a previously-invisible alien architecture). You play a follower called
*dissociation depth* `D`; as it crosses a switch the familiar grid fragments
region-by-region and the impossible machine ignites and assembles in its place.

## The one question

> What if dissociation were rendered NOT as the self fading away, but as a SWITCH
> you PLAY — where your familiar, sensory-connected world goes dark and a
> previously-invisible alien architecture ignites and reorganizes in its place,
> drawn as real, crisp vector line-work (an impossible Escher machine)?

## The mechanic

- **`D` is a played follower, not a timeline.** It rises while contacts are
  sustained/dragged and decays on release. It is slew-limited (integrated at a
  bounded rate, never snapped).
- **Multi-parameter played input (≥4 independent dimensions):**
  1. **contact COUNT → switch pressure** — more fingers drive `D` up faster.
  2. **contact X → region / stereo pan** — which part of the field/axis you act on.
  3. **contact Y → pitch** — quantised to a Sethares stretched-scale degree.
  4. **drag SPEED → ignition sparks** — fast drags throw sparks and fire a
     metallic ignition tick.
- **The SWITCH (~`D`=0.4).** Below it the isometric grid is bright and your touch
  maps **1:1** — touch a region, it answers there and sounds. As `D` rises the grid
  strokes fade in a left→right spatial sweep (`switchAt` staggered by x) while the
  impossible struts/beams ignite on the same sweep — a **reorganisation**, never a
  fade to void.
- **Decoupling.** Past the switch the pointer no longer maps 1:1: the response
  marker slides from where you touched toward a warped location pulled onto the
  nearest node of the alien lattice ("reality far off in the distance"). A dashed
  link is drawn literally from the true touch point to the displaced response — the
  paper's signature made visible.
- **Seeded self-demo.** After ~4s idle a seeded (`mulberry32`) autopilot eases in a
  two-finger gesture that drives `D` past the switch, ignites the machine, and
  releases, looping gently. It yields the instant you touch. No `Math.random` /
  `Date` anywhere — randomness is seeded, timing comes from the rAF timestamp.

## How the science is implemented

**Bera, Looger, Proekt & Cichon, "Cortical Mechanisms Contributing to
Ketamine-Induced Dissociation," *The Neuroscientist* (online 2025-12-26; print
2026-02-01).** The paper's core mechanism is a *switch*: dissociative-dose ketamine
**silences** spontaneously-active neuronal ensembles while previously-**quiescent**
neurons become **active**, fragmenting normal circuit motifs and promoting novel,
complex activity **disconnected from sensory thalamocortical input** — the
substrate of perceptual detachment.

The piece maps this directly: the ACTIVE iso-grid = spontaneously-active ensembles
tied to sensory input (pointer couples to it 1:1); the DORMANT impossible lattice =
the quiescent population that becomes active. `D` crossing the switch performs the
silencing (grid fades, motif fragments) and the ignition (impossible machine
assembles), and the pointer decoupling renders the disconnection from sensory
input.

**William Sethares (1993), stretched-partial harmony.** Every voice is an additive
stack where partial `n` sits at `f₀ · n^log₂(A)` — inharmonic, not a pure harmonic
series. Two banks crossfade with `D`: **A = 2.02** (warm, near-harmonic — the
familiar world) → **A = 2.30** (strongly stretched, metallic "machine"). The played
scale itself stretches with `D` too. Explicitly **not** pentatonic, **not** just
intonation, **not** Bohlen–Pierce. A slow two-note drone bed (both banks,
crossfaded) sits underneath.

**M.C. Escher / impossible architecture** is the visual reference: Penrose tribars
(three beam quads painted in cyclic order with end-overlap so the occlusion
contradicts itself) plus struts snapped to a set of contradictory angles that never
resolve into a coherent Euclidean grid.

## Substrate

100% SVG-DOM — every stroke is an actual `<line>` / `<path>` / `<circle>` element.
No `<canvas>`, no WebGL. The element pool is **bounded (~138 nodes)** and created
once; the animation loop only mutates attributes (points, opacity, stroke) via refs
— it never creates or destroys nodes.

## Safety

No strobe. `D` is slew-limited; all luminance change is slow drift. Any pulsing glow
routes through the shared `createSafeFlicker` engine (capped ≤3 Hz, here 0.6 Hz) and
honours `prefers-reduced-motion` (motion damped, sparks slowed). Sparks are one-shot
fades, never repetitive flashing. Audio is silent until the "Begin" gesture unlocks
the AudioContext; if Web Audio is unavailable the visuals still run and an on-brand
`text-destructive` notice is shown.

## Tags

- **input:** pointer / multi-touch PLAYED (multi-parameter, active)
- **output:** SVG-DOM (real `<line>`/`<path>`/`<circle>` mutated per frame — not canvas, not WebGL)
- **technique:** active↔silent SWITCH — two co-located line-architectures cross-fading as a played dissociation-depth follower rises
- **harmony:** Sethares stretched partials (A = 2.02 → 2.30)
- **state:** ketamine / dissociative k-hole · **pole:** intense (non-dissolution — structure re-assembles)

## Next-cycle deepening

This is cycle 1 of a multi-cycle concept. Directions to deepen:

- **True per-corner impossible occlusion.** Replace the approximate tribar
  paint-order interlock with exact per-vertex over/under masking (SVG clip paths) so
  the impossibility holds under any rotation.
- **Ensemble-level switching.** Model many small ensembles that each flip
  independently on their own played sub-thresholds, so the fragmentation reads as a
  population of motifs going silent rather than a single sweep.
- **Hysteresis in the follower.** Give `D` a Schmitt-trigger character (rises easily,
  latches, resists coming back) to capture the "cannot simply will your way out" feel
  of the hole.
- **Warp topology as an instrument.** Let sustained decoupling *rewire* which alien
  hub a region maps to, so repeated play sculpts a personal non-Euclidean map.
- **Sethares dissonance-minimised chords.** Derive chord voicings that minimise
  sensory dissonance for the current stretch, so the machine timbre has its own eerie
  consonances distinct from the familiar bank.
