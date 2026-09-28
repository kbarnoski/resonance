# Slowbloom

**Status**: demoable

The stiller you hold your whole body, the slower TIME flows through Karel's real
piano recording — with the pitch frozen, so a single chord blooms and hangs for
many seconds. Whole-body motion energy (shoulders, wrists, nose) conducts a
pitch-preserving time-stretch of the recording: be still and time dilates up to
~8× slower with the pitch unchanged, so notes elongate into a long, luminous
"now"; move and time resumes toward the natural tempo. Press **Begin** — a slow
breathing demo conducts it on its own — then **Use camera** and sit back with
your shoulders in frame to dilate time with your own stillness. Reach your hands
up to brighten; lean side to side to pan.

## Design notes

**The time-stretch engine — STFT phase vocoder (pitch-preserving TSM).** Pitch is
preserved by a real-time, variable-rate STFT phase-vocoder time-scale
modification running inside an **AudioWorklet**, loaded from a **Blob URL** so it
is fully self-contained (no separately served `.js`). Frame N = 2048, synthesis
hop Hs = 512 (Hann, 75% overlap-add); the analysis hop Ha = Hs / stretch shrinks
as we slow down. Per synthesis frame: window the analysis grain at read pointer
`ta` (linear interpolation, wrap-looped) → FFT → magnitude + phase; compute the
instantaneous frequency per bin from the phase difference against the previous
analysis frame (`dphi = phase − prevPhase − Ha·ω`, principal-argument wrap,
`instFreq = ω + dphi/Ha`); accumulate synthesis phase `synPhase += instFreq·Hs`;
IFFT with (magnitude, synPhase) → Hann window → overlap-add into an internal
accumulator drained 128 samples per quantum. A **self-contained iterative radix-2
Cooley–Tukey FFT/IFFT** lives in the worklet string (no npm deps). Both channels
run the phase vocoder on the **same analysis timing** (shared `ta`, shared Ha) so
L/R stay aligned. `stretch` is exposed as a k-rate AudioWorkletProcessor
parameter and driven smoothly from the main thread with `setTargetAtTime`.
Crucially, `AudioBufferSourceNode.playbackRate` is **never** used to slow the
music — that would drop the pitch. The technique shipped is the streaming STFT
phase vocoder described above.

**Whole-body motion-energy → time-flow mapping.** MediaPipe pose landmarks feed a
motion-energy signal E ∈ [0,1] summed from the per-frame displacement of
shoulders, wrists and nose, heavily low-pass smoothed into a slow, meditative
control. `stretch = 1 + (1 − E)·(MAX_STRETCH − 1)` with MAX_STRETCH = 8: a still
body freezes into a long bloom, motion returns time to natural tempo. Tracking is
gated only on shoulders (with wrists and nose contributing to energy), never on
hips/knees/ankles, so it works seated and waist-up. Secondary axes: **reach**
(mean wrist height above the shoulders) gently lifts a pitch-clean high-shelf on
the bus and warms the field; **lateral lean** (shoulder-midpoint x) drives a
`StereoPanner` and a visual drift.

**Demo drive.** On load, and whenever no camera is granted, a labeled demo drive
feeds a synthetic breathing curve `E = 0.5 + 0.5·sin(t·0.00013)` through the exact
same energy → stretch → bloom chain, so the whole mechanism is provably alive
headless. It is labeled on screen and never looks identical to live tracking.

**WebGL2 long-exposure bloom field.** Raw WebGL2 (no three.js, no Canvas2D): a
ping-pong feedback/accumulation buffer whose retention rises with stillness (a
long exposure where light accretes into smears) and whose dispersion rises with
motion, a spectral bloom driven by the safeMaster analyser, and volumetric light
shafts. Rendered in a restrained, near-achromatic **pewter → pearl** moonlit
palette. If WebGL2 is unavailable the audio still blooms and an on-brand notice
is shown.

All audio terminates at `createSafeMaster`; the only source is Karel's real
catalog via `REAL_TRACKS` / `loadRealTrackBuffer`.

## References

- Flanagan & Golden, "Phase Vocoder," *Bell System Technical Journal* (1966).
- Dolson, "The Phase Vocoder: A Tutorial," *Computer Music Journal* (1986).
- Lubis, Peng, Carreño & Tsai, *arXiv* 2609.18999 (2026) — modern real-time
  variable-rate time-scale modification.
