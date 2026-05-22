# Morning digest — last updated 2026-05-22 UTC (Cycle 113)

## New since yesterday

- **[/dream/80-room-acoustic](https://getresonance.vercel.app/dream/80-room-acoustic)** — Room Acoustic
  Draw a rectangular room, pick wall and floor materials, press **▶ play chord**.
  A C-major chord sounds in that room via a real impulse response (image-source method,
  3rd-order reflections, Web Audio ConvolverNode). The RT60 readout shows how reverberant
  the space is — and it colors to tell you: emerald = studio dry, blue = room, violet = hall,
  amber = cathedral/cave.

  Drag the amber ♪ source and violet 👂 listener within the room — the IR rebuilds automatically
  after each drag. 9 presets to start with: **Stone Chamber** (RT60 ≈ 2.5s, your Ghost location),
  **Concert Hall**, **Cathedral**, **Closet** (near-anechoic), **Forest Clearing** (soft outdoor).

  **Why open this**: it's the first prototype about the physics of space rather than the physics of
  signal. The Stone Chamber preset sounds unmistakably like a stone chamber — ringy, metallic,
  with dense early reflections. The Cathedral is diffuse and vast. You can now tune Ghost scene
  acoustics with a slider rather than guessing. Also relevant to any venue installation you're
  planning — put in the real room dimensions, hear whether it's too live.

## Previous (Cycle 112 — kids build)

- **[/dream/97-kids-star-catch](https://getresonance.vercel.app/dream/97-kids-star-catch)** — Star Catch (kids)
  Pentatonic stars fall slowly, tap to catch → note plays + sparkles. After 3 catches, replay
  button lets the child hear the melody they assembled. Zero permissions, zero reading required.

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

## In progress / partial

Nothing blocked. `76-cymatics-on-piano-path` still waiting on Welcome Home track IDs.

## Open questions for Karel

1. **Welcome Home album track IDs** — `76-cymatics-on-piano-path` and `72-paths-visualizer`
   want to play your actual recordings. Needs audio IDs from the `journey_paths` table.
2. **New loves?** Votes API still shows only `82` and `83`. Recent builds worth a listen:
   `80-room-acoustic` (new this cycle), `96-projection-mapping-sandbox`, `75-houdini-particle-flock`.
3. **Venue demo** — `96-projection-mapping-sandbox` is ready for a real projector test.
4. **Next cycle (114) is kids** — planning a polish pass on `82-kids-color-piano` (text contrast).
