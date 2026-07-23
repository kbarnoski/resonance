# 2392 · Room Tone

**An acoustic ruler.** Measure the real reverberation of the room you're sitting
in — just by clapping — then hear a piano note play *inside* that measured room.

This is a tool, not a mood piece. The vibe is clinical and instrumental: a
well-behaved measurement instrument, Resonance-dark, violet on near-black.

---

## The one question

> What if you could measure the actual acoustics of your room — its
> reverberation time — with a clap, and then audition your playing through it?

## Three steps for the visitor

1. **Measure the room** — clap once; the app records the decay tail.
2. **Read RT60** — the instrument display shows the energy decay curve and the fit.
3. **Play through your room** — hit a note pad; toggle Dry / Wet to A/B it.

---

## Subsystems

### 1. Impulse-response capture (`getUserMedia` + `ScriptProcessorNode`)

A single clap is a cheap, broadband acoustic impulse. On **Measure the room** the
app resumes the `AudioContext`, requests the mic with
`echoCancellation:false, noiseSuppression:false, autoGainControl:false` (those
DSP stages would corrupt the decay we're trying to measure), and streams samples
through a `ScriptProcessorNode`.

**Capture mode chosen: clap detection (mode a).** The processor watches for a
transient whose peak sample crosses an onset threshold (0.14). On trigger it
splices a short pre-roll ring buffer (so the direct sound isn't clipped) ahead of
~1.8 s of decay tail into a `Float32Array`. I chose clap capture over a
sine-sweep because it directly answers the framing ("measure your room by
clapping") and needs no loudspeaker calibration — the trade-off is a noisier IR,
which is exactly why the analysis uses the robust **T20** estimator (below).

`ScriptProcessorNode` (rather than `AudioWorklet`) keeps the prototype fully
self-contained — no separate worklet module URL to load. Its output is routed
through a zero-gain node so the mic never feeds back to the speakers.

**Graceful degradation.** No `mediaDevices`, permission denied, or no clap within
8 s → a clear `text-destructive` message **and** a synthetic fallback:
`synthesizeDemoIR()` builds a plausible room IR from exponentially-decaying,
one-pole-smoothed noise (RT60 ≈ 0.85 s) with a sharp direct spike. The display is
labelled **"Demo room — no mic"** so the fallback is never mistaken for a real
measurement, and the entire tool still demos end-to-end offline.

### 2. Analysis — Schroeder integration + T20/T30 → RT60

From the captured IR (`analyzeImpulse`):

- **Trim to the direct sound.** Find the global peak; integrate from there.
- **Schroeder backward integration.** The energy decay curve is the *reverse*
  cumulative sum of the squared impulse response:
  `EDC[i] = Σ_{m ≥ i} h[m]²`, then converted to dB relative to total energy.
  Integrating backwards yields a smooth, monotonic decay instead of the ragged
  curve you get from squaring the IR directly. This is the key idea from
  **M.R. Schroeder, "New Method of Measuring Reverberation Time," *JASA* 37,
  409–412 (1965).**
- **T20 → RT60.** Following **ISO 3382**, a least-squares line is fit to the EDC
  over the **−5 dB to −25 dB** span and its slope extrapolated to a full 60 dB
  drop: `RT60 = 60 / |slope|`. Starting at −5 dB avoids the direct-sound knee;
  stopping at −25 dB keeps the fit above the noise floor — which is why **T20**
  is the standard robust estimator for short/noisy decays like a clap.
- **T30** (−5 to −35 dB) is computed and reported alongside for comparison.

### 3. Audition — ConvolverNode

The measured (peak-normalized) IR becomes the buffer of a Web Audio
`ConvolverNode` (`normalize=false`, so the measured level is preserved). A
synthesized piano-ish tone — four partials (sine + triangle), 6 ms attack,
exponential decay — is routed either **dry** straight to the output, or **wet**
through the convolver. Because the IR contains the direct spike *and* the diffuse
tail, the wet path is "note + your room's reverb." The **Dry / Wet A-B toggle**
makes the difference immediate.

### 4. Instrument display (Canvas2D)

A single `requestAnimationFrame` loop (all data via refs, so no stale closures or
effect-dep churn) draws: a dB grid, a live input meter while listening, the raw
IR waveform (dim violet), the Schroeder EDC (bright violet `#8b6ef6`), the fitted
T20 decay line (dashed), the −5/−25 dB fit markers, and a large mono RT60 readout.

---

## References

- **M.R. Schroeder**, "New Method of Measuring Reverberation Time," *Journal of
  the Acoustical Society of America* **37**, 409–412 (1965) — backward integration.
- **ISO 3382** — Acoustics: Measurement of room acoustic parameters
  (T20 / T30 reverberation-time definitions).

## Constraints honored

Audio + visual, self-contained in this folder, zero new npm deps (Web Audio +
Canvas only), no server/API route, `"use client"`, all browser APIs SSR-guarded,
semantic color tokens for all chrome (violet primary, `text-destructive` for mic
errors), `font-mono` only for labels/readouts.
