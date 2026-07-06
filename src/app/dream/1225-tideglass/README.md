# 1225 · Tideglass

**The one question:** *What if your two hands were grain-heads moving through a
cloud of sound — reaching wide scatters it, lifting them raises the pitch, and
your body's place in the room pans it in space?*

Route: `/dream/1225-tideglass`

## How it works

Full-body **MediaPipe PoseLandmarker** (33 landmarks, loaded from a CDN at
runtime — never added to `package.json`) tracks your **two hands (wrists)** and
your **torso (shoulders + hips)**. Those become a compact `PoseFrame` that drives
two granular grain-heads:

- **Each hand = a granular grain-head** scrubbing a living cloud of grains. Every
  grain is a short (~60–140 ms) windowed slice of a synthesized FM wavetable
  (built in-engine, no audio file), pitch-shifted and windowed with a
  triangular/Hann envelope so there are no clicks.
- **Hand height → pitch + brightness.** Raising a hand lifts that head's grain
  playback-rate (~0.47×–2.14×) and opens its per-head lowpass filter.
- **Reach between the hands → density / spread.** Hands wide fires a dense
  scatter of grains across a wide stereo image; hands together collapses to a
  focused, low-density point-source.
- **Body's place in the room → spatialization.** Each head is hard-panned to its
  side through an equal-power **StereoPanner**; your torso's horizontal centre
  shifts the whole cloud's panorama, and your lean pushes a slow global filter
  sweep. Spatial audio is the distinguishing voice of this piece.

Every grain that fires also lights an **amber spark** in a three.js **point-cloud
grain field** that recedes in depth (teal near → violet far). Your two hands
appear as **bright amber attractors** moving through the cloud.

### Subsystems (ambition floor #2 — six of them)
1. Pose tracking (MediaPipe PoseLandmarker, CDN runtime import).
2. Hand/torso kinematics (`frameFromLandmarks` → reach, height, torso centre, lean).
3. Granular synth engine (wavetable + bounded look-ahead grain scheduler).
4. Stereo spatializer (per-head StereoPanner + panorama + width from reach).
5. three.js point-cloud renderer (depth field + amber sparks + attractors).
6. Hard fallback (draggable hand-pucks + auto-drift, GPU→CPU delegate retry).

## Tags

- **INPUT** — camera full-body pose-skeleton, **hands + torso active**. Fallback:
  two draggable hand-pucks with auto-drift.
- **OUTPUT** — three.js **3D point-cloud grain field in depth**, grains lighting
  up as amber sparks when they fire, two hands as bright attractors (not a flat
  2D field, not a Canvas2D scene).
- **VOICE** — **granular synthesis + stereo spatialization** (not a choir, drone,
  pluck, or bell).
- **PALETTE** — deep teal → violet nebular gradient with warm amber grain-sparks.

## Ambition hit

Clears all three floors: (#1) MediaPipe **Pose as a spatial granular instrument**
is new to the lab — the first true stereo-spatialized grain cloud driven by body
position; (#2) six distinct subsystems above; (#3) both named references cited.

## Named references

- **BlazePose** — Bazarevsky, Grishchenko, et al., *"BlazePose: On-device
  Real-time Body Pose Tracking"* (Google, 2020). The on-device model behind
  PoseLandmarker.
- **Curtis Roads — *Microsound* (MIT Press, 2001).** Foundational treatment of
  granular synthesis: grain clouds, density, and windowed wavelets.

## Safety & bounds

- Gesture-gated: no audio until **Start** (AudioContext created inside the click).
- Master chain: master gain **ramps from 0** → **DynamicsCompressor limiter** →
  destination. Per-head filter → StereoPanner → head gain sit before the master.
- **Grain-voice count is hard-bounded**: a look-ahead scheduler caps active grains
  at 64 (real density stays far lower — rate × grain-duration is only a handful of
  concurrent grains), each grain frees itself `onended`, and the scheduler resyncs
  rather than burst-catching-up after tab throttling.
- **No strobe.** Sparks are local point brightenings with smooth per-frame decay
  (×0.9); hand-attractor glow is low-passed. No full-field flash; luminance change
  stays well under 3 Hz.
- Clean teardown cancels rAF, stops + disconnects all audio nodes, ramps the
  master down and closes the AudioContext, closes the landmarker, and stops the
  MediaStream tracks.

## Honest edges

- **The headless camera path is unverified.** The MediaPipe CDN load, GPU→CPU
  delegate retry, and `detectForVideo` loop are written to the proven recipe but
  were not exercised against a real webcam in this build. If anything in that path
  fails, the piece drops to the fallback pucks with a `text-rose-300` notice, so
  it always makes sound and never shows a dead screen.
- **Grain-voice safety is reasoned, not stress-tested.** The math keeps typical
  active grains in the single digits and the cap is a backstop; I have not
  profiled a pathological device where the scheduler tick starves.
- Stereo width uses `StereoPanner` (equal-power L/R), not full HRTF `PannerNode`
  spatialization — chosen for reliability across browsers; it reads as true
  left/right placement but not front/back elevation.
- Torso lean in fallback mode is approximated from the puck height difference,
  since there is no real body to measure.
- The amber spark placement samples random cloud points near each hand rather than
  a full nearest-neighbour search, so sparks cluster near the attractors but do
  not perfectly track the closest grain point.
