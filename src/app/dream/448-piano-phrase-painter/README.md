# Piano Phrase Painter (448)

## The One Question

What if Karel's ACTUAL recorded piano could paint itself — but the painting is driven by MUSICAL STRUCTURE, not raw spectrum? Onset/phrase detection + harmonic (chroma/key) color + dynamics envelope drive when a new image is dreamed and what it depicts; the returning image's color then bends the real piano playback back. A CLOSED audio→image→audio loop that is MUSICALLY AWARE — it listens like a musician, not a spectrum analyzer.

---

## How the Musical Analysis Works

### Onset / Phrase Detection (Bello et al. spectral-flux method)

From the AnalyserNode (FFT 2048, `getByteFrequencyData`), each animation frame:

1. **Spectral flux**: sum of positive-only differences between the current and previous magnitude spectrum (half-wave rectification). This detects the energy burst at note attacks without responding to sustained tones.
2. **Adaptive threshold**: computed as `median(fluxHistory[last 20 frames]) × 1.35`. The median is more robust to transient spikes than a simple mean.
3. **Debounce**: onsets within 80ms of the previous onset are suppressed.
4. **Phrase boundary**: if smoothed RMS falls below 30% of the recent peak for 18 consecutive frames (after a period of activity), a phrase boundary fires. This models the pianist letting the sound die between musical phrases.

Implemented in `analysis.ts → buildAnalyser()`.

### Harmonic Color (12-bin Chromagram)

Each FFT bin is mapped to MIDI pitch via `midi = 12 × log₂(hz/440) + 69`, then `pitch_class = round(midi) % 12`. Bins are summed per pitch-class, normalized, and exponentially smoothed (α=0.15).

The chromagram is matched against major and minor chord templates (dot-product with rotations over all 12 roots) to estimate:
- **Dominant pitch-class** (C–B)
- **Modality**: major / minor / chromatic (based on best-match score threshold 0.35)
- **Consonance**: strength of the best triad match (0–1)

### Dynamics Envelope

Smoothed RMS (`α=0.06`) maps to dynamics labels: `ppp / pp / p / mp / mf / f / ff / fff` and to prompt density words (sparse mist → turbulent storm).

---

## The Image-Dreaming Loop

1. **Trigger**: a new image is requested when a phrase boundary fires OR when ~8 onsets have accumulated since the last request, with a hard minimum 7s between requests and at most 1 in-flight request. This ensures images arrive at musically-meaningful moments — phrase breaks, not arbitrary timer ticks.

2. **Prompt construction** (`analysis.ts → buildMusicalPrompt()`):
   - Harmony → palette words (bright major → warm gold; deep minor → indigo/cerulean; chromatic → iridescent shifting)
   - Dynamics (RMS) → density words (sparse mist ↔ roiling chromatic tempest)
   - Dominant pitch-class → accent hue word (each of 12 pitch-classes maps to a distinct hue vocabulary)
   - Base style: `"abstract volumetric light responding to a solo grand piano performance, latent dreamscape, soft caustics, Refik-Anadol-like data-pigment, cinematic, no text"`

3. **Image arrives**: cross-fades (~2.5s) over the previous on a full-bleed canvas with slow Ken-Burns drift + vignette. Image is preloaded with `crossOrigin="anonymous"`.

4. **Color sampling**: the image is drawn to an 8×6 offscreen canvas and `getImageData()` extracts average R/G/B (try/catch skips if CORS-tainted). Brightness, dominant hue, and warmth are computed.

5. **Audio loop-back**: brightness bends the master lowpass cutoff (brighter → more open, airier); warmth bends reverb wet gain (warmer → longer tail). Cool blue hues add a shimmer gain lift. Applied to the real piano chain or synth engine.

6. **Onset bloom pulses**: each detected onset fires a bloom radial-gradient that expands and fades over the canvas (over AI images or the synthesized field), synchronizing visible pulses to musical attacks.

---

## Audio Source Strategy

**Priority order:**

1. **Karel's real recording** (`/api/audio/549fc519-f7fc-4c38-a771-adaad2edbc81`): fetched on Begin tap, `audio.crossOrigin = "anonymous"` set before `audio.src`. Connected as `ctx.createMediaElementSource(audioEl) → AnalyserNode → [dry + convolver/reverb] → lowpass → compressor → destination`. CORS-taint check: if the analyser reads all-zero after 350ms, falls back to synth.

2. **File drop / file input**: `URL.createObjectURL(file)` → same audio element, no CORS concern. Works at any time, even while the prototype is running (hot-swaps the audio source). Object URL revoked on teardown/stop.

3. **Synthesized fallback** (`synth.ts → buildSynthEngine()`): A warm oscillator-bank piano stand-in with a chord progression that includes an authentic V7→I cadence (resolves on purpose, not atonal, not a drone). Routes through the same AnalyserNode path so all musical analysis and image generation work identically. Status line shows amber "couldn't load the recording — synthesized stand-in playing."

---

## Graceful Degradation

| Failure | Response |
|---|---|
| `/api/audio/…` 404 or network error | Synth stand-in, amber status |
| Analyser all-zero (CORS taint) | Synth stand-in, amber status |
| FAL_KEY absent (501) or rate-limited (429) | Synthesized plasma/blob field from `field.ts` |
| Image CORS taint on sampling | `try/catch` skips color feedback, image still displays |
| Canvas 2D context null | Silently skips draw |
| WebAudio unavailable | Error state with message |

---

## Subsystems (≥3 active simultaneously)

1. **Musical analysis engine** (`analysis.ts`): spectral-flux onset detector, 12-bin chromagram, harmonic modality estimation, phrase-boundary detector, dynamics envelope, OPM counter — all real-time, no ML libraries.
2. **AI image pipeline** (FAL `flux/schnell`, route `api/route.ts`): musically-timed requests, crossfade renderer, Ken-Burns drift, vignette.
3. **Synthesized visual field** (`field.ts`): plasma layer + orbiting volumetric blobs + particle flow + onset bloom pulses — driven by the same `MusicalFrame` as the AI pipeline.
4. **Audio loop-back**: image color → lowpass cutoff + reverb tail + shimmer bend on real audio chain or synth engine.
5. **Real audio pipeline** (Karel's recording + reverb convolver + compressor chain, or user file drop).

---

## Named References

- **Refik Anadol** — *Unsupervised* (MoMA, 2022) and *Machine Hallucinations* latent/data-pigment corpus. The FAL prompt directly names the aesthetic ("Refik-Anadol-like data-pigment"). The concept of a space that paints itself from its own data is the central lineage.

- **Memo Akten** — *Learning to See* (2017): real-time neural re-description of camera/audio streams, creating a feedback loop between world and latent space. The direct conceptual ancestor of the audio→image→audio loop here.

- **Spectral-flux onset detection** — Bello, J.P., Daudet, L., Abdallah, S., Duxbury, C., Davies, M., & Sandler, M.B. (2005). "A Tutorial on Onset Detection in Music Signals." *IEEE Transactions on Speech and Audio Processing*, 13(5), 1035–1047. The half-wave-rectified positive spectral flux + adaptive median threshold implemented in `buildAnalyser()`.

---

## Ambition Floor Claims

- **#4 Multi-cycle commitment** [cycle-1-of-a-planned-spine]: This prototype is the first in a planned three-part cycle (447 latent room, 448 phrase painter, 449 latent grains) exploring the closed audio→image→audio loop with progressively deeper musical structure awareness. 448 is the "musically-aware" apex of that spine.

- **#2 ≥3 subsystems**: Musical analysis engine + AI image pipeline + synthesized visual field + audio loop-back + real audio chain = five distinct, simultaneously active subsystems (see above).

- **#3 Named references**: Refik Anadol *Unsupervised*; Memo Akten *Learning to See*; Bello et al. 2005 spectral-flux onset detection.

---

## File List

```
src/app/dream/448-piano-phrase-painter/
├── page.tsx          — Main "use client" React component (the prototype)
├── analysis.ts       — Musical analysis: chromagram, onset, phrase, dynamics
├── synth.ts          — Warm synthesized piano stand-in (resolves on purpose)
├── field.ts          — Synthesized plasma/blob/particle visual field + onset blooms
├── api/
│   └── route.ts      — Guarded FAL flux/schnell API route
└── README.md         — This file
```

---

*Built for the Resonance dream lab. Karel's piano, listening to itself.*
