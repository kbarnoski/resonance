# 6936 · Float Drift

**The one question:** What if stilling your phone — sensory deprivation, a float
tank — let drug-free entoptic imagery bloom the quieter you get?

A cosmic-ambient / sensory-deprivation piece. The screen is a dark weightless
void. Hold the device stiller and slow entoptic Klüver-form geometry — cobweb,
spiral, faint lattice, rendered as vector SVG line-work — grows richer and more
organized. Move or shake and the imagery scatters back to sparse drifting
phosphene points. A slow just-intonation drone swells with imagery density.

## How the stillness → vividness engine works

A single **stillness** scalar `S ∈ [0,1]` is the imagery-vividness dial:

- **Motion energy** accumulates from device-motion *jerk* (frame-to-frame change
  in `accelerationIncludingGravity`), or from pointer speed on desktop. It decays
  toward zero every frame, so it reflects only *recent* movement.
- `targetStillness = 1 − smoothstep(motionEnergy)`. `S` eases toward that target
  slowly (a low first-order rate), so the field blooms and scatters as a gentle
  drift — every luminance/opacity change is well under 3 Hz. No strobe, ever.

`S` then gates three overlaid Klüver (1926) **form-constants**, each a persistent
SVG element pool whose `d`, opacity and transform are rewritten each rAF frame:

| Family  | Geometry                                   | Emerges around |
| ------- | ------------------------------------------ | -------------- |
| Cobweb  | radial spokes + concentric polygon rings   | `S ≳ 0.16`     |
| Spiral  | 2–3-arm logarithmic-ish spiral             | `S ≳ 0.42`     |
| Lattice | honeycomb of small hexagons                | `S ≳ 0.58`     |

Spoke/ring counts and turn counts also grow with `S`, so deep stillness reads as
*more organized*, not merely brighter. A pool of drifting phosphene points is the
always-present low-`S` baseline; it fades as the web fills in.

## Sensor mapping

- **`DeviceMotionEvent`** (primary): `accelerationIncludingGravity` jerk → motion
  energy → stillness. A phone held perfectly still still streams events, so
  "holding still" keeps the real-input path active and lets the field bloom.
- **`DeviceOrientationEvent`**: `gamma`/`beta` tilt → an eased **gravity vector**
  that offsets the field center and pulls the drifting points, giving the void a
  subtle "down."
- **Desktop / no permission**: pointer position = tilt, pointer speed = motion.
- **Idle (no real input for ~2.6 s)**: a seeded (`mulberry32(0x6936)`) auto-drift
  breathes stillness between calm and deep and slowly rotates the "down," so the
  piece is **alive on load** before any permission or gesture. Audio joins on the
  Start tap (iOS also requests `requestPermission()` there); it degrades to
  pointer + auto-drift if sensors are unavailable.

Determinism: all randomness is `mulberry32(0x6936)`; time is `performance.now()` /
`requestAnimationFrame`. `prefers-reduced-motion` slows the drift further and
reduces element counts.

## References

- Heinrich Klüver, form-constants (1926) — the cobweb / spiral / lattice /
  tunnel taxonomy.
- Kraehenmann et al. on Flotation-REST / sensory-deprivation phenomenology.
- Ganzfeld / hypnagogia and sensory-deprivation phenomenology — reduced sensory
  input surfacing endogenous, dream-like geometry.

## Next-cycle deepening

Add a **hysteresis "descent" memory**: once a visitor has held very still for a
sustained stretch, let the field retain a faint learned imprint of the geometry
it reached, so returning to stillness re-blooms *faster and richer* each time —
modeling how flotation practitioners drop into imagery more readily with
practice, and giving the piece a slow arc across a single sitting.
