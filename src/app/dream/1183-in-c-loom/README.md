# 1183 · In C Loom

**The question:** What if Resonance could perform Terry Riley's _In C_ forever —
a self-organizing minimalist ensemble with real musical **state** that is
genuinely different at minute 6 than at minute 1?

## Concept

A faithful-in-spirit generative realisation of **Terry Riley's _In C_ (1964)**.
Twelve virtual players each advance — forward-only, with probabilistic
repetition — through **53 short authored melodic cells** in C. A steady high-C
eighth-note pulse holds everyone loosely together while the players phase apart
and re-converge into ever-shifting interlocking patterns. When a player finishes
cell 53 it wraps to cell 1 and begins a new pass, so it never stops.

This is **audio-first**: the sound is the piece. The ring visualisation is a
calm, secondary readout of where each player currently sits.

## The mapping

- **Cells → audio.** Each cell is an array of `{ degree, dur }` notes, where
  `degree` is a semitone offset from C4 and `dur` is in eighth-note pulse units.
  Cell notes are voiced by a warm marimba/plucked synth (two detuned bodies plus
  a faint high partial → percussive envelope → gentle lowpass).
- **The arc.** Cells 1–20 are diatonic C major (a brightening rise); cells 21–39
  bring in the **B♭** that gives _In C_ its mixolydian shading (the famous
  emotional turn); cells 40–53 restore B natural and **F♯**, resolving bright to
  a C octave.
- **The pulse.** A soft high-C (C6) bell-blip on every eighth — the traditional
  _In C_ "pulse" — keeps the ensemble coordinated without a conductor.
- **The drone.** A warm sustained low-C pad (C2 / C3 / G3) with a slow (≤1 Hz)
  filter breath sits under everything.
- **The herding rule.** When a player finishes a cell it decides (seeded PRNG)
  whether to repeat or advance. It may **only advance if that keeps it within 3
  cells of the slowest active player** — otherwise it is forced to repeat. This
  single rule produces the long-form phasing: independent voices drift, but never
  into chaos.

## Architecture

- `ensemble.ts` — pure logic. The 53 cells, a `mulberry32` deterministic PRNG,
  and the `InCEnsemble` state machine (`tick()` per eighth → onsets; `spread()`
  readout).
- `audio.ts` — Web Audio. A ~25 ms lookahead scheduler (the "A Tale of Two
  Clocks" pattern) schedules notes onto `ctx.currentTime`; 22-voice polyphony
  with oldest-voice stealing; a `DynamicsCompressor` limiter → master gain ~0.2;
  full `dispose()` teardown (cancel interval, stop + disconnect all nodes,
  `ctx.close()`).
- `page.tsx` — the client component. Bright ivory/amber palette, a spare
  constellation canvas (53 ticks + 12 glowing dots), a live text readout, and
  controls: gesture-gated Begin/Stop, pulse tempo, density, seed re-roll.
  `prefers-reduced-motion` calms the animation. No strobe/flicker — any
  brightness change is a slow luminance drift.

## References

- **Terry Riley, _In C_ (1964)** — the source: 53 cells, forward-only players, a
  shared pulse, no conductor.
- **Steve Reich, _Piano Phase_ (1967)** — the phasing aesthetic of identical
  material sliding out of and back into alignment.

## What's designed, not heard

The cells are faithful in **shape and arc** but are authored plausibly rather
than transcribed exactly (_In C_ is intentionally open to interpretation). The
marimba, pulse, and drone are **synthesised impressions**, not sampled
instruments. The herding rule is a deliberate simplification of the human social
dynamics of a live _In C_ ensemble — a single distance constraint standing in for
players listening to each other in a room.
