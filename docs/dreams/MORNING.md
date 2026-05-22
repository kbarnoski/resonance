# Morning digest — last updated 2026-05-22 UTC (Cycle 106)

## New since yesterday

- **[/dream/93-kids-share-screen](https://getresonance.vercel.app/dream/93-kids-share-screen)** — Share the Screen (kids)
  Full-screen canvas for two simultaneous players. First finger = violet voice, second = rose voice.
  Slide up = higher note, slide down = lower. Both voices draw from C-major pentatonic — any two
  simultaneous notes sound consonant (no wrong combinations). Smooth pitch glide, sparkle trails,
  animated dashed line connecting the two orbs when both are active.
  **Why open this**: hand the iPad to a kid, put your own finger on the screen at the same time.
  Slide yours slowly up while theirs stays low — instant parallel thirds. This is the co-play
  prototype you requested from KIDS.md. Zero permissions, zero API, loads instantly.

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

- **Cycle 105**: [/dream/73-journey-arc-spread](https://getresonance.vercel.app/dream/73-journey-arc-spread) — 5 of your published journeys × distinct visual arcs. Cosmic star field, Mycelium network lines, Sacred hexagonal mandala, Ocean sine bands, Snowflake falling shapes. Tab between them while running.
- **Cycle 104**: [/dream/92-kids-ghost-lullaby](https://getresonance.vercel.app/dream/92-kids-ghost-lullaby) — Your Ghost floats on a Lissajous path. Tap → note. Drag → glissando + sparkles. Lullaby after 2 min.
- **Cycle 103**: [/dream/86-sound-to-video](https://getresonance.vercel.app/dream/86-sound-to-video) — 10 s audio → FLUX.2 scene image → LTX-Video 5 s clip. ~$0.25/gen.

## In progress / partial

Nothing blocked. Full queue in IDEAS.md.

## Research findings worth a look

No new research this cycle (build cycle). Prior findings in RESEARCH.md.

## Open questions for Karel

1. **Welcome Home album track IDs** — `76-cymatics-on-piano-path` and `72-paths-visualizer` both want to use your actual recordings but need the audio IDs from the `journey_paths` table. What's the easiest way to expose those?
2. **Share the Screen feedback** — Does the violet/rose color assignment feel right? Any preference for different voice colors or interaction model?
3. **New loves?** Votes API still shows only `82` and `83`. Anything new worth deepening? The Journey Arc Spread (`73`) in particular would be worth a vote if the visual differentiation across journeys feels useful.
4. **Next build (Cycle 107)** — leaning toward `76-cymatics-on-piano-path` (Chladni patterns driven by your Welcome Home tracks) if audio IDs are available, otherwise `84-wave-fluid` (WebGPU MLS-MPM ocean sim).
