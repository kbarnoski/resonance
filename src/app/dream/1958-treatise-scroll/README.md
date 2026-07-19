# 1958 · Treatise Scroll

Route: `/dream/1958-treatise-scroll`

## The one question
**What if reading a graphic score WAS performing it** — where your scroll
velocity is the tempo and expression, and the music exists only while you read?

## What it is
A self-writing, endless **Cornelius Cardew *Treatise*-style graphic score**
rendered in **SVG-DOM** that scrolls vertically past a fixed horizontal
**playhead** (~40% down the viewport). You perform the piece by **scrolling**:

- **Scroll is the only instrument.** Wheel / trackpad / touch-drag velocity is
  the tempo; scroll up rewinds. There is no play button driving the sound.
- **Stopping sustains.** Every mark carries a real vertical extent; a mark
  sounds while the playhead sits inside it. Park the scroll on a thick line,
  circle, or box and it rings on as a held drone; scroll off and it releases.
- **Speed is dynamics + tempo.** Faster reading = brighter, quicker arrivals;
  slow reading lets each mark bloom.

## Sound mapping
- Vertical scroll = **time**; horizontal position = **pitch** (piano-roll
  rotated to read top-to-bottom — left low, right high).
- Pitch lives on a real **just-intonation** scale: three octaves of the ratios
  `1/1 9/8 5/4 4/3 3/2 5/3 15/8` over a **C3 (130.81 Hz)** tonic. Not pentatonic.
- **Thick strokes** → dynamics/gain + sustain. **Circles / boxes** → sustained
  JI chords (stacked ratios). **Dots / clusters** → plucks & quick arpeggios.
  **Arcs** → gliding tones. **Number-fields** → soft bells. A soft **spine
  drone** at the tonic is the central reading thread's reference tone.

## Ghost auto-reader
After ~1.5s of no input, a deterministic ghost auto-scrolls at a musical,
breathing tempo (accelerating into dense passages, easing to near-stop to let
sustains ring) so the piece self-demos with sound + motion — important for a
first, untouched (headless) view. Any scroll instantly takes over; the ghost
resumes after idle. A **▷ Auto-read** toggle forces it on demand.

## Technique / constraints
- **Substrate: SVG-DOM only** — `<line>/<circle>/<path>/<rect>/<text>`
  transformed via `translateY`. No canvas / WebGL / three.js. The visible mark
  count is bounded (bands recycled around the playhead) to stay light and 60fps.
- **Fully deterministic:** a seeded **mulberry32** PRNG places every mark and
  drives the ghost. No `Math.random`, no `Date.now`, no `new Date` — time comes
  from `performance.now()` / the rAF timestamp only. Same page every load.
- **Audio:** Web Audio API only. Bounded polyphony (≤10) of triangle/sine voices
  → lowpass → **master gain 0.15** → **tanh soft-clip WaveShaper limiter** →
  destination, plus a lowpassed feedback delay for warmth. Context created inside
  a user gesture (iOS-safe) and resumed on the first scroll / "Begin reading".
  Clean teardown on unmount (cancel rAF, disconnect, `close()`, remove listeners).
- **Palette:** warm paper-and-ink — a floating warm page with graphite marks and
  a cinnabar playhead (raw hex confined to the SVG art layer; all UI chrome uses
  Resonance semantic tokens). Respects `prefers-reduced-motion` by slowing the
  ghost.

## Files
- `page.tsx` — the piece: scroll capture, rAF transport, SVG rendering, chrome.
- `score.ts` — seeded PRNG, JI pitch axis, deterministic mark generation.
- `audio.ts` — Web Audio engine (overlap-based voicing, spine drone, limiter).
- `ghost.ts` — deterministic auto-reader velocity curve.
- `readme-text.ts` — design notes rendered in the in-app modal.

## References
- Cornelius Cardew, *Treatise* (1963–67).
- "Arrows & Operators: Visual Debates in Music", Portland Campus Art Gallery
  (opened 2026-07-10), with live *Treatise* performances.
- "Interpreting Graphic Notation with MusicLDM" (arXiv:2412.08944).
