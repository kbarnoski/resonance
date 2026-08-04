# 6392-stemfield

**Fly INSIDE your own recording, pulled apart into its separate voices — and remix it by moving through and touching them.**

Route: `/dream/6392-stemfield`

## What it is

Drop an audio file (solo piano / acoustic music works best) and Stemfield separates
it **live, in the browser, with no ML model** into four perceptual layers using
**Harmonic–Percussive Source Separation (HPSS) via median filtering + a harmonic
band-split**. Each layer becomes a distinct glowing 3D body floating in space. You
orbit and fly through the scene, and remix the piece by **soloing, muting, and
pushing the level** of each voice. Muting genuinely removes a layer from playback —
the mix is resynthesized from the separated streams — so the interaction is real,
not cosmetic.

It is **alive on load with zero interaction**: a seeded synthetic four-stem musical
bed (just-intonation arpeggio, soft sub, brushed noise ticks, high shimmer) plays
through the *same* per-stem path until — and unless — you drop your own file.

## How to use

- **Nothing required.** On load a musical bed plays and four bodies breathe with it.
  (Browsers gate audio until a gesture — tap once if you see "tap to wake the sound".)
- **Tap / click a body** to solo that voice. Tap it again to un-solo.
- **Faders** (bottom mixer) push each voice's level from silence to +50%.
- **Mute** buttons genuinely drop a voice from the resynthesized mix.
- **Drag** to look around; the camera auto-orbits on its own.
- **Drop / choose an audio file** to replace the synthetic bed with your own
  recording, separated on the fly (progress bar; first ~35 s analyzed).

## The technique (no ML, all DSP)

1. Decode → mono `Float32Array` via `AudioContext.decodeAudioData`.
2. **STFT** — Hann window, 2048 / 512 hop, using a hand-written radix-2 FFT
   (`stft.ts`, no npm dependency). Keep the `N/2+1` non-redundant bins.
3. **HPSS by median filtering** (Derry Fitzgerald, *"Harmonic/Percussive Separation
   using Median Filtering,"* DAFx 2010): median-filter the magnitude spectrogram
   **along time** per bin → harmonic estimate `H`; **along frequency** per frame →
   percussive estimate `P`. Soft Wiener masks `Mh = H²/(H²+P²)`, `Mp = 1−Mh` are
   applied to the complex spectrogram and **inverse-STFT**'d (overlap-add) back to a
   harmonic stream and a percussive stream. Because `Mh + Mp = 1`, the two streams
   sum to the original — muting is a true removal.
4. **Band-split** the harmonic stream with crossover biquads:
   `bass = LP(H, 250 Hz)`, `air = HP(H, 2.6 kHz)`, `body = H − bass − air`
   (so `bass + body + air ≡ H` exactly).
5. Play the four `AudioBuffer`s through per-stem `GainNode`s → per-stem
   `AnalyserNode`s → a `DynamicsCompressor` limiter → master (≤ 0.85). Each analyser
   sits *after* its gain, so the visual bodies dim and swell with the mix you hear.

## Subsystems

- `stft.ts` — radix-2 FFT + forward STFT + masked inverse STFT (overlap-add).
- `hpss.ts` — median-filter HPSS, soft masks, biquad crossover band-split (chunked
  with `await` yields + progress).
- `audio.ts` — four-stem resynth playback engine + seeded synthetic bed.
- `scene.ts` — three.js spatial mixer scene (4 bodies, bloom, ACES, orbit, picking).

## References

- **Derry Fitzgerald**, *"Harmonic/Percussive Separation using Median Filtering,"*
  DAFx 2010 — the core method here.
- The 2026 real-time music-source-separation frontier — **arXiv 2511.13146**
  *"Towards Practical Real-Time Low-Latency Music Source Separation"* and
  **arXiv 2607.23395** (MSST) — reframed here as the **no-ML, in-browser,
  classic-DSP** counterpart: what you can do without a neural model.

## Honest rough edges

- HPSS median filtering is a *soft perceptual* split, not true source separation:
  bleed between stems is expected, especially with dense polyphony or drums-heavy
  material. Solo piano / sparse acoustic gives the cleanest, most legible result.
- The band-split uses forward-only biquads (some phase shift) — `body` is defined by
  subtraction so it always sums correctly, but its spectrum is not a textbook
  bandpass.
- Separation runs on the main thread (chunked/yielded, not a Worker), so a long file
  is capped to the first ~35 s to keep the tab responsive; very slow devices will
  still see a pause during the harmonic/percussive median passes.
- Analysis is mono; stereo image is collapsed before separation and resynthesis.
- No WebGL → the 3D field is skipped with an on-brand notice, but audio still plays.
