# Morning digest — last updated 2026-05-22 UTC (Cycle 97)

## New since yesterday

- **[/dream/87-piano-transcript](https://getresonance.vercel.app/dream/87-piano-transcript)** — Piano Transcript
  Play your piano into the mic — the prototype writes while you play.
  YIN pitch detection (~35 lines, zero deps) transcribes each note in real time as a
  filled rectangle on a scrolling Canvas2D piano roll (C2–C7 range).
  Color gradient: amber → violet → cyan across the registers.
  Phrases group automatically (≥2 s silence = new group, violet bracket).
  "Save PNG" exports the full session to a 1920-px-wide timestamped image.
  **Zero API · Zero deps · 3.80 kB**

- **[/dream/83-kids-tilt-rain](https://getresonance.vercel.app/dream/83-kids-tilt-rain)** — Rain Catcher (kids, Cycle 96)
  Tilt the iPad to slide a glowing bowl and catch falling colored drops.
  Each drop is a pentatonic note; 5 catches → Replay button. No reading, no fail state.

## In progress / partial

- `72-paths-visualizer` — waiting on Welcome Home album recording IDs accessible without auth.
- `84-wave-fluid` (2 cycles) — WebGPU MLS-MPM ocean, 100k particles. Queued for Cycle 99+.

## Up next

- **Cycle 98 (kids)**: `kids-hum-to-paint` — hum pitch → animated brush strokes.
  Mic required (parent taps Start), then the child hums and the canvas paints itself.
- **Cycle 99**: `88-marpi-void` — audio-reactive organic entity ecosystem (Marpi "New Nature" technique).
  Zero API, zero deps, one cycle. High visual surprise.

## Research findings worth a look

- **LTX-2.3** (`fal-ai/ltx-2.3/text-to-video`, Jan 2026, $0.04/s) — enables `86-sound-to-video`: 10s piano → 6s video ~$0.25.
- **FLUX.2 Flash** (`fal-ai/flux-2/flash`, $0.005/MP) — upgrade from Schnell for all new AV+image work.
- **Seedance 2.0** (April 2026, fal.ai) — takes audio directly as input → synced video. Single API call for `86-sound-to-video`.

## Open questions for Karel

- **[IMPORTANT]** Welcome Home album recording IDs accessible without auth → `72-paths-visualizer`.
- **Votes**: still `{}`. Any prototype you love → tap ❤ → biases future picks.
- **Piano Transcript UX note**: mic gain matters for YIN. If notes aren't detecting well,
  try moving closer to the piano or adjusting the system mic gain. Future cycle can add
  a sensitivity slider (YIN threshold 0.05–0.15).
- Kids test: have you tried `82-kids-color-piano` or `83-kids-tilt-rain` with an actual kid?
  Feedback from a real 4-year-old session would directly shape the next kids prototype.
