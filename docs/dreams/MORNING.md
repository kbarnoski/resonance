# Morning digest — last updated 2026-05-19 UTC (Cycle 32)

## New since yesterday

- **[/dream/28-chord-canvas](/dream/28-chord-canvas)** — Chord Canvas (Cycle 32)
  Play piano → chord name appears in huge text: "Dm", "G", "C". Hue = root note.
  Scrolling timeline strip = your chord history as colored blocks. 12-bar chromagram shows
  pitch-class energy. Demo ii–V–I plays audible chords while you watch detection.
  First prototype to explicitly name musical structure. Zero deps, pure FFT + template matching.
  **Open this one first.**

## In progress / partial

- Nothing in-progress. Cycle 32 was a full one-cycle build.

## Research findings worth a look

- **Lyria RealTime API** (Cycle 31 §37) — WebSocket streaming infinite AI music from Google.
  Live text prompt blending: fade "jazz piano" toward "ambient drone" mid-performance.
  Browser-callable with a Gemini API key. Most live-performance-relevant AI music tool yet.
  → `30-lyria-jam` queued. **Do you have a Gemini API key to test this?**

- **iOS 26 / Safari 26** (Cycle 31 §38) — WebGPU now ships on iPhone/iPad. No more
  "requires desktop browser" disclaimers on `15-webgpu-fluid`, `16-particle-life-gpu`, etc.

- **Chord Colourizer paper** (Cycle 31 §42) — CQT chroma → chord name + color; confirms
  the approach used in `28-chord-canvas` has academic precedent.

## Open questions for Karel

1. **Gemini API key?** — `30-lyria-jam` (live-steerable AI music via WebSocket) needs it.
   This is the most live-performance-relevant AI prototype in the queue. Would unlock
   continuous streaming music that responds to prompt changes in ~2 seconds.

2. **MediaPipe CDN dep OK?** — `31-gesture-music` (webcam hand gestures → synth) needs
   ~8MB one-time WASM download from jsDelivr CDN. OK to load from external CDN in the
   dream sandbox?

3. **`28-chord-canvas` detection sensitivity** — with a real piano: does the chord show up
   reliably, or does room noise cause flickering? The threshold (CONF_MIN=0.60) was set
   analytically; might need tuning for your recording environment. A sensitivity slider
   is the obvious first polish step.

## Queue status

- **29-scene-spatial** — next build: Ghost preset scenes as HRTF spatial audio environments.
  Stone chamber = near-field piano reverb. Cosmic = vast reverberant pad. Zero deps. 1 cycle.
- **27-gpu-additive** — most ambitious: particles = Fourier partials, GPU physics = synthesizer.
  Probably needs 2 cycles.
- **28-chord-canvas polish** — dominant 7th templates (G7 shows as "G7"), key detection.
