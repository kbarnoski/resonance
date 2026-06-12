# 532 · Vocoder Veil

## The question this prototype answers

> *What if you could sing or speak, and your words came out played by Karel's real piano — your voice as the shape, his recorded piano as the voice?*

---

## What it is

A classic **channel vocoder** — the first in the Resonance dream lab — that takes two audio signals:

- **Modulator**: the live microphone (your voice, speech, singing), or a built-in vowel-cycle auto-demo
- **Carrier**: Karel Barnoski's actual *Welcome Home* piano recording (looped), fetched from `/api/audio/549fc519-f7fc-4c38-a771-adaad2edbc81`

The result: the piano "talks" in the shape of your voice. Robotic, uncanny, intimate, musical.

---

## How to use it

1. Open the page — the WebGL2 band-ladder visualization starts animating immediately from a simulated vowel cycle.
2. Tap **Wake the Vocoder** to start audio (required for iOS unlock). The piano begins singing through the auto-demo vowel sequence: *ah → ee → oh → oo → mm*, looping with smooth glides.
3. Tap **Use my voice** and grant microphone permission — the piano now speaks in real-time in your formants. Sing a long vowel ("aaaaaah"), say consonant-heavy words ("statistics", "she sells seashells"), and hear the piano enunciate.
4. Use **Vocoder intensity** to fade the effect louder/softer.
5. Use **Carrier pitch shift** (semitones) to transpose the piano up or down to match your singing range.
6. Tap **Auto-demo** to return to hands-free mode.

---

## Technique: channel vocoder

A channel vocoder, as invented by Homer Dudley at Bell Labs in 1939, splits both signals into N parallel frequency bands using a bank of bandpass filters:

```
mic ──┬─→ [BP band 1] → [envelope follower] → [gain.gain] ← (AudioParam audio-rate modulation)
      │                                              ↑
piano ─→ [BP band 1] ─────────────────────→ [GainNode] ──→ summer ──→ output
      │
      ├─→ [BP band 2] → [envelope follower] → ...
      │
      └─→ ... (16 bands total, log-spaced 120 Hz – 7 kHz)
```

**Envelope follower**: each modulator band's signal is squared via a `WaveShaperNode` (x² curve), then smoothed with a lowpass `BiquadFilterNode` at ~20 Hz. This produces an audio-rate amplitude signal representing how much energy is in that band. This signal is connected directly into the `.gain` `AudioParam` of the corresponding carrier `GainNode`, making the piano band's amplitude follow the voice band's envelope — a native Web Audio audio-rate modulation technique.

**Sibilance trick**: broadband noise (highpass-filtered above 3.5 kHz) is mixed into the carrier at low level. This ensures that unvoiced fricatives ("s", "sh", "f") — which have energy only in high-frequency noise, not in the piano's tonal content — still produce intelligible output.

**16 bands** log-spaced from 120 Hz to 7 kHz, matching the range of human speech formants and piano harmonics.

**Master output chain**: `vocoderSum → masterGain → BiquadFilter(lowpass, 7.5 kHz) → DynamicsCompressor(threshold -6 dB, ratio 16:1, attack 2ms) → destination`. This brick-wall limiter prevents harsh output under any input condition.

---

## Named references

- **Homer Dudley** — *The Vocoder* (1939, Bell Labs). The original channel vocoder, designed to compress telephone bandwidth by transmitting only the formant envelope coefficients. Dudley's analysis/synthesis filterbank is exactly what's implemented here.
- **Wendy Carlos & Robert Moog** — vocoder on *A Clockwork Orange* (1972). The first major musical use of the vocoder, with Moog's hardware band-filterbank and Carlos's synthesizer. The "robotic choir" sound that defines the instrument.
- **Imogen Heap** — "Hide and Seek" (2005). A talkbox/vocoder piece that demonstrated how the technique can be intimate and emotional rather than merely robotic. Her voice-through-synthesizer approach is the spiritual model for this prototype.

---

## Tags

| dimension | value |
|---|---|
| INPUT | microphone (voice) + Karel's recorded audio as carrier |
| OUTPUT | WebGL2 (live filterbank band-ladder visualization) |
| TECHNIQUE | channel vocoder — N-band analysis/synthesis (**lab-first**) |
| PALETTE/VIBE | uncanny-intimate, responsive, playful (NOT solitary drone) |
| AUTO-DEMO | yes — plays from first load, no mic permission needed |

---

## Graceful degradation

| Failure mode | Behavior |
|---|---|
| Mic permission denied | `text-rose-300` message; auto-demo vowel modulator keeps running |
| Piano audio fetch fails (404, CORS, offline) | `text-amber-300/95` note; rich sawtooth/square chord synth (6 voices) used as carrier instead — vocoder still fully works |
| WebGL2 unavailable | Canvas2D fallback draws identical band-ladder visualization; `text-amber-300/70` "canvas2d fallback" badge appears |
| iOS AudioContext unlock | `buildEngine()` is only called from the button click handler (user gesture), satisfying iOS autoplay policy |
| No JavaScript | Page renders title and description; no audio or canvas — acceptable static fallback |

---

## Auto-demo modulator (hands-free phone mode)

The demo modulator builds a harmonically-rich sawtooth oscillator (G3 + 8 harmonics), then shapes it through two `peaking` BiquadFilter formant filters (F1, F2) that cycle through five classic vowel targets:

| Vowel | F1 (Hz) | F2 (Hz) |
|---|---|---|
| ah | 800 | 1200 |
| ee | 270 | 2300 |
| oh | 570 | 840 |
| oo | 300 | 870 |
| mm | 280 | 900 |

Transitions use `setTargetAtTime` (time constant 0.15s) for smooth, click-free glides.

---

## Unverified surfaces (honest list)

- **Mic permission UX on iOS 16+**: Safari's getUserMedia dialog behavior and whether the `AudioContext.resume()` pattern is sufficient for full iOS unlock has not been tested on a physical device.
- **CORS on `/api/audio/<id>`**: The piano fetch works same-origin in the dev server; behavior behind a CDN or different origin has not been verified.
- **WebGL2 on older Android WebView**: The fullscreen-quad GLSL (using `gl_VertexID` without a VBO) requires WebGL2 + GLSL ES 3.00; older devices may need Canvas2D fallback.
- **AudioParam audio-rate modulation range**: The envelope follower outputs values roughly 0–0.1 (squared RMS), which may not drive the carrier gain to unity without additional scaling — the bias constant and envelope magnitude may need tuning on real voices vs. the auto-demo.
- **Piano buffer decoding**: `decodeAudioData` behavior for the specific codec/format returned by `/api/audio/<id>` has not been verified; the fallback triggers on any exception.
- **Carrier detune on AudioBufferSourceNode**: `setTargetAtTime` on `detune` is used for the pitch slider; some browsers may not support continuous detune change on a playing source without artifacts.
