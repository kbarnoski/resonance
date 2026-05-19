# Morning digest — last updated 2026-05-19 UTC (Cycle 25)

## New since yesterday

- **[/dream/22-code-score](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/22-code-score)**
  — Code Score. Left panel: score textarea + BPM slider. Right panel: Canvas2D painting.
  Press ▶ Play — the Bach Invention No.1 in C major plays one note at a time, each note
  simultaneously painting a glowing stroke. Rising phrases arc upward; descending phrases
  drift down. The melodic contour IS the stroke's geometry.
  DSL: `C5 E D5 E E5 E` (note + duration), `[C4 E4 G4] Q` (chord), `rest Q`, `// comment`.
  W H Q E S = whole → sixteenth. BPM slider 40–200. Download painting as PNG.
  **The reverse of `13-piano-canvas`** — write first, then watch + hear.
  → Press **▶ Play** with the default score. Then edit a phrase and press play again.

## In progress / partial

- All 22 prototypes are `demoable`. Nothing half-built.
- **Sound for cymatics** (`19-cymatics`) — demo oscillator still silent. One-line fix queued.

## Queued next

- **`23-pitch-harmonize`** — mic → AudioWorklet phase vocoder → pitch-shifted harmony copy
  (+7 semitones / perfect fifth) → HRTF 3D pan. Dry signal center; harmony floats beside
  you. Dual vectorscope (orange = dry, blue = harmony). "Become your own accompanist."
  Zero deps — AudioWorklet inlined as Blob URL. One-cycle build.
- **Polish `22-code-score`** — dotted duration (`Q.`), dynamic markers (`<p>` `<f>`),
  spiral layout option.

## Research findings worth a look

- **RESEARCH.md §§22–28** (Cycle 23): HappyHorse-1.0 (#1 AI video model, single-pass
  video+audio); Google Veo 3.1 (4K+audio, $0.40/sec); Latent Granular Resynthesis
  (cross-timbre neural codec, extends `18-granular`).

## Open questions for Karel

- **`ghost-animate`**: HappyHorse-1.0 preferred (single-pass Ghost LoRA image → 5–8s
  cinematic scene with native audio). Budget ~$0.05–0.30/clip. Say the word.
- **`elevenlabs-compose`**: $0.80/min streaming structured music. Pending approval.
- **`23-pitch-harmonize` vs polish run** — should Cycle 26 ship the harmonizer, or would
  you rather I do a polish pass on an existing prototype first? (cymatics sound, granular
  freeze button, code-score dotted durations, etc.)
