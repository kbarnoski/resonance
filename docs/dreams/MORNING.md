# Morning digest — last updated 2026-05-27 UTC (Cycle 213)

## New since yesterday

- **Research sweep (Cycle 213)** — 7 new findings, 3 new prototype specs seeded
  No new prototype deployed this cycle (research sweep). Key discoveries below.

- **[/dream/181-kids-texture-drum](https://getresonance.vercel.app/dream/181-kids-texture-drum)** — Texture Drum (kids, Cycle 212)
  Five material zones: Wood · Metal · Water · Earth · Glass. Each zone has a distinct synthesized
  timbre. Tap any zone to hear. Hold to roll. Two fingers → accent + full-screen flash.
  **First kids prototype about timbre, not pitch.** All prior kids builds use C-major pentatonic;
  this asks: what does material sound like?

- **[/dream/180-cellular](https://getresonance.vercel.app/dream/180-cellular)** — Cellular (adult, Cycle 211)
  Conway Life on a 64×16 grid; columns are pitches (C2→C5). Try Glider, Pulsar, R-pentomino.
  First autonomous music prototype — patterns evolve, not react.

## Research findings worth a look

Three prototype seeds from this cycle are particularly strong:

**`ritual-generate`** (§228) — inspired by a ICMC 2026 paper connecting I-Ching coin-casting
to AI music generation. Six virtual coin throws → hexagram → Lyria 3 Pro generates a 30s
ambient piece matched to the hexagram's theme. The ritual ACT is the music trigger — no text
prompt, no mic. Needs GEMINI_API_KEY. Most surprising idea in the queue.

**`piano-motion`** (§229) — load one of your Welcome Home tracks via `/api/audio/[id]`,
extract notes, and animate cartoon piano hands on a top-down keyboard. Fingers glide to
the right keys, press at onsets, chord notes light up together. First prototype showing
the ACT of playing rather than the sound. Zero deps, zero API.

**`camera-compose`** (§231) — webcam snapshot → Gemini Flash vision (describe scene) →
Lyria 3 Pro ambient track. "Take a photo. Hear its music." 30s ambient piece plays through
the live-bloom visualizer. Needs GEMINI_API_KEY. First prototype where the camera is
the instrument.

**Lyria 3 Pro** is now live on fal.ai (`fal-ai/lyria3/pro`) — upgrades all four queued
Lyria-based prototypes (`lyria-ghost`, `binaural-lyria`, `piano-to-ghost`, `lyria-jam`).

**Stable Audio 3** (arxiv 2605.17991) — Stability AI released small+medium weights publicly.
Runs in a few seconds on MacBook M4. When it appears on fal.ai, upgrade `43-stable-extend`.

**Mirelo SFX 1.6** now has `extend-audio` and `inpaint-audio` endpoints — enables `41-mirelo-ghost-loop`
to create 60s seamless Ghost soundscapes and selective audio regeneration.

## In progress / partial

- Nothing in-progress.

## Open questions for Karel

- **`gesture-music`**: still needs your OK on ~8MB MediaPipe WASM CDN dep (jsDelivr).
  Webcam hands → pitch/reverb control. Could answer with a simple yes/no.

- **`piano-motion`**: can use your actual Welcome Home tracks via `/api/audio/[id]`.
  Would need to confirm which track IDs to embed as the picker options. Want me to build
  this with a hardcoded Bach fallback first, or do you want to specify the track IDs?

- **`ritual-generate`**: six coin throws is the interaction. Should each hexagram just
  pick a fixed ambient prompt, or do you want Gemini to also write the prompt text
  live (adds one LLM call per generation)? Simpler = faster = better demo.
