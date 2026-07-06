# 1210 · datamatics — "the image IS the score"

> Route: `/dream/1210-datamatics`

## The one question

**What if you could DRAW a sound as a picture** — paint bright marks onto a
scrolling monochrome spectrogram and hear them resynthesised in real time as a
bank of pure sine partials, in the stark black-and-white idiom of Ryoji Ikeda?

## What it is

A full-viewport, strictly monochrome Canvas2D "spectrogram score" you play like
an instrument.

- **Vertical axis** = log-frequency, `55 Hz` (bottom) → `7.5 kHz` (top),
  logarithmic.
- **Horizontal axis** = time.
- A thin **cyan playhead** sweeps left → right (one full sweep ≈ 11 s, ≈ 20 s
  under `prefers-reduced-motion`). It is the *only* colour in the piece — white
  marks on true black plus that single accent scan-line.
- **You draw into the score** with pointer / touch. Dragging paints energy;
  painting brighter (repeated passes, or dense strokes) = more amplitude at that
  frequency/time. `shift`-drag or the **erase** tool clears.

## The mapping (the core)

The spectrogram is **not an analysis of a sound — it *is* the sound.**

| Score dimension        | Sound                                             |
| ---------------------- | ------------------------------------------------- |
| row (0…63)             | one pure sine `OscillatorNode`, log-spaced Hz     |
| brightness of a cell   | that partial's amplitude                          |
| playhead column        | the additive spectrum sounding *right now*        |
| hard high-contrast edge| a short band-passed white-noise **tick** (onset)  |

Concretely: **64 `OscillatorNode`s** (`type: "sine"`), one per frequency row,
each pinned to a clean log-frequency grid so dense columns stay in tune rather
than turning to mud. Every frame the column under the playhead is read and each
oscillator's gain is glided (`setTargetAtTime`) toward that row's brightness, so
the timbre morphs continuously to match the drawing. When column-to-column
energy jumps past a threshold (a hard left edge / attack), a filtered-noise tick
fires so onsets read precisely.

This is the ANS-synthesiser / Xenakis-*UPIC* / *Phosphor* / *Tembrica*
image→additive-resynthesis lineage, made playable.

## The voice

Clinical Ikeda test-tone register: **pure sine partials + short filtered-noise
clicks.** No warm pad, no just-intonation choir, no modal percussion, no
granular, no FM. Sub-bass to bright highs, precise and electronic.

## Presets (demoable in one tap)

- **sweep** — a rising diagonal (log glissando bottom → top).
- **chord** — a clean stack (A2·E3·A3·C#4·E4·A4) drawn as full-time bands.
- **dots** — a sparse, deterministic Ikeda-ish dot field (also the idle seed, so
  the screen is never a dead black rectangle).
- **clear** — empty the score.

## Safety & robustness

- **No strobe.** All motion is smooth continuous drift; the only periodic
  element is the single ~0.09 Hz playhead sweep — far below the 3 Hz ceiling.
  A faint grid drifts even when idle so the screen is never a dead black field.
- Respects `prefers-reduced-motion` (slower sweep + drift).
- Audio is gesture-gated behind **Begin** (resumes the `AudioContext`). Master
  gain ramps up from 0 through a `DynamicsCompressor` brick-wall limiter, and
  dense columns are **energy-normalised** across partials so a fully-painted
  column can never spike.
- Full teardown on unmount: `cancelAnimationFrame`, stop + disconnect every
  oscillator/gain/filter node, `ctx.close()`.

## Files

- `page.tsx` — React shell: Canvas2D score, pointer painting, the render/loop,
  presets, transport, design notes.
- `datamatics-engine.ts` — the additive sine bank + noise-tick + limiter graph.
- `README.md` — this file.

## Named references

- **Ryoji Ikeda** — *datamatics* / *test pattern* / *data-verse* (2026
  *data.gram [nº11]*).
- The **ANS synthesiser** (photo-optic drawn-spectrum synthesis).
- **Iannis Xenakis** — *UPIC* (draw curves → sound).
- ***Phosphor*** — spectral synth (Synthtopia, Feb 2026).
- **Tembrica Image-to-Sound** (Mar 2026).

## Next-cycle deepening (from the two DEEP siblings this fire raced)

This shipped as the winner of a DEEP fire — one concept ("a playable strict-monochrome
Ikeda data-instrument, voiced in the clinical sine/noise/click register") attacked via
three technical routes. The two banked siblings suggest concrete deepenings:

- **A rhythmic MODE (from `1211-test-pattern`).** Add a second read-mode where the score
  is scrubbed/scanned on an *analytic look-ahead scheduler* against `audioCtx.currentTime`
  (sample-accurate onsets, not RAF-column reads), so the same drawn field can be played as
  precise machine-rhythm as well as a continuous spectral morph. `1211` proved the coprime
  multi-lane polyrhythm (bar counts 61/43/26/17) and the four-register voice split
  (sine pip · gated sine · noise tick · sub pulse).
- **A generative MODE (from `1212-data-matrix`).** Let the drawn field *evolve* between
  sweeps — a bounded Conway's-Life / CA pass on a quantised version of the score — so it
  plays itself and mutates, a self-composing Ikeda datamatics. `1212` proved the toroidal
  Life step + the datamatrix column-scan sonification with bounded per-column polyphony.

## Honest rough edges

- 64 partials is a deliberate resolution/CPU trade-off. It reads clearly as
  pitch but the frequency grid is coarser than a true FFT bin count, so very
  fine spectral gestures quantise to the nearest row.
- The onset tick uses a simple column-energy delta, not per-partial onset
  detection, so it catches broadband edges best; a single faint dot may not
  click.
- The playhead reads a static painted field on a loop (paint-then-hear), rather
  than an infinitely scrolling tape — the simplest framing of "the image is the
  score," but it means the piece is a loop, not an endless timeline.
- Energy-normalisation keeps loudness roughly constant, which very slightly
  de-emphasises the difference between a sparse and a dense column in level (the
  timbral difference is preserved).
