**For**: kids (4+)

# 974 · Tilt Cadence Meadow

*What if a 4-year-old could FEEL a real V7→I cadence in their hands — by TILTing
the tablet to roll a glowing marble HOME through a tension-and-resolution
landscape?*

Route: `/dream/974-kids-tilt-cadence`

## What it is

Three colored wells sit on a warm, daytime meadow. A glowing marble rolls under
simulated gravity as the child tilts the device. The wells **are** Hugo
Riemann's harmonic functions:

- **Gold "Home" well = Tonic (I)** — the resting place, center-ish.
- **Green "Away" well = Subdominant (IV)** — departure.
- **Orange "Pull" well = Dominant 7th (V7)** — restless, contains the leading
  tone (E) and the chordal 7th (B-flat) of C7.

While the marble sits in a well, that chord sounds (soft pad) over an always-on
quiet tonic drone (F2 + C3), so it never feels broken.

**The magic moment:** rolling the marble from the orange **Dominant (V7)** well
into the gold **Tonic (I)** well fires a real **authentic cadence** with genuine
voice-leading — the leading tone E resolves **up** a semitone to F, the chordal
7th B-flat resolves **down** to A, root C → F, fifth G → A. Sparks burst from the
marble and flowers bloom around the gold well. Tension → home, learned in the
hands.

Key: **F major**. This is real functional harmony with genuine tension and
resolution — not pentatonic "no wrong notes".

## How it works

- **Input = device TILT.** `DeviceOrientation` `beta`/`gamma` set a gravity
  vector. Non-pointer — that's the whole point.
- **Physics:** a damped point-mass marble on a height field of three Gaussian
  attractor basins (see `physics.ts`). Tilt sensitivity and downhill accel are
  exposed as constants near the top (`TILT_SENSITIVITY`, `DOWNHILL_ACCEL`,
  `TILT_GRAVITY`, `DAMPING`) — tune `/35` and `1.9` first on a real device.
- **Harmony state machine:** well transitions drive a real chord machine
  (`audio.ts`, `HarmonyEngine`). `V7 → I` is detected explicitly and triggers the
  cadence with scheduled frequency glides for voice-leading.
- **Output = Canvas2D additive warm-meadow glow** (gold/green/amber) — sun wash,
  glowing basins, sparks, blooming flowers. No dark cosmic nebula.

## Degrades gracefully

- **iOS** permission is requested via `DeviceOrientationEvent.requestPermission()`
  inside the Start button gesture.
- **No sensor / denied / desktop:** falls back to an on-screen drag tilt-pad
  (drag a puck to set the gravity vector) **and** arrow-key nudges. A `rose-300`
  note appears when the sensor is unavailable.
- **Hands-free auto-demo:** if untouched ~3s, the marble auto-rolls a full
  T→S→D→I loop in ~1s so a zero-interaction glance both sees motion and hears a
  cadence resolve.
- Canvas2D only (no WebGL dependency); audio is independent of the visuals.

## Kids-safe

No reading required to play, big saturated colors, ≥64px tap target on Start,
clamped marble speed, gentle attack/release, low-pass filtered output — no sudden
loud sounds, no high ringing.

## Files

- `page.tsx` — UI, canvas render loop, tilt/pad/keyboard input, auto-demo.
- `physics.ts` — height field, Gaussian wells, damped marble integrator.
- `audio.ts` — `HarmonyEngine`: drone, I/IV/V7 voicings, V7→I cadence.

## Named references

- **Hugo Riemann functional harmony** — the wells literally are Tonic /
  Subdominant / Dominant.
- **Toca Boca tilt-toys** — playful, no-instructions tablet interaction.
- **BeSound** — embodied music education for children.
- **CHI 2026 "From Movement to Sound and Back"** — movement-based sonification
  workshop.

## Design notes

The bet here is that *functional harmony is a feeling of physical place*: the
tonic is where things rest, the dominant is where things are pulled taut. By
mapping those functions onto literal gravity wells and asking the child to do the
work of bringing the marble home against the tilt, the V7→I resolution stops
being an abstract music-theory rule and becomes a bodily relief — the same relief
as a marble finally dropping into its bowl. The voice-leading (leading tone up,
seventh down) is scheduled as audible frequency glides at the moment of arrival
so the resolution is heard, not merely implied, and the always-on tonic drone
keeps the home key present so the ear always knows where "home" is.
