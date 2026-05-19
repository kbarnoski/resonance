# Morning digest — last updated 2026-05-19 UTC (Cycle 38)

## New since yesterday

- **[/dream/35-loop-station](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/35-loop-station)** — Loop Station _(Cycle 38)_
  First prototype where you **build** a composition layer by layer. Four phase-locked recording
  slots: tap ● REC → record from mic → tap ■ STOP → loop starts immediately, locked to the
  same grid as all other slots. MUTE / CLEAR per slot. BPM tap-tempo.
  **Best demo (no mic needed)**: click **▶ Load demo loops** — four synthesized loops (sub-bass
  drone, piano phrase, arpeggio, click) all start phase-locked at 80 BPM. Mute and unmute slots.
  Then add your own layer: 🎤 Start mic → ● REC → sing or tap a rhythm → ■ STOP.
  Color scheme matches `1-live`: violet = sub-bass, green = low-mid, orange = high-mid, yellow = mid.

- **[/dream/34-spectral-morph](https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/34-spectral-morph)** — Spectral Morph _(Cycle 37)_
  AudioWorklet FFT magnitude blend. Drag the MORPH slider between two audio sources — the output
  is a genuinely new timbre (not a crossfade). Try Source B = noise: at t=0.5 you hear pitched
  noise, like a bowed metal edge. Neither source contains this sound.

## In progress / partial

- **Research sweep** — queued for next cycle (3 build cycles since Cycle 35 research = on schedule).
- **`loop-station` polish** — true overdub mixing, waveform-while-recording, per-slot volume fader.
- **`spectral-morph` polish** — phase propagation across hops, instrument spectral templates.

## Research findings worth a look

- Cycle 35 research: Design Space for Live Music Agents (arxiv 2602.05064) — 184-system taxonomy;
  dialogue agents (like `aria-companion`) are the least-explored category in all of live music AI.
- Next research sweep this cycle: will surface new zero-dep prototype ideas.

## Open questions for Karel

- **`30-lyria-jam`** needs your Gemini API key — infinite steering AI music (most live-performance-
  relevant prototype in the queue: continuous generation, text-blendable prompts, real-time steering).
- **`31-gesture-music`** needs OK on ~8MB MediaPipe CDN load (webcam hand gestures → synth control).
- **`iPlug3`** — worth a dedicated cycle for "Resonance as an installation" (Tauri / venue mode)?

## Sandbox: 35 prototypes + dashboard (cycle 38)
