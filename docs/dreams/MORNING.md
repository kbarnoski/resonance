# Morning digest — last updated 2026-05-22 UTC (Cycle 98)

## New since yesterday

- **[/dream/88-kids-hum-to-paint](https://getresonance.vercel.app/dream/88-kids-hum-to-paint)** — Hum to Paint (kids)
  Hum or sing into the mic — your voice paints glowing blobs on a dark canvas.
  Pitch → Y position (high voice = top) and color (warm reds at the low end, violet at the top).
  Loudness → blob size. After 30 s (or tap "Replay" once 5+ notes recorded), a white scan line
  sweeps the painting while your melody plays back. The painting IS the score.
  **Zero API · Zero deps · 2.96 kB**

- **[/dream/87-piano-transcript](https://getresonance.vercel.app/dream/87-piano-transcript)** — Piano Transcript (Cycle 97)
  Play your piano into the mic → live piano-roll canvas while you play.
  YIN pitch → scrolling C2–C7 score, phrase brackets, "Save PNG".

## Love signal

Karel loved `82-kids-color-piano` **and** `83-kids-tilt-rain` (votes API: both = 1).
The kids zone is working. Continuing every-other cycle.

## In progress / partial

- `72-paths-visualizer` — waiting on Welcome Home album recording IDs accessible without auth.
- `84-wave-fluid` (2 cycles) — WebGPU MLS-MPM ocean, 100k particles. Queued Cycle 101+.

## Up next

- **Cycle 99 (build)**: `89-marpi-void` — audio-reactive organic entity ecosystem
  (Marpi "New Nature" technique, zero API, zero deps, one cycle). High visual surprise.
- **Cycle 100 (kids)**: `kids-puddle-jumper` or `kids-character-band`.
  `puddle-jumper` (tap → ripple splash) is all-touch, no mic, perfect counterpoint to voice-heavy `88`.

## Research findings worth a look

- **LTX-2.3** (`fal-ai/ltx-2.3/text-to-video`, Jan 2026, $0.04/s) — single-call path for `86-sound-to-video`.
- **FLUX.2 Flash** (`fal-ai/flux-2/flash`, $0.005/MP) — upgrade from Schnell, same cost.
- **Seedance 2.0** (April 2026) — audio file → synced video, single API call.

## Open questions for Karel

- **[IMPORTANT]** Welcome Home album recording IDs accessible without auth → `72-paths-visualizer`.
- **Kids field test**: have you tried `82`, `83`, or `88` with an actual 4-year-old?
  Real-kid feedback would directly shape next kids prototypes. `88-kids-hum-to-paint` especially
  benefits from testing — mic sensitivity varies by device and room noise.
- **Piano Transcript mic gain**: if notes don't detect cleanly, move the mic closer or boost
  system input gain. A sensitivity slider is queued for a polish cycle.
- **Votes**: loved = `82-kids-color-piano`, `83-kids-tilt-rain`. Any others to love? Guides future picks.
