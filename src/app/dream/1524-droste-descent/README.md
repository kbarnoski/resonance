# 1524 · Droste Descent

**The one question:** _Can you hold infinite regress in your hands and steer it —
plunge, climb, and twist through an endlessly self-nesting tunnel where every
level you fall through is felt as one octave of falling pitch?_

An **infinite-zoom Droste tunnel built entirely from DOM `<div>`s and CSS 3D
transforms** (no `<canvas>`, no WebGL), welded 1:1 to a **Shepard–Risset endless
glissando**. You don't watch it run — you play it.

## How to play

- **Begin the descent** — the first gesture (button, drag, or key) unlocks audio.
- **Pointer drag** — vertical position dives (lower half) or climbs (upper half);
  horizontal position twists the tunnel.
- **Keyboard** — `W`/`↑` dive, `S`/`↓` climb, `A`/`D` twist left/right,
  `Space` = surge (a burst of speed + reverb bloom).
- Let go and it keeps drifting downward on its own — kinetic at rest, never blank.
- Top-right HUD shows accumulated **depth** and current velocity.

## The technique

- **Discrete-Droste treadmill.** Only `N = 13` real nested frame `<div>`s exist.
  A continuous `travel` value (levels descended) is accumulated; each frame's
  on-screen level is `((k − travel) mod N)`, positioned in Z under a single CSS
  `perspective`. When a frame passes the camera it wraps to the far plane and
  fades in — because every frame is identical, the wrap is seamless and the
  descent is endless. Per-level `rotateZ` gives the helical twist that the
  mathematical Droste effect predicts.
- **See = hear.** Descent velocity drives the Shepard engine's glide rate
  (`rate ≈ |velocity|`, in octaves/sec = levels/sec), so the pitch falls exactly
  as fast as the eye descends. Two engines (`dir = −1` fall, `dir = +1` climb)
  crossfade by the sign of velocity so reversing direction reverses the glide.
- **Boundary bells.** Each integer level crossing rings a just-intonation bell
  (cycled through a small JI chord palette), marking the octave you just fell.
- **Bed + space.** A JI drone bank (`droneBank`) opens its filter with intensity;
  a code-generated convolution void (`convolutionVoid`) supplies the cavern.
- **Audio safety.** AudioContext is gesture-gated; master ramps from silence to
  ≤ 0.18 through a `DynamicsCompressor` limiter; bell polyphony is capped (oldest
  stolen); full teardown on unmount. No luminance strobe — only smooth transform
  motion + slow hue drift. `prefers-reduced-motion` slows the drift and caps the
  max descent rate.

## Named references

- M.C. Escher, _Print Gallery_ (1956) — the canonical painted mise-en-abyme.
- The **Droste effect** (Droste cocoa tin, 1904) — a picture containing itself.
- Bart de Smit & Hendrik Lenstra, _The Mathematical Structure of Escher's Print
  Gallery_ (2003) — the conformal/logarithmic-spiral completion of the Droste
  loop, echoed here as per-level twist.
- Roger Shepard (1964) / Jean-Claude Risset — the auditory barber-pole / endless
  glissando used as the carrier.
- The DMT / hypnagogic **tunnel form-constant** (Klüver) — the felt target.

## Nearest neighbour / honest knocks

- **Nearest neighbour:** any infinite-zoom fractal shader (a Mandelbrot dive, a
  Droste GLSL loop). The wager here is that _real nested frames_ make the
  **self-nesting legible as nesting** — you can count the frames you fall
  through — in a way a fractal blur cannot, and that welding it to a played
  Shepard tone turns a screensaver into an instrument.
- **Knock 1:** the see=hear lock is tight while descending or holding, but
  loosens under rapid direction reversals — the fall and climb engines crossfade
  rather than sharing one continuous phase, so a hard flip has a brief seam.
- **Knock 2:** `N = 13` DOM layers is a real ceiling; at very high twist rates the
  near frame's rotation can read as spin rather than pure depth. It's a tunnel,
  not a true conformal Escher grid — the de Smit/Lenstra spiral is only gestured
  at, not solved.
- **Knock 3:** CSS 3D compositing is smooth on desktop and modern mobile but has
  no sub-pixel antialiasing control; frame borders can shimmer slightly at the
  vanishing point.
