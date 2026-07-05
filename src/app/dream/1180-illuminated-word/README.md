# Illuminated Word

**What if you could *hear* a word — type any name, line, or poem and watch it
become an illuminated hymn that sings itself into being?**

A cross-modal **TEXT → MUSIC** instrument whose visual is a **self-illuminating
manuscript**. You type a verse, tap **Begin**, and the text is gilded
letter-by-letter in time with the music: an oversized gold drop-cap on a lapis
panel, calligraphic glyphs that brighten from faint ghost-ink to iron-gall,
gold-leaf and vermilion as each is sung, and marginalia vines that grow down the
margins as the reading progresses. It reads as a bright vellum gospel-book page
writing itself — no dark/cosmic palette.

Everything is inline **SVG** (React-generated `<text>`/`<path>` elements), not a
raster canvas — deliberately typographic.

## The text → music mapping

Scale: **D Dorian** over a soft D/A drone, so any text stays consonant and
chant-like rather than random beeps.

| Text feature | Musical result |
| --- | --- |
| letter (a–z) | a scale degree of D Dorian (`degree = letterIndex % 7`, with a second octave for the back half of the alphabet) |
| **vowel** (a e i o u) | warm, sustained **choir** tone — slow attack, legato, rings over the next letters (3 detuned saw/triangle voices + a sub) |
| **consonant** | short **plucked/struck** articulation — fast attack, quick decay, plus a tiny filtered-noise transient for the "consonant" edge |
| word length | phrase length (letters sound at a steady tempo) |
| space | a small breath (short rest, no note) |
| `, ; : -` | short cadential rest |
| `. ! ?` | full rest **and** a resolving tonic chord (the phrase lands home) |
| capital letter | pitch lifts an octave (a register/new-phrase feel) |
| line break | new line / register lift |
| phrase position | a gentle harmonic **arc** — pitch rises toward the middle of each phrase (`sin(π·p)`) and resolves at the period |

Reading proceeds at a musical tempo (~0.24 s/letter), and the same `Score`
object drives both the audio scheduler and the SVG layout, so the gilding you
see is locked to the note you hear.

Audio is raw **Web Audio API**: oscillators + gain envelopes + biquad filters +
a generated convolver reverb (church tail). Polyphonic with **voice-stealing**
(cap of 12 — the oldest-ending voice is released early when the budget is
exceeded). Master chain ends in a `DynamicsCompressor` limiter → conservative
master gain (~0.2, only ramped via `setTargetAtTime`). **Begin/Stop** fully
tears down: RAF cancelled, all oscillators stopped, nodes disconnected,
`ctx.close()`.

## Named reference

- **The Book of Kells** and the **Lindisfarne Gospels** — the insular
  illuminated-manuscript tradition of the decorated **drop-cap**, gold-leaf and
  lapis initials, and interlace/vine **marginalia** that this page imitates.
- **Apollinaire's _Calligrammes_** — concrete poetry, where the *shape* of the
  text on the page is part of its meaning; here the text's layout and its sound
  are one gesture.
- (Nod to **Kandinsky's** letter/colour synesthesia — vowels gild gold,
  punctuation flares vermilion.)

## Safety notes

- **No strobe.** Each letter's brightening is a one-time slow CSS transition
  (~0.55 s). The only repeating motion is a sub-1 Hz page "breathe" (7 s) and a
  ~0.7 Hz glow on the single currently-sung glyph — both well under 3 Hz.
- Honors `prefers-reduced-motion`: the breathe and pulse animations are
  disabled and the current-glyph glow becomes a static soft halo. The gilding
  reveal (the substance of the piece) remains, as it is a slow, non-flashing
  transition.
- High-key, warm parchment ground throughout — no near-black background.

## Graceful degradation

- If Web Audio is unavailable, a `text-rose-300` notice explains the hymn can't
  be sung; the manuscript still lays out the typed text.
- If the text field is empty, it falls back to the default line.
- Audio is gesture-gated — the `AudioContext` is created only inside the Begin
  click handler.

## Honest gaps

- SVG text uses a fixed per-glyph advance and a system serif (`Georgia`) rather
  than a true calligraphic hand — no web font is loaded (self-contained). Glyphs
  sit on an even column, which reads as manuscript regularity but isn't real
  proportional kerning.
- The drop-cap flourish and marginalia vines are a small hand-authored set of
  paths, not procedurally generated knotwork; they don't vary with the text.
- Word-wrap is greedy and assumes the first character is a letter (input is
  trimmed); very long single "words" can overrun. Input is capped at 220 chars
  to keep it a single page.
- The harmonic arc is per-phrase pitch shaping, not full functional harmony —
  it leans on the drone + Dorian scale for consonance rather than voice-led
  chord changes.

## Files

- `page.tsx` — client component: UI, SVG manuscript, RAF clock, teardown.
- `manuscript.ts` — pure text→score model (pitch/timing) + typographic layout.
- `audio.ts` — Web Audio engine (voices, reverb, drone, limiter, voice-stealing).
