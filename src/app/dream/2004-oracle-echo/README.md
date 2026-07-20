# 2004 · Oracle Echo

**What if Resonance could HEAR the room speak and answer in an evolving field of light and tone — running TWO real machine-learning models chained together, entirely in the browser, for $0?**

This is the lab's first real two-model, in-browser AI pipeline. Live microphone audio is transcribed, the transcript is scored for sentiment, and the sentiment becomes a living score of light and tone. No server, no API key, nothing added to the build — both models are fetched and run client-side.

## The chain (two ML models in series)

Both via **Transformers.js v4**, dynamic-imported from a CDN ESM URL at runtime (`/* webpackIgnore: true */ /* turbopackIgnore: true */`, variable specifier so nothing is bundled and `package.json` is never touched).

1. **Model 1 — ASR.** `pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en')` (falls back to `onnx-community/whisper-tiny.en`). A ~4 s rolling window of mic PCM is resampled to 16 kHz and transcribed every ~3.5 s.
2. **Model 2 — sentiment.** `pipeline('text-classification', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english')`. POSITIVE/NEGATIVE + confidence maps to a musical **valence** (`0.5 ± score/2`). Word rate and live loudness drive **arousal**.

Inference runs on the single WASM/WebGPU backend behind a `busy` guard so windows never overlap. Whisper's silence hallucinations ("thank you", "you", …) are filtered out so the oracle stays quiet in a quiet room.

## Cross-modal mapping

- **Valence → color + harmony.** The particle field warms to amber (positive) or cools to slate (negative). The harmony is a plain tempered chord (root + fifth + octave) that crossfades a **minor third against a major third** by valence — a smooth, in-tune major↔dark morph. (Deliberately *not* a just-intonation partial stack over a drone.)
- **Arousal → motion + tempo + register.** Quickens the flow field, enlarges the motes, opens the pad filter, lifts an octave shimmer, and speeds a soft arpeggio (silent when calm).
- **Level → brightness pulse + gain swell.**
- Each transcribed word appears as **luminous text** that drifts, fades, and **dissolves into a burst of motes** carrying its sentiment color.

## Output substrate

The visual field is a CPU-advected particle/flow field rendered in **WebGL2** — an additive point cloud with feedback trails (`preserveDrawingBuffer` + a per-frame fade veil). This is not WebGPU; WebGPU may only be used under the hood by Transformers.js for inference.

## Robust fallback (always makes sound + light)

Layered graceful degradation, with an honest on-brand status line:

- **Full path** — mic + models load → `listening · whisper-tiny + distilbert loaded`.
- **Spectral fallback** — mic granted but models unavailable (no network / no WASM / WebGPU) → Web-Audio FFT features: spectral **centroid → brightness/valence**, **RMS → arousal/tempo**. Status: `fallback: spectral features`. (The words shown here are the oracle's own ambient murmurs, never a transcript.)
- **Demo mode** — no microphone at all → a gentle self-playing ambient drive (slow noise) moves the same field and harmony. Status: `demo mode`.
- **No WebGL2** → the identical particle simulation renders on a 2D canvas (`lighter` compositing). Sound and the sentiment chain are unaffected.

The field renders from mount, so there are visuals before you even press Start; audio begins on the Start gesture (autoplay policy).

## Named references

- Memo Akten, *Learning to See* — real-time ML re-seeing the world as an evolving generative image.
- The Transformers.js v4 in-browser-ML release (2026), which makes a two-model chain like this feasible at $0.

## Tags

`INPUT` mic speech · `OUTPUT` WebGL2 particle/flow field · `TECHNIQUE` 2-model ML chain (ASR → sentiment) → cross-modal harmony · `PALETTE` sentiment-driven (warm for positive, cool-slate for negative)

## Files

- `page.tsx` — UI, lifecycle, the single rAF loop, path/state machine, word overlay, design-notes overlay.
- `gl.ts` — the shared `ParticleSim` plus WebGL2 and Canvas2D renderers (`createField`).
- `audio.ts` — `OracleAudio` (the tempered morphing harmony + arpeggio) and `MicInput` (spectral features + PCM ring buffer + 16 kHz resample).
- `ml.ts` — `OracleML`, the runtime Transformers.js two-model chain and transcript hygiene.
