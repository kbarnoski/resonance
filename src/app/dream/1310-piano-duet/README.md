# 1310 · Sing Into His Piano

## The one question

**What if you could sing INTO Karel's _recorded_ piano — your live voice
reshaping his harmonics in real time, a duet with a recording?**

Karel's real solo-piano recording (his album _Welcome Home_) never stops
playing. It is the **carrier** — the harmonic excitation. Your live microphone
is not a passive gain meter here; it is the **sculptor**. Your voice's spectral
envelope (its formants — the difference between "ahh" and "ooo") is stamped onto
his piano's spectrum, so humming a vowel audibly morphs his chord toward that
vowel. This breaks the lab's "mic = loudness bar" rut: the mic is a real
controller of a real recording.

## The mic → cross-synthesis mapping

- **Karel's piano loops continuously** as the excitation / harmonic source.
- Your **live mic is FFT-analysed**. We extract a smoothed **spectral envelope**
  — the energy across 20 log-spaced bands from ~130 Hz to ~6 kHz — normalized to
  a _shape_ so the formant peaks of your vowel stand out regardless of volume.
- **Cross-synthesis (channel vocoder on a recording):** a bank of **20 parallel
  bandpass BiquadFilters** splits the piano across those same 20 bands. Each
  band's output gain is driven, every frame, by the matching band of your voice.
  Loud in a band on your voice → that band of _his_ piano is boosted; quiet →
  that band is carved away. Sum the bank and his piano wears your vowel.
- **Intensity** is both an on-screen slider and mapped to overall mic loudness —
  the louder you sing, the harder your voice sculpts. A **dry path** keeps his
  piano clearly audible, so it stays a **duet**, not a gate.
- Gains are steered with `AudioParam.setTargetAtTime` (a one-pole, ~50 ms time
  constant) so the sculpt is **click-free** — no zipper noise as bands rise and
  fall.

## DSP / audio graph

```
Karel's piano (looping AudioBufferSource)
 ├─▶ pianoAnalyser (tap — draws the violet carrier spectrum)
 ├─▶ dryGain ─────────────────────────────────┐
 └─▶ 20 × bandpass(f_i, Q≈4) ─▶ bandGain_i ────┤ (wet: the vocoder bank)
                                               ▼
                                            mixBus ─▶ outputAnalyser (tap)
                                               │
                                               ▼
                                   DynamicsCompressor (limiter)
                                               │
                                               ▼
                                     masterGain (RAMPS 0 → 0.92)
                                               │
                                               ▼
                                          destination

Live mic ─▶ micAnalyser   (SINK ONLY — never connected to destination)
```

- `bandGain_i.gain ← mix × loudnessScale × voiceEnvelope_i`, smoothed.
- The **raw mic is never routed to the speakers** — only its _analysis_ moves
  the filter gains. That is the feedback guard.
- Master gain **ramps up from 0** on start (~1.4 s) and **ramps to 0 in ~60 ms**
  on Stop, after which the source, filters, mic tracks and AudioContext are all
  disconnected / stopped / suspended / closed.

### Mandatory fallbacks (never dead, never silent)

- **No recording?** If the fetch fails, `audio.ts` synthesizes a ~12 s gentle
  looping solo-piano-like buffer (enveloped lydian partials + hammer transients
  + a sub drone) via `OfflineAudioContext`, so there is always a piano to duet
  with.
- **No mic?** If `getUserMedia` is denied/fails, a `text-rose-300` notice
  appears and the same filter bank is driven by a **synthetic voice envelope** —
  a slow auto-morph by default, plus an **XY pad**: drag anywhere on the canvas
  to move the vowel formant across his spectrum (x) and sharpen / push it (y).
  The cross-synthesis still plays and Karel still hears his sound being sculpted.
- The piano **and** a gentle auto-morph begin **immediately** after Start,
  before the mic prompt resolves — a cold 06:30 glance is never dead or silent.

## Visualization — two spectra merging into a third

Dark Resonance palette. On a shared log-frequency x-axis:

- **Violet / indigo filaments** — Karel's piano (the carrier) spectrum.
- **Amber / rose ridge** — your live voice envelope, and the sculpt actually
  being applied to his bands.
- **Bright ridge** — the resulting cross-synthesized _output_ spectrum, showing
  where your voice is carving and boosting his harmonics.

A small VU bar and a "singing detected" indicator make the _your-voice-shapes-
his-sound_ story legible at a glance.

## Lineage (living references)

- **Trevor Wishart** — cross-synthesis, _Vox_, and spectral morphing: the idea
  of one sound wearing another's spectral identity, and of the voice as raw
  spectral material to be transformed rather than merely recorded.
- **Robert Henke (Monolake)** — live spectral practice: real-time filter-bank /
  spectral processing as a performed, reactive instrument rather than an offline
  studio effect.

This prototype is a single-performer, browser-native echo of that lineage: a
channel-vocoder cross-synthesis where the "modulator" is your live voice and the
"carrier" is one man's recorded piano.

## Safety notes

- **Photosensitive epilepsy:** no hard strobe or flicker. Luminance changes are
  slow (canvas trails, gentle ramps — well under 3 Hz). Honors
  `prefers-reduced-motion` (stronger frame fade, calmer trails).
- **Feedback:** the raw microphone is a sink on an `AnalyserNode` only — it is
  never connected to `destination`, so there is no mic→speaker howl. Only the
  _analysis_ drives the filter gains.
- **Instant Stop:** master ramps to 0 in ~60 ms, then the graph is torn down and
  the AudioContext is suspended and closed.
- **Graceful degradation:** works with no recording (synth carrier) and with no
  mic (auto-morph + XY pad).

## Next-cycle deepening

- **Phase-vocoder cross-synthesis** (real STFT magnitude transplant with phase
  from the carrier) for a truer spectral morph than a 20-band channel vocoder.
- **Formant tracking / LPC** on the voice for cleaner vowel identity, plus a
  detected-pitch shimmer (subtle detune of the wet path) once it is robust.
- **More bands + perceptual (Bark/ERB) spacing** for smoother, more vocal
  timbre.
- **Onset-gated freezing** — hold your last vowel as a sustained mask so his
  piano keeps "speaking" it after you stop, then release.
- **Stereo widening** of the wet bank so the sculpt blooms around the listener.
- A **spectrogram scrub** history so you can see (and re-sing) the moment your
  vowel bent his chord.
