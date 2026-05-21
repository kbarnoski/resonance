# Morning digest — last updated 2026-05-21 UTC (Cycle 94)

## New since yesterday

- **[/dream/79-fm-explorer](/dream/79-fm-explorer)** (Cycle 94) — **FM Explorer.**
  2-operator FM synthesis: one slider for C:M ratio, one for modulation index β. The Bessel sideband
  spectrum redraws in real time — mathematical, not FFT. Covers the entire DX7 palette.
  - **Try it first**: click **DX Piano** preset, then hold Space — classic Yamaha electric piano.
    Drag β to 8 — same note, now harsh FM bass. Watch the spectrum: at β=2.5 the carrier bar nearly
    disappears (J₀(2.5) ≈ 0.05), energy shifts to the 1st and 2nd sidebands.
  - **Mic mode**: speak or play piano near mic — bass energy (60–250 Hz) pushes β up to +14,
    making the timbre react live to your playing.
  - 6 presets: DX Piano, Bell, Reed, FM Bass, Metallic, Glass Harmonica.
  - Zero deps · Zero API · 5.29 kB.

- **[/dream/78-node-synth](/dream/78-node-synth)** (Cycle 93) — **Node Synth.**
  Web Audio API as a visual patch bay. Draggable node cards, bezier wires, real-time audio.
  Zero deps · 4.67 kB.

## In progress / partial

- `72-paths-visualizer` — waiting on Karel's Welcome Home album recording IDs.
- **Next kids (Cycle 96)**: `kids-tilt-rain` or `kids-hum-to-paint`.
- **Next research (Cycle 95)**: room acoustics (image-source reverb IRs) or Houdini particle flock.

## Research findings worth a look

- **FM synthesis** — now filled (Cycle 94). 3 Web Audio nodes = Yamaha DX7 palette.
- **CassetteAI (§157)** — 30s music in ~2s, 10× faster than ACE-Step. FAL_KEY in use. `cassette-speed` queued.
- **TouchDesigner** patterns still rich: Horikawa-style VEX particle flock, Bileam multi-buffer N-frame delay.

## Open questions for Karel

- **[IMPORTANT — paths-visualizer]** Need Welcome Home album recording IDs accessible without auth
  (either `is_featured=true` or a `share_token`). 3–5 IDs → beautiful piano music visualizer next cycle.
- **Votes**: love signal returned `{}` — no loves recorded yet. Tap ❤ on any prototype to bias the queue!
- `ANTHROPIC_API_KEY` in Vercel env → enables `claude-shader` (LLM-generated audio-reactive GLSL)
- `GEMINI_API_KEY` → `lyria-jam`, `lyria-ghost`, `binaural-lyria` (all queued and waiting)
- `browser-stems` (~200MB ONNX CDN dep OK? Cached after first load, stays on device.)
