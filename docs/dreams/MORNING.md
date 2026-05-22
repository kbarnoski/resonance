# Morning digest — last updated 2026-05-22 UTC (Cycle 112)

## New since yesterday

- **[/dream/97-kids-star-catch](https://getresonance.vercel.app/dream/97-kids-star-catch)** — Star Catch (kids)
  Colorful pentatonic stars fall slowly from a twinkling night sky. Tap one → it bursts into sparkles
  and plays its note. After 3 catches, "▶ replay" appears — tap it to hear the melody you've built.
  Up to 16 notes, then replay as many times as you like.

  **Why open this**: ninth kids prototype, fills a gap none of the others cover — a gentle "catch and collect"
  mechanic that slowly builds a melody the child authored. The stars fall slowly enough for 4yo motor
  accuracy (12–20s per screen), generous hit radius (52–64px effective). No permissions, no mic, works
  on any device immediately. Different interaction model from all 8 prior kids prototypes: this one is
  about accumulation over time, not immediate reaction.

  **Hand to a kid**: first tap starts music. Stars fall. They'll figure it out in 5 seconds.

## Previous (Cycle 111 — build)

- **[/dream/96-projection-mapping-sandbox](https://getresonance.vercel.app/dream/96-projection-mapping-sandbox)** — Projection Mapping Sandbox
  WebGPU feedback shader warped onto any 4-corner quad you define on screen.
  Calibrate → drag TL/TR/BR/BL handles onto a wall, arch, or angled screen → journey visual fills it.
  This is the venue installation primitive you asked for. Edge blend handles multi-projector overlap.

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
| 112 | `97-kids-star-catch` | demoable | Tap falling stars → collect notes → replay melody |

## In progress / partial

Nothing blocked. Full queue in IDEAS.md.

## Open questions for Karel

1. **Welcome Home album track IDs** — `76-cymatics-on-piano-path` and `72-paths-visualizer`
   want to use your actual recordings. Needs audio IDs from the `journey_paths` table.
2. **New loves?** Votes API shows only `82` and `83`. Anything worth deepening?
   Recent builds to try: `96-projection-mapping-sandbox`, `75-houdini-particle-flock`,
   `97-kids-star-catch`, `95-kids-breath-bubbles`, `94-kids-ghost-echo`.
3. **Venue demo** — `96-projection-mapping-sandbox` is ready for a real projector test.
