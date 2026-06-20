**For**: kids (4+)

# Kite Flyer

Tilt the tablet to fly a glowing kite across a bright, sunny daytime sky — and
the kite's flight *plays music*. The kite's **height** is a melody (snapped to a
major pentatonic, so every height is a "right" note — higher is higher), the
**wind** is a rhythm (gusts toss in soft sparkle chimes), and the taut
**string** hums a soft Aeolian drone that swells the more it tightens.

No reading required: one big "Fly!" button starts everything (and on iOS unlocks
audio + requests tilt permission inside that tap). If there's no tilt sensor or
permission is denied, you steer by dragging a finger/mouse — and if nobody
touches it for ~2 seconds, a gentle "ghost breeze" keeps the kite swooping and
singing on its own, so it's never silent or still.

## How it plays

- **Tilt left/right** → kite moves across the sky (gamma).
- **Tilt forward/back** → kite climbs or dives (beta).
- **Altitude → melody** — bell/marimba notes on a C major pentatonic.
- **Wind gusts → rhythm** — sparkle chimes + particle bursts.
- **String tension → Aeolian drone** — a soft filtered-sawtooth hum that swells
  and brightens as the string tightens.

Audio runs through a kid-safe master chain: master gain ≤ 0.3 → lowpass ≤ 7500 Hz
→ DynamicsCompressor (−10 dB, 20:1) → destination. A warm pentatonic pad is
always on so it never feels broken. Voices are capped at ~6 with refractory
timing so it can't pile into noise.

## Named references

- **The Aeolian harp** — an instrument the *wind* plays by vibrating a taut
  string. The swelling string-tension drone is the direct nod.
- **LocoRoco** — tilt the whole world to play.
- **Kite-flying as embodied, whole-body play** — the input *is* the body moving.

## Tags

- **INPUT**: device tilt (DeviceOrientation) + pointer-drag / ghost-breeze fallback
- **OUTPUT**: three.js real 3D geometry — gradient sky, smiling sun, fluffy
  clouds, rolling hills, a glossy diamond kite, a wavy bow tail, a visible string
- **TECHNIQUE**: tilt→spring kite-physics · altitude/wind→pentatonic
  sonification · string-tension→Aeolian sawtooth drone
- **PALETTE/VIBE**: bright sunny daylight, bold primary colors, exuberant

## Ambition-Floor self-assessment

- **#2 ≥3 distinct subsystems — YES.** Four clearly separable subsystems: (1)
  device-tilt input with a working drag + auto-breeze fallback, (2) a real
  three.js 3D scene with spring kite-physics, (3) altitude→pentatonic melody
  sonification, and (4) a string-tension→Aeolian sawtooth drone. They're wired
  but independently meaningful.
- **#3 named reference — YES.** The Aeolian harp (the string drone), LocoRoco
  (tilt-the-world), and kite-flying as embodied play.
- **#4 multi-cycle — PARTIAL.** It runs indefinitely and stays alive via the
  ghost breeze; there's no scripted long-form arc beyond optional softening, so
  this is a soft claim, not a strong one.
- **#1 never-before-used technique / #5 recent-research-cite — not claimed.**
  Tilt and pentatonic sonification both appear elsewhere in the lab; the novelty
  here is the *combination* (string-tension Aeolian drone driven by kite
  altitude), not a brand-new primitive.

Strongest claims: **#2** and **#3**.
