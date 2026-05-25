# Beat Builder — design notes

**For**: kids (4+) · Zero permissions · Zero API · Zero deps

## What it is

A two-row, 6-step loop sequencer. The top row plays melody; the bottom row plays drums. One sweeping cursor crosses both rows simultaneously. Tap any dot to light it; the cursor fires it each time it passes.

The child builds a layered composition by choosing which dots to light. No wrong combinations — all 6 melody pitches are C-major pentatonic, and all drum sounds work with any melody.

## Interaction

- **Tap top half of a column**: toggles that column's melody note (C3 → E4, left → right)
- **Tap bottom half of a column**: toggles that column's drum sound
  - Col 0 (rose) = kick, Col 1 (amber) = snare, Col 2 (emerald) = hi-hat,
    Col 3 (cyan) = tom, Col 4 (pink) = clap, Col 5 (violet) = shaker
- **Clear**: resets all dots
- **− / +**: adjust BPM (40–160, step 16)

## Why this interaction is new

47 prior kids prototypes use one track: tap → note. Beat Builder is the first where the child operates **two simultaneous tracks** — a melody line and a percussion line — in one grid.

The emergent discovery: when a melody note is on the same column as a drum hit, it lands on a percussive accent. The child doesn't need to know this — they hear "the melody sounds different when it hits with the drum" and start placing notes deliberately.

## Audio

- Melody: triangle oscillators, 12ms attack, 650ms decay. C major pentatonic: C3(131Hz) E3(165Hz) G3(196Hz) A3(220Hz) C4(262Hz) E4(330Hz).
- Kick: sine sweep 150→40Hz over 250ms.
- Snare: bandpass noise (2.5kHz) + 200Hz sine body.
- Hi-hat: highpass noise (7kHz), 140ms decay.
- Tom: sine sweep 110→55Hz over 280ms.
- Clap: double bandpass noise burst at 0ms + 22ms (the two-burst gap is the perceptual cue for "clap").
- Shaker: highpass noise (5.5kHz), 140ms decay.
- Ambient pad: C3/E3/G3 sines at 0.007 gain — inaudible as separate sounds, prevents silence.

Drum synthesis is the same engine as `98-kids-drum-circle` ❤️.

## Design lineage

- `145-kids-dot-seq` ❤️ — same 6-column melody sequencer; this adds the drum row.
- `98-kids-drum-circle` ❤️ — same percussion synthesis; this adds the melody row.
- `111-kids-shape-loop` ❤️ — additive layering: child builds composition by adding voices.

## Polish ideas (future cycles)

- Demo pattern pre-loaded on start (kick on 0+3, hi-hat on 2+5, E3 on col 1) — zero-state canvas is fine for parents but may puzzle young children.
- Mute button per row (let child silence drums while keeping melody or vice versa).
- Second melody row with a higher octave (C4–E5) for 3-layer composition.
- Visual highlight: drum column glows subtly warmer when a drum hit fires on the same step as a melody note.
