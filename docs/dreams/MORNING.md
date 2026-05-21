# Morning digest — last updated 2026-05-21 UTC (Cycle 93)

## New since yesterday

- **[/dream/78-node-synth](/dream/78-node-synth)** (Cycle 93) — **Node Synth.**
  The Web Audio API as a visual patch bay. Oscillators, gain stages, filters (5 types), and delay
  appear as draggable node cards. Draw bezier wire connections between output/input ports — audio
  flows in real time. Starter patch: Oscillator → Gain → Speakers plays immediately on ▶ Start.
  - **Try it**: add a Filter between Oscillator and Gain → sweep its frequency slider from 80 Hz
    to 18 kHz. Add a second Oscillator (different frequency) → wire both into the same Gain →
    hear the interval. Add Delay → wire it as a parallel wet path → set feedback to 0.6 for echo.
  - 83 prototypes; this is the first to make the audio graph itself the UI.
  Zero deps · Zero API · 4.67 kB.

- **[/dream/82-kids-color-piano](/dream/82-kids-color-piano)** (Cycle 92) — **Color Piano (kids).**
  Eight pentatonic circles — tap, hold, or drag for a glissando. No wrong notes. No text. No fail state.
  - **Try it**: hand your phone to a 4-year-old. Or drag two fingers at once across circles.

- **[/dream/74-touchdesigner-feedback](/dream/74-touchdesigner-feedback)** (Cycle 91) — **TD Feedback.**
  WebGPU ping-pong texture feedback (TD TOP port). Best: ROTATION −10‰ → collapsing black hole.

## In progress / partial

- Nothing blocked or in progress.
- **Next build (Cycle 94)**: `83-fm-explorer` (2-operator FM synthesis — DX7 timbres, zero deps) OR
  `paths-visualizer` if Karel confirms accessible recording IDs (see open questions below).
- **Next kids (Cycle 96)**: `kids-tilt-rain` or `kids-hum-to-paint`.
- **Next research (Cycle 95)**: due in 2 cycles.

## Research findings worth a look

- **FM synthesis gap** — 83 prototypes, none have done FM synthesis. 3 Web Audio nodes (carrier +
  modulator oscillators + modulation index gain) = the entire Yamaha DX7 palette (electric piano,
  bell, metallic clangs, bass plucks). High surprise, zero cost.
- **CassetteAI (§157)** — 30s music in ~2s, 10× faster than ACE-Step. FAL_KEY in use. `cassette-speed` queued.
- **TouchDesigner** patterns still rich: Horikawa-style VEX particle flock (`75-houdini-particle-flock`),
  Bileam Tschepe multi-buffer N-frame delay (feedback with configurable history depth).

## Open questions for Karel

- **[IMPORTANT — paths-visualizer]** To build a prototype that plays your Welcome Home album tracks,
  I need to know which recording IDs are accessible without authentication — either `is_featured=true`
  or with a `share_token`. If you can share 3–5 IDs (or mark them featured), the next cycle can build
  a beautiful visualizer of your actual piano music.
- **Votes**: love signal returned `{}` — no loves recorded yet. Tap ❤ on any prototype to bias the queue!
- `ANTHROPIC_API_KEY` in Vercel env → enables `claude-shader` (LLM-generated audio-reactive GLSL)
- `GEMINI_API_KEY` → `lyria-jam`, `lyria-ghost`, `binaural-lyria` (all queued and waiting)
- `browser-stems` (~200MB ONNX CDN dep OK? Cached after first load, stays on device.)
