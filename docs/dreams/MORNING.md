# Morning digest — last updated 2026-05-22 UTC (Cycle 111)

## New since yesterday

- **[/dream/96-projection-mapping-sandbox](https://getresonance.vercel.app/dream/96-projection-mapping-sandbox)** — Projection Mapping Sandbox
  WebGPU feedback shader warped onto any 4-corner shape you draw on screen.
  This is the venue installation tool you asked for — drag the TL/TR/BR/BL corner handles
  onto a wall corner, arch, or angled screen surface and the journey visual fills it live.

  **How to experience it**: Open on desktop Chrome → hit "Calibrate" → drag the four colored
  dots to the corners of whatever surface you want to project onto (or just pull them into an
  interesting quadrilateral). Hit "Demo" for audio reactivity. The black area outside the quad
  goes dark — exactly what a real projector would show.

  **Why open this**: You've been asking about installation/venue mode for months. This is the
  GPU primitive that makes it possible: define the projection surface by dragging four points,
  the shader maps itself to fill it using bilinear inverse mapping. Edge blend adds soft
  fade-out at the quad margins (standard projection technique for multi-projector overlap).
  Rotate/zoom/decay sliders let you tune the feedback feel. Three color themes: Cosmic, Earth, Ocean.

## Previous (Cycle 110 — kids)

- **[/dream/95-kids-breath-bubbles](https://getresonance.vercel.app/dream/95-kids-breath-bubbles)** — Breath Bubbles (kids)
  Blow into the mic → colorful soap bubbles float upward and pop with pentatonic dings.
  Tap to drop manual bubbles. Demo mode auto-breathes. Zero permissions needed for demo.

## Kids zone — full status

| Cycle | Prototype | Status | Notes |
|-------|-----------|--------|-------|
| 92 | `82-kids-color-piano` | demoable | **Karel loved ❤** |
| 96 | `83-kids-tilt-rain` | demoable | **Karel loved ❤** |
| 98 | `88-kids-hum-to-paint` | demoable | hum → colored brush strokes |
| 100 | `90-kids-puddle-jumper` | demoable | tap pond → ripples; zero permissions |
| 102 | `91-kids-character-band` | demoable | 5 animals, Toca Band-style |
| 104 | `92-kids-ghost-lullaby` | demoable | Ghost floats, tap/drag → notes |
| 106 | `93-kids-share-screen` | demoable | Two-finger co-play; pentatonic harmony |
| 108 | `94-kids-ghost-echo` | demoable | Spirit pond — tap → Ghost appears + fades |
| 110 | `95-kids-breath-bubbles` | demoable | Blow → bubbles float + pop |

## In progress / partial

Nothing blocked. Full queue in IDEAS.md.

## Open questions for Karel

1. **Welcome Home album track IDs** — `76-cymatics-on-piano-path` and `72-paths-visualizer`
   want to use your actual recordings. Needs audio IDs from the `journey_paths` table.
2. **New loves?** Votes API still shows only `82` and `83`. Anything worth deepening?
   `96-projection-mapping-sandbox`, `75-houdini-particle-flock`, `84-wave-fluid`,
   `94-kids-ghost-echo`, `95-kids-breath-bubbles` are all fresh to try.
3. **Venue demo** — `96-projection-mapping-sandbox` is ready for a real projector test.
   If you have a surface in mind, the corner calibration should get you there in ~30 seconds.
