# 1200 · Gait Loom

**What if walking — or stepping in place — were a step sequencer: your gait sets the tempo and your limbs weave a granular rhythm?**

The lab's first full-body MediaPipe **Pose skeleton** instrument built around **gait → tempo**. Your stepping cadence locks a rhythmic clock (BPM); each footfall and each swing of a limb triggers **granular percussion hits** quantized to that gait clock, weaving a loop that grows as you keep moving. Walk faster and the whole groove speeds up; stop and the loom slowly unravels to silence. The body is literally the sequencer's transport.

| | |
|---|---|
| **INPUT** | camera body-skeleton / gait — MediaPipe Pose, 33 landmarks (active, embodied, locomotion-based) |
| **OUTPUT** | Canvas2D radial gait-loom — a rotating step-clock with footfall bursts, woven limb-threads and a faint skeleton overlay |
| **TECHNIQUE** | MediaPipe Pose skeleton + gait-cadence detection + granular sequencing |
| **VOICE** | granular synthesis — windowed grains scattered rhythmically (NOT a JI choir / pad / drone) |
| **PALETTE** | chromatic chiaroscuro — warm ember/amber footfalls + cool teal/emerald limb-threads on deep graphite |
| **POLE** | embodied / rhythmic |

## How it works

**Gait → BPM.** MediaPipe Pose (`pose_landmarker_lite`, VIDEO mode, one body) is loaded from a CDN at runtime — not an npm dependency — via a `webpackIgnore`'d dynamic import, GPU delegate with a CPU fallback. Each frame yields 33 normalized landmarks. A per-foot state machine (`gait.ts`) watches each ankle's vertical position, normalized by torso height so it is scale-invariant: when a foot rises past a lift threshold and then returns past a plant threshold, that is a **footfall**. The intervals between successive footfalls give a cadence (steps/min); the median of the last few intervals is EMA-smoothed into a **BPM**, clamped to a musical ~60–160. One footfall ≈ one beat, so the tempo tracks your cadence and glides as you speed up or slow down. Only joints with `visibility > ~0.5` are trusted.

**Footfall / limb → grains.** Wrist **velocity peaks** fire limb-swings between the beats (an adaptive per-wrist threshold), and strong knee lifts add occasional mid accents. Each event carries an intensity and a pan (mirror-aware). Events are handed to the granular loom.

**Granular voice + quantization.** At load, `grains.ts` synthesizes two short source buffers with **no external assets** — a filtered-noise burst and a decaying resonator ping. Every hit **granulates those buffers**: a grain is a short Hann-windowed slice played through a fast attack/short-decay envelope, pitched by `playbackRate` and panned by which limb fired it. **Footfalls** read the low resonator (rate ≈ 0.5) as kick-like thuds; **wrists** spray several bright noise grains (rate ≈ 2–2.5). A 16-step ring (one bar of sixteenths) spins at the gait BPM using look-ahead scheduling against `audioContext.currentTime`; incoming hits are **quantized into the ring**, and each cycle replays the deposited grains — so the loop *weaves* as you move. Slot lives decay each cycle (and master gain follows body-motion energy), so when you stop the loom **unravels to silence**. A soft immediate grain plays on each live event for tactile responsiveness; grain count is hard-capped and layered behind a compressor + short feedback delay.

**Visuals** (`render.ts`). A rotating radial timeline: 16 step-marks around a ring, a sweeping playhead locked to the BPM, bright bursts dropped where footfalls and swings land (ember for feet, teal for wrists/knees), woven quadratic threads accumulating between successive limb events, and a faint mirrored skeleton. Centre readout shows live BPM, lock state and cadence.

## Fallback (always makes sound + visuals)

If the camera is denied/unavailable or MediaPipe fails to load, the reason is shown in `text-rose-300` and the piece switches to **fallback** mode, which drives the **same** gait clock + granular engine:

- **Limb pads** — L/R foot (low thuds) and L/R wrist (bright sprays); tapping the foot pads in a steady rhythm runs a **tap-tempo** estimator that locks the BPM.
- **Spacebar** — each press is a "step", alternating feet, feeding the same clock.

If WebGL2 were unavailable it would not matter here — the renderer is Canvas2D — but audio always runs regardless.

## Safety

All luminance change is slow or event-driven: background wash oscillates at ~0.15 Hz, glows drift, and rhythmic bursts are **local** radial glows, not full-field flashes. No strobe; full-field luminance change stays well under 3 Hz.

## Cleanup on unmount

`cancelAnimationFrame`, stop the transport and ramp master to zero then disconnect all audio nodes, `close()` the PoseLandmarker, stop all `MediaStream` tracks, and `close()` the `AudioContext`.

## Named references

- **Curtis Roads, *Microsound* (2001)** — the granular-synthesis foundation: sound as clouds of short windowed grains.
- **Biomechanics of gait cadence** — human walking cadence sits ~90–130 steps/min; footfall periodicity as a tempo source.
- **Myron Krueger, *Videoplace* (1974–75)** — full-body, camera-based interaction with no worn hardware.
- **The "Sonified Body" practice** — mapping skeletal movement to sound.

## Files

- `page.tsx` — orchestration, start/fallback UI, rAF loop, cleanup.
- `pose.ts` — MediaPipe PoseLandmarker CDN loader + landmark rig.
- `gait.ts` — footfall/limb-swing detection + cadence → BPM lock.
- `grains.ts` — granular synthesis voice + the 16-step loom transport ring.
- `render.ts` — the radial gait-loom Canvas2D renderer.
