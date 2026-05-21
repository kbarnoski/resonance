# Morning digest — last updated 2026-05-21 UTC (Cycle 92)

## New since yesterday

- **[/dream/82-kids-color-piano](/dream/82-kids-color-piano)** (Cycle 92) — **Color Piano (kids).**
  First kids prototype. Eight pentatonic circles fill the screen — tap any to play a note, hold to
  sustain, drag across circles for a glissando, two fingers for a chord. C-major pentatonic (no wrong
  notes). Each circle has its own saturated color (red → orange → yellow → teal → blue → purple →
  deep orange → cyan). A soft C-major pad plays continuously from first touch so the screen never
  feels silent. No text. No score. No fail state. Zero deps · Zero API.
  - **Try it**: open on your phone, touch two circles at once. Drag slowly from the red circle
    through yellow to cyan — you'll hear a slow glissando. Hand it to a 4-year-old.

- **[/dream/74-touchdesigner-feedback](/dream/74-touchdesigner-feedback)** (Cycle 91) — **TD Feedback.**
  TouchDesigner's TOP feedback loop, ported to WebGPU. Two ping-pong render textures feed into
  themselves each frame (rotate + zoom + hue shift + decay + audio bloom). Infinite self-similar
  pattern evolution from a black screen. Four sliders. WebGPU required. Zero deps · Zero API.
  - **Best interaction**: pull ROTATION to −10‰ while zoomed in → collapsing black hole effect.

- **[/dream/71-shader-evolve](/dream/71-shader-evolve)** (Cycle 89) — 2×2 WebGPU grid of mutated
  audio-reactive WGSL shaders. Select → ↻ EVOLVE → breed. ★ SAVE to gallery. ✎ EDIT raw WGSL.

## In progress / partial

- Nothing blocked or in progress.
- **Kids queue next**: `kids-tilt-rain` (tilt iPad = rain basket game, notes from caught drops),
  `kids-hum-to-paint` (hum pitch → colored brush stroke on canvas). Both queued in KIDS.md.

## Research findings worth a look

- **FM synthesis gap** — 72+ prototypes, none have done FM synthesis. 3 Web Audio nodes = the
  entire Yamaha DX7 palette (electric piano, bell, metallic). `79-fm-explorer` queued.
- **CassetteAI (§157)** — 30s music in ~2s, 10× faster than ACE-Step. `81-cassette-speed` queued.
- **TouchDesigner pattern next**: Junichiro Horikawa-style VEX particle flock (`75-houdini-particle-flock`)
  or Bileam Tschepe multi-buffer N-frame delay feedback.

## Open questions for Karel

- **[KIDS]** Try `/dream/82-kids-color-piano` on your phone or iPad — does it feel right for a
  4-year-old? Key question: is the circle size large enough? Should it be landscape-only?
- **Votes**: love signal returned `{}`. Which prototypes are your favorites so far?
- `ANTHROPIC_API_KEY` in Vercel env → enables `claude-shader` and `llm-pattern`
- `GEMINI_API_KEY` → `lyria-jam`, `lyria-ghost`, `binaural-lyria` (queued and waiting)
- `72-paths-visualizer` uses your actual Welcome Home album tracks via `/api/audio/[id]`. Auth needed?
- `browser-stems` (~200MB ONNX CDN dep): OK to build? Audio stays on device, cached after first load.
