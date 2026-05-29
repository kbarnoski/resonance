# 211 · kids-firefly-web

**Route**: `/dream/211-kids-firefly-web`  
**Status**: `demoable`  
**Cycle**: 244 (2026-05-29)

---

## The question

What if releasing lights into a dark space could weave music?

## Interaction

- **Tap anywhere**: a firefly appears at that point, glowing with a warm hue and drifting gently.
- Fireflies have subtle mutual attraction — they wander, but tend to drift toward each other.
- When two fireflies come within ~155 px, they **spin a glowing silk thread** between them.
  The thread vibrates (quadratic Bézier with a sinusoidal perpendicular offset).
- **On thread formation**: a triangle-oscillator chime sounds, pitched by thread length:
  short thread → high pentatonic note; long thread → low pentatonic note.
  All notes are from C pentatonic major (C4–D5), so multiple threads always harmonize.
- Up to 8 fireflies on screen at once. The thread web can hold up to 28 simultaneous connections.

## Audio design

- **Chime synthesis**: single triangle oscillator, soft attack (10 ms linear ramp), 2.2 s exponential decay.
- **Pitch mapping**: `PENTA[round((1 − dist/CONNECT_DIST) × 7)]` — 8-note pentatonic lookup.
  Closer = higher index = higher note (C5, D5 range). Farther apart = lower notes (C4, D4 range).
- **No ambient pad** — the silence between chimes is part of the experience. Kids notice when two
  fireflies are about to meet.

## Visual design

- Dark canvas `#04040e` with 21% translucent fill each frame (trail glow, not a hard erase).
- Each firefly: radial gradient halo (24 px radius, pulsing at ~0.5 Hz) + bright 5 px core dot.
- Each thread: `createLinearGradient` from firefly A hue to firefly B hue, with the midpoint
  brightened. Line width scales with closeness (1.6–2.6 px). Canvas `shadowBlur=12` for the silk glow.
- Hue range 48–160° (yellow-green to cyan) — warm insect palette, never red (avoids alarm associations).

## Physics

- Velocity integration with friction 0.983 / frame.
- Soft attraction force: `0.022 × (1 − d/(CONNECT_DIST×2.2))` for nearby fireflies.
- Random wander jitter: `±0.055` per axis per frame.
- Speed clamp: 1.3 px/frame max.
- Wall repulsion: invisible springs 22 px from each edge.

## Why it works for 4-year-olds

- **Zero reading** — a glowing dot appears wherever you tap. Cause = effect, no words needed.
- **Immediate feedback** — halo and drift start within the same frame as the tap.
- **No wrong moves** — every tap releases something beautiful; no fail states.
- **Collaboration** — two kids can take turns tapping, building a web together.
- **Musical magic** — the chime surprise moment (thread appears + sound) is repeatable and
  predictable enough that children will intentionally tap near existing fireflies to trigger it.

## Connection to loved prototypes

- `140-kids-string-bridge` ❤ — tapped points → silk connections; firefly-web makes the endpoints
  alive (they drift) instead of static.
- `133-kids-ripple-pond` ❤ — proximity → harmonic event; same spatial music logic.
- `169-kids-marble-run` ❤ — organic physics toy feel; fireflies share the gentle drift aesthetic.

## Polish ideas

- **Mic mode**: mic amplitude → firefly speed (breathing into mic makes them swarm).
- **Thread count hud**: show "4 threads humming" as ambient feedback.
- **Thread snap**: when a long thread breaks, a quick "pluck" descending glissando.
- **Color families**: assign hue ranges to quadrants of the screen (left = warm, right = cool)
  so cross-screen threads produce a wider harmonic interval.
- **Second harmonic**: chime could also play the note an octave up at half volume for richness.
