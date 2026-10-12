# Phosphor Helm

**Status**: demoable — head-pose conducting over Karel's real stereo piano, rendered as a violet-phosphor X–Y vectorscope. Works with no camera via a labelled pointer fallback.

## What it is

An oscilloscope you wear. Karel's real catalog recording always plays, and your
head is the conductor. An X–Y vectorscope plots the left channel against the
right channel; for a stereo recording the point traces a living **Lissajous
figure**. Here that figure — and the stereo image you hear — are both re-aimed
by the orientation of your head, drawn as a laser trace in brand-violet phosphor
on a near-black scope.

- **Input:** webcam head-pose — MediaPipe `FaceLandmarker` (478 landmarks +
  named blendshapes), via the shared `cameraTracking` loader. Yaw, pitch and
  roll are derived calibration-free from the eye-corner and nose landmarks;
  `jawOpen` comes straight from the blendshape categories.
- **Output:** a true stereo vectorscope on Canvas2D — a LAB-FIRST technique.
  X = left-channel sample, Y = right-channel sample, with a phosphor-decay trail
  (a translucent near-black wash each frame instead of a hard clear) and additive
  `lighter` compositing with `shadowBlur` glow for the laser look.
- **Palette:** monochrome **violet phosphor** on near-black (brand violet ramp).
  No green/jade/cyan phosphor — violet only.

## The chain: head → stereo rotation → Lissajous

1. **Audio.** `loadRealTrackBuffer` decodes a real track into a looping
   `AudioBufferSourceNode` (rate 1.0). If the recording decodes **mono**
   (`numberOfChannels === 1`), it is spread into a pseudo-stereo pair with a
   short ~12 ms Haas delay on one side so the figure still has width — a stereo
   *decorrelation of Karel's audio*, not a synthesized source.
2. **Head roll → rotation matrix.** A `ChannelSplitter` → four `GainNode`s →
   `ChannelMerger` rotate the stereo vector by the smoothed roll angle θ:
   `Lout = L·cosθ − R·sinθ`, `Rout = L·sinθ + R·cosθ`. The four gains are
   `setTargetAtTime`'d to `cosθ / −sinθ / sinθ / cosθ`. This genuinely re-pans
   and widens/narrows the image.
3. **The same θ** rotates the drawn (L,R) points, so the sound twisting and the
   figure twisting are one gesture.
4. **Head yaw →** a gentle pan bias (`StereoPannerNode`). **Head pitch →** a tilt
   filter (low-shelf vs high-shelf balance) — look down to darken, up to
   brighten. **Jaw-open →** a resonant peaking filter (brightness) and a longer
   phosphor trail.
5. The rotated pre-master signal is tapped into two time-domain `AnalyserNode`s
   (`getFloatTimeDomainData` for L and R) **upstream** of the master, and also
   feeds `createSafeMaster(ctx).input`. Nothing ever touches `ctx.destination`
   directly. All motion→param moves are smoothed (~0.12 s easing).

Idle (before audio starts) shows a slow breathing calibration ring with a faint
crosshair — alive, never blank.

## Works-when-shipped

Designed for a seated laptop webcam (face fills the frame); gated only on
face-present. A small mono status line reads `tracking · live` when a face is
found, or a destructive hint — *"face the camera, keep your head in frame"* —
when it is lost. With no camera, denied permission, or a model-load failure, the
piece falls back to a **pointer** drive (mouse X = roll, mouse Y = pitch,
click/hold = jaw-open) through the identical audio + visual chain, clearly
labelled `pointer · demo` so it never looks like live tracking.

## Reference

In the lineage of **oscilloscope music** / X–Y vectorscope art. The canonical
modern practitioner is **Jerobeam Fenderson**, whose *Oscilloscope Music* draws
shapes directly from a stereo waveform played into a scope's X and Y inputs —
the same phase-space idea this piece applies to Karel's piano. This cycle's
research anchor is **DrawnBySound** (GitHub, updated 2026-10-04), which renders
live audio into reactive oscilloscope shapes — the fresh in-window prompt for
the vectorscope technique.

## Honest limits

- The head-pose estimate is **calibration-free**: a hard initial tilt reads as a
  small permanent offset, and extreme yaw/pitch saturates at the clamp.
- **Mono** recordings are stereo-widened (Haas delay) for the figure; their
  Lissajous reads as a thin phase ellipse rather than a wide stereo spread.
- Blendshape `jawOpen` is sensitive to lighting and distance; the pointer hold
  gesture is the reliable stand-in.
- Roll is bounded to ±0.8 rad so the stereo image twists audibly without ever
  fully inverting.
