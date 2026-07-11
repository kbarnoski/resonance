# 1440 · Thread Scan

**One unbroken thread weaves the whole painted field into a single continuous line of light and pitch.**

A dark field you paint luminous marks into. A **Hilbert space-filling curve** threads
every cell of that field, and a bright reading-head travels the thread and *sounds*
whatever it passes — so the entire field is heard as one connected line rather than as
separate notes.

## How to use

1. Press **Begin — sound on** (AudioContext is gesture-gated). A pre-painted glyph is
   already weaving before you touch anything, so it is never blank or silent.
2. **Drag on the field** (mouse or touch) to paint glowing marks. Colour follows the
   vertical axis (violet up top → amber below), the same axis pitch is mapped to.
3. **order (3–6)** — zoom the weave. Low order = a coarse, calm thread; high order = a
   finer, denser, more intense one (2^order × 2^order cells).
4. **speed** — how fast the head travels the thread.
5. **let go** — on: the head drifts the thread on its own. off: the head is held and a
   **scrub** slider lets you steer its position by hand.
6. **clear field** — wipe your marks and start over.

## Design notes

- **The Hilbert locality property.** A Hilbert curve is a single unbroken line that
  visits every cell of a plane exactly once *while preserving locality* — cells that are
  neighbours in 2-D land close together along the 1-D curve. That is the whole instrument:
  a shape you paint becomes a **coherent gesture in time** instead of scattered clicks, and
  the flat field is woven into literally one thread. Raising the order refines the weave
  without breaking that continuity.
- **Continuous pitch, on purpose.** Pitch is a **glissando** mapped continuously from the
  head's vertical field position — *not* a scale, *not* pentatonic, *not* a just-intonation
  index. The lab is saturated with always-consonant scale-step pitch; here the thread is a
  woven *continuum* of pitch, which is what makes the field read as one line rather than a
  sequence of chosen notes. Brightness → loudness, hue → filter/timbre, local density →
  a shimmer partial and softer/longer grains.
- **Sound architecture.** A single sustained thread voice (two detuned saws → lowpass) is
  always the line; when the head crosses *into* a bright mark it plucks a soft, panned grain
  at the current pitch (polyphonic, voice-capped at 12). Master gain ramps 0 → 0.2 into a
  DynamicsCompressor limiter; full teardown (rAF, AudioContext, GL resources) on unmount.
- **Render surface.** WebGL2 is primary: the painted field is uploaded as an RGBA texture
  and drawn as a full-screen quad; the whole Hilbert thread is a faint additive LINE_STRIP;
  the head and its comet trail are additive glow sprites (the "bloom" is their overlap). If
  WebGL2 is missing, a reduced Canvas2D fallback draws the same three layers and still plays.
- **Altered-states framing.** state = **unity / ego-dissolution (DMN-dissolution)**; pole
  spans **cosmic-ambient ↔ intense**. Low order + slow = cosmic-calm; high order + fast =
  an intense melt. The felt axis is *unification* — the moment the field stops being marks
  and becomes one woven line.
- **Safety.** No strobe. The only luminance pulse is a ~0.12 Hz breathing drift (well under
  the 3 Hz ceiling); `prefersReducedMotion` slows head travel and shrinks the breath.

## Named reference

- **David Hilbert, space-filling curve (1891)** — following **Giuseppe Peano (1890)**; the
  locality-preserving single line that motivates the whole piece.
- **Carhart-Harris — entropic brain / REBUS** — the "oneness / hyperconnected unified field"
  of ego-dissolution that the woven thread is trying to make audible and visible.

## Honest knocks

- The comet trail is additive glow sprites, not a true multi-pass bloom, so at very high
  order the fine weave can alias against the pixel grid rather than glowing softly.
- The Canvas2D fallback draws the field cell-by-cell and omits the faint full-thread trace
  (too heavy), so it looks flatter than the WebGL2 path — it still plays identically.
- Audio reads only the single cell under the head each frame; extremely thin one-pixel marks
  can be skipped between frames at high speed. Painting with the default soft brush avoids it.
- Pitch is continuous by design, which means it will *not* lock to anything consonant — that
  is the point, but it reads as eerie/microtonal rather than "musical" in the tonal sense.
