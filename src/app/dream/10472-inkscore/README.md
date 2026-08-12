# 10472 · Inkscore

**Drop a piece of recorded music and watch it auto-compose itself into a living
graphic score — Cage / Feldman / Xenakis notation — that you can then
re-perform by scrubbing the ink.**

## The question

What if recorded sound could write its own hand-drawn graphic score, in the
twentieth-century graphic-notation tradition, and that drawn score were
genuinely _re-performable_ — not a picture of the music but a playable object
you sweep a playhead across?

## Named reference & lineage

The direct reference is **Playmodes — _FORMS_ (Santi Vilanova / Eloi Maduell,
2026)**, a generative graphic-scoring bot that turns _notation into sound_.
Inkscore is its **inverse**: it runs the arrow the other way — _sound into
notation_. Live audio is analysed and abstracted into marks, and only then can
those marks be re-sounded.

It sits in the lineage of graphic notation: **John Cage** (indeterminate
point-fields and scatter), **Morton Feldman** (duration × register grid-boxes),
**Iannis Xenakis** (glissando sheaves — fanned pitch-bend lines), **Cornelius
Cardew — _Treatise_** (continuous contour lines with no fixed key), and **Vera
Molnár** (systematic, seeded generative drawing).

## Input → output → technique

- **Input** — an audio file via a **drag-drop zone** or the **file picker**
  button. With no file, **Start** synthesises a seeded phrase and scores that.
- **Output** — an **SVG-DOM** score: real `<rect>`, `<line>`, `<circle>`,
  `<polyline>` elements (never canvas, never WebGL) scrolling left-to-right on
  ink-on-parchment, with a vertical playhead.
- **Technique** — Web Audio FFT → **spectral-flux onset detection** (adaptive
  mean + 1.6·std threshold, 90 ms refractory) → **spectral centroid** (register)
  → **loudness** (boldness) → **spectral flatness** and **centroid slope** (glyph
  choice) → generative notation layout.

## How analysis maps to marks

| Feature (at onset)              | Notation glyph                              | Tradition        |
| ------------------------------- | ------------------------------------------- | ---------------- |
| noisy / percussive (high flatness) | **scatter cluster** of dots               | Cage / Xenakis   |
| pitch moving (steep centroid slope) | **glissando sheaf** — fanned lines        | Xenakis          |
| strong & steady (high loudness) | **sustained stroke** — long horizontal line | Feldman          |
| mid-strength onset              | **grid-box** (duration × register)          | Feldman          |
| quiet onset                     | **dot / point**                             | Cage / Feldman   |
| continuous centroid trajectory  | **contour line** drawn under everything     | Cardew _Treatise_ |

Higher spectral centroid places a mark **higher on the staff**; louder onsets are
**bolder and larger**; sustained energy stretches strokes horizontally.

## Re-performance (scrub)

Every mark stores its estimated pitch and character. In scrub mode you **drag the
paper left/right under the fixed playhead**; each mark the playhead crosses is
re-sounded with a short **inharmonic additive grain** (five stretched partials;
clusters add a band-passed noise chiff). The drawn score is therefore a genuine
instrument, not an image.

## Degrade ladder (muted-phone-friendly by design)

1. **File dropped / picked** → decoded with `decodeAudioData`, played through the
   safe master, analysed live.
2. **Decode fails** → a `text-destructive` notice, then the seeded phrase.
3. **No file** → **Start** plays a **seeded deterministic phrase** (a stretched
   phrygian, inharmonic piano-ish voice — deliberately _not_ just-intonation
   major-triad material) and scores that.
4. **Muted phone** → the Web Audio graph still runs, so the analyser still
   produces data: the score **still draws, scrolls and reads** as an evolving
   notation image with the sound off. That silent legibility is the whole point.

## Constraints honoured

- `"use client"` first line; shared `PrototypeNav`; one `createSafeMaster(ctx,
  { gain: 0.2 })` with every source routed into `master.input` (never raw
  `ctx.destination`).
- No `Math.random` / `Date.now` / `new Date` in executable code — timing from the
  `AudioContext` clock, all randomness from `mulberry32(0x10472)`.
- Clean teardown: sources stopped, grains disconnected, master disconnected, rAF
  cancelled, context closed on unmount.
- No API route, no new npm dependencies — pure React + Web Audio + inline SVG.
- Art marks use raw ink/parchment hex; all UI chrome uses semantic tokens.

## What I'd deepen next

- **Offline pre-analysis** (`OfflineAudioContext`) so a dropped file paints its
  _entire_ score instantly, then plays — instead of writing in real time.
- **Voice separation** so polyphony fans out into parallel staves rather than
  collapsing onto one centroid.
- **Export** the finished SVG as a printable engraving plate.
- Richer **onset feature space** (percussive/harmonic split, transient shape) to
  widen the glyph vocabulary toward the full Cardew / Xenakis alphabet.
