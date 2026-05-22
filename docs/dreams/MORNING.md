# Morning digest — last updated 2026-05-22 UTC (Cycle 107)

## New since yesterday

- **[/dream/84-wave-fluid](https://getresonance.vercel.app/dream/84-wave-fluid)** — Wave Fluid (WebGPU ocean)
  Audio-reactive ocean surface in a single WebGPU fragment shader. Bass raises the swell,
  treble chops the surface, onsets send ripples. Click anywhere on the water for a manual splash.
  Sky has twinkling stars + spray particles arcing on parabolic paths. Water has caustic
  shimmer, subsurface violet volume scatter, rose/violet waterline bloom.
  **Why open this**: hit "Demo mode" and watch the ocean breathe. Click the water a few times
  to see the expanding ring ripples. Then try mic — piano bass notes make dramatic swells.
  WebGPU required (Chrome/Edge 113+, Safari 26+). Graceful fallback to 3-fluid if unavailable.

## Kids zone — full status

| Cycle | Prototype | Status | Notes |
|-------|-----------|--------|-------|
| 92 | `82-kids-color-piano` | demoable | **Karel loved ❤** |
| 96 | `83-kids-tilt-rain` | demoable | **Karel loved ❤** |
| 98 | `88-kids-hum-to-paint` | demoable | mic → hum paints canvas |
| 100 | `90-kids-puddle-jumper` | demoable | tap pond → ripples; zero permissions |
| 102 | `91-kids-character-band` | demoable | 5 animals, Toca Band-style |
| 104 | `92-kids-ghost-lullaby` | demoable | Ghost floats, tap/drag → notes, lullaby at 2 min |
| 106 | `93-kids-share-screen` | demoable | Two-finger co-play; pentatonic harmony guarantee |

## Previous notable

- **Cycle 106**: [/dream/93-kids-share-screen](https://getresonance.vercel.app/dream/93-kids-share-screen) — Two-finger co-play. First finger = violet, second = rose. Pentatonic; any two notes always sound consonant. Hand the iPad to a kid, add your finger.
- **Cycle 105**: [/dream/73-journey-arc-spread](https://getresonance.vercel.app/dream/73-journey-arc-spread) — 5 published journeys × distinct visual arcs. Star field, Mycelium network, Sacred mandala, Ocean bands, Snowflake. Tab while running.
- **Cycle 103**: [/dream/86-sound-to-video](https://getresonance.vercel.app/dream/86-sound-to-video) — 10 s audio → FLUX.2 image → LTX-Video 5 s clip. ~$0.25/gen.

## In progress / partial

Nothing blocked. Full queue in IDEAS.md.

## Research findings worth a look

No new research this cycle (build cycle). Prior findings in RESEARCH.md.

## Open questions for Karel

1. **Welcome Home album track IDs** — `76-cymatics-on-piano-path` and `72-paths-visualizer`
   both want to use your actual recordings. Needs audio IDs from the `journey_paths` table.
   What's the easiest way to expose those?
2. **Wave Fluid feedback** — Does the height-field ocean satisfy the "WebGPU ocean" vision,
   or do you want a true particle-based MLS-MPM upgrade (Cycle 109 candidate)?
3. **New loves?** Votes API still shows only `82` and `83`. Anything new worth deepening?
   `84-wave-fluid` and `73-journey-arc-spread` in particular would be informative.
4. **Cycle 108 (kids)**: leaning toward `kids-ghost-echo` (tap → Ghost appears + plays a note,
   multiple Ghosts coexist, "spirit pond" feel). Or would you prefer polish on `82-kids-color-piano`?
