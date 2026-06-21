# 816 · Tone Tower

A kids harmony-**shaping** toy. *What if a 4-year-old could build a chord by
stacking blocks — genuinely shaping the harmony, not just triggering
pre-approved notes?*

## What it is

A glowing tower of blocks sits on a warm cream play area. The bottom block is the
root (a low, soft ~F3 drone). Each block above sits a musical **interval** higher
than the block beneath it. The child stacks new blocks by tapping/dragging — and
the size of the vertical gap they make **chooses the interval**. Tall reaches make
open, bright chords; tight stacks make close, rich clusters. The whole tower
sounds bottom→top as a chord, and a gentle arpeggio loops so the page is alive and
sounding the moment you glance at it.

## How a kid uses it (no reading required)

- **Drag up** from the top of the tower and let go to drop a new glowing block.
  A small gap = a tight, rich block stacked close; a big reach = a bright, open
  block high above. A dotted "reach line" and a ghost block preview the placement
  live as they drag.
- **Just tapping** drops a friendly warm third — so a single poke always works.
- **▶ (green)** strums the whole tower bottom-to-top.
- **💥 (orange)** knocks the tower over with a downward gliss + sparkle, then it
  re-seeds itself so you start again. There is **no wrong move and no fail state.**
- Color is the language: each interval has its own bold saturated hue (unison =
  gold → octave = magenta-rose), and a row of color dots shows how many voices
  are stacked. Voices cap at 8 so the chord stays clean.

## The harmony-shaping mechanism (the point)

The child's gesture — the vertical **gap** between one block and the next — is
normalized to 0..1 and mapped across 0..1200 cents, then **snapped to the nearest
entry in a just-intonation consonance lattice** (`harmony.ts`):

unison 1/1 · major 2nd 9/8 · minor 3rd 6/5 · major 3rd 5/4 · perfect 4th 4/3 ·
perfect 5th 3/2 · major 6th 5/3 · octave 2/1.

Because every interval is a small-whole-number ratio, **any** stack the child
builds is consonant and never harsh — but the child genuinely controls whether the
chord is open or close, simple or rich, bright or dark. Absolute pitches are
resolved bottom→top by multiplying the ratio chain from the root. This is harmony
*shaped* by the child, not a fixed pentatonic where every note is pre-approved.

## Named references

- **Friedrich Froebel's "Gifts"** — the original kindergarten building blocks;
  abstract forms a child composes with. Tone Tower is a sounding Gift: the blocks
  *are* the chord.
- **uCue** (Interaction Design and Children 2025, ACM) — an interactive musical
  interface where children shape musical experiences, including harmony layers
  with "common and unusual harmonizations." Tone Tower's gap-shaped intervals are
  the harmony-layer idea reduced to one bodily gesture.
- **Harry Partch / tonality-diamond just-intonation lattice** — consonant
  intervals as whole-number frequency ratios. The lattice in `harmony.ts` is a
  small diamond the child walks by choosing gaps.

## Tags

- **input:** touch / mouse — tap or drag to drop & place a block; tap ▶ to strum
- **output:** animated SVG/DOM tower (glowing rects, Gaussian-blur glow filters,
  CSS transforms for the bouncy place + topple)
- **technique:** Web Audio synthesis (triangle+sine warm voices, soft 50ms
  attack, looping arpeggio), gap→cents→just-intonation snapping
- **vibe:** warm cream nursery, bold saturated blocks, soft and safe, never harsh

## Audio safety / degradation

- Kids-safe master chain: `gain 0.28 → lowpass 7000 → DynamicsCompressor → out`.
  Soft attacks, no sudden loud transients, nothing high-ringing.
- A soft ambient pad (detuned low sines, slow tremolo) hums under everything so it
  never feels broken or silent.
- AudioContext is created on mount but **resumed inside the first user tap** (iOS).
- Full teardown on unmount: the loop timer is cleared and the AudioContext is
  closed/disposed.
- If Web Audio is unavailable, a visible rose-700 notice appears and the visuals
  (stacking, glow, topple, color meter) stay fully alive — you can still build and
  watch the tower glow.

## Files

- `page.tsx` — the prototype (SVG tower, pointer interaction, loop, controls)
- `audio.ts` — the kids-safe Web Audio engine (pad, notes, strum, topple)
- `harmony.ts` — the just-intonation lattice + gap→interval snapping + freq resolve
