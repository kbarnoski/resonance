# Morning digest — last updated 2026-05-19 UTC (Cycle 34)

## New since yesterday

- **[/dream/32-mood-vis](/dream/32-mood-vis)** — Mood Viz · Cycle 34
  A visualizer that listens. Audio features (energy, spectral brightness, band spread) drive a
  rule-based classifier that picks one of **six visual modes** automatically — and switches between
  them as the music changes character. Demo cycles through all six modes at 5-second intervals so
  you can see each one without a mic. **"The viz adapts to what you're playing."**

  Mode → aesthetic mapping:
  - **minimal** (silence) → Lissajous curve (2:3 ratio, slow rotation)
  - **calm · bright** (soft + high centroid) → Ink rings (expanding cyan circles from center)
  - **calm · dark** (soft + low centroid) → Orbital drift (110 violet particles in elliptical orbits)
  - **energetic · bright** (loud + high centroid) → Radial bloom (72 frequency spokes, warm spectrum)
  - **energetic · dark** (loud + low centroid) → Pulse field (bass rings + vertical bars, deep red)
  - **complex** (spectrally irregular) → Spectral mandala (6 rotating arms, one per band, additive)

  The transition between modes is natural — 7% canvas fade per frame means old visuals evaporate
  in ~1s while new ones grow in. No crossfade code needed; the physics do it.

  Best demo path: click Demo → watch minimal → ink rings → orbital drift → radial bloom → pulse
  field → spectral mandala, each 5 seconds. Then try mic: play a bass note (calm_dark), switch to
  high chords (calm_bright or energetic_bright), bang something percussive (complex or energetic_dark).
  The HUD shows current mood + features (amplitude, centroid, spread) so you can see what's driving
  each switch.

- **[/dream/29-scene-spatial](/dream/29-scene-spatial)** — Scene Spatial · Cycle 33
  Six Ghost narrative scenes as 3D HRTF spatial audio environments — no audio files, all
  synthesized. **Wear headphones — Forest Dawn is the clearest demo** (canopy birds above, stream
  left, piano right — three distinct azimuths immediately obvious).

## In progress / partial

- Nothing in progress. Next candidates (pick from IDEAS.md queue):
  - `27-gpu-additive` — particles = Fourier partials, GPU physics = synthesizer (2 cycles, WebGPU)
  - `30-lyria-jam` — infinite AI music via Lyria RealTime (needs Gemini API key)
  - `31-gesture-music` — webcam hand gestures → synthesis (needs MediaPipe CDN approval)

## Recent prototype set

| Cycle | Prototype | One-line |
|-------|-----------|----------|
| 34 | **32-mood-vis** (NEW) | Audio character → visual mode: 6 moods × 6 aesthetics |
| 33 | 29-scene-spatial | Ghost scenes as 3D HRTF spatial audio — wear headphones |
| 32 | 28-chord-canvas | Play a chord → chord name + color in real time |
| 31 | (research) | Lyria RealTime, iOS WebGPU, Chord Colourizer, SonoWorld |
| 30 | 26-score-follow | Bach score lights up as you match notes on piano |
| 29 | 25-cellular | Conway's Life where cell columns = musical pitches |

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
3. Which scene in `29-scene-spatial` do you want deepened? Forest Dawn (most spatial clarity),
   Cosmic Ascension (most meditative), Stone Chamber (most tactile).
4. `32-mood-vis` classifier thresholds — do the 6 moods feel right from your piano? If
   certain chords or passages are misfiling, I can tune amplitude/centroid thresholds.
