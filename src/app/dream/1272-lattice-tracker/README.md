# 1272 · Lattice Tracker

> What if a music tracker lived inside a live HTML spreadsheet whose rows recede
> into an infinite CSS-3D tunnel corridor — so composing a pattern means typing
> into cells that stream toward you down a glowing lattice you play?

A step sequencer that is also a corridor. The instrument is a **real DOM grid**
— `<div>` cells in flex rows, not pixels on a canvas — transformed with CSS
`perspective` + `rotateX` so the rows fall away into a vanishing point. A
playhead sweeps down the steps; as it advances, the whole table flies toward the
camera like a rhythm-game highway bent into a tunnel. You compose *inside* the
tunnel: the spreadsheet you are editing is the lattice geometry you are flying
through.

## How it works

**The grid (the surface).** 8 columns × 16 rows of live terminal cells. Columns
are **voices**, rows are **time steps**. A cell's value (0 = rest, 1–7 = a scale
degree) sets the note for that (voice, step). You compose by:

- **clicking** a cell to cycle its degree 1→7→rest, or
- **focusing** a cell (click) and **typing** a digit `0`–`7`, `Backspace` to
  clear, arrow keys to move — a tracker keyboard flow.

The page seeds a gentle, consonant arpeggio (a seeded `mulberry32` PRNG, biased
toward chord tones on downbeats) so it makes music the instant you press Play;
everything is editable live. "New pattern" reseeds; "Clear" empties the grid.

**The playhead (the sequencer).** A `requestAnimationFrame` loop reads the
`AudioContext` clock, converts elapsed time to a fractional step
`pf = elapsed / stepSec`, and fires each integer step it crosses (sample-accurate
`when` times, with catch-up). Tempo (40–132 bpm) is live — changing it rebases
the clock so the sweep never jumps.

**The tunnel (the CSS-3D corridor).** The `.lt-stage` plane is tilted with
`transform: rotateX(52deg)` inside a `perspective: 640px` viewport. Each row is
absolutely positioned and, every frame, transformed to
`translate3d(-50%, -d·depth, z)` where `d = r − playhead` is the row's *signed,
wrapped* distance from the playhead. Future rows sit far up the tilt (receding to
the vanishing point); the struck row lands right at the camera and glows; past
rows fall below and **recycle invisibly at the fog boundary**, giving an infinite
corridor from only 16 DOM rows. Static glowing **rails** (column boundaries
extended down the plane) form the lattice walls; the flying rows are the rungs.
Fired cells pop with `translateZ` + `scale` + bloom, driven by a per-row `--fire`
CSS custom property that the cells inherit.

**The audio (just-intonation lattice).** Each column is pinned to a *pure
harmonic* of a 55 Hz root — `×1, 3/2, 2, 3, 4, 6, 8, 12` — and each cell degree
multiplies by a just-intonation ratio (`1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8`). Every
pitch is therefore a rational ratio of one root, so the whole grid is a single
consonant harmonic lattice — it rings, it never buzzes chromatically. Signal path:

- a **16-voice pool** of persistent oscillators (triangle + detuned sine →
  lowpass → gated gain), voice-stolen round-robin — no per-hit allocation/leak;
- a **drone bed** of 3 detuned sines (root / fifth / octave) through a lowpass
  with a slow gain LFO, so it is never silent;
- a master **`ConvolverNode`** fed a procedurally-synthesized impulse response
  (exponentially-decaying seeded noise) for space, plus a
  **`DynamicsCompressor`** to glue it.

Default is cosmic-ambient (slow tempo, ~26 ms attacks, 1.5 s releases); pushing
the tempo makes it rhythmic and driving.

## References

- **Heinrich Klüver's form constants** (1926) — the tunnel/funnel and
  lattice/grid are two of the four constant classes of early visual hallucination
  (class II/III). This piece literally makes you compose on the lattice as it
  becomes the tunnel.
- **Tracker / step-sequencer lineage** — ProTracker (Amiga) and Renoise: music as
  a vertical spreadsheet of hex cells with a descending playhead. This is that,
  bent into depth.
- **"DOOM rendered in CSS 3D Transforms" (2026)** — the proof that ordinary DOM +
  `matrix3d`/`rotateX` is a legitimate 3D surface. Here the *spreadsheet* is the
  3D geometry, not a texture on it.
- **Smol Sequencer (2026)** — the tiny, immediately-playable, seed-a-pattern
  browser sequencer that inspired the "make music the instant you press Play"
  default.
- **Just intonation / the harmonic lattice (Partch, Tonnetz)** — columns walk the
  octave/fifth axes; cell values walk the scale, keeping the grid consonant.

## Safety notes

- **No hard strobe.** Per-cell glow changes are local. The only *global* luminance
  motion is a slow scene "breathing," routed through the shared
  `createSafeFlicker` engine (≤ 3 Hz hard cap, soft sine, 0.74 luminance floor,
  runs at ~0.16 Hz).
- **`prefers-reduced-motion`** shallows the tilt (52° → 36°), shortens the
  corridor depth, caps the tempo, and the flicker engine self-downgrades to a
  sub-perceptual drift.
- **Instant Stop** ramps the master gain to zero in 60 ms, cancels the animation
  frame, and suspends the audio context.
- Degrades gracefully: if Web Audio is unavailable, the tunnel still animates and
  a `text-rose-300` notice explains there is no sound.

## Next-cycle deepening

1. **Lattice navigation, not just editing** — let the player *transpose* whole
   columns along the octave/fifth axes of the JI lattice mid-flight, so the
   corridor's harmonic geometry visibly shears as you move through Tonnetz space.
2. **Per-cell articulation** — a second keystroke sets velocity/glide/ornament
   per cell (tracker "effect columns"), with the cell's depth-pop and trail length
   mapped to it, so louder notes physically reach further out of the tunnel.
3. **Camera choreography** — bank/roll the corridor toward whichever column is
   densest in the upcoming rows, and open the walls into a Klüver spiral on
   sustained tutti chords — the composition steering the hallucination.
