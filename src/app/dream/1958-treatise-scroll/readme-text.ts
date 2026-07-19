export const README = `# 1958 · Treatise Scroll

**What if reading a graphic score WAS performing it?** Here your scroll velocity
is the tempo and expression, and the music exists only while you read.

## How to perform it
- **Scroll is the instrument.** Wheel, trackpad, or drag with a finger. Scroll
  down to read forward, up to rewind. There is no play button driving the sound —
  your reading motion is the transport.
- **Stopping sustains.** Whatever marks sit under the fixed playhead line when
  you stop keep ringing as a held drone. Park on a thick line, a circle, or a
  box and it sustains; scroll off it and it releases.
- **Speed is dynamics + tempo.** Read faster and marks arrive quicker and
  brighter; read slowly and each mark blooms and lingers.

## Reading the marks
The page is a Cornelius Cardew *Treatise*-style graphic score, generated
endlessly from a fixed seed (the same page every visit). Vertical scroll is
**time**; the horizontal axis is **pitch** — a mark on the left rings low, a mark
on the right rings high, like a piano roll turned to be read top-to-bottom.

- **Long faint lines** — the horizontal spine / staff fragments.
- **Thick strokes** — dynamics ride the thickness; they sustain.
- **Circles & boxes** — sustained just-intonation chords (hold them).
- **Filled dots & clusters** — plucks and quick arpeggios.
- **Arcs** — gliding tones. **Number-fields** — soft bells.
- A soft **central drone** at the tonic is the spine's reference tone.

## The sound
Pitch lives on a real **just-intonation** scale (ratios 1/1 9/8 5/4 4/3 3/2 5/3
15/8 over a C3 tonic) — no equal temperament, no pentatonic shortcut. Everything
runs through Web Audio: simple triangle/sine voices, a gentle lowpass, warm
attack/release envelopes, a lowpassed feedback delay, and a tanh soft-clip
limiter after a master gain capped at 0.15 to protect your ears.

## The ghost
Leave it alone for ~1.5s and a deterministic auto-reader takes over so the piece
performs itself — accelerating into dense passages, easing to a near-stop to let
sustains ring. Any scroll of yours instantly takes back control.

## Substrate
Deliberately **SVG-DOM** — every line, circle, arc and glyph is a real DOM
element transformed as you scroll. No canvas, no WebGL. Warm paper-and-ink
palette. Fully deterministic: a seeded PRNG (mulberry32) places every mark, so
the score is identical and reproducible on every load.

## References
- Cornelius Cardew, *Treatise* (1963–67).
- "Arrows & Operators: Visual Debates in Music", Portland Campus Art Gallery
  (opened 2026-07-10), with live *Treatise* performances.
- "Interpreting Graphic Notation with MusicLDM" (arXiv:2412.08944).
`;
