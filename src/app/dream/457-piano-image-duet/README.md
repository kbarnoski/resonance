# Piano Image Duet (457)

**Cycle 3 of The Latent Piano Room spine.** A dreamed AI image that doesn't merely filter Karel's real piano (cycles 1–2 bent color → lowpass/reverb) but actively **re-composes** it: a glowing scan-line sweeps the image left→right, reading it as a spectral score. Each column's vertical brightness profile is sampled at 24 log-spaced Y positions and mapped to an additive partial bank — Y-position → frequency in the detected key, brightness → amplitude — producing a shimmer/choir voice that duets the real piano. The picture is literally singing along.

---

## Subsystems

### 1. Audio source (`page.tsx`)
Fetches `/api/audio/549fc519-f7fc-4c38-a771-adaad2edbc81` → JSON `{url}` → `HTMLAudioElement` with `crossOrigin="anonymous"` → `MediaElementSourceNode` → AnalyserNode (FFT 2048) → reverb convolver + lowpass + DynamicsCompressor → master. Performs an all-zero analyser CORS-taint check 350ms after play; on failure falls back to the synthesized piano. Also supports drag-drop of an audio file. **Never silent.**

### 2. Musical analysis (`analysis.ts`)
Smoothed RMS dynamics (ppp…fff), 12-bin chromagram via log-frequency bin folding, dominant pitch-class, major/minor/chromatic modality by dot-product triad templates (best-fit key root = `keyPc`), spectral-flux onset detector with adaptive median threshold (Bello et al. 2005), phrase-boundary heuristic (energy dip <30% recent peak for 18 frames).

### 3. Warm synthesized piano fallback (`synth.ts`)
When Karel's recording is unavailable: C–Am–F–G7–Cmaj9 chord progression (oscillator + 2nd harmonic per note + arpeggiation) through convolver reverb and DynamicsCompressor. Resolves on purpose. Never atonal.

### 4. Image generation (`api/route.ts`)
Guards via `../../_shared/api-guard` (first two lines: `const blocked = await guard(req); if (blocked) return blocked;`). Calls `fal-ai/flux/schnell` at 4 steps, `landscape_4_3`. Returns 501 when `FAL_KEY` is absent. Client POSTs a prompt built from the music's key / energy / modality every ≥7s (≤1 in flight), cross-fades the returning image with a slow Ken-Burns drift.

### 5. Image-as-spectrogram resynthesis — the new move (`scanner.ts`)
**The Art2Mus / UPIC moment.** `buildFrequencyGrid(keyPc, modality)` produces 24 frequencies spanning ~3 octaves of the diatonic scale (major: semitones 0,2,4,5,7,9,11; minor: 0,2,3,5,7,8,10; chromatic fallback: pentatonic) — every partial is constrained to an in-key pitch. `buildAdditiveVoice()` creates 24 sine oscillators (slight ±3¢ detune for shimmer), each with an independent `GainNode`, through a highpass (remove sub-bass mud) → `DynamicsCompressor` limiter. `sampleColumn(imageData, normX)` samples one vertical column at log-mapped Y positions → 24 brightness values. Each frame: advance scan-line, sample column, set partial amplitudes. Sweep speed is derived from musical phrase period (~4–12s/sweep). Partials are retuned to the new key on every phrase boundary.

### 6. Synthesized latent field (`field.ts`)
When no FAL_KEY → 501, a plasma/drifting-blob field is rendered on canvas from the musical features (hue from pitch-class, speed from arousal, saturation from consonance). `readImageData()` snapshots the canvas for the scanner — so the synthesized field is scanned exactly as a real image would be. The piece is complete with zero API calls.

### 7. Scan-line HUD
A glowing vertical line with soft glow halo sweeps the canvas. Active partials are lit as soft radial points along the scan-line (size/alpha ∝ brightness), so you visually see which frequencies the image is singing. A mini partial-bar visualizer in the HUD shows all 24 bands live.

---

## Degradation

| Condition | Behaviour |
|---|---|
| FAL_KEY present | Real AI images; scan-line reads them; emerald status "dreaming live" |
| No FAL_KEY (501) | Plasma field canvas; scan still runs; amber "synthesized field (no image key)" |
| Karel's recording absent / CORS | Warm synth piano (C–Am–F–G7–Cmaj9); amber status |
| Both absent | Synth piano + plasma field; fully self-contained; beautiful |

---

## The Art2Mus / UPIC / MetaSynth Thesis

Cycles 1–2 of the spine showed that an AI image can **filter** audio (image → text → color → cutoff frequency). Cycle 3 asks: can the image **compose** audio? The image-as-score concept traces back to Xenakis's UPIC (1977) where drawn curves became waveforms and envelopes; to MetaSynth (Wenger & Spiegel 1997) where any PICT image became a spectrogram you could listen to; and to the very recent Art2Mus (arXiv 2602.17599, Feb 2026) which demonstrated direct visual→music conditioning bypassing image→text. Here the "score" is a latent dreamscape generated from the music itself — the piano dreams an image, the image re-composes the piano, the loop closes.

The key discipline: **musical quantisation keeps it warm**. The partial grid is always diatonic to the detected key, so no matter what the image contains — however abstract or dark — the shimmer voice resolves consonantly alongside Karel's piano rather than going atonal.
