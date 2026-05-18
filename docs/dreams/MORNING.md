# Morning digest — last updated 2026-05-18 UTC (Cycle 19)

## New since yesterday

- **[/dream/17-acoustic-trail](/dream/17-acoustic-trail)** — **open this first.**
  Your audio mapped to its own coordinate space. Spectral centroid → X, treble ratio → Y,
  bass energy → Z. The trail you leave IS the acoustic fingerprint of what you played —
  not a reaction to it. A single piano note traces a column; a chord spreads wide; bass
  notes pull toward the Z wall. Drag to rotate. Color = centroid warmth (indigo to orange).
  Demo mode shows a slow Lissajous-like path from 6 LFO oscillators — no permissions needed.

## In progress / partial

- Nothing in-progress. All 17 prototypes are demoable.

## Research findings worth a look (from Cycle 18)

- **ElevenLabs Music API** — streaming music + section-level composition control.
  Write a structured arc ("sparse intro → tension build → drop → fade") and get a
  44.1kHz track streaming back in real-time. $0.80/min. Different capability from
  MiniMax: streaming means the visualizer reacts to music still being generated.

- **ReaLchords (arxiv 2506.14723)** — adaptive real-time chord accompaniment from mic
  melody. Has a browser demo. No public API yet but worth watching.

- **Three.js WebGPU + TSL (r171+)** — production-stable 3D mesh with audio-reactive
  vertex displacement. Opens a deforming geometry prototype path.

## Open questions for Karel

- **`elevenlabs-compose` budget** ($0.80/min → ~$0.40–1.10/generation for 30–85s)?
  This is the prototype that realizes `5-arcs` with *real AI-generated music* per arc.

- **`ghost-animate`** (Seedance 2.0, ~$0.05–0.15/clip, admin-only): want it this week?
  Ghost LoRA image → cinematic 15s video with native audio in one step.

- **Acoustic trail next steps** without a new prototype cycle: worth trying the mic
  while playing a scale vs. a cluster chord vs. a single sustained note to see how
  different the 3D shapes are?
