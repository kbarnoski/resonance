# 4232 · Pendulum — tilt a harmonograph until sight and sound agree

**The one question:** what if tilting your phone were a pair of pendulums, and
the slowly-decaying interference figure they trace were *both* a drawing you
watch close *and* a two-voice chord you hear — so sight and sound agree the
moment the figure closes?

Press **Start sound + tilt** (earbuds help). Lean the phone left/right and
front/back. Two pendulums — one per screen axis — change their swing ratios as
you tilt. When both ratios settle near a simple whole-number relationship the
traced rosette **closes and holds still**, and the two tones **lock into a
consonant chord**. Tilt away from those points and the figure precesses (never
quite closing) while the tones **beat and roughen**. The Pythagorean insight —
that simple frequency ratios are what sound consonant — made visible and audible
at once, in one gesture.

## What it is

- **INPUT** — device tilt (`DeviceOrientationEvent`; iOS `requestPermission()`
  is called inside the Start gesture). Falls back to dragging on the figure,
  then two sliders, then a seeded self-demo after a few seconds idle.
- **OUTPUT** — crisp inline **SVG**: one accumulated trail path (cap 2600
  points), a brighter leading tail, per-axis phase nodes, the pen dot, and axis
  guides. The violet ramp only.
- **TECHNIQUE** — a decaying-Lissajous **harmonograph** integrator + a two-voice
  just-ratio synth, coupled by the *same two ratios*.
- **VIBE** — geometric / analytic / meditative.

## The math

Two pendulums, phase-accumulated so ratio changes bend the curve instead of
tearing it, under one shared exponential decay:

```
x(t) = e^(−t/11s) · sin(2π · 0.55 · rx · t + π/2)
y(t) = e^(−t/11s) · sin(2π · 0.55 · ry · t)
oscillators: 220·rx Hz  and  220·ry Hz  (each a ±4¢-detuned pair → soft beats)
```

`rx` and `ry` are set by tilt, then **softly pulled** toward the nearest just
ratio in `{1:1, 5:4, 4:3, 3:2, 5:3, 2:1}` by a Gaussian basin
(`strength = exp(−((raw−target)/0.032)²)`, `value = lerp(raw, target,
strength)`). Near a basin the pull is ~1 → the ratio locks exactly → the figure
closes and the dyad is pure. Between basins the pull is ~0 → the raw ratio passes
through → precession + audible roughness. **It is a basin, not a quantiser:**
continuous pitch is preserved everywhere between the locks — there is no 12-TET
and no snap-to-scale.

`envAt(t) < 0.02` rings the figure out at ~26 s; **Re-strike** (and the idle
self-demo) resets the clock, phases and trail.

## Design decisions

- **Tare on the first tilt reading.** The resting angle at which you happen to
  hold the phone becomes the neutral (ratios ≈ 1:1 / a mid interval), so the
  figure isn't biased by hold posture — the one rough edge earlier versions
  carried.
- **Visuals run from mount; audio joins on Start.** So the piece is already
  drawing itself when you arrive (good for a phone glance), and sound attaches
  on the first tap (the browser gesture requirement).
- **The trail is written straight to the DOM** each frame (path `d` attributes),
  with only a ~9 Hz throttled React update for the text HUD, so 2600-point
  redraws stay cheap on a phone.
- **Two starved lanes at once** — tilt input (~0× in the recent window) and SVG
  output (jury-flagged as starving) — which is why this shipped: its strongest
  quality is diversity + phone-nativeness, not novelty of technique.

## References

- Hugh Blackburn's pendulum (1844); Jules Antoine Lissajous (1857); the Victorian
  parlour harmonograph.
- Just intonation / the Pythagorean small-integer-ratio account of consonance.

## Limits / next

Not ear/eye-verified from the build box (headless — no phone gyro, no speakers):
whether the lock *feels* like snapping shut and whether the beating→consonance
transition is as legible by ear as by eye want a real phone + earbuds.

Next-cycle deepening: independent per-axis decay (one voice outlives the other
into a bare drone) + a damping-driven hue shift; a third pendulum; a
re-ink/record button to keep a favourite figure.

*No API route, no network, no secrets — pure client Web Audio + SVG.*
