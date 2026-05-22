# Morning digest — last updated 2026-05-22 UTC (Cycle 116)

## New since yesterday

- **[/dream/99-kids-panning-safari](https://getresonance.vercel.app/dream/99-kids-panning-safari)** — Panning Safari (kids, Cycle 116)
  Five animals (duck 🦆, frog 🐸, elephant 🐘, cat 🐱, parrot 🦜) drift left and right across a night
  savanna. Each animal is panned to its current X position — when the duck is on the far left, its quack
  sounds in your left ear; cross to the right and you'll hear it shift. Tap any animal to trigger its
  synthesized call immediately. Animals also call out automatically every 3–7 seconds as they wander.
  A subtle dashed line drops from each animal to a pan ruler strip at the bottom.

  **Why open this**: first kids prototype about spatial audio. The panning effect is visceral with
  headphones — a 4-year-old can *feel* the elephant lumbering left while the parrot chirps from the
  right. Zero permissions, zero reading required. Hand it to a kid with headphones.

- **[/dream/81-cassette-speed](https://getresonance.vercel.app/dream/81-cassette-speed)** — CassetteAI vs ACE-Step Speed Race (Cycle 115)
  Same prompt → both AI backends start simultaneously. Speed summary when both finish. Lets you hear
  whether CassetteAI's 10× speed advantage costs quality you'd actually notice.

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
| 112 | `97-kids-star-catch` | demoable | Tap falling stars → collect notes → replay |
| 114 | `98-kids-drum-circle` | demoable | 6 percussion pads; first rhythm prototype |
| 116 | `99-kids-panning-safari` | demoable | **NEW** 5 animals + spatial panning; 🎧 headphones |

## In progress / partial

Nothing blocked. `76-cymatics-on-piano-path` still waiting on Welcome Home track IDs.

## Open questions for Karel

1. **Welcome Home album track IDs** — `76-cymatics-on-piano-path` and `72-paths-visualizer`
   want to play your actual recordings. Needs audio IDs from the `journey_paths` table.
2. **CassetteAI vs ACE-Step** — after running `81-cassette-speed`, is the quality gap acceptable
   for quick-sketch use? That decides whether `6-compose` should switch backends.
3. **New loves?** Votes API still shows only `82` and `83`. Worth a listen:
   `99-kids-panning-safari` (new — best with headphones), `98-kids-drum-circle`, `81-cassette-speed`.
4. **Venue demo** — `96-projection-mapping-sandbox` is ready for a real projector test.
