# 7464 · Ruletape

> **What if you could PLAY the boundary between chaos and order — tune a symbolic
> rule and feel geometry crystallize or dissolve under your hands?**

`state: criticality / order-chaos edge · pole: intense ↔ cosmic (the ruletape moves you across it)`

## The premise

A **turmite** — a generalized Langton's ant — is one tiny agent crawling a 2D
lattice. Its entire behaviour is a short symbolic **ruletape**: a string of turn
symbols, one per cell colour/state, like `RL`, `RLR`, `LLRR`, `LRRRRRLLR`,
`RRLLLRLLLRRR`. The tape is the DNA of the machine. Here you rewrite that DNA
live — tap the discrete SVG symbol tiles or pick from the preset shelf — and the
lattice re-runs instantly, so you can feel the phase-transition under your hands
and hear it in the same breath.

## How a ruletape defines a turmite

The tape has length **k** = the number of cell states/colours. Each cell starts
in state `0`. When the ant lands on a cell:

1. **Read** the cell's state `s`.
2. **Turn** by `rule[s]`: `L` = 90° left · `R` = 90° right · `U` = 180° · `N` =
   go straight.
3. **Repaint** the cell to the next colour, `(s + 1) mod k`.
4. **Step** forward one cell.

That is the whole machine. Classic Langton's ant is simply the tape `RL`.

## Why small edits change the regime

The astonishing fact — the reason this is an *instrument* and not a demo — is
that a **one-symbol edit** flips the *same* machine between wholly different
aesthetic regimes:

- **Chaos** — space-filling visual noise, high edge-density, diffusive wandering.
- **Symmetry** — bilateral or spiral ordered art (`LLRR` grows a cardioid;
  `RRLL` mirrors).
- **Highway** — a self-repeating structure that marches off the lattice forever.

`RL` itself is the showpiece: it wanders chaotically for ~10,000 steps and then,
as if it decided, snaps into a diagonal highway. The **order meter** (top-left)
estimates where the current tape sits on the order↔chaos axis by blending two
cheap live signals: the *straightness* of the ant's frame-sampled path (a highway
is collinear → ordered) and the *edge-density* of the visited region (chaos is
high-entropy → disordered). Watch the needle cross the critical edge the instant
Langton's highway forms.

## The criticality framing

Recent turmite theory shows that the **tape, not the machine, chooses the
regime** — the old "a highway is eventually inevitable" conjecture *fails* for
generalized ants:

- arXiv **2505.05426**, *"Sideways on the highways"* (2025).
- arXiv **2506.10482**, *"The LLLR generalised Langton's ant"* (2025).

These prove that generalized ants such as `LLRRRL`, `LLRLRLL` and `LLLR` admit
*both* persistent highway order *and* persistent chaos, selected by the symbol
string.

That maps directly onto **2026 psychedelic neuroscience**: the Entropic Brain
Hypothesis and a 2026 virtual clinical trial frame the psychedelic state as the
brain moving toward **criticality — the edge between order and chaos**. This
instrument lets you slide a system across that exact edge by editing a symbol
string, and both see and hear the crossing.

### Named references

- Chris Langton, *Studying artificial life with cellular automata* (1986) — the
  original ant.
- A. K. Dewdney, *"Two-dimensional Turing machines: Turmites"*, Scientific
  American (1989).
- arXiv 2505.05426 & 2506.10482 (2025) — generalized-ant regime theory.
- Carhart-Harris et al., the **Entropic Brain Hypothesis**; 2026 criticality
  framing of the psychedelic state.

## The input model

- **Self-demos from mount with zero input.** The lattice runs immediately (audio
  silent until Start). After **Start** it auto-cycles through the preset shelf,
  letting each tape run long enough to reveal its regime, so the
  phase-transitions play themselves.
- **Keyboard + on-screen controls (no microphone).**
  - **Tap a symbol tile** to cycle that state's turn through `L → R → U → N`.
  - **`+` / `−`** add or remove a state (change the tape length / colour count).
  - **Preset shelf** — labelled by regime; keys **`1`–`0`** select them.
  - **`R`** re-seeds the current tape from a clean centre; **space** toggles the
    auto-tour.
  - Editing anything stops the tour so you can play; *Resume tour* restarts it.
- **Audio (Web Audio).** Cell writes fire warm pentatonic notes (state → pitch,
  x-position → pan) through a lowpass → feedback-delay voice. The **tape** re-voices
  the timbre (R/L balance and length move register, waveform and delay time), and
  the **order meter** drives a master filter + noise bed: chaotic tapes are
  brighter, noisier, denser; ordered tapes are cleaner and groovier. Notes are
  throttled to ~8/sec to stay musical.

## Build / safety notes

- **Non-GPU only** — Canvas2D lattice + inline SVG for the tape UI. No
  WebGL/WebGPU/shaders.
- `AudioContext` is created and resumed only after the Start gesture. No Web
  Audio → the lattice still runs silently and a `text-destructive` notice shows.
- The lattice is redrawn from slowly-changing state every frame (soft bloom via a
  blurred upscale pass), so it accumulates smoothly — **no full-frame flicker or
  strobe**.

## Next-cycle deepening

- **Full turmite state machine.** Generalize the tape from a turn-per-colour to a
  `(turn, write, new-internal-state)` triple per (colour × internal-state) — the
  Turing-complete "turmite" proper — and expose the internal-state count as a
  second dial. Whole new regime families (Langton's *ants* → Langton's *turmites*)
  open up.
- **Hex / triangular lattices** and non-90° turns, for the ant families that only
  tile order on other grids.
- **A criticality auto-seeker.** A slow search that nudges a tape toward the order
  meter's midpoint and *holds* it there — an autopilot for the edge of chaos —
  which you can then perturb by hand.
- **Highway detection → rhythm lock.** When a repeating highway is detected,
  quantize the note clock to its period so the groove literally locks to the
  emergent structure.
