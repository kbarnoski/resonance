# 222 · Musical Magnets

**For**: kids (4+)  
**Route**: `/dream/222-kids-magnet-notes`  
**Status**: demoable  
**Built**: Cycle 256

---

## The question

What if musical notes were physical objects you could attract with a magnet?

---

## What it does

Six pentatonic note-bubbles float on a dark star-field canvas, each with its own color and pitch
(BANDIMAL rule: bigger = lower). Tap anywhere to drop a glowing star magnet. The bubbles are pulled
toward the magnet by a spring-like attraction force — they drift in, ring their note as they arrive,
bounce outward from a kick impulse, then slowly spiral back in again. Multiple magnets (up to 4)
create layered orbital patterns where different bubbles converge on different stars.

Two magnets auto-appear at load so the prototype is immediately alive — visual attraction is visible
before the first tap. Sound starts on first user touch (browser AudioContext policy).

---

## Physics

Each note is a point mass with position and velocity:

- **Spring attraction**: acceleration = `SPRING × (magnet_pos − note_pos)` — a Hooke's law pull with
  natural length 0. At 150 px distance: ~30 px/s² inward acceleration.
- **Damping**: velocity × 0.987 each frame — notes spiral slowly inward rather than orbiting forever.
- **Brownian walk**: small random impulse per frame keeps notes from freezing (realistic drift).
- **Ring trigger**: when distance < 52 px → play note + 82 px/s outward kick. Notes bounce back and
  forth through the ring zone, ringing ~every 0.7–3 s depending on magnet placement.
- **Wall bounce**: elastic bounce at canvas edges (65% energy preservation).

---

## Audio

Triangle wave oscillator with fast exponential decay (τ = 0.42 s). Soft attack (no click), 2s tail.
Six pitches — C major pentatonic C3 to E4 — so any combination of simultaneous rings is consonant.

---

## What's new

1. **First attraction-physics melody prototype.** All prior kids prototypes use tap/drag/hold as
   direct note triggers. Here the *placement of a magnet* determines what notes play — the physics
   engine generates the melody autonomously from the note–magnet geometry.
2. **Orbital periodicity without a clock.** The ring rate is determined by spring constant, damping,
   and kick speed — not a BPM counter. Notes at different distances from their magnet ring at
   different intervals, creating emergent polyrhythm without any scheduling code.
3. **BANDIMAL sizing encodes the instrument.** The largest bubble (violet, r=44) is the bass;
   the smallest (rose, r=20) is the treble. A 4yo can learn the pattern without any labels:
   "big circles make low sounds."
