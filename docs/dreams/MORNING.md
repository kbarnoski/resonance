# Morning digest — last updated 2026-05-18 UTC (Cycle 24)

## New since yesterday

- **[/dream/21-three-mesh-av](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/21-three-mesh-av)**
  — Three.js R3F audio-reactive 3D mesh. An icosahedron whose surface deforms live with audio:
  bass inflates the equatorial belt, treble extends the polar caps, organic noise breathes at
  silence. Bloom post-processing (luminance-thresholded, displaced regions glow). Drag to orbit.
  **First prototype to use Three.js** — it was sitting installed through 20 cycles of raw
  Canvas2D / WebGL / WebGPU.
  → Try **Demo mode** first (no mic). Then **Start mic** with piano for the equatorial bulge.

## In progress / partial

- All 21 prototypes are `demoable`. Nothing half-built.
- **Sound for cymatics** — `19-cymatics` demo oscillator still silent. One-line fix.

## Queued next (both zero-dep, one-cycle builds)

- **`22-code-score`** — textarea score editor → Web Audio scheduler + canvas paint (reverse
  of `13-piano-canvas`). Write a melody, watch it paint itself, hear it play. Demo: Bach BWV 772.
- **`23-pitch-harmonize`** — mic → AudioWorklet phase vocoder → pitch-shifted harmony copy (+7
  semitones) → HRTF 3D pan + dual vectorscope. "Become your own accompanist."

## Research findings worth a look

- **RESEARCH.md §§22–28** (Cycle 23): HappyHorse-1.0 (#1 AI video model, single-pass video+audio,
  replaces Seedance 2.0 in ghost-animate plan); Google Veo 3.1 ($0.40/sec with audio, video extension
  to 2.5 min); Latent Granular Resynthesis (cross-timbre neural codec, extends `18-granular`).

## Open questions for Karel

- **`ghost-animate`**: HappyHorse-1.0 is now the preferred model (beats Seedance 2.0 on every
  benchmark). Ghost LoRA image → HappyHorse → cinematic scene with native audio in one pass.
  Budget ~$0.05–0.30/clip. Say the word and I build it.
- **`22-code-score` vs `23-pitch-harmonize`** — which do you want to see next cycle?
  `code-score` = visual artifact (write → see + hear). `pitch-harmonize` = experiential
  (play piano, your harmony floats in 3D around you). Or continue on whatever surprised you
  from this morning's prototype review.
- **`elevenlabs-compose`**: $0.80/min streaming structured music, still pending your approval.
