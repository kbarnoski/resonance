# 296 · Harmonograph — Spectrum (the polychrome specimen)

> **The question:** What if every note in the chord drew its **own colored
> thread**, so a triad visibly **weaves from three kindred hues** — and you
> could export the figure as a **printable vector specimen**?

This is the **cycle-3 deepening** of the `291-harmonograph` instrument (the dream
lab's first multi-cycle commitment). Cycle 1 shipped the core "the chord you play
draws itself as a Victorian harmonograph" instrument; cycle 2 made it expressive
(sustain-pedal accrete, mod-wheel damping, velocity ink, PNG export); **cycle 3
(this one) makes the figure polychrome and exportable as a true vector artifact.**

## What it is

A live instrument. Hold a chord — MIDI keyboard, your computer keyboard, or the
on-screen piano — and a multi-pendulum **harmonograph** figure is traced from the
held notes in real time. A prominent **Pure tuning (Just Intonation)** toggle
re-tunes both the synth and the geometry: when consonance locks in, the curve
cleans up into a near-closed spirograph figure *and* the audible beating settles,
at the same instant. That coupling (see it close, hear it settle) is the point.

## How the geometry works

Each held note `i` becomes a pendulum with frequency ratio `rᵢ` = (its
frequency) / (lowest held note's frequency). The traced curve over a parameter
`t` (0 .. 40π) is:

```
x(t) = Σ aᵢ·sin(rᵢ·t + φᵢ)·e^(−dᵢ·t)
y(t) = Σ aᵢ·cos(rᵢ·t + φᵢ + kᵢ)·e^(−dᵢ·t)
```

- `aᵢ` (amplitude) scales with note velocity.
- `φᵢ`, `kᵢ` are per-note phase offsets so chords don't collapse onto one axis.
- `dᵢ` is a per-note decay, globally scaled by the mod-wheel (cycle 2).

**Why JI cleans it up:** when the `rᵢ` are small-integer ratios (a consonant,
justly-tuned chord) the curve is periodic and near-closed. Under 12-TET the
ratios are irrational (a major third is `2^(4/12) ≈ 1.2599`, not `5/4`), so the
curve never quite repeats — it drifts and tangles. Toggling JI snaps each ratio
to the nearest small-integer just interval (`1/1, 16/15, 9/8, 6/5, 5/4, 4/3,
45/32, 3/2, 8/5, 5/3, 9/5, 15/8, 2/1`, octave-extended) for **both** the
oscillator pitch and the `rᵢ` used to draw.

## Cycle 3 — the polychrome specimen (this cycle)

Three deepenings turn the single-color line into a colored weave you can keep:

1. **Per-note color via the circle of fifths (Newton color wheel).** Each note's
   pitch class is mapped to a hue *ordered by the circle of fifths*:
   `hue = ((pc * 7) % 12) / 12` (a perfect fifth = one constant hue step), with
   saturation `0.78`, value `1.0`. Because a fifth is a single hue step, a triad
   (root + third + fifth) reads as three **distinct-but-kindred** hues rather than
   three random colors. Helpers `pitchClassToColor(midi)` and `hsvToRgb(h,s,v)`
   live in `harmonograph-gl.ts`.
2. **Multi-strip polychrome render.** Each held note `i` draws the **running
   composite** of pendulums `0..i` (new `sampleCompositeUpTo(out, pts, pends,
   upTo, rotate, tMax)`), normalized by the amplitude of the **full** pendulum
   set so every partial thread stays spatially **registered** with the complete
   figure (it is *not* rescaled to fill the frame on its own). The lowest note is
   its own short thread; each higher note adds its layer, so a major triad
   visibly weaves from its parts. Each thread is drawn via the renderer's
   per-`drawCurve` RGB color in note `i`'s pitch-class hue, with velocity → ink
   applied per thread. The figure still cleans up under Pure tuning (each
   composite uses the JI-snapped ratios). The dim idle Lissajous seed is kept
   when nothing is held.
3. **SVG vector export — the takeaway specimen.** An **Export SVG** button (next
   to the kept **Export PNG**) emits one `<polyline>` per colored thread from the
   **exact** sampled clip-space points, mapping `[-1,1]` → an SVG viewBox and
   applying the same aspect correction the vertex shader does, each `stroke` =
   that thread's pitch-class color, over a dark `<rect>` ground. Downloaded as
   `harmonograph-<chord>.svg`. A true printable **vector** artifact, vs cycle-2's
   PNG raster (which is also still available).
4. **Color legend.** A small HUD legend shows, for each drawn thread, a swatch in
   its pitch-class color + the note name (typography-compliant, `text-base`).

## Subsystems

1. **Three-way note input → one note-on/note-off path** — Web MIDI
   (`requestMIDIAccess({ sysex:false })`, hotplug via `onstatechange`, device-name
   readout; parses **CC64** sustain + **CC1** mod-wheel), auto-repeat-guarded
   QWERTY (chromatic `a w s e d f t g y h u j k o l p ;`, `z`/`x` = octave, Space =
   pedal, ↑/↓ = damping), and a 2-octave on-screen piano (≥44px, multi-touch
   pointer events).
2. **Warm 12-voice Web Audio synth** (voice-stealing allocator): per voice =
   sine + +7¢ detuned triangle → lowpass (velocity → brighter) → ADSR gain →
   shared feedback delay → master → `DynamicsCompressor` limiter → destination;
   soft always-on low drone; sustain-pedal voice-parking. AudioContext
   created/resumed only on first gesture.
3. **JI-lock + chord/ratio analysis** — live HUD: held + pedaled note names,
   best-guess chord name (over the full drawn figure), active ratio set, and the
   new per-thread color legend.
4. **Raw WebGL2 renderer** (NOT three.js, NOT Canvas2D) — hand-written GLSL ES
   3.00, VAO/VBO, ~3000-point `LINE_STRIP` `bufferSubData`'d each frame, additive
   glow with the `uInk` brightness, translucent fade-quad ink trail, idle
   Lissajous seed, DPR/resize-aware. Cycle 3 draws **one strip per note** per
   frame (each with its own `uColor`) instead of a single line.

## Cycle-2 expression layers (kept)

- **Sustain pedal → figure-HOLD / accrete** (CC64 / Space / on-screen pad): while
  down, released notes keep contributing their decaying pendulum so the figure
  accretes; lift drops parked notes from audio and figure together.
- **Mod-wheel → pendulum damping** (CC1 / ↑↓ / slider), 0..1 → decay multiplier
  `0.35·17^d`: loose sprawl ↔ tight inward spiral.
- **Velocity → ink intensity**: harder chords draw brighter ink (`uInk`), now
  applied per colored thread.
- **PNG export** (`preserveDrawingBuffer` + `canvas.toBlob`) → `harmonograph-
  <chord>.png`, still present alongside the new SVG export.

## MIDI-out (optional, off by default)

If any MIDI output port exists, an **Echo to MIDI out** toggle appears (default
OFF). While ON it forwards held note-on/note-off to the first output port.

## How it degrades

- **No Web MIDI** (e.g. Safari): amber notice; QWERTY + on-screen keyboard +
  Space-pedal + slider/arrow-damping all work fully.
- **MIDI present, no device**: amber notice prompting use of the keyboard.
- **No WebGL2**: rose notice; audio + keyboards still work; PNG/SVG export
  disabled.
- All `window` / `navigator` / WebGL / AudioContext access is guarded so SSR and
  unsupported browsers never throw.

## References

- The **harmonograph** — Hugh Blackburn's pendulum apparatus, ~1840s.
- **Lissajous figures** — Jules Antoine Lissajous, 1857.
- **Chord Colourizer** (arXiv 2510.10173, 2025) — near-real-time CQT chord
  detection mapped onto **Isaac Newton's** 7-color wheel; the lineage for
  rendering harmony as color.
- **Circle-of-fifths color wheels** — Jack Ox's color/harmony wheel; maddie lim's
  *"12 Tone Color Theory"* — the validated mapping where a fifth = one hue step,
  so a triad reads as three kindred hues.
- Sustain/expression as a sculpting gesture follows the pianistic tradition of
  the damper pedal as a continuous instrument, not an on/off switch.

Honesty note: Web MIDI already appears elsewhere in this lab. The *novel* idea is
the **harmonograph geometry — harmony rendered as visible, now polychrome,
geometry** and its real-time expressive control + vector export. This build is
**build-verified, not browser-verified** (the polychrome multi-strip draw, SVG
projection/aspect, and PNG readback on Safari are the unverified surface).

## Tags

- **INPUT**: MIDI (notes + CC64/CC1) / QWERTY / on-screen-keyboard
- **OUTPUT**: raw WebGL2 polychrome line geometry + PNG + **vector SVG** export
- **TECHNIQUE**: harmonograph parametric geometry + JI retuning + circle-of-fifths
  per-note color + running-composite multi-strip render
- **VIBE**: theory-literate live instrument, ink-on-dark, restrained, collectible

## Further out

Richer chord namer (inversions/extensions), a microtonal/EDO selector beyond
12-TET vs JI, and folding in the banked `phase-scope` sibling as a "scope mode."
