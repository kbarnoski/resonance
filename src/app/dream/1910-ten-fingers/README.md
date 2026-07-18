# 1910 · Ten Fingers

**The one question:** What if a phone screen became a chord instrument that
spoke *real* functional harmony — where where-you-press picks a diatonic
function and the voices lead smoothly between held chords — and it made no sound
at all until real fingers touched the glass?

## The harmony system

A key is a tonic pitch-class + mode. The grid is a 4×3 matrix whose **columns
are functions**: Tonic · Predominant · Dominant · Applied. So a **ii–V–I** is a
single left-to-right gesture, and it resolves like one.

- **Diatonic functions** (major): I, ii, iii, IV, V, V7, vi, vii°, ii7 — the
  full tonal palette, not a safe scale.
- **Secondary dominants** live in the Applied column: **V/V** (D7→G), **V/vi**
  (E7→Am), **V/IV** (C7→F). They tug toward a temporary key and let go — real
  chromatic tension that bites.
- **Modulation:** two strip cells pivot the whole key. `→ DOMINANT` moves up a
  fifth; `→ RELATIVE` swaps major↔relative minor (the grid re-voices to a full
  minor-mode function set: i, ii°, III, iv, V7, VI, vii°, iiø7, V/iv, iv7). The
  entire matrix re-labels in the new key.
- **Voice-leading:** four voices. Pressing a new cell snaps each voice to the
  **nearest chord tone** of the next chord — common tones held, motion
  minimised. The oscillators literally **glide** (`setTargetAtTime` portamento)
  from the old pitches to the new, so held→new slides rather than jumps. That
  glide is the bite. Dragging a finger across cells glissandos with the same
  voice-leading.

## Why it looks and sounds like this

- **SVG-DOM, not Canvas/WebGL.** Real `<rect>/<line>/<circle>/<polyline>`
  elements; the voice-leading ribbon (a morphing 4-node polyline over a pitch
  axis) is redrawn every frame via `requestAnimationFrame` setting attributes.
  A deliberate vote for the lab's minority SVG substrate.
- **Cold graphite monochrome**, near-white ink on charcoal, one hairline —
  after **Ryoji Ikeda's *data.matrix***. A deliberate break from the lab's
  violet-on-black monoculture.
- **Touch-as-instrument**, up to ten Pointer-Event fingers, no autopilot —
  after **Toshio Iwai's *Tenori-on* / *Electroplankton***. No fingers on glass
  ⇒ total silence, a still grid. The piece is dead without a human.

## What's rough

Voice-leading is greedy per-voice, so it can occasionally double a tone or
cross voices rather than find the globally optimal move. Equal temperament (the
point here is *function*, not intonation). The feedback delay tail can smear
very fast two-handed playing. The two-tap modulation is deliberate but blunt —
there's no pivot-chord animation, the labels just re-key.

## Self-assessment

- **Ambition:** a genuine tonal engine — diatonic functions, three secondary
  dominants, real modulation, and audible nearest-tone voice-leading — driven by
  a bespoke SVG instrument.
- **Needs a human:** completely. Silent and still until touched; no self-play
  mode exists.
- **Diversity vs the four banned tags:** functional/chromatic harmony (not
  pentatonic), cold graphite monochrome (not violet-on-black), SVG-DOM (not
  Canvas2D), and strictly finger-driven (not self-playing).
