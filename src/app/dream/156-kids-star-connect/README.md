# Constellation Song — design notes

**For**: kids (3+)  
**Route**: `/dream/156-kids-star-connect`  
**Cycle**: 184 (kids build)  
**Status**: demoable

---

## The question

What if musical intervals could be *discovered* by connecting stars, the way constellations are
formed by drawing imaginary lines across the night sky?

## What it does

Thirteen glowing stars are pre-placed on a dark sky in three loose clusters. Each star has a
fixed pitch in the C-major pentatonic scale and a color that signals that pitch class:

- **Violet** → C (261–523 Hz range)
- **Emerald** → E or G3
- **Amber** → G or A3
- **Rose** → A
- **Cyan** → C5 (highest)

**Draw a line** from one star to a neighboring star → both notes ring out simultaneously
as a two-voice interval (triangle-wave OscillatorNodes, 1.8s decay).

**Close a triangle** (three stars all connected to each other) → a three-note chord fires
with staggered onset (0ms, 55ms, 110ms), the triangle interior shimmers with pale blue light,
and 15 colored sparkles radiate outward from the centroid.

A soft C3+G3 ambient pad runs throughout so the canvas is never silent.

## Why this is different from `152-kids-star-paint`

Star-paint **creates** stars — the child draws a path, stars emerge at each point, and the
constellation sings back after 16 seconds. The sound follows from the gesture.

Star-connect **reveals** stars that are already there, waiting. The child discovers hidden
musical relationships by connecting existing points. No new stars appear — you're uncovering a
structure that was latent in the sky. The sound is immediate (on snap, not delayed).

The contrast:

| | Star-paint | Star-connect |
|---|---|---|
| Stars | Created by gesture | Pre-placed, waiting |
| Sound | Delayed arpeggio | Immediate on connection |
| Shape | Drawn path | Polygonal graph |
| Discovery | "My path sings back" | "The sky has a chord hidden in it" |
| Reward | Patient (16s delay) | Immediate + compound (triangle chord) |

## Design choices

**Why pre-placed clusters instead of a grid?**  
Random placement or a grid would feel arbitrary. The three clusters (left, right, bottom) give
the child a natural starting point — connect the nearby stars first. Cross-cluster connections
are longer and produce more dissonant intervals (E3 + C5 = a minor seventh), which are still
consonant within the pentatonic system but feel more dramatic.

**Why triangle as the chord trigger?**  
Triangle is the minimal closed polygon. A 3-year-old can draw three connections and feel the
system reward them. Requiring a square (four connections) before any chord fires would take
too long and might feel arbitrary. Every triangle completes a musical event.

**Why no multi-touch drag?**  
Dragging from a star to another star is a precise gesture. Multi-touch would let two children
play simultaneously (parent + child), but the drag precision needed means accidental touches on
the source star would likely abort the drag. Single-touch keeps the mechanic clean.

**Why pentatonic?**  
Any connection between any two stars is always consonant. A child cannot create a dissonant
interval by drawing in the wrong direction. This is the same principle as `133-kids-ripple-pond`
(collision chords always consonant) and `145-kids-dot-seq` (any column pattern sounds musical).

## What emerged during build

The sparkle color cycling (`n % 3` picking from the three star colors) creates a subtle visual
record of which triangle was completed — a violet-emerald-amber burst is visually distinct from
a rose-cyan-amber burst. After several triangles, the sky has a color signature that reflects
the particular constellations the child chose to draw.

The rubber-band dashed line during drag gives immediate feedback that a star has been "grabbed" —
the child sees the line extending from their origin star toward their finger, which models the
mechanic (draw a line → connect two points) before the connection is confirmed.

## What to build next

- **`156-kids-star-connect` polish**: show a faint "available connections" glow on nearby stars
  when a drag is active — help kids see where to aim.
- **New seed**: a kids prototype where tapping a star adds it to a growing "current chord" — a
  1-5 note chord built by selecting stars. Tap a sixth star to play and clear. Different from
  connect (no drawing; it's additive chord building).
- **Polish `154-kids-clap-back`**: add 5 pattern-indicator dots (top corner) showing which of
  the 5 rhythm patterns is currently active — still not done from Cycle 183's queue.
