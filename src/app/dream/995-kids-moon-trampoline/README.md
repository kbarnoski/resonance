**For**: kids (4+)

# Moon Trampoline 🌙

## The one question
What if a 4-year-old could tilt a tablet like a tray, roll a glowing moon-ball
across a springy **trampoline of stars**, and the stretching cloth itself
**RANG like a soft drum** — the sheet's own simulated vibration modes ARE the
sound?

## How to play (no reading required)
- **Tilt** your phone/tablet like a tray — the moon rolls toward the low side.
  (On iPhone/iPad, tap **Start** to grant motion access — that same tap also
  turns the sound on.)
- **Drag** a finger (or mouse) on the screen to tip the tray if there's no tilt
  sensor.
- **Arrow keys** nudge it and **space** levels the tray, on a laptop.
- **It plays by itself.** If nobody touches it for ~2 seconds, the moon drifts
  in a slow circle so the piece is always moving and singing — safe to leave on
  at bedtime. There's a gentle ~12-minute "goodnight" fade.

No fail states, nothing is "wrong" — only "different". Every sound is consonant.

## The technique
- **Physics — CPU-Verlet mass-spring cloth (Provot-style).** A 24×24 grid of
  point masses with **structural + shear + bend** springs, integrated with
  **Verlet** and stabilized by a few **PBD-style constraint-relaxation passes**
  per frame, plus **Provot's over-elongation cap** so the cloth can never blow
  up. The **four corners are pinned**. All on the CPU / main thread — no
  WebGPU, no workers — so it runs on basically any phone or laptop browser.
- **Render — hand-written TRUE-3D WebGL2.** Our own `perspective` + `lookAt`
  matrices (`gl-math.ts`, column-major, no three.js). A camera **gently orbits**
  so the sheet visibly stretches toward and away from you in depth — it reads as
  a real 3D scene, not a flat top-down heightmap. The cloth is a glowing wire
  lattice with **gold/white star-glints at the nodes** and faint indigo lines,
  over a deep-indigo **starry-night** background. The **moon-ball** is a soft
  additive-glow sphere that **dents** the sheet (sphere-vs-cloth push-out).
- **Audio — membrane-mode synthesis (Web Audio API, no libraries).** A small
  circular-membrane-ish modal bank (partials at ~1 / 1.59 / 2.14 / 2.30 / 2.65
  of a fundamental, with soft per-mode levels), an always-on **Eb + Bb drone
  pad**, and a kids-safe master chain
  (`gain ≤ 0.26 → lowpass ~6500 Hz → DynamicsCompressor(−10, 20:1)`,
  attacks ≥ 30 ms). Everything is in **Eb major** — no wrong notes.

## The audio mapping (the cloth drives the sound)
- **Dent depth → fundamental bends DOWN.** When the moon presses the sheet
  deep, the membrane's fundamental drops (up to ~3 semitones flat). This is the
  real physics of a struck membrane under large displacement: tension
  modulation shifts the partial frequencies — see Avanzini & Marogna below.
- **Ripple energy → higher drum-skin modes.** How fast the cloth and ball are
  moving opens the upper modal partials and brightens the tone.
- **Settle (ball at rest) → a sustained warm chord.** **Bounce (a sharp kick)
  → a soft bloom** on the Eb-major triad. Never silent, never harsh.

## Input chain (with full fallbacks)
1. `DeviceOrientationEvent` (`gamma`/`beta` → a 2D gravity vector). On iOS 13+,
   `requestPermission()` is called **synchronously inside the Start tap**.
2. Pointer drag tilts the tray.
3. Arrow keys + space.
4. Auto-demo (slow circular drift) after ~2 s of no input.

If the sensor is denied or missing, a notice in `text-rose-300` tells you to
drag or use keys — and the piece keeps playing itself.

## Files
- `page.tsx` — UI, Start/permission flow, input chain, and the physics→audio→
  render loop. (Client component.)
- `cloth.ts` — Provot mass-spring cloth: grid, springs, Verlet step, PBD
  relaxation, Provot cap, ball motion, sphere-vs-cloth collision, and the
  `maxDent` / `rippleEnergy` diagnostics fed to audio.
- `renderer.ts` — hand-written WebGL2: shaders for glowing lines + soft round
  glow points, the star field, the cloth lattice/nodes, and the moon-ball.
- `gl-math.ts` — column-major `mat4` perspective / lookAt / multiply, by hand.
- `audio.ts` — membrane modal bank, Eb+Bb drone, dent pitch-bend, ripple→modes,
  bloom, kids-safe master chain, 12-min goodnight fade.
- `README.md` — this file.

## References
- **Provot, X. (1995). "Deformation Constraints in a Mass-Spring Model to
  Describe Rigid Cloth Behaviour."** *Graphics Interface.* — the structural/
  shear/bend spring layout and the over-elongation (super-elasticity) cap.
- **Avanzini, F. & Marogna, R. "A Modular Physically Based Approach to the Sound
  Synthesis of Membrane Percussion Instruments." *IEEE Transactions on Audio,
  Speech, and Language Processing.*** — the tension-modulation amplitude-to-pitch
  coupling that motivates the dent→fundamental-bend mapping.

## Honest warts (reasoned, not device-verified)
- **Not run on real hardware here.** It was built and reasoned in a headless
  box; the WebGL2 path, iOS `requestPermission()` flow, and real
  `deviceorientation` axes/sign were not verified on an actual phone. The tilt
  axis signs may need flipping on some devices.
- The cloth points only move on the **vertical (Y) axis** — the lattice stays
  planar in X/Z. This keeps the simulation rock-stable and cheap, but it means
  the cloth doesn't fold or wrinkle sideways; it sags and rings, which is what
  the toy needs.
- The membrane modal bank is a **perceptual approximation** of a circular drum
  head, not a solved PDE — the partial ratios are idealized and the
  dent→pitch-bend curve is hand-tuned for "soft and pretty," not measured.
- 24×24 was chosen as a safe 60fps target for a mid phone; it has **not** been
  profiled on a low-end device. Drop `N` in `cloth.ts` if a real phone chugs.
- The moon-ball glow is an additive **point cluster**, not a shaded sphere — it
  looks soft and luminous (intended) rather than photoreal.
