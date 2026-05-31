# 227-paths-granular — design notes

**For**: adult · Zero permissions (file upload) · Zero API · Zero deps · Pure Web Audio + Canvas

## What is this?

Upload any audio file (WAV, MP3, FLAC) and reshape it into a grain cloud. Scrub to any moment in the buffer; the engine scatters Hann-windowed fragments at configurable density, pitch-shifts each grain independently, and pans them in the stereo field. The result ranges from smooth frozen-chord textures to glitchy percussive clouds.

## Controls

| Slider | Range | Effect |
|--------|-------|--------|
| Scrub | 0–100% | Which moment in the buffer grains are drawn from |
| Grain size | 20–500 ms | Shorter = glitchy; longer = smoother/more recognizable |
| Density | 2–30/s | Grains per second; higher = denser cloud |
| Pitch | ±12 st | Semitone shift applied to every grain (1 octave range) |
| Scatter | 0–50% | How far grains stray from the scrub point |

## Audio architecture

- Each grain: `AudioBufferSourceNode` (playbackRate = 2^(pitch/12)) → `StereoPannerNode` (random ±0.4) → `GainNode` (Hann window: linear ramp up + exponential ramp down)
- Grain scheduling: lookahead at `ctx.currentTime + 0.1s` to prevent gaps
- Demo buffer: C major phrase + Am7 pad synthesized via `OfflineAudioContext` (no audio files needed on first load)

## What makes it unique

First granular synthesis prototype in the sandbox (227 prior prototypes use additive, FM, Karplus-Strong, or real-time mic analysis). Granular is the "texture sculptor" of synthesis: it can freeze time inside a recording, stretch a 500ms piano note into a 30-second pad, pitch-shift without changing tempo, and generate rich evolving clouds from a single instant.

## Musical sweet spots

- **Frozen pad**: grain 80–150 ms + density 8–15 → smooth, sustained texture
- **Glitch cloud**: grain 20–40 ms + density 25–30 → shimmery percussive scatter
- **Wide ambient**: scatter 40–50% + density 10 → evolving cloud that wanders across the buffer
- **Pitch freeze**: pitch +5 st + scatter 0 + grain 200 ms → frozen chord transposed up a fourth

## Resonance connection

Inspired by Karel's `163-paths-visualizer` ❤️ (his Welcome Home album visualized). Granular is the natural next step: not just visualizing Karel's piano recordings but reshaping their texture in real time. Try loading a Welcome Home WAV → scrub to a resonant sustain → grain 120 ms + density 12 + pitch +7 → instant dreamy suspended fifth pad.

## Polish ideas

- **Auto-load**: pull from `/api/audio/[id]` once Karel approves (no manual upload needed)
- **Freeze mode**: lock scrub position while scatter evolves autonomously over time
- **Envelope automation**: LFO on grain density (0.1 Hz) for slowly breathing textures
- **Record output**: capture grain cloud output back to a buffer via `OfflineAudioContext`
