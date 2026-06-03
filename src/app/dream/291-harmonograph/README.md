# 291 · Harmonograph — Expressive (multi-cycle)

> **The question:** What if the chord you play — on a MIDI keyboard, your
> computer keyboard, or an on-screen keyboard — *drew itself* as a Victorian
> harmonograph, so you can literally **see** the geometry of the harmony, while
> it sounds through a synth you can re-tune to pure just intonation — and then
> you could **sculpt that figure live**, the way a pianist sculpts with the
> pedal and dynamics?

This is the dream lab's **first multi-cycle commitment** (the 2026-06-03 jury's
#1 provocation: "stop shipping orphans — pick ONE thing and deepen it over 2–3
cycles"). Cycle 1 shipped the core instrument; **cycle 2 (this one) makes it
expressive**; cycle 3 will make the figure polychrome and exportable as a vector
specimen (see "What cycle 3 adds").

## What it is

A live instrument. Hold a chord and a multi-pendulum **harmonograph** figure is
traced from the held notes in real time, glowing as an ink-on-dark line. A
prominent **Pure tuning (Just Intonation)** toggle re-tunes both the synth and
the geometry: when consonance locks in, the curve cleans up into a near-closed
spirograph figure *and* the audible beating settles — at the same instant. That
coupling (see it close, hear it settle) is the whole point.

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
- `dᵢ` is a per-note decay, so the figure spirals gently inward like a real
  decaying pendulum — and in cycle 2 `dᵢ` is now globally scaled by the
  mod-wheel (see below).

**Why JI cleans it up:** when the `rᵢ` are small-integer ratios (a consonant,
justly-tuned chord) the curve is periodic and near-closed. Under 12-TET the
ratios are irrational (e.g. a major third is `2^(4/12) ≈ 1.2599`, not `5/4`), so
the curve never quite repeats — it drifts and tangles. Toggling JI snaps each
ratio to the nearest small-integer just interval (`1/1, 16/15, 9/8, 6/5, 5/4,
4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8, 2/1`, octave-extended) for **both** the
oscillator pitch and the `rᵢ` used to draw.

## Cycle 2 — the expressive live instrument (this cycle)

Four performance layers now sculpt the figure as it draws, each with a MIDI
control AND a no-hardware fallback so it's fully demoable on a laptop:

1. **Sustain pedal → figure-HOLD / accrete.** MIDI **CC64** (≥64 = down), the
   **Space bar**, or an on-screen press-and-hold pad. While the pedal is down a
   key-up does *not* remove the note — the synth keeps the voice ringing and the
   note keeps contributing its (now slightly faster-decaying) pendulum, so the
   figure **accretes** as you layer chords over a held bass. The HUD shows
   *held* vs *pedaled* notes separately and tints pedaled keys on the on-screen
   piano. Lifting the pedal drops every parked note from both the audio and the
   drawn figure, together. (Engine: `HarmonographSynth.setPedal()` parks
   key-released voices in a `sustained` set and returns the dropped midis on
   release.)
2. **Mod-wheel → pendulum damping.** MIDI **CC1**, the **↑/↓ arrow keys**, or a
   slider, mapped 0..1 → an exponential decay multiplier (`0.35·17^d`) applied
   to every pendulum's `dᵢ`. Low = long-lived, loose, sprawling figure; high =
   fast inward spiral. A readable `NN%` + word label ("loose / balanced / tight
   spiral") is shown — no sub-70%-opacity hint text.
3. **Velocity → ink intensity.** Average held velocity drives a `uInk` uniform
   in the line fragment shader (`mix(0.10, 0.85, head) * uInk`), so a hard-struck
   chord draws a brighter, bolder curve — dynamics become visible.
4. **PNG export.** The WebGL2 context is created with
   `preserveDrawingBuffer: true`; an **Export PNG** button calls
   `canvas.toBlob` and downloads `harmonograph-<chord>.png`. A chord becomes a
   takeaway image.

## Subsystems

1. **Three-way note input → one note-on/note-off path** — Web MIDI
   (`requestMIDIAccess({ sysex:false })`, hotplug via `onstatechange`, device-name
   readout; now also parses **CC** messages for sustain CC64 + mod-wheel CC1),
   auto-repeat-guarded QWERTY (chromatic `a w s e d f t g y h u j k o l p ;`,
   `z`/`x` = octave, Space = pedal, ↑/↓ = damping), and a 2-octave on-screen
   piano (≥44px, multi-touch pointer events).
2. **Warm 12-voice Web Audio synth** (voice-stealing allocator): per voice =
   sine + +7¢ detuned triangle → lowpass (velocity → brighter) → ADSR gain →
   shared feedback delay → master → `DynamicsCompressor` limiter → destination;
   soft always-on low drone; **sustain-pedal voice-parking**. AudioContext
   created/resumed only on first gesture.
3. **JI-lock + chord/ratio analysis** — live HUD: held + pedaled note names,
   best-guess chord name (computed over the full drawn figure), active ratio set.
4. **Raw WebGL2 renderer** (NOT three.js, NOT Canvas2D) — hand-written GLSL ES
   3.00, VAO/VBO, ~3000-point `LINE_STRIP` `bufferSubData`'d each frame, additive
   glow with the new `uInk` brightness, translucent fade-quad ink trail, idle
   Lissajous seed, DPR/resize-aware.

## MIDI-out (optional, off by default)

If any MIDI output port exists, an **Echo to MIDI out** toggle appears (default
OFF). While ON it forwards held note-on/note-off to the first output port.

## How it degrades

- **No Web MIDI** (e.g. Safari): amber notice; QWERTY + on-screen keyboard +
  Space-pedal + slider/arrow-damping all work fully.
- **MIDI present, no device**: amber notice prompting use of the keyboard.
- **No WebGL2**: rose notice; audio + keyboards still work; PNG export disabled.
- All `window` / `navigator` / WebGL / AudioContext access is guarded so SSR and
  unsupported browsers never throw.

## References

- The **harmonograph** — Hugh Blackburn's pendulum apparatus, ~1840s.
- **Lissajous figures** — Jules Antoine Lissajous, 1857.
- Sustain/expression as a sculpting gesture follows the long pianistic tradition
  of the damper pedal as a continuous instrument, not an on/off switch.

Honesty note: Web MIDI already appears elsewhere in this lab. The *novel* idea
is the **harmonograph geometry — harmony rendered as visible geometry**, and now
its real-time expressive control. The cycle-2 build is **build-verified, not
browser-verified** (see STATE.md for the unverified surface — pedal accrete edge
cases, PNG readback on Safari).

## Tags

- **INPUT**: MIDI (notes + CC64/CC1) / QWERTY / on-screen-keyboard
- **OUTPUT**: raw WebGL2 line geometry + PNG export
- **TECHNIQUE**: harmonograph parametric geometry + JI retuning + pedal/damping
  expression control
- **VIBE**: theory-literate live instrument, ink-on-dark, restrained

## What cycle 3 adds (banked from the parallel explorer `harmonograph-spectrum`)

A second builder explored the *polychrome specimen* direction in parallel this
cycle; its ideas are the cycle-3 plan:

- **Per-note color — Newton color wheel.** Map each note's pitch class around a
  hue wheel via the **circle of fifths** (a fifth = a constant hue step, so a
  triad reads as three distinct-but-kindred hues), in the lineage of the **Chord
  Colourizer** (arXiv 2510.10173 — near-real-time CQT chord detection → Isaac
  Newton's 7-color wheel). Draw each pendulum's running-composite contribution
  as its own colored `LINE_STRIP` so the chord weaves visibly from its parts.
- **SVG vector export — the takeaway specimen.** Emit one `<polyline>` per
  colored thread from the exact sampled curve points, wrapped in an SVG doc with
  the dark ground, downloaded as `harmonograph-<chord>.svg`. A true printable
  vector artifact, not a raster snapshot.
- **Specimen legend** — swatch + note name + ratio per thread.

(The renderer already supports a per-`drawCurve` color; cycle 3 extends it to
per-pendulum color + multi-strip draw, and adds `sampleCompositeUpTo`.)

Further out: richer chord namer (inversions/extensions), microtonal/EDO selector
beyond 12-TET vs JI, and folding in the banked `phase-scope` sibling as a
"scope mode."
