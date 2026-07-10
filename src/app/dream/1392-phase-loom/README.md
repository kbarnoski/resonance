# 1392 · Phase Loom

**The one question:** What if you held down notes and each one became a short
melodic loop running at its OWN period — so the loops slowly drift in and out of
phase with each other, Steve-Reich style, weaving evolving polymetric music with
NO drum grid and no step-sequencer?

## How it works

- **Per-note loops.** Every note you activate (MIDI, on-screen pad, or computer
  key) spawns a short melodic **cell** — 3 to 6 notes drawn from a
  just-intonation major pentatonic, transposed to that note's root. The cell
  repeats forever until you switch the note off.
- **Each loop has its own period.** Two things make the periods differ: the cell
  **length** varies (3–6 steps → immediate polymeter) and each pitch gets a tiny
  **tempo drift** (±~2.7% on the step duration). So loops never share a grid.
- **Phasing.** Because the periods differ, the loops slide relative to one
  another. Over roughly 10–60 seconds any pair drifts from unison, through the
  full cycle of offsets, and back — Steve Reich phasing. The polymeter (differing
  cell lengths) plus the drift means the composite pattern is never the same
  twice; there is no metronome and no 4/4 step-sequencer anywhere in the engine.
- **Scheduling.** A 25 ms look-ahead is used purely for Web Audio **timing
  accuracy**: each voice carries its own `nextTime` / `stepDur` and is scheduled
  independently. The look-ahead is a clock, not a groove grid.
- **Tuning.** Just intonation (pentatonic ratios 1, 9/8, 5/4, 3/2, 5/3 over two
  octaves) keeps every interference beat consonant. An underlying just-intonation
  pad comes from the shared `_shared/psych/droneBank.ts`.
- **Visualisation (three.js).** Each active loop is a tilted orbital **ring** with
  a glowing mote travelling around it once per loop period. Rings at different
  periods orbit at different rates, so you literally SEE the phasing: when two
  motes reach the same angle (a conjunction — loops in phase) a filament lights
  between them and the central core swells; as they drift apart it fades. The
  swell tracks the very slow beat frequency, so its luminance change is far below
  3 Hz — no strobe. Honors `prefers-reduced-motion` (no auto-rotation, gentler
  core swell).

## Controls

- **Begin the loom** — starts audio + visuals and seeds two contrasting loops so
  the phasing is instantly audible and visible.
- **Pads / keys** — 10 pads (also bound to `A S D F G H J K L ;`) toggle a loop
  on that pitch. Web MIDI is requested on start; a connected device's note-on
  toggles the matching loop. The badge shows `● MIDI` (emerald) or `○ on-screen
  keys` (amber).
- **Nudge a loop** — shifts one loop's timeline by a third of a cycle so you can
  re-phase the weave.
- **Clear** — stop all loops.

## Tags

`input: Web MIDI (+ on-screen keyboard fallback) · output: three.js 3D orbiting
phase-rings · technique: polymetric phasing (Reich Piano Phase / Riley In C) —
TIME off the drum grid · pole: hypnotic, meditative-minimalist`

## References (cited honestly)

- **Steve Reich — _Piano Phase_ (1967)** and **_Music for 18 Musicians_ (1976):**
  two identical parts played at fractionally different tempos gradually shift out
  of unison; the resulting interference patterns are the music. Phase Loom applies
  the same principle to independently-launched loops.
- **Terry Riley — _In C_ (1964):** short melodic cells looped independently by an
  ensemble, sliding against one another into a continually-evolving polymetric
  texture. The per-note cells here are a direct nod.

## Honest novelty note

Phasing and process-minimalism are well-established (Reich, Riley, and much
subsequent minimalism). Nothing about the phasing math is new. The fresh axis for
this lab is the **framing and substrate**: playable **MIDI / keyboard input**
where each held note becomes an autonomous loop, finding TIME through **phasing
instead of the 120-BPM look-ahead step-sequencer** the lab's rhythm pieces had
converged on, rendered on a **three.js orbital surface** that makes the
interference beat directly visible as conjunctions of orbiting motes.
