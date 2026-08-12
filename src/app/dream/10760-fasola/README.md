# 10760-fasola — Raise the hollow square

## What it is

An SVG shape-note singing school. A seeded modal hymn steps across a horizontal
staff as the four classic 1846 Aikin shapes — **fa = right-triangle, sol = oval,
la = rectangle, mi = diamond** — while a violet playhead sweeps the measures and
lights each note as it sounds. Four vocal parts (treble, alto, tenor, bass) sit
facing inward around a **hollow square** emblem; you raise each part yourself
until the whole square is ringing in open, dispersed harmony.

This is the lab's first Sacred Harp / shape-note / fasola piece (grep-verified 0
across the prior prototypes).

## The one question

*What if you could raise a hymn the way Sacred Harp singers do — reading the four
shape-notes, singing the shapes not the words, in the raw OPEN dispersed harmony
of the tradition — and add each vocal part yourself until the whole hollow square
is ringing?*

## Subsystems

- **Generative modal hymn** — seeded with `mulberry32(0x10760)`. A tune in
  A-minor pentatonic (a gapped mode), 4/4, 16 bars, in an AABA phrase shape with
  cadences resolving to the tonic. Deterministic: identical every load.
- **Fasola solmization** — each pitch is mapped to its shape by scale degree via
  the standard movable-do four-shape system (1=fa 2=sol 3=la 4=fa 5=sol 6=la
  7=mi 8=fa). In this pentatonic that surfaces all four shapes: A=fa, C=la,
  D=fa, E=sol, G=mi.
- **Shape-note staff (inline SVG)** — five staff lines, barlines, stemmed
  noteheads drawn as crisp SVG shapes, and a sweeping playhead. The
  currently-sounding tune note lights violet.
- **Open dispersed part-writing** — the tenor carries the tune (as in the
  tradition). Bass takes the chord root low; alto takes the open fifth; treble
  doubles at the bare octave — lots of hollow fifths and octaves, an occasional
  open third at cadences. Each voice is a formant-ish choral tone (three detuned
  sines through a vowel bandpass, soft attack). All audio is routed through the
  shared safe master.
- **The hollow square viz** — four blocks, one per section, arranged facing
  inward around an empty center; each pulses as its voice sounds, so you *see*
  the four-part texture fill in.
- **Interaction** — click a section block or a voice button, or press keys 1–4,
  to toggle treble/alto/tenor/bass. A tempo slider (60–132 bpm) rebases the clock
  so the phrase never jumps.
- **Auto-performer** — on mount the visual transport starts immediately (no
  gesture needed), so a muted phone still sees the shapes step across the staff
  within ~1s. A seeded schedule raises the parts one by one (tenor, then bass,
  alto, treble). Badged *"auto — tap a part to sing it yourself."* Audio begins
  on the first user gesture (Start, a part tap, or a number key).

## Named reference

*The Sacred Harp* (B.F. White & E.J. King, 1844) — the shape-note tunebook of
the Southern singing tradition — together with the **Aikin / Little & Smith
four-shape "patent note" system** and the tradition of **dispersed harmony**.
This is a living oral technique being ported, not a dead-inventor decoration.

## Tags

- **INPUT** = pointer + keyboard (no mic, tilt, or camera)
- **OUTPUT** = inline SVG-DOM (shape-note staff + hollow-square emblem); no
  canvas, no WebGL
- **TECHNIQUE** = fasola four-shape solmization + open dispersed part-writing
  over a seeded modal hymn
- **PALETTE** = old-hymnal / meetinghouse — parchment/bone-white ground,
  ink-black staff & shapes, one violet accent for the active voice (cool, high
  contrast; no warm ember/bronze/amber)

## Self-assessment

Meets the brief: the four shapes are drawn as distinct, readable SVG geometry
and the auto-performer paints the staff and fills the square within a second on
a muted screen. The open voicing genuinely leans on bare fifths and octaves, so
the texture reads as hollow rather than blended, and the tenor-carries-the-tune
convention is honored. Honest limits: the harmony is rule-driven rather than
hand-voiced, so the part-writing is idiomatic in *spacing* but not in voice-
leading finesse (no true suspensions or fuging entries); the "vowel" is a single
bandpass formant, so the timbre is choral-ish but not a convincing sung syllable;
and with 24 noteheads on one staff the shapes stay legible on desktop but shrink
on a narrow phone, where the staff scrolls horizontally.
