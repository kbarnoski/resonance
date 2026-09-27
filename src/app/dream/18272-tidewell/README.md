# 18272 · tidewell

**Status**: demoable

**Tilt your head to conduct the tonal register of Karel's real piano recording — tip right and the air/treble rises and pours right, tip left and the body/bass swells left, while the pitch never changes.**

A head-**roll → spectral register-tilt** conductor. The roll ANGLE tips a spectral seesaw (a tilt-EQ); the roll VELOCITY throws a brief "splash" of air; head YAW pans the whole field across the stereo image. Nothing is ever pitched or time-stretched — the recording loops at `playbackRate = 1.0` and only its tonal BALANCE and spatial PLACEMENT move.

## How it works

**Landmark → roll → EQ → sound**

1. **Landmark.** MediaPipe `FaceLandmarker` (VIDEO mode) runs on each animation frame via the shared `createFaceTracker` / `startCamera` loaders. We read `result.faceLandmarks[0]` — normalized 0..1 points.
2. **Roll.** ROLL is the angle of the eye line: the two outer eye corners (indices **33** right-eye and **263** left-eye), `roll = atan2(b.y − a.y, b.x − a.x)`, normalized over ±30° to roughly [−1, 1], with x mirrored so it reads like a mirror. YAW is the nose (index **1**) horizontal offset from the eye midpoint, normalized by inter-eye distance. Both are smoothed with a ~0.12 s exponential time constant. Tracking is gated ONLY on eye/nose landmark presence — never on hips/knees/ankles — for a seated waist-up laptop-webcam framing.
3. **EQ (the tilt-EQ seesaw, pitch-clean).** The signal path is `source → lowShelf(320 Hz) → highShelf(3.5 kHz) → StereoPanner → safeMaster`. Roll right → `highShelf.gain` climbs toward **+10 dB** and `lowShelf.gain` drops toward **−9 dB** (air rises); roll left mirrors it (body swells); neutral → both ≈ 0 dB. Roll VELOCITY charges a decaying "splash" that adds a few dB of transient air to the high-shelf, then fades via `setTargetAtTime`. The panner follows `clamp(roll·0.8 + yaw·0.4, −1, 1)`. **Every** audio parameter is smoothed with `setTargetAtTime(target, ctx.currentTime, ~0.12)` — no zipper noise, no async in the control path.
4. **Sound.** Karel's real catalog only (`loadRealTrackBuffer`), played through a single looping `AudioBufferSourceNode` at rate 1.0. The whole mix terminates in `createSafeMaster` (never `ctx.destination`); visuals are driven from `master.analyser`.

**→ shader**

The analyser's `getByteFrequencyData` feeds an R8 spectrum texture and per-frame `energy` / `treble` / `bass` / roll-velocity uniforms into a raw WebGL2 full-screen fragment shader — a volumetric "sea of light" whose horizon TIPS with the roll:

- a **horizon plane** that tilts with `roll` — the raised side glows cool **cyan** (air), the lowered side deep **violet** (body);
- **volumetric godray shafts** that pool where the FFT bins have energy;
- an **incandescent white** seam burning along the waterline where energy gathers;
- a **luminous cascade** that pours downhill toward the lowered side at a speed set by roll velocity;
- the stereo **pan** position slides the horizontal light pool.

Every audible change (EQ tilt, pan, splash) has a visible twin. When WebGL2 is unavailable a Canvas2D fallback renders the same tilting sea.

## Design notes

- **Demo drive first.** On load, before any camera, the piece auto-runs a labeled seesaw: `roll = 0.7·sin(t·0.00017)`, `yaw = 0.4·sin(t·0.00011)` (`t` in ms), driving the identical downstream chain. So the whole look → sound → light path is audible, visible, and headless-verifiable with no webcam — this is why it ships `demoable`, not `wip`. The demo is always visually labeled ("demo — press Use camera to conduct with your head") and never indistinguishable from live tracking.
- **Three-state status line** (mono, shown whenever camera is on): `searching…` / `tracking · live` / a `text-destructive` lost-state with an actionable hint.
- **Graceful degradation.** No `getUserMedia` / permission denied / model-load failure → the demo keeps running AND a pointer fallback is enabled (drag left–right across the stage to tilt the register by hand), with a visible `text-destructive` notice. WebGL2 unavailable → a Canvas2D sea plus an on-brand notice; the audio never stops.
- **Palette.** Deep indigo → violet base, cool cyan for the air/high side, deep violet for the body/low side, incandescent white where energy pools. Never warm amber/gold. Brand-accent chrome is violet only (`text-primary`); cyan/violet/white live inside the WebGL art as hex/GLSL strings.
- **Ear safety.** Every path terminates in the shared `safeMaster` bus (high-shelf cut, lowpass cap, limiter), never the raw destination.
- **Reference.** Zwicker & Fastl, *Psychoacoustics: Facts and Models* — spectral balance and "sharpness" are what the ear reads as perceived brightness, the basis for treating a tilt-EQ as a "tone" conductor. Believed a lab-first: no prior proto conducts register / tonal balance via head-roll (existing conductor pieces conduct tempo/phrasing).
