# Breathtide (flow)

Route: `/dream/18196-breathtide-flow`

## What if

What if you could conduct your own piano recording with your **breath** — inhale to swell and open the music, exhale to let it settle — with nothing but your webcam watching your chest rise and fall?

An embodied camera piece in a meditative, cosmic-ambient register: a somatic mirror made of Karel's own music. Camera-tracked respiration is the only interaction signal; the sound is always his real recorded take, transformed live by how you breathe.

## How it works

**Audio path (always his recording).** One decoded real take from the *Welcome Home* catalog (`loadRealTrackBuffer`) loops via an `AudioBufferSourceNode`. It splits into a **dual path**:

- **DRY** — direct → pre-gain → low-shelf (warmth) → high-shelf (air) → tidal-tremolo gain → dry gain.
- **WET** — the same tremolo tap → a `ConvolverNode` whose impulse response is a decaying, attack-ramped ~2 s slice of *his own* buffer → wet gain.

Both terminate in `createSafeMaster(ctx).input` — never `ctx.destination`. Visuals read `master.analyser`. No oscillators, synths, or generated audio anywhere; the breath only shapes his sound.

**Breath detection (approach B — chest-ROI motion, landmark-light).** MediaPipe `PoseLandmarker` (via the shared `createPoseTracker`) is used *only* to locate the shoulder line (landmarks 11 & 12), throttled to ~25 Hz. A chest **region-of-interest** is placed just below that line. Each frame the mirrored webcam is drawn into a small 96×72 offscreen canvas; the ROI's row-luminance profile is sampled, and a coarse vertical optical-flow proxy (SAD-minimizing row shift between consecutive frames) plus the shoulder-line rise give a raw expansion signal. That slow signal is band-limited (high-pass ~0.1 Hz to drop drift, low-pass ~0.5 Hz) into a breath waveform, then normalized against an adaptive min/max envelope. From it: **phase** (inhaling vs exhaling, from the smoothed slope), **depth** (envelope range), and **rate** (breaths/min, from inhale-peak intervals).

**Mapping.** A `bloom = depth × breath01` value drives everything through `setTargetAtTime` (~0.16 s) so it glides:
- **Inhale** → equal-power crossfade toward WET, louder master, high-shelf brightens, pre-gain swells — the music opens and blooms.
- **Exhale** → toward DRY, low-shelf warms, quieter — it settles and closes.
- **Depth** scales the swing (shallow = subtle, deep = big bloom).
- **Rate** paces a slow tidal tremolo LFO (computed in JS, not an oscillator node).
A quiet always-on core keeps silence from going dead.

**Visuals.** A viewport-filling Canvas2D tidal-aurora field (aqua → pale-cyan → deep-indigo): a rising horizon, a central swell, layered aurora ribbons, and rising motes that open on inhale and settle on exhale, with `analyser` energy layered in. Afterglow trails, no grain. A small ROI overlay (top-right) shows what's being watched.

**Degradation & gating.** Gates *only* on the shoulders to place the ROI — never hips/torso/ankles — so a seated desk webcam works; if shoulders aren't found it falls back to a fixed centered chest ROI rather than rejecting the frame, and holds the last good estimate briefly when tracking drops. A labeled **autonomous demo** breath curve runs before any camera (visibly and audibly alive), and a **Spacebar / press-and-hold** pointer fallback covers denied permission or model-load failure. Tracking state is always shown: `breathing · live` with a live breaths/min readout, vs. a `text-destructive` low-signal / lost hint. No-canvas → notice.

**Status** wip
