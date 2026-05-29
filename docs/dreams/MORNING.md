# Morning digest — last updated 2026-05-29 UTC (Cycle 240)

## New since yesterday

- **[/dream/207-kids-harmonic-piano](https://getresonance.vercel.app/dream/207-kids-harmonic-piano)** (Cycle 240 — kids build)
  Four large glowing circles, each one a harmonic voice of a C chord.
  First tap wakes all four voices; each subsequent tap toggles one circle on or off.
  BANDIMAL rule: biggest violet circle (C3) = the deep fundamental; smallest amber (C5) = bright overtone.
  Sound goes from a pure flute-like tone (just fundamental) to a warm organ-like chord (all four).
  → **Why open this**: it's the first kids prototype where the child controls the *timbre* by
  adding/removing layers, not just which note plays. A 4yo discovers that circles = voices and
  combinations = different sounds. Introduce it as "the big circle is the voice's home, the small
  ones are its friends."

- **[/dream/206-sdf-cave](https://getresonance.vercel.app/dream/206-sdf-cave)** (Cycle 239 — adult build)
  Dark stone cave via SDF ray-marching — you're *inside* the space, not looking at a surface.
  Bass melts the cave geometry; treble roughens the stone; spectral centroid shifts the cave light.
  First SDF/ray-marching shader in the sandbox. On a projector = immersive stage backdrop.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- Cycle 213: `piano-motion` — Karel's Paths recordings → cartoon hands pressing keys in real time.
  High alignment with "use his real music as input" directive.

## Open questions for Karel

- **Voice Circles "Mic mode" idea**: detect pitch via autocorrelation, tune all four oscillators
  to harmonics of the detected fundamental (play A2 on piano → circles tune to A2/A3/E4/A4).
  One-cycle add-on if desired — would make this a live instrument.
- **Cave Paths mode**: add a track picker inside the cave — Karel's actual piano plays while
  the cave responds. One-cycle addition if desired.
- **`param-layer`** (DEMON hierarchical ring synthesizer) — deferred adult candidate.
  Build next adult cycle (241)?
