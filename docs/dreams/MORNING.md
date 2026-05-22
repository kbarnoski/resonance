# Morning digest — last updated 2026-05-22 UTC (Cycle 101)

## New since yesterday

- **[/dream/85-spectrogram-paint](https://getresonance.vercel.app/dream/85-spectrogram-paint)** — Spectrogram Paint
  Your sound crystallizes into a living painting in real time. The FFT waterfall scrolls
  left (time) × bottom-to-top (pitch, log scale 20–8 kHz). Each frame the display decays
  at 98.4%, zooms 1.002×, and drifts slightly — fresh spectrogram injected additively.
  Notes leave trails that **bloom outward** and slowly evaporate like breath on glass.
  Color: black → violet/cyan → white (Ryoji Ikeda *data.matrix* aesthetic).
  **In mic mode: play a chord → three white lines crystallize, expand, then fade.**
  Demo mode shows a C-major improvisation with 11 harmonic frequencies. Zero deps · Zero API · 2.76 kB.

## Surprise finding

Chords "bloom" faster than single notes in the feedback buffer — because the frequency
columns from each note ADD together (lighter composite). Harmonic richness becomes
morphology: a C-major chord has a characteristic cluster shape, visually distinct from
a power chord or an augmented chord. The painting tells you what was played.

## Love signal

Karel still loves `82-kids-color-piano` and `83-kids-tilt-rain` (votes API unchanged).
Four kids prototypes now live (82, 83, 88, 90). No new AV loves since last check.

## In progress / partial

- `72-paths-visualizer` — waiting on Welcome Home album recording IDs.
- `84-wave-fluid` (WebGPU MLS-MPM ocean, 2 cycles) — queued Cycle 103+.
- `85-spectrogram-paint` — first pass done. Cycle 102 upgrade path: port to WebGPU texture
  writes + WGSL feedback shader for more complex tonemapping (see README).

## Up next

- **Cycle 102 (kids)**: `kids-character-band` — 5 animal characters, tap each → distinct
  melodic phrase. Toca Band-style but Resonance-toned (calmer, piano-rooted).
- **Cycle 103 (build)**: `84-wave-fluid` (MLS-MPM WebGPU ocean) OR `86-sound-to-video`
  (play piano → FLUX.2 image → LTX-2.3 video, Karel's "AI image inside AV" direction).

## Open questions for Karel

- **Welcome Home recording IDs** → needed to build `72-paths-visualizer`.
- **Spectrogram paint feel**: does the decay speed (2 s trail) feel right, or too fast/slow?
  The `decay` constant (0.984) in the page is easy to tune.
- **WebGPU upgrade**: worth spending a cycle on the WGSL port of 85, or is Canvas2D quality sufficient?
- **Any new loves?** Would shape which direction to deepen next.
