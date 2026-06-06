# 353 — Collapse Score

**What it is:** A generative musical score that composes itself in real time using Wave Function Collapse. An 8×16 lattice (8 voice layers × 16 beat columns) starts with every cell in superposition — all 14 D-Dorian tiles possible. The WFC solver runs step-by-step, collapsing cells and propagating arc-consistency constraints to neighbours, until the grid is full. As cells collapse, a sweeping playhead sounds each note via a warm FM-pad + bell synth. The result is a never-repeating piece of music that is always locally coherent — you can *watch* it being composed.

---

## How to use

1. **Begin Composition** — unlocks Web Audio (required for iOS Safari) and starts the WFC solver + playhead simultaneously.
2. **Watch** — superposition cells (dim, numbered) collapse to bright coloured notes. Constrained neighbours flash briefly as constraints ripple outward.
3. **Listen** — the playhead sweeps left→right every ~300 ms, playing each collapsed note. Rows are voice layers; higher rows play at slightly higher velocity.
4. **New Seed** — re-seeds the PRNG for a fresh, completely different composition. Each seed is deterministic.
5. **Replay** — enter any seed value and press Replay to reconstruct an exact previous run.
6. **Solve speed** — Slow / Normal / Fast controls how quickly the WFC solver collapses cells (doesn't affect playhead tempo).
7. **Pause / Resume** — stops both the solver and the playhead.

When the grid fills, it auto-reseeds and continues indefinitely (long-form generative).

---

## WFC algorithm

The core loop:

```
repeat until grid full:
  1. Find the uncollapsed cell with the LOWEST SHANNON ENTROPY
     (weighted by tile frequency; tie-broken with tiny PRNG noise)
  2. COLLAPSE it: weighted-random choice from remaining candidates
  3. PROPAGATE arc-consistency via BFS from the collapsed cell:
     - For each uncollapsed neighbour, remove tiles incompatible
       with the collapsed/constrained source
     - If a neighbour's candidate set shrinks, push it to the queue
     - Contradiction guard: if candidates would reach 0, hold the
       previous mask (graceful recovery, keeps the solve going)
```

The solver runs one collapse-and-propagate per tick via `setTimeout`, so the animation is the solve itself — not a replay.

---

## Musical constraint design

**Palette:** 14 tiles — 7 D-Dorian scale degrees (D E F G A B C) × 2 octaves (D2–C4).

**Horizontal constraints** (time / left–right neighbours):  
Tile B may move to E, G, A, B, C — but not directly to D or F (avoids tritone jump F↔B). All other pairs are allowed except E→C and C→E (to discourage the tritone substitution at tempo). This gives stepwise and consonant-leap motion as the default.

**Vertical constraints** (voice layers / up–down neighbours):  
A neighbour tile is allowed if the two tiles share a diatonic interval of unison, a third (2 scale steps), a fourth (3), or a fifth (4). This means adjacent voice rows will always form consonant harmony.

**Tile weights:**  
Root (D) = 4×, 4th (G) = 3×, 5th (A) = 3×, b3 (F) = 2×, 2nd (E) = 2×, 6th (B) = 2×, b7 (C) = 1×. Lower octave tiles get ×1.3 gravity.

---

## Audio

Two voices per note:

1. **FM pad** — sine carrier at note frequency, modulated by a sine at ×2.01 (slight detuning for warmth). Modulator depth fades from 90% of freq to 30% over 400 ms; pad envelope: 50 ms attack, 1.5 s release.
2. **Bell click** — sine at ×4 fundamental + inharmonic partial at ×7.1, fast exponential decay (450 ms / 250 ms). Adds the pluck transient.

Master bus: gain → DynamicsCompressor (threshold −6 dB, ratio 20:1) → destination.

---

## Named references

- **Maxim Gumin** — *Wave Function Collapse* (2016). The canonical formulation of constraint-propagation on tiles with adjacency rules. https://github.com/mxgmn/WaveFunctionCollapse
- **Paul Merrell** — *Model Synthesis* (2007). The direct algorithmic precursor: generate 3D models satisfying local adjacency constraints. https://paulmerrell.org/model-synthesis/
- **Brian Eno** — *Discreet Music* (1975) and *Music for Airports* (1978). The generative-music lineage this inhabits: music that composes itself by rule, producing something "as ignorable as it is interesting."

---

## Ambition self-assessment

The brief asked for: WFC solve that is *legible* (you can watch a cell decide), constraint propagation that ripples visually, a warm synth, long-form auto-continuation, seeded PRNG replay, speed / pause / new-seed controls, DOM/CSS grid (no canvas/WebGL), and clean TypeScript.

All of these are present. The legibility works well — superposition cells show their candidate count, constrained cells flash a brief hue-keyed glow, and collapsed cells show their note name. The constraint ripple is visible at Normal and Slow solve speeds. The FM+bell synth produces the intended warm-pad + pluck character. Replay via seed is deterministic. The auto-reseed on completion keeps it running indefinitely.

What could be better at higher effort: (a) a proper "contradiction recovery" with backtracking rather than the current graceful mask-hold, (b) explicit playhead tempo control separate from solve speed, (c) a piano-roll overlay view on top of the cells for music-theory readers.

---

## Build verified / unverified surface

**Build-verified:** TypeScript compiles clean (`tsc --noEmit` zero errors in this folder). ESLint passes (`next lint` no warnings/errors). `npm run build` succeeds (363/363 static pages generated).

**Unverified surface (not browser-tested):** Audio output quality and volume balance (FM modulation depth, bell decay, limiter behaviour); CSS transitions at various screen sizes and in reduced-motion mode; iOS Safari AudioContext gesture unlock behaviour; visual appearance of the playhead outline; whether the auto-reseed timing feels right in practice.
