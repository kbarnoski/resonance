# sound-to-image — design notes

**Route**: `/dream/57-sound-to-image`  
**Cycle**: 71 · **Status**: `demoable`

## What it does

Captures 10 seconds of audio (mic or demo oscillators). Extracts five acoustic features per frame at ~10 FPS:

1. **RMS energy** (0–1) — how loud
2. **Spectral centroid** (Hz) — perceptual brightness; low = bass-heavy, high = treble-dominant
3. **Zero-crossing rate** (normalized) — distinguishes smooth tonal signals from noisy/percussive ones
4. **12-bin chroma** — pitch-class energy distribution → root note and major/minor quality
5. **Autocorrelation pitch** (Hz) — dominant fundamental frequency if present

After 10s: averages all frames → builds a natural-language description → maps to one of 6 scene archetypes → sends to `fal-ai/flux/schnell` → photorealistic image fades in over 1.8 seconds.

## Scene mapping

The six scene quadrants map the acoustic space to Resonance's narrative vocabulary:

| Energy | Centroid | Scene |
|--------|----------|-------|
| Low | Low | Stone chamber underground — candle, dark water, carved walls |
| Low | High | Ancient forest at dawn — golden light, dew, empty clearing |
| Mid | Low | Sea cave with bioluminescent water — vast stalactite ceiling |
| Mid | High | Sunlit Mediterranean courtyard — warm stone, arched colonnade |
| High | Low | Wild headland at dusk — storm waves, dark volcanic rocks |
| High | High | Cosmic nebula — deep space, gas clouds, star clusters |

These map to Resonance's six Ghost journey scenes (Stone Chamber, Forest Dawn, Underground Pool, Root Portal, Stormy Coast, Cosmic Ascension).

## What's interesting about this

Every other prototype in the sandbox visualizes audio as abstract art (fluid, particles, waveforms) or musical notation (piano roll, score). This one generates a *semantic interpretation* — what physical environment or narrative setting does this sound evoke? The same audio that looks like an abstract color field in `1-live` becomes a stone chamber or a cosmic nebula here.

The text description generated before the API call is itself the model: "soft, smooth tonal, warm bass-dominant music — C major, hopeful, central pitch 294 Hz" is a complete acoustic fingerprint of a piano performance. The image is just one way to render that description.

## Demo mode

5 triangle-wave oscillators: C4 (261.63 Hz), E4 (329.63 Hz), G4 (392 Hz), C5 (523.25 Hz), A3 (220 Hz). A C major chord in root position with A3 as a sub-bass anchor. This maps to: moderate energy, warm bass-dominant centroid (~350 Hz), smooth tonal (low ZCR), C major quality. Expected scene: **sea cave with bioluminescent water** (mid energy, low centroid). Image should feel calm, vast, and mysterious.

## Polish ideas

- **Retry** button to regenerate with same fingerprint (different seed → different interpretation)
- **Scene picker override** — show which scene was selected and allow the user to override before generating
- **Continuous mode** — capture and generate every 10s, display rolling timeline of scenes
- **Side-by-side** — show the abstract bloom visualization (from `1-live`) alongside the generated image, same audio

## Technical notes

- `getFloatTimeDomainData` / `getFloatFrequencyData` require `Float32Array<ArrayBuffer>` in TS 5.5+ (narrow typed array spec). Use `new Float32Array(new ArrayBuffer(n * 4))` instead of `new Float32Array(n)`.
- Autocorrelation pitch detection with lag range 70–900 Hz, N=1024 inner loop. ~5M ops/sec at 10 FPS — fast enough.
- Chroma computation: sum linear FFT magnitudes by pitch class (60–4000 Hz range, normalized per frame). Average over all frames gives a robust chord fingerprint even with noisy or imprecise playing.
- Server route uses `fal.subscribe` (polling) not streaming — Flux Schnell typically returns in 2–5 seconds.
