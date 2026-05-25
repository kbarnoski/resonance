# Loop Garden

**For**: kids (3+)

Draw a glowing stroke anywhere on the screen. When you lift your finger, the stroke immediately begins looping as a melody — forever. Draw up to four strokes in different parts of the screen to create overlapping musical loops. Tap any stroke to erase it with a sparkle burst.

## How it works

**Color zones**: the screen is divided into four invisible columns, each with its own timbre and color:
- Left (violet) — sine oscillator, piano-like with a crisp attack and long decay
- Mid-left (amber) — sine with slight detune (+8 cents), bell-like warmth
- Mid-right (teal) — sine with negative detune (−6 cents), slightly hollower chime
- Right (rose) — sine with slow attack and long decay, pad-like and dreamy

**Pitch mapping**: Y position maps log-linearly to C-major pentatonic (C3 at the bottom, C5 at the top). Any combination of strokes is always consonant — no wrong notes.

**Loop mechanics**: each stroke is sampled into 4–18 pitch control points evenly spaced along the path. Notes play at 0.32 s each. Short strokes loop faster; long strokes loop slower. A glowing traversal dot sweeps along each active stroke showing where in the loop you are.

**Deletion**: tap near any point of an active stroke to erase it — the stroke bursts into sparkles.

**Max 4 loops**: once all four loop slots are full, new strokes can't be started until one is erased.

## Design notes

This is the kids version of `153-paint-compose` (which Karel loved ❤️) — simplified to zero-permission, no-palette, no-BPM-control, one-tap-to-erase interaction suitable for a 4-year-old.

The combination of "drawing gesture = musical gesture" echoes Karel's loved prototypes `100-kids-paint-song` (draw → melody), `111-kids-shape-loop` (loop = composition), and `152-kids-star-paint` (drawing persists as sonic artifact). This extends all three: multiple simultaneous timbral loops from freehand drawing, always in tune.

The zone-based color differentiation teaches the concept: "where you draw determines the sound's character." A child who discovers this draws in different zones deliberately — without any instruction, just by exploring.

## Technical notes

- `AudioContext.currentTime` scheduling with 130 ms look-ahead (safe across all mobile browsers)
- Pentatonic snap ensures no dissonance even from random drawings
- `ctx.globalCompositeOperation = 'screen'` gives additive blending; strokes brighten where they cross
- `rgba(0,0,10,0.18)` per-frame dark fill causes deleted strokes to ghost-fade over ~30 frames
- Demo seeded with 3 pre-built loops at proportional coordinates — scales correctly to any screen size
- Zero deps · Zero permissions · Zero API
