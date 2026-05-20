# stable-extend — design notes

**Question**: What if your piano phrase could keep going?

## What it does

Record up to 30 seconds of piano (or any audio) via mic. Press "Extend →". Stable Audio 2.5 on
fal.ai receives your recording and produces a seamless 30-second continuation in the same style
and mood. The original recording + AI extension play back through the live-bloom radial visualizer.

The waveform strip shows both clips side by side: **amber** = your recording (left), **blue** = AI
extension (right).

## Architecture

```
mic → MediaRecorder (webm/opus) → Blob
       ↓
POST /dream/43-stable-extend/api
       ↓
fal.storage.upload(blob) → inputUrl
       ↓
fal.subscribe("fal-ai/stable-audio-25/inpaint", {
  audio_url: inputUrl,
  prompt: "...",
  seconds_total: 45,
  cfg_scale: 7.0,
  steps: 100,
}) → { audio: { url } }
       ↓
fetch(url) → ArrayBuffer → AudioContext.decodeAudioData → play via AudioBufferSourceNode + AnalyserNode
       ↓
six-band radial bloom (same as 1-live)
```

## Stable Audio 2.5

Stability AI released Stable Audio 2.5 as open source in 2026. It generates 44.1kHz stereo audio
at up to ~4 minutes. The inpaint/continuation mode takes an existing audio clip as a prefix and
extends it seamlessly — the model's latent representation of the input audio anchors the style.
The result sounds like the same recording continued by the same (or a related) instrument.

This is different from:
- **6-compose**: generates from a text prompt only (no audio input)
- **14-reference-compose**: style-matches a phrase via MiniMax Music 2.5 (text-based style transfer)
- **stable-extend**: continues YOUR actual audio directly in the latent space

## Server route

`src/app/dream/43-stable-extend/api/route.ts` is a Next.js Route Handler within the dream zone
scope fence. It uses `process.env.FAL_KEY` server-side — the key is never exposed to the browser.

⚠ **Note on endpoint**: The fal.ai endpoint `fal-ai/stable-audio-25/inpaint` and its parameter
names (`audio_url`, `seconds_total`, `cfg_scale`, `steps`) were sourced from RESEARCH.md §70 and
the fal.ai explore page. If the endpoint returns an error, the UI displays the raw error message —
check the error text to diagnose parameter naming and adjust `route.ts` accordingly.

## Cost

~$0.20/generation (Stable Audio 2.5 on fal.ai). FAL_KEY is already in use by the production
Ghost LoRA image generation. No additional API key required.

## Polish ideas

1. **Show both clips as separate playable sections** — playhead that highlights which portion is
   "yours" vs "AI" during playback.
2. **Download button** — save the extended audio as a WAV.
3. **Continuation chain** — take the generated audio and feed it back as the next recording,
   building a multi-minute AI-extended piece in steps.
4. **Style presets** — quick-select buttons: "cello duet", "jazz trio", "orchestral", "ambient drone".
5. **Fal.ai streaming** — if the API supports incremental audio output, show the waveform growing
   as the generation arrives rather than waiting for the full result.
