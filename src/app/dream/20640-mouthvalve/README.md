# 20640-mouthvalve — Sing the Shape, Not the Note

**Status**: demoable

The lab's first mouth-driven piece. Karel's real piano loops; the **shape of your
mouth** is the conductor — you sing the shape, not the note.

## Design notes

**The one question:** what if you could conduct Karel's piano with the SHAPE of
your mouth?

**How mouth → sound works.** Everything runs on exactly two scalars, and the
same two scalars drive BOTH the audio and the picture — the coupling is by
construction, so see == hear is guaranteed (there is no second path to drift out
of sync).

- **Aperture** (vertical lip gap, landmarks 13 ↔ 14) opens a resonant *valve* on
  his piano: a lowpass cutoff that sweeps ~300 Hz → ~6 kHz (exponential) AND a
  gain gate ~0.15 → ~1.0. Closed mouth = dark, muffled, pulled-back — the music
  is "held in." Wide-open = bright, full — it pours out.
- **Width** (corner-to-corner, landmarks 61 ↔ 291) tilts the timbre between two
  fixed peaking biquads whose balance shifts: a low peak ~500 Hz (round) against
  a high peak ~2.8 kHz (bright). Deliberately NOT a vocal-tract / formant model —
  just this simple two-peak tilt, so it stays distinct from the formant piece.

The same aperture sets how far the drawn mouth opens and how brightly the stream
issues from it; the same width sets the stream's spread and violet hue. Both
mouth scalars are read as ratios against the inter-ocular distance (landmarks
33 ↔ 263) so they are distance-invariant, smoothed with a ~0.12 s time constant.

**Audio discipline.** The only sound is ONE `AudioBufferSourceNode` of Karel's
real catalog track (`loadRealTrackBuffer`), filtered — zero oscillators, zero
synth. The whole graph terminates at `createSafeMaster().input`, never
`ctx.destination`. The visual stream is driven by `master.analyser` (tamed
time-domain data → RMS + waveform).

**Pointer-first / degrade story.** The pointer is a genuine first-class control,
not a degraded fallback: pointer Y → aperture, pointer X → width, driving the
IDENTICAL audio + visual chain with no webcam. Arrow keys nudge the same two
scalars. The webcam (face mouth-landmarks) is the richer layer ON TOP — the
piece is fully experienceable and self-evident with no camera at all. Camera
denied / model-load failure / no getUserMedia all degrade to a visible,
actionable `text-destructive` notice while the pointer keeps working. A visible
`tracking · live` vs lost status shows whenever the camera is on. Idle (no input)
lets the mouth breathe gently and the stream keeps flowing — never blank, never
frozen.

**Visual.** Canvas2D only. A drawn mouth-aperture lens at center-screen from
which a luminous filament streams to both edges, anchored at the mouth so it
reads as pouring out; brightness / thickness / turbulence track the analyser RMS
and aperture. Palette: violet (hue ~262–288°) + bone/off-white on near-black.
Zero green. No film grain / noise overlay.

**Reference.** After *Handel* (contra.com, 2026-10-02), a browser toy mapping
recognized hand SHAPES to sound events. Mouthvalve generalizes that shape→sound
idea from the hand to the mouth.
