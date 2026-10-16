# Datum

**Status**: demoable — real-time phase-vocoder on Karel's recording, fully playable with the pointer; camera path wired but untestable headless.

## The one question

What if you could pull Karel's piano recording apart into its raw spectral DATA
— a stark Ikeda-style datamatics grid of magnitude AND phase — and reach your
hand in to time-stretch, freeze, and smear it in real time, watching the actual
STFT matrix bend as you conduct?

This is deliberately an **anti-glow** piece: hard-edged black / white / red data
geometry, crisp 1px raster cells, scanlines, monospace numeric readouts. No blur,
no bloom, no glow, no decorative gradients. A spectrogram rendered as a data
display, not a nebula.

## The sound-verb — a real-time phase vocoder

The only audio source is one of Karel's real catalog recordings (`REAL_TRACKS` /
`loadRealTrackBuffer`), decoded and mixed to mono. It is fed into a true STFT
**phase vocoder** that runs inside an `AudioWorkletProcessor` loaded from a
self-contained Blob URL (no extra served file; the radix-2 FFT is written by hand
inside the worklet string, since nothing can be imported into a worklet).

- **Frame 1024, hop 256, 4× overlap, Hann window, overlap-add.** Each synthesis
  step runs one forward FFT and one inverse FFT (O(N log N)).
- **Time-stretch independent of pitch.** The analysis read-head advances by
  `Ha = HOP / stretch` per synthesis hop while synthesis stays fixed at `HOP`;
  phase is propagated per bin by accumulating the measured instantaneous
  frequency: `phaseOut += omega + (measuredPhaseDelta − expectedPhaseDelta)`,
  with the deviation wrapped to (−π, π]. Hand X → stretch 0.25×…4× (log).
- **Spectral freeze.** Dwell (hold still ~600 ms) or a fist halts the read-head
  (`Ha → 0`) so the current frame's magnitudes are held while phases keep
  advancing at bin-center — the frame *shimmers* instead of buzzing. The freeze
  crossfades smoothly via `Ha = (HOP/stretch)·(1 − freeze)`.
- **Phase-blur / scramble.** Pointer-press, or hand openness, adds a controlled
  random phase rotation per bin, so the take smears and ghosts in time while the
  harmony (magnitudes) stays intact. This is the "exploit PHASE, not just
  magnitude" angle.

Params are driven as `AudioParam`s and smoothed on the audio thread with
`setTargetAtTime` (~0.12–0.14 s) so motion isn't twitchy. The worklet posts its
**own** latest magnitude + phase frame (plus a phase-coherence scalar and the
dominant bin) back to the main thread every few hops — so the on-screen grid IS
the real STFT, not a faked AnalyserNode. Everything terminates at
`createSafeMaster(ctx).input`; nothing touches `ctx.destination`.

If the AudioWorklet path is unavailable, the piece degrades gracefully: it plays
the same take through the safe-master analyser, shows a live magnitude spectrum,
maps the pointer to playback speed, and posts a visible notice — never a blank
screen or a thrown error.

## The look — Ikeda datamatics

Columns are recent analysis frames (scrolling left), rows are frequency bins (low
at the bottom), cell brightness is hard-quantized magnitude (6 steps, black→white,
no smoothing, nearest-neighbour upscale). A sparse **red** layer is the phase
channel — cells where the phase crosses a tight band over real energy. A red
scan-line marks the newest frame; a red crosshair marks the hand/pointer position
on the matrix; monospace readouts in the corners show frame index, stretch factor,
cursor-bin Hz, dominant Hz, and mean phase coherence. The idle state (nothing
playing) shows a living procedural data-grid so the stage is never blank.

Palette is black / white / red only — a deliberate break from the lab's banned
violet phosphor-glow. Reference: Ryoji Ikeda, *data-verse / data.gram* (2026),
datamatics as a data display; and *SpectroFX* (2025), which treats the STFT
spectrogram as an editable canvas with non-iterative phase-vocoder reconstruction.

## How to use it

1. Press **Play** (headphones help). Karel's recording decodes and starts
   streaming through the vocoder.
2. Move your **mouse (or hand)** left–right to time-stretch — far left ≈ 0.25×,
   centre = 1×, far right ≈ 4×.
3. **Hold still**, or make a **fist**, to freeze the spectrum — it shimmers.
4. **Press and hold** (pointer), or **open your hand** (camera), to phase-blur
   the take into ghosts.
5. Move up/down to move the spectral cursor (the bin-Hz readout follows it).
6. `f` for fullscreen, `i` for info.

Interaction is **pointer-first and mandatory**: the whole chain is fully playable
and audible with the mouse alone. The hand camera is a secondary layer driving the
exact same `cursorRef` — one index-fingertip cursor, mirrored X, with
openness→blur and fist→freeze. A tracking-status line always says whether the
camera is `tracking · live` or lost (in `text-destructive` with an actionable
hint); no camera / denied / model-fail falls back to the pointer with a notice.

## Verified vs untested

- **Verified:** TypeScript strict + ESLint clean; audio loads via the sanctioned
  `loadRealTrackBuffer`; the phase-vocoder worklet (FFT, phase propagation,
  overlap-add, freeze, blur) is self-contained and the engine produces transformed
  sound on Play with the pointer alone; the live STFT matrix renders from the
  worklet's own posted frames; idle grid animates; fallback path is wired;
  cleanup cancels the RAF, closes the context, stops camera tracks, revokes the
  worklet Blob URL and disconnects the safe-master on unmount.
- **Untested (headless):** the camera / hand-tracking path cannot be exercised in
  this environment (no webcam, prod frozen). It follows the validated shared
  `cameraTracking` pattern (runtime MediaPipe loader, mirrored index-fingertip
  cursor, `computeHandFeatures` for openness/fist), but live fingertip→stretch and
  fist→freeze behaviour has not been confirmed on a real camera. The pointer path
  is the guaranteed-working control.
- **Risk:** the worklet does one forward + one inverse 1024-FFT per 256 output
  samples (~187 steps/s); this is comfortably real-time on modern hardware but may
  glitch on very old/low-power devices — the fallback covers total worklet
  failure, not mid-run CPU starvation.
