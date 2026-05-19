# Morning digest — last updated 2026-05-19 UTC (Cycle 31)

## New since yesterday

- **Cycle 31 was a research sweep** (no new prototype built).
  7 new RESEARCH.md entries, 5 new IDEAS.md prototype specs. Short version below.

- **[/dream/26-score-follow](/dream/26-score-follow)** — still the newest demoable prototype (Cycle 30).
  Bach Invention No.1 piano roll — play along and the score lights green as you match each note.
  Demo mode self-matches all 35 notes perfectly. **Still worth opening if you haven't yet.**

## Research highlights (Cycle 31)

### 🔑 Lyria RealTime API — most significant find this cycle
Google DeepMind's streaming infinite music API. Connect via WebSocket with your Gemini API key.
Prompt: "jazz piano" weight 1.5 + "ambient drone" weight 0.5. Slide weights live — music morphs
within ~2 seconds. BPM/density/brightness/key controls. Generated 48kHz stereo, forever.

Prototype `30-lyria-jam` is specced and ready to build — **it just needs your Gemini API key**.
All other AI music prototypes generated a fixed clip; this one *never stops and responds live*.
Client-side only (key stored in sessionStorage). Admin-gated. Budget: Gemini API free tier quota.

**Open question: Do you have a Gemini API key to test this with?**

### 📱 iOS 26 / Safari 26 — WebGPU on your phone, finally
WebGPU ships in Safari 26 (iOS 26, iPadOS 26). Your iPhone can now run:
- `/dream/15-webgpu-fluid` (512×512 Navier-Stokes)
- `/dream/16-particle-life-gpu` (9,000 GPU particles)
- upcoming `27-gpu-additive`

No more "requires WebGPU — may not work on mobile" disclaimer. Worth testing on your phone today.

### 🎹 `28-chord-canvas` — next build target
Real-time chroma analysis → chord name in large type + scrolling color timeline. "F♯m", "C", "Bdim"
as you play. Zero deps, one cycle. First prototype to name musical structure, not just visualize signal.

### 🌐 `29-scene-spatial` — Ghost scene acoustic identities
Hand-authored 3D HRTF audio for each Ghost preset (stone chamber = dry reverb + percussion from above,
cosmic = vast pad from all around). Extends `7-spatial`'s HRTF. Zero deps, one cycle. Wear headphones.

### 🤌 `31-gesture-music` — conduct with your hands
Webcam → MediaPipe hand landmarks → synthesizer (hand Y = pitch, spread = reverb, curl = harmonics).
30ms latency. No mic. Needs ~8MB MediaPipe WASM from CDN.
**Open question: OK to load MediaPipe from CDN (~8MB)?**

### 🎭 `32-mood-vis` — a visualizer that listens
Rule-based audio feature classifier (centroid/ZCR/tempo/tonal clarity) → 6 mood buckets → visual
mode switches (fluid for calm, particles for energetic, tiles for complex). Zero deps, one cycle.

## In progress / partial

- All 26 prototypes are `demoable`. Nothing half-built.

## Open questions for Karel

1. **Gemini API key** — `30-lyria-jam` (infinite streaming AI music) is ready to build. Needs key.
2. **MediaPipe CDN dep** — `31-gesture-music`. 8MB WASM load on first visit. Worth it?
3. **`elevenlabs-compose`** — ~$0.40–1.13/generation for structured arc music. Still greenlight?
4. **`ghost-animate`** — Veo 3.1 Fast is now $0.15/sec with audio (~$0.75/clip). HappyHorse still
   leads benchmarks. Kling 3.0 for multi-shot arc ($1–2/arc). FAL_KEY + budget needed.
5. **Cellular MIDI out** — Web MIDI `.send()` per Conway tick. One function. Say the word.

## Preview URL

https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/
