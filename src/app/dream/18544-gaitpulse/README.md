# 18544 · GaitPulse

**Status**: demoable

**The one question:** *What if your whole body's SWAY became the PULSE of one
of Karel's recordings — conduct the rhythm with your body, not your hands?*

GaitPulse turns a single seated body into a conductor. A desk webcam reads the
**torso cadence** — the slow rhythm of swaying side-to-side or bobbing up-and-down
— estimates a **body tempo and phase**, and uses that pulse to **re-articulate**
one of Karel's real piano recordings: short Hann-windowed grains of the recording
are re-triggered on the detected beat-grid. Sway slow and wide → sparse, broad
re-articulation; sway quick and tight → dense, tight grains. Each *furthest point*
of the sway lands a downbeat. Pitch is preserved (every grain plays at rate 1.0) —
the piece is **re-timed** onto your body, never transposed.

The sound drives a three.js **instanced kinetic lattice** of voltaic-jade light:
emerald cores bleeding to near-white, pulsing as spherical shells that expand
through the grid on every beat.

## The control chain (landmark → feature → tempo → grain → audible)

1. **Landmark.** MediaPipe `PoseLandmarker` (full-body, lite) via the shared
   `createPoseTracker`. We gate tracking **only** on landmarks a desk webcam
   actually sees — **shoulders + nose**, with a wrist as a presence check — and
   **never** require hips/knees/ankles. The torso centroid is the mean of the two
   shoulders and the nose.
2. **Feature.** The centroid's **deviation magnitude** from its slow-EMA centre
   is the cadence signal: it peaks at every extreme of a sway (left, right, top,
   bottom) regardless of the sway axis, and goes quiet when you hold still.
3. **Tempo.** A **running autocorrelation** over a ~5 s ring buffer of the cadence
   signal (resampled to 30 Hz) finds the lag of peak self-similarity in the
   0.30–1.40 s range → a **body beat period**, smoothed. Local maxima of the
   cadence signal **phase-lock** the grid: each confirmed extreme realigns the
   next downbeat.
4. **Grain.** A **lookahead scheduler** (0.12 s horizon) re-triggers grains of the
   recording on the beat-grid. Subdivisions (1×/2×/4×) and window length
   (~140–260 ms, true Hann via `setValueCurveAtTime`) follow the tempo; the read
   head advances by the musical gap so the piece progresses at ~natural pace while
   being re-windowed onto your pulse.
5. **Audible.** Every grain routes `BufferSource → Gain(Hann) → grainBus → safe
   master → speakers`. Nothing touches `ctx.destination` directly. Downbeats are
   louder and light the lattice brighter.

## Demo drive

The piece is alive on load with **no camera**: an autonomous **Lissajous swaying
torso** (slow lateral sway with a shallow 2× vertical bob and a gentle tempo
drift) feeds the *identical* cadence → tempo → scheduler → visuals chain. The
status line clearly distinguishes `demo · autonomous` (muted) from `tracking ·
live` (foreground) and a `tracking · lost` destructive state ("face the camera,
shoulders in frame"). The first real detected body flips the driver to live; any
model/camera/WebGL failure falls back to the demo with a visible notice.

## Design notes

- **Audio is Karel's real catalog only** — Welcome Home + Snowflake via the
  shared `loadRealTrackBuffer`, routed through the shared `createSafeMaster` bus.
  No oscillators, no synth tones, no generated audio. A small selector picks the
  track (default: the first Welcome Home piece).
- **Re-timing, not pitching.** Grains always play at `playbackRate = 1.0`. We move
  *when* the recording speaks, not *what pitch* it speaks at.
- **Palette — voltaic jade.** HSL hue ~155° emerald cores lifting toward near-white
  highlights on a near-black jade field; additive instanced octahedra as the
  lattice of light. No amber, no cyan/blue, not achromatic.
- **Safety / house rules.** Luminance changes are smooth pulse envelopes, never a
  strobe; `prefers-reduced-motion` thins the lattice. No film grain, no substance
  references. Semantic color tokens for all chrome.

## References

- **Inverted inspiration —** *Encypher: Shared Agency and Social Presence in
  Collaborative Music Generation for Dance Cyphers* (arXiv:2609.18062, 16 Sep
  2026). There, collective body movement **conditions generated** music; GaitPulse
  inverts this — a **single** body's cadence instead **re-articulates an existing**
  recording.
- **Tempo-from-motion —** the classic autocorrelation-based real-time beat/tempo
  technique, in the lineage of the **OBTAIN** real-time beat tracker
  (arXiv:1704.02216). GaitPulse applies the same self-similarity idea not to an
  audio onset envelope but to a body's cadence signal.
