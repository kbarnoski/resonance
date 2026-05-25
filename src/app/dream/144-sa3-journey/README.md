# SA3 Journey — design notes

**Route**: `/dream/144-sa3-journey`  
**Cycle**: 171 (adult build)  
**Status**: `demoable`

## What it answers

"What if Karel could hear a full 6-minute ambient journey score for each Resonance theme in under 2 minutes — or continue his own piano recording for 4 minutes?"

## The gap it fills

Every prior generation prototype (6-compose, 43-stable-extend, 44-vocal-bgm, 126-arc-steer, 129-lyria3-journey, 138-lmdm-echo) caps out at 30–90 seconds. Stable Audio 3 Large (Stability AI, released May 20, 2026) generates up to **6+ minutes** of coherent audio in a single pass. That's enough for a full Resonance journey phase — not a sketch.

Mode B (causal continuation) also directly addresses Karel's directive: "let his existing music be the input." Record 5–30 s of piano; SA3 uses it as a prefix and extends the musical logic for 2–6 minutes.

## Two modes

**Mode A — Write Journey**: Pick one of 8 Resonance journey themes (Cosmic Homecoming, Earth Grounding, Inner Sanctuary, Ocean Breath, Snowflake, Ghost, Inner Fire, Mycelium Dream). Each pre-fills a descriptive text prompt. Edit freely. Pick 2/4/6 min target duration. Hit Generate. SA3 runs on fal.ai and returns a WAV.

**Mode B — Extend Your Playing**: Record 5–30 s of piano via mic. SA3 treats the recording as the causal prefix and generates a continuation of the selected duration. Original recording (amber waveform) + AI continuation (blue waveform) play back sequentially.

## SA3 endpoint

`fal-ai/stable-audio-3` — the route tries this endpoint and surfaces a clear error if it's not yet live. SA3 Large was released May 20, 2026; fal.ai partner access may be rolling out. Fallback: Karel can use SA3 Medium via HuggingFace Inference API with a minor route change.

## Build notes

- API route handles both modes from a single `/api` endpoint: FormData = Mode B (audio upload), JSON = Mode A (text-to-audio).
- Bloom visualizer: same 6-band radial gradient approach as `1-live` and `43-stable-extend`.
- Waveform: peak-downsampled bars. Mode B shows original (amber) | AI (blue) split with a white divider.
- Duration picker: 2/4/6 min (120/240/360 seconds). SA3 generation time scales roughly linearly: expect 1–3 min wall time for 6-min output.
- `export const maxDuration = 300` on the route (Vercel function timeout).

## Polish ideas for future cycles

- Live generation progress via fal.ai streaming status (progress %)
- Waveform playhead animation during playback
- Multiple SA3 preset seeds shown simultaneously (like 129-lyria3-journey's scene grid)
- Download as MP3 (currently WAV — transcode client-side via AudioContext)
- Automatically queue the next phase after the first completes (6-phase arc like 126-arc-steer but with SA3 audio)
