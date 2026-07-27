# 3008 · Daylight

**Route:** `/dream/3008-daylight`

**The one question:** *What if the light in your room were the instrument?*

## The idea

The webcam reads **the environment** — the room's overall brightness, its
warm↔cool colour, and how much is moving — **not your body**. Those three
numbers become one slow, living, continuous-pitch chord and a matching aurora,
so the sound and the image are the same gesture.

This is the **inverse colour-organ**. Alexander Scriabin scored a colour part
(*tastiera per luce*) into *Prometheus: Poem of Fire* (1910), and
Louis-Bertrand Castel built his *clavecin oculaire* — a colour-harpsichord — in
the 1730s. Both turned **sound into light**. Daylight runs the arrow the other
way: **colour drives sound.** It is the canonical "whole-frame" read — the
entire camera image collapses to one breathing chord.

## How to play

1. Press **Start**. This one gesture opens the AudioContext and requests the
   camera (video only, never audio).
2. **Dim the room or cup the lens** → the chord hushes toward silence and the
   aurora darkens.
3. **Face a warm lamp vs a cool window** → the base pitch, interval colour, and
   the aurora's hue slide between indigo (cool) and magenta (warm).
4. **Wave a hand across the frame** → shimmer rises and light catches an accent.
5. **No camera / permission denied / headless?** A seeded autopilot drifts the
   same three numbers like a room easing into dusk with passing clouds — the
   piece is always alive, and a notice says so.

## How it works

Each frame the video is drawn into a tiny 64×48 offscreen canvas and reduced,
via `getImageData`, to three scalars: **L** (mean perceptual luminance, heavily
smoothed so it breathes), **H** (mean warm↔cool balance from R vs B), and **M**
(mean absolute frame-to-frame difference, smoothed less so gestures register).

- **L →** overall gain + number of audible partials + spectral brightness
  (a master lowpass). Dark room = hushed, low, few partials.
- **H →** base frequency, detune, and interval colour — the warm and cool chord
  ratios are lerped continuously, so nothing ever snaps to a scale.
- **M →** tremolo/shimmer depth, with a soft accent on motion spikes.

All parameter changes glide via `setTargetAtTime` — ambient, no clicks.

## Design notes

- **Continuous, never quantised.** The chord's root and its partial ratios
  glide between a warm stack (octaves + low fifth) and a cool one (open ninth +
  brighter partials). Warmth bends the harmony without a single discrete step.
- **The image is the sound.** The aurora is driven by the exact same L/H/M, on
  the same smoothing — so what you hear and what you see are one gesture, not a
  chart of it.
- **Alive by default, private by design.** The seeded (`mulberry32(0x3008)`)
  autopilot means the page is demoable with no camera at all. All pixel work is
  client-side; no pixel data leaves the browser and the prototype makes no
  network calls.

## Where this goes next (multi-cycle)

Daylight is cycle 1 of a multi-cycle build — the canonical, most-legible
"whole-frame → one chord" read, shipped first on purpose so the idea lands in
one glance. It was the winner of a DEEP race against two other attacks on the
same concept, both built demoable and banked (IDEAS §918) to graft on next:

- **Spatial voicing (from `lumen`).** Split the frame into a grid of zones and
  give each its own voice — brightness = level, hue = timbre, column = stereo
  pan, row = continuous pitch — so a light *gradient* across the room (bright
  window left, shadow right) becomes a chord's *voicing* you can see, and a
  swept hand/shadow (optical flow) *strums* the voices it crosses.
- **Long-form memory (from `gloaming`).** Instead of a moment-to-moment map,
  accumulate the light's *history* into a decaying bank of strata (~45s
  half-life, re-occurring light reinforces rather than duplicates), so the room
  at dusk *composes* a piece that is different at minute 5 than at second 0 —
  the lab's long-form-stateful seam, driven by light.

The natural fusion: a spatial light field whose zones each carry a little
memory — an instrument that is legible in a glance *and* rewards being left
running for minutes.
