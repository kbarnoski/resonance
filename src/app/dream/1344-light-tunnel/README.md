# 1344 · Light Tunnel

**The one question:** What if the near-death tunnel-toward-light were rendered
entirely as living **vector line-art** — hundreds of animated concentric SVG
rings receding into a luminous center — that you steer by tilting your phone?

A dark void opens onto a tunnel of thin cool line-work that warms to gold and
white at the vanishing point. Tilt your phone to steer the vanishing point (the
tunnel bends toward your gaze) and to control how fast you fall toward the being
of light. A slow Shepard–Risset ascent breathes underneath. It is alive on load
— auto-drifting until you take control — and asks only for a single **Begin**
tap to start sound and motion together.

## The substrate — SVG DOM line-art (the whole point)

The render surface is a single inline `<svg>`. **There is no `<canvas>` and no
WebGL anywhere.** Every mark is a real SVG DOM element:

- **~90 concentric `<circle>` rings** form the tunnel. Each ring owns a phase
  offset; a global depth phase advances every frame. A ring's normalized depth
  `z ∈ [0,1)` maps to radius on a **log-polar** curve
  (`r = R_MIN · e^(z·ln(R_MAX/R_MIN))`), so travel feels like constant velocity
  down an endless tube.
- **A radial vector-field of ~30 `<line>` spokes** converges on the vanishing
  point and rotates slowly — the precise Ikeda/Lieberman line-field feel.
- **A `<radialGradient>` bloom** (`userSpaceOnUse`) is the being of light; its
  `r` grows with approach.
- **A `<radialGradient>` vignette rect** constricts toward the luminous core —
  the literal tunnel-vision of hypoxia — by animating a gradient stop offset.

Crucially, the elements are **created once** and then **reused**: the
`requestAnimationFrame` loop mutates each element's `r`, `cx`, `cy`, `stroke`,
`stroke-width` and `opacity` attributes in place. The DOM shape count never
changes frame to frame, which is what keeps ~120 animated SVG nodes smooth on a
phone.

### Bending the tunnel

Far rings (`z → 0`) are centered on the vanishing point; near rings (`z → 1`)
are centered on the frame. The blend weight is `(1 − z)^1.6`, so the mouth of
the tunnel stays with you while the depths curve toward wherever you steer —
the tunnel visibly **bends**.

## Input — device tilt, pointer fallback

- **Primary: `DeviceOrientationEvent`.** On iOS 13+ we call
  `DeviceOrientationEvent.requestPermission()` from inside the Begin gesture.
  `gamma` / `beta` steer the vanishing point; the magnitude of your lean sets
  the approach speed toward the light.
- **Fallback: pointer.** On desktop (or if motion access is denied) pointer
  position over the field becomes the tilt — position steers, distance from
  center is speed. An amber note announces the fallback.
- **Auto-drift** runs a slow Lissajous wander before you ever tilt, so the piece
  is alive the instant it loads.

## Audio — a real, time-based cosmic-ambient bed

See `audio.ts`. Built entirely in Web Audio, no files:

- A slow **Shepard–Risset ascent** — octave-spaced sine partials under a fixed
  Gaussian window, gliding upward forever (the auditory barber-pole). Uses the
  shared `_shared/psych/shepard.ts` engine.
- A warm **just-intonation drone bed** (`_shared/psych/droneBank.ts`) on an E1
  sub floor.
- Both poured into a synthetic **convolution void**
  (`_shared/psych/convolutionVoid.ts`).
- **Approach speed is the single drive**: it speeds the glide, opens a master
  low-pass, and lifts the wet tail toward the being-of-light moment.
- A **~0.1 Hz breath swell** breathes over the whole thing.
- Master gain ≤ 0.2 with exponential fade-in, a `DynamicsCompressor` limiter,
  and a full teardown that fades out and stops every oscillator.

It is deliberately **not** a beat, not a step-sequencer, not a struck bell — one
continuous, weightless, time-based rise.

## How to use

1. Open on a phone and tap **Begin** (grant motion access when asked).
2. Tilt to steer the tunnel; lean to fall faster toward the light; hold level
   to drift.
3. On desktop, just drag/move the pointer across the field to steer.
4. **Design notes** (top-right) opens an in-page overlay mirroring this README.

## Reference

In the lineage of **Ryoji Ikeda** (data / line minimalism) and **Zach
Lieberman** (generative vector poetry) — both living artists whose precise,
animated vector fields this piece translates into a near-death tunnel.

## Safety & degradation

- **No strobe.** Luminance changes are smoothed and stay ≤ 3 Hz; the center
  light is a slow bloom, never a flash.
- **`prefers-reduced-motion`** slows the approach and softens the contrast and
  vignette.
- **No tilt sensor / permission denied** → pointer-drag steers, announced in an
  amber note.
- **No audio** until Begin; full teardown on unmount.
