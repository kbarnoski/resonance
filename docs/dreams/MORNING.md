# Morning digest — last updated 2026-05-19 UTC (Cycle 33)

## New since yesterday

- **[/dream/29-scene-spatial](/dream/29-scene-spatial)** — Scene Spatial · Cycle 33
  Six Ghost narrative scenes as 3D HRTF spatial audio environments — no audio files, all
  synthesized. Stone Chamber (piano decay + stone percussion + low resonance), Root Portal
  (earth drone below + forest ahead), Underground Pool (water trickle right + cave below),
  Tiny Planet (wind dome + two birds above), Forest Dawn (canopy birds + stream left + piano
  right), Cosmic Ascension (harmonic pads swelling from silence). Drag colored dots to
  reposition sounds in real time. **Wear headphones — Forest Dawn is the clearest demo.**

## In progress / partial

- Nothing in progress. Next candidate: `32-mood-vis` (semantic visualizer — visual mode switches
  based on audio character: calm/energetic/complex, rule-based MIR, zero deps, one cycle).

## Recent prototype set

| Cycle | Prototype | One-line |
|-------|-----------|----------|
| 33 | **29-scene-spatial** (NEW) | Ghost scenes as 3D HRTF spatial audio — wear headphones |
| 32 | 28-chord-canvas | Play a chord → chord name + color in real time |
| 31 | (research) | Lyria RealTime, iOS WebGPU, Chord Colourizer, SonoWorld |
| 30 | 26-score-follow | Bach score lights up as you match notes on piano |
| 29 | 25-cellular | Conway's Life where cell columns = musical pitches |
| 28 | 24-piano-roll | Scrolling piano roll from mic — what you played, as notation |

## Research findings worth a look

From Cycle 31:
- **Lyria RealTime API** (Google DeepMind) — WebSocket streaming infinite music, live text
  prompt blending ("jazz piano" → "ambient drone"). Browser-callable with Gemini API key.
  Most live-performance-relevant AI music find yet. Prototype `30-lyria-jam` is queued.
  **Open question: do you have a Gemini API key to test this?**
- **iOS 26 / Safari 26** — WebGPU now universal on iPhone/iPad. All WebGPU prototypes
  (15-webgpu-fluid, 16-particle-life-gpu, future 27-gpu-additive) now run on Karel's phone.
- **gesture-music** (31) — webcam hand gestures → synthesis via MediaPipe WASM (~8MB CDN).
  **Open question: OK to load MediaPipe from jsDelivr CDN?**

## Open questions for Karel

1. Do you have a Gemini API key? Enables `30-lyria-jam` — infinite streaming AI music you can
   steer live ("jazz piano" at 1.5× + "ambient drone" at 0.5×, slider between them mid-set).
2. OK to load MediaPipe from CDN (~8MB)? Enables `31-gesture-music` — hand position →
   synth pitch, palm spread → reverb, curl → harmonics. No mic needed.
3. Which scene in `29-scene-spatial` do you want deepened? Candidates: Forest Dawn (most
   spatial clarity), Cosmic Ascension (most meditative), Stone Chamber (most tactile).
