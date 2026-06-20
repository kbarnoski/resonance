# 797 · Tonnetz Walk

**What if you could WATCH harmony take a walk — a chord gliding forever through
the Tonnetz lattice by smooth voice-leading, never the same path twice?**

An autonomous, long-form generative piece. A single triad walks the
Neo-Riemannian lattice on its own, choosing **P / L / R** transforms over time.
Each transform holds two common tones and steps the one remaining voice, so the
warm pad **glides** rather than jumps. The path it traces through the lattice
*is* the form — and because the chooser is weighted and stochastic, minute 5
never resembles minute 1.

## How to use

- **Start / Pause** — begins pure-synthesis audio and the animated walk.
- **wander ↔ home** slider — at 0 the walker drifts freely; turn it up and it
  is pulled back toward the origin triad (C major) after long journeys.
- **step** slider — seconds per transform (1.5–8s); also paces the arpeggio.
- **arpeggio** toggle — a sparse, soft outline of the current chord.
- **Click any triad** — computes a short P/L/R path (BFS over the 24-triad
  graph) and steers the walk there, then resumes autonomous wandering.

Readout shows the current chord, the last transform (color-coded), steps taken,
and elapsed time. The current triad glows; recently-visited triads leave a
fading luminous trail; the active transform edge lights up as it is crossed.
Lit yellow dots are the three pitch classes currently sounding.

## The technique

The **Tonnetz** ("tone network") arranges pitch classes so that one axis is the
perfect fifth (+7 semitones) and another the major third (+4). Every small
triangle is a triad — upward triangles major, downward minor — giving all 24
major/minor triads as a tiled lattice.

**Neo-Riemannian** theory studies the three *parsimonious* transforms that move
only a single voice while holding the other two:

- **P** (Parallel): C ↔ c — the third moves by one semitone.
- **L** (Leading-tone exchange): C ↔ e — the root steps by a semitone.
- **R** (Relative): C ↔ a — the fifth steps by a whole tone.

All three are involutions (applying one twice returns you home). The walker
weights them, suppresses immediate backtracking, and biases toward home using a
cached BFS distance in the transform graph. Audio is a 3-voice pad
(triangle+sine, slow attack) with portamento that glides only the moving voice,
a sub-bass on the root, a feedback-delay reverb network, and an optional sparse
arpeggio — all synthesized, no assets or network.

## How this differs from 37-ratio-lab

`37-ratio-lab` is a **static just-intonation Tonnetz you click to hear**. This
one is the opposite: an **autonomous generative walker** performing
Neo-Riemannian P/L/R voice-leading over time. Nothing here is click-to-sound by
default — the lattice is driven by a self-running harmonic process; clicking
only *redirects* that process.

## Named reference

- **Euler's Tonnetz** (Leonhard Euler, 1739).
- **Neo-Riemannian theory** — after Hugo Riemann; formalized by **David Lewin**
  and **Richard Cohn** (*Audacious Euphony*, 2012).
- The **P / L / R** parsimonious voice-leading transformations.

## Honest limitations

- Voice-leading is realized as nearest-pitch-class assignment across three pad
  voices; it is smooth and correct in pitch-class terms but is not a full
  conventional four-part voice-leading engine (no doublings, no spacing rules).
- The reverb is a feedback-delay network, not a convolution impulse — lush but
  not a modelled room.
- Tuning is 12-TET (equal temperament), not just intonation; this piece is about
  *motion* through the lattice rather than its pure ratios.
- The lattice is a finite 8×6 window of the infinite Tonnetz, so visually the
  walk wraps in pitch-class space even though geometry stays in-frame.
- Audio requires a user gesture (the Start button) per browser autoplay policy.
