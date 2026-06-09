# Latent Listening Room (441)

## The question it answers

**What if a piece of music could continuously *dream a picture of itself* — an AI image that is regenerated every few seconds, shaped by the music's changing spectral character, and whose returning colors then bend the music back?**

This is an AI-image-generation-inside-an-audio-visual-experience piece. The image responds to and shapes the audio; it is not a standalone image-generation tool. It rides the aesthetic of `323-latent-condensation`.

---

## How the audio → prompt → image → audio loop works

### 1. Audio (Web Audio API, fully synthesized)

On "Begin", a generative ambient/cinematic pad + arpeggio starts using Web Audio API oscillators — no mic, no file upload. The synth runs a chord progression of 8 chords in expressive 12-TET equal temperament (NOT just-intonation), cycling every 15–25 s:

- **Pads:** detuned sawtooth + triangle + sine stacks per chord tone, with quick cross-fades on chord change.
- **Arpeggio:** plucked sine notes walking chord tones, with slight interval jitter for organic feel.
- **LFO:** slow ~0.05 Hz filter modulation.
- **Signal chain:** Oscillators → gain → preFx → [dry → masterGain] + [reverb → reverbWet → masterGain] + [shimmer highpass → masterGain] → master lowpass → DynamicsCompressor limiter → AnalyserNode → destination.

The `AnalyserNode` (FFT 2048, smoothing 0.72) is read each animation frame to extract:
- **Energy/RMS:** mean square energy across 8 log-spaced bands (20 Hz – 20 kHz).
- **Spectral centroid:** frequency-weighted mean normalised 0–1 against 5 kHz.
- **Dominant pitch-class:** simplified chromagram — MIDI pitch-class accumulated from FFT bins 80–4000 Hz.

### 2. Spectral → prompt mapping

Every ~6 seconds (±random jitter) a text prompt is built from the live spectral state:

| Spectral value | Prompt dimension |
|---|---|
| Centroid < 0.25 | "deep indigo and midnight violet, subterranean shadow" |
| Centroid 0.25–0.45 | "cool cerulean and slate-blue, dim luminescence" |
| Centroid 0.45–0.65 | "warm amber-gold and dusty rose, soft interior glow" |
| Centroid > 0.65 | "luminous gold and pale aureate, blazing radiance" |
| Energy < 0.12 | "ethereal sparse mist, barely-there vapour threads" |
| Energy 0.12–0.28 | "drifting haze, slow cloud tendrils" |
| Energy 0.28–0.5 | "layered volumetric fog, swelling turbulent mass" |
| Energy > 0.5 | "swirling turbulence, dense chromatic storm" |
| Pitch-class | hue accent (A=blue-grey … G=gold-green) |

A fixed base style is appended: `"abstract volumetric light, latent dreamscape, soft caustics, Refik-Anadol-like data-pigment, cinematic, 4k"`.

The current prompt is shown in small monospace text in the lower-left corner as it changes.

### 3. AI image pipeline (FAL flux/schnell)

The prompt POSTs to `/dream/441-latent-listening-room/api` (a Next.js Route Handler). The route:
1. Runs the shared `guard()` (origin check + per-IP rate limit 8/min, 40/day).
2. Returns `501` if `FAL_KEY` is absent.
3. Otherwise calls `fal-ai/flux/schnell` via `fal.subscribe` (4 inference steps, `landscape_4_3`).
4. Returns `{ url }` on success.

On the client:
- Images are preloaded with `img.crossOrigin = "anonymous"`.
- Cross-faded over the previous image on the full-bleed `<canvas>` (~2.5 s fade).
- Ken-Burns drift: slow pan/zoom so the image always feels alive.
- **Pacing:** never more than 1 request in flight; minimum 7 s between requests (well within the guard's 8/min / 40/day limits).

### 4. Loop-back — the image shapes the audio

When a new image arrives, it is drawn into an 8×6 off-screen canvas and `getImageData` is called to extract average R/G/B. Three audio parameters are then bent via `linearRampToValueAtTime`:

| Image property | Audio effect |
|---|---|
| **Brightness** (0.299R + 0.587G + 0.114B) | Master lowpass cutoff: 1800 Hz (dark) → 6800 Hz (bright) |
| **Brightness** | Shimmer highpass gain: 0 → 0.15 (subtle sparkle layer) |
| **Warmth** (red–blue bias) + warm hue (< 60° or > 300°) | Reverb wet gain: 0.45 → 0.63 (longer tail on warm images) |

If `getImageData` throws (CORS taint), the loop-back is silently skipped — no crash.

### 5. Graceful degradation

With no `FAL_KEY` (or on any error: 501, 429, network failure, image load error), the prototype falls back to a **locally-synthesized canvas visual** built from the same spectral data:

- **Plasma layer:** pixel-wise sum-of-sines formula mapped to hue, upscaled from a low-res off-screen canvas. Hue, saturation, and lightness drift with centroid and energy.
- **Radial gradient blobs:** 3 slowly orbiting volumetric light blobs in pitch-class hues.
- **Particle flow field:** ~220 particles driven by a curl-like vector field from the plasma formula, with spawn rate and size tied to energy.
- **Ken-Burns drift** on the whole field layer.
- **Vignette** applied on top.

Status is shown as amber `"live image unavailable — showing synthesized field"` during fallback, emerald `"dreaming live"` when AI images are arriving.

---

## Named references

- **Refik Anadol** — *Unsupervised* (MoMA, 2022) and *Machine Hallucinations* series: AI trained on cultural datasets rendered as living latent-space pigment flows. The prompt explicitly invokes this aesthetic ("Refik-Anadol-like data-pigment").

- **Memo Akten** — *Learning to See* (2017, updated 2019): a neural network continuously re-describes live camera input in terms of things it has been trained on, creating a real-time feedback loop between input and hallucinated perception. Direct conceptual ancestor of the audio→image→audio feedback loop here.

- **Real-time latent diffusion as instrument** — the line from *Infinite Nature* (Liu et al., 2022) through *StreamDiffusion* (Kodaira et al., 2023) to **arXiv 2604.07612** (Apr 2026, *"Towards Real-Time Human–AI Musical Co-Performance: Accompaniment Generation with Latent Diffusion Models and MAX/MSP"* — Music2Latent space, consistency-distilled for ~real-time): treating latent diffusion as a co-performer that responds to and feeds back into live audio. This prototype borrows that *feedback-loop framing* (audio conditions a generative latent → output feeds back into the audio), realized browser-natively via FAL flux/schnell rather than a local diffusion model. NB: the paper is ~2 months old, so it is cited as research context, not as a <14-day ambition anchor.

---

## What is unverified in this sandbox

- **No FAL_KEY** — the AI image path has never executed end-to-end in this build environment. The fetch/response/crossfade/loop-back logic is present and follows the same pattern as `271-pigment-mosaic`, but is untested with a live key.
- **No real audio output in CI/build** — audio context requires a browser with a user gesture. The synth code is structurally correct but not runtime-verified in a headless environment.
- **CORS on FAL CDN images** — `crossOrigin = "anonymous"` is set; if the CDN does not send CORS headers, `getImageData` will throw and loop-back is silently skipped (the image still displays).
- **Rate-limit pacing** — the 7 s minimum between requests is approximate; under slow network conditions requests may arrive out of order (guarded by the `inFlightRef` single-request lock).
