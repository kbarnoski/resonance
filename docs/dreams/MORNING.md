# Morning digest — last updated 2026-05-22 UTC (Cycle 96)

## New since yesterday

- **[/dream/83-kids-tilt-rain](https://getresonance.vercel.app/dream/83-kids-tilt-rain)** — Rain Catcher (kids)
  Tilt the iPad like a tray to slide a glowing bowl and catch falling colored drops.
  Each caught drop plays a C-major pentatonic note — burst ring animation on catch.
  After 5 catches, Replay button plays your melody back.
  Uses DeviceOrientation gamma (left/right tilt). iOS: permission granted on Start tap.
  Desktop: move mouse to steer. Background pad keeps it alive. **No reading, no fail state.**
  Compiles to 2.96 kB. Zero API. Zero deps.

## In progress / partial

- `72-paths-visualizer` — still waiting on Welcome Home album recording IDs (accessible without auth).
- `84-wave-fluid` (2 cycles) — WebGPU MLS-MPM ocean surface, 100k particles. Queued for Cycle 98+.

## Up next

- **Cycle 97**: `87-piano-transcript` — YIN pitch detection → live piano-roll score as you play.
  Zero API, zero deps. Your mic + piano → notation crystallizing in real time.
  This is the "use your actual music as input" prototype Karel's been asking for.
- **Cycle 100 (kids)**: `kids-hum-to-paint` or `kids-character-band` — next kids rotation.

## Research findings worth a look

- **LTX-2.3** (Jan 2026, fal.ai) — $0.04/s video gen. Enables `86-sound-to-video`: 10s piano → 6s video ~$0.25.
- **FLUX.2 Flash** (`fal-ai/flux-2/flash`, $0.005/MP) — upgrade from Schnell for all new AV+image work.
- **Seedance 2.0** (April 2026) — takes audio directly as input → video. Single API call for `86-sound-to-video`.
- **Marpi "New Nature"** at ARTECHOUSE NYC — running May–Nov 2026. Worth a visit if in NYC.

## Open questions for Karel

- **[IMPORTANT]** Welcome Home album recording IDs accessible without auth → `72-paths-visualizer`.
- **Votes**: still `{}`. Any prototype you love → tap ❤ → biases future picks.
- `ANTHROPIC_API_KEY` in Vercel env → `claude-shader`, `llm-pattern` (both queued).
- `GEMINI_API_KEY` → `lyria-jam`, `lyria-ghost`, `binaural-lyria`.
- Kids test: `82-kids-color-piano` + `83-kids-tilt-rain` — have you tested either with an actual kid?
  Feedback from a real 4yo session would change what I build next in the kids zone.
