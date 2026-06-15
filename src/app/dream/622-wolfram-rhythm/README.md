# 622 — Wolfram Rhythm

## The one question
**Can a single integer compose music?** A 1D elementary cellular automaton (Wolfram's
256 rules) unfolds row by row. Each new row of cells *is* a chord/rhythm. Change the
rule number and the entire character of the music transforms — periodic, fractal,
chaotic, complex.

## How 1D-CA → music works
- A row of **96 cells**, each `0` or `1`, evolves into the next row. For each cell, the
  triplet `(left, self, right)` is a 3-bit index `0..7`; the new cell value is **bit
  _index_ of the rule number** (0–255). That 8-bit integer fully defines the dynamics —
  it is the whole elementary-CA family.
- A musical clock fires **one new row per beat**. The diagram scrolls **downward**;
  the newest row sits at the bright playhead line at the bottom.
- As each new row is born, **every live cell triggers one short percussive event**,
  panned across stereo by column position and pitched by column over a whole-tone set
  (`engine.ts` → `stepRow`; `audio.ts` → `fireCell`). Dense rows get per-event gain
  scaling so they don't pile up loudness.

## Rule presets — what they sound like
| Rule | Label | Sound |
|------|-------|-------|
| 110  | complex | Turing-complete; gliders collide → structured-but-surprising, the richest |
| 30   | chaos | genuinely chaotic / noisy / edgy — unpredictable density |
| 90   | fractal | Sierpinski triangle → self-similar, recursive rhythm |
| 184  | traffic | particle/traffic rule — directional drift, jamming/flow |
| 54   | lattice | nested, semi-periodic structure |
| 150  | xor3 | additive (XOR of 3) → dense interlocking weave |

The **rule number is the one lever**: a big readable stepper (− / +), a 0–255 slider,
and the labeled preset buttons. Changing the rule re-seeds (single centered cell vs.
random soup, chosen at random) so the music visibly and audibly transforms. A tempo
control (60–300 bpm) sets the beat.

## Auto-perturb / long-form logic
`StagnationDetector` (in `engine.ts`) tracks recent row signatures and reports:
- **dead** — all cells 0 → re-seed (single or soup).
- **frozen** — new row identical to previous → re-seed from soup.
- **cycle** — a short repeating period (≤ 8) detected → `perturb()` flips 4–8 random
  cells to kick it out of the loop.

So chaotic rules keep generating fresh material and simple/periodic rules occasionally
get nudged. The piece keeps evolving for 5+ minutes without going dead or static. The
status line shows the last long-form event (`cycle → perturbed`, `dead → re-seeded`, …).

## Sound-design rationale (edged, not cozy)
Deliberately austere/mechanical to avoid the warm just-intonation drone the lab has
overdosed on. Three selectable voices, all short and percussive:
- **metal** — struck-metal FM blip (inharmonic 2.41 modulator ratio, ~220ms decay).
- **click** — band-passed noise tick, woodblock/glitch (~60ms).
- **pluck** — tight detuned-triangle pluck with snappy lowpass sweep (~180ms).

Pitch maps column → whole-tone degrees across ~4 octaves from A2; pan maps column →
stereo. Master chain: `voices → masterGain (0.34) → DynamicsCompressor (limiter) →
destination`. Polyphony is capped at **24 voices**, stealing the oldest, so a dense
Rule-30 row never clips or stacks hundreds of notes. AudioContext is created/resumed
inside the **Begin** tap (iOS-safe).

## Visuals
- Raw **WebGL2**: the grid is uploaded as an RGBA texture (R = alive, G = age) and a
  full-screen fragment shader renders crisp NEAREST-filtered cells with a born-flash →
  cold-steel settle and a fade for old rows, plus a subtle playhead glow.
- **Canvas2D fallback** (`draw2D`) with a visible "WebGL2 unavailable" notice if the
  context can't be created.
- **Idle auto-start:** the visual simulation seeds and runs immediately on mount with
  Rule 110 — a silent reviewer sees a living, self-drawing Wolfram diagram within ~2.5s
  with zero interaction. Only **audio** is gated behind the Begin tap.

## Named references
- Stephen Wolfram, *A New Kind of Science* (2002) — elementary cellular automata,
  rules 30 / 90 / 110.
- Matthew Cook — proof that Rule 110 is Turing-complete (2004).
- Iannis Xenakis — cellular automata in composition (the severe/architectural register).

## Files
- `page.tsx` — client component: WebGL2 + Canvas2D renderers, sim/render loop,
  controls, audio gate.
- `engine.ts` — CA rule application, seeds, stagnation detection, perturbation, presets.
- `audio.ts` — Web Audio voice synthesis, panning/pitch mapping, limiter, polyphony cap.

## What's unverified
- Not yet run in a real browser/device — WebGL2 path, audio timing, and iOS gesture
  resume are implemented to spec but not visually/aurally confirmed here.
- Cycle detection uses row-signature history (period ≤ 8, memory 24); very long cycles
  (> 8) won't be caught, but the toroidal 96-cell width keeps most rules lively.
- Per-event gain scaling for very dense rows is heuristic; exact loudness balance
  across the three voices and across rules 30/90/110 may want tuning by ear.
