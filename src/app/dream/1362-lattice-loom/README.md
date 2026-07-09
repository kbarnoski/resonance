# 1362 · Lattice Loom

*A spatial lattice of real DOM cells, woven by hand with polymetric light.*

## The one question

**What if the lattice were made of real DOM cells floating in CSS-3D space, and you wove polymetric light through them by hand — TIME as spatial phasing, not a beat?**

## What it is

A crystalline loom rendered **entirely in DOM + CSS 3D** — no `<canvas>`, no
WebGL, no three.js. Real `<button>` cells sit in a `transform-style: preserve-3d`
scene, arranged into three stacked, fanned planes that rotate slowly as one
volume. Each plane is one **metric layer**:

| layer | length | key row | octave | pitch span |
|-------|--------|---------|--------|------------|
| 1 (bottom) | **3** | `1 2 3` | ×1 | 110 – 206 Hz |
| 2 (middle) | **5** | `q w e r t` | ×2 | 220 – 412 Hz |
| 3 (top)    | **7** | `a s d f g h j` | ×4 | 440 – 825 Hz |

Columns are **pitches** — a just-intonation scale (1, 9/8, 5/4, 4/3, 3/2, 5/3,
15/8) above a 110 Hz root, shared as vertical lattice positions across all three
layers. Every cell is therefore a rational ratio of the same root, so the whole
lattice stays consonant no matter what you weave.

## How to play it

1. Press **Begin** (audio is gesture-gated; a just-intonation drone bed fades in).
2. **Weave with the keyboard** — the three physical key rows map to the three
   layers, and a key's position in its row is the column/pitch it seeds:
   - `1 2 3` → layer 1
   - `q w e r t` → layer 2
   - `a s d f g h j` → layer 3
3. Or **tap the cells** directly (each is ≥52 px — phone-friendly; pointer is a
   secondary nicety, keyboard/tap is primary).
4. **Reweave** throws a fresh deterministic pattern; **Clear** empties the loom.

Then just watch: three phase-cursors sweep their layers at their own periods
(0.40 / 0.50 / 0.60 s per step). When a cursor crosses a lit cell it **flares**
the cell and **sounds** that column's tone.

## The technique — spatial Reich phase across coprime polymeter

The three pattern-lengths **3, 5, 7 are coprime** (LCM = 105 steps), and each
layer's cursor also runs at its own pulse. So the lit cells continuously
**de-phase** — the sweeps slide out of step, cross, and only slowly drift back
toward alignment. This is Steve Reich's phase music spread across **space**
instead of carried by a 4/4 beat: TIME is the drift of the sweeps over the
lattice. Because the whole assembly is real DOM transformed in CSS 3D, it is
deterministic and renders reliably everywhere — the point of the substrate.

Audio: the shared `startDroneBank` JI drone bed (its `setDrive` follows recent
strike density), plus a per-cell bell voice pool (triangle + detuned sine
through a lowpass, fast attack / ~1.4 s exponential decay). Master gain is capped
at 0.22 behind a `DynamicsCompressor` limiter with an exponential fade-in.

## Named references

- **Ryoji Ikeda — *datamatics*.** The clinical-luminous grid/data aesthetic:
  cool cyan cells, precise lattice, light as data.
- **Lineage — this lab's `1272-lattice-tracker`.** This is an explicit
  **cycle-2** of that celebrated DOM/CSS-3D piece (a music tracker receding into
  a 3D corridor) — which the concept jury named as having gotten zero follow-up.
  Loom keeps the "DOM grid *is* the instrument, tuned to a JI lattice" idea but
  answers a different question: not a playhead down a sequencer, but three
  independent phase-cursors weaving polymeter through a rotating volume.

## Safety

No strobe. Cell lighting is smooth continuous fades driven by fractional cursor
distance and a slow strike-decay; the fastest any single cell can flash is once
per its loop (~0.8 Hz at most), far under the 3 Hz ceiling. Global luminance
"breathing" routes through the shared `SafeFlicker` engine (~0.09 Hz).
`prefers-reduced-motion` slows the sweeps, the rotation, and the idle drift.

## Honest notes — what works / what's rough

- **Works:** the de-phasing is genuinely legible — with only three short lanes
  you can *see* the sweeps slide apart and re-cluster, and hear it as the
  familiar-then-scattered-then-familiar bloom. Pure-DOM 3D means it never blanks
  and needs no GPU. The JI tuning keeps any weave consonant.
- **Works:** never blank / never silent — a default woven pattern animates
  silently on load (preview clock), and an idle auto-demo drifts the pattern
  deterministically if you walk away, so a cold glance always shows light moving.
- **Rough:** only 15 seedable cells (3 + 5 + 7). It's deliberately sparse and
  clinical rather than dense — legibility over spectacle; some will want more.
- **Rough:** the sweep bars and layer planes are tuned for a laptop; on very
  small phones the whole scene is scaled to ~0.62 to fit, which softens the
  depth read. Landscape is better than portrait.
- **Rough:** CSS-3D compositing of many glowing cells can cost a little on old
  mobile GPUs; glow is kept modest to stay smooth.
