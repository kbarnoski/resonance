**For**: kids (4+)

# Magic Bell Tray (984-kids-shake-bells)

What if a 4-year-old could SHAKE a tablet like a tray of magic handbells — and each shake rings real, physically-modeled bells that climb and descend a genuine musical ladder, so harder shakes ring a fuller sparkling arpeggio?

## How to play

- **Shake the device.** The accelerometer detects the shake (not tilt) and rings the next bell on the ladder. Harder shakes ring more bells at once.
- **Tap the big round SHAKE! button.** A 176px target for hands-free or no-sensor play.
- **Press the spacebar.** Same as a medium shake, for desktop.
- **Do nothing.** After ~3 seconds of stillness a *ghost auto-shaker* takes over and rings the ladder on its own, so a hands-free glance both sees and hears the toy alive.

There are no wrong notes, no fail states, and no scary/loud transients. An always-on soft drone keeps it from ever going silent. After ~12 minutes the whole thing slowly fades toward a "goodnight" lull, fully hushed by ~15 minutes.

## Musical design

- **Mode: G Mixolydian** (G A B C D E F♮). The lowered 7th, F-natural, is the bright modal color of the toy. We deliberately do **not** use a pentatonic "no-wrong-notes" scale (too safe, no character) and we deliberately avoid a I–IV–V–I / V→I functional cadence — this is a **modal ladder**, not functional harmony. The point is modal *color*, not resolution.
- **The ladder.** ~2 octaves of the mode laid end to end. Successive shakes walk the index UP the ladder, and when it reaches the top it turns around and DESCENDS — so repeated shaking traces a rising-then-falling shimmer rather than a fixed loop.
- **Intensity mapping.** Shake intensity (0..1) sets two things at once: how many ladder bells ring (gentle = 1–2 soft tones, big shake = a 3–5 bell sparkling arpeggio that climbs a few rungs) and the strike brightness (how much of each bell's high inharmonic energy comes through).

## Technical approach

- **Shake-onset detection** (`motion.ts`). We read `DeviceMotionEvent.accelerationIncludingGravity`, low-pass it to estimate the slowly-varying gravity vector, subtract that baseline to get linear acceleration, take the magnitude, and fire on a downward threshold crossing (just after the peak) with a ~150ms refractory period. Peak magnitude maps to intensity. iOS 13+ requires `DeviceMotionEvent.requestPermission()`, called inside the Start tap. The threshold and sensitivity are exported top-level constants — see warts below.
- **Modal bell synthesis** (`audio.ts`). No samples and no single sine. Each struck bell is a small bank of inharmonic partials at non-integer ratios (~1, 2, 2.4, 3, 4.5) with independent exponential decays (low partials ring longer, bright partials die fast) and a slight per-partial detune so the bell *beats* and shimmers. Polyphony is normalized by 1/√voices so a big arpeggio never clips or turns harsh.
- **Kids-safe master chain.** master `GainNode` (≤0.3) → lowpass `BiquadFilter` (~6500 Hz) → `DynamicsCompressor` (threshold −10, ratio 20) → destination. Always-on soft G drone (G2 + D3) under everything. All attacks ≥10ms — no sudden loud transients.
- **WebGL2 glow field** (`gl.ts`). Hand-written WebGL2 (no three.js, no libs): an additive point-sprite radial-glow field of warm gold/amber bells over a breathing deep blue-violet night. A struck bell blooms (point size + brightness) and decays. The glow is driven by the audio amplitude estimate only — the audio is never driven off the visual.

## Graceful degradation

- Sensor denied or absent → a `text-rose-300` notice, but the big button, spacebar, and ghost auto-shaker all keep working.
- WebGL2 unavailable → a Canvas2D fallback renderer (`BellField2D` via `makeCanvas2DRenderer`) with the same glow language.
- Neither graphics path works → a `text-rose-300` notice; the bells still ring.
- Full teardown on unmount: cancel rAF, remove the DeviceMotion listener, disconnect/stop all audio nodes, close the AudioContext, lose the GL context.

## References

- **Orff Schulwerk** handbell / body-percussion pedagogy — children make music through gesture and whole-body movement before notation; the shake-as-strike maps directly onto that tradition.
- **Modal color vs functional cadence** — choosing Mixolydian's lowered 7th for *color* rather than building a tonic-dominant pull is a deliberate modal (not functional-harmony) design choice.
- **2026 embodied-children-music research line** — including the *Moving Mandala* (2025) work on embodied, movement-driven musical interfaces for young children, which motivates input-as-gesture over input-as-pointer.

## Honest warts

- **Shake thresholds are reasoned, not measured.** There is no accelerometer in the build container, so `SHAKE_THRESHOLD`, `SHAKE_FULL`, `SHAKE_REFRACTORY_MS`, `GRAVITY_SMOOTH`, and `SHAKE_SENSITIVITY` are physically plausible estimates that *want real-device tuning*. The exported constants make that tuning a one-line change.
- **Not ear-verified.** With no audio device in the container, the bell timbre, the polyphony normalization, and the lull envelope were designed by reasoning about the synthesis, not by listening. Expect to tweak decay times and partial gains once you can actually hear it.
