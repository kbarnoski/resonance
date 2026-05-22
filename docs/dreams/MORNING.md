# Morning digest — last updated 2026-05-22 UTC (Cycle 114)

## New since yesterday

- **[/dream/98-kids-drum-circle](https://getresonance.vercel.app/dream/98-kids-drum-circle)** — Drum Circle (kids)
  Six large colored percussion pads: red=kick, orange=snare, yellow=hihat, teal=tom, blue=clap, purple=shaker.
  Each synthesized via Web Audio (no samples): kick = sine sweep 150→40 Hz; snare = bandpass noise + sine
  body; clap = classic double-burst 22ms apart; shaker = >5.5kHz highpass noise. Background canvas spawns
  expanding colored rings from each tap point. Multi-touch supported.

  **Why open this**: it's the first kids prototype about rhythm rather than pitch. All 10 previous kids
  prototypes use C-major pentatonic melodic notes — this is the first pure percussion set. A 4yo can tap
  any combination and get a layered beat, no music theory needed. The rings from overlapping taps create
  a light show. Zero permissions, zero reading.

- **[/dream/80-room-acoustic](https://getresonance.vercel.app/dream/80-room-acoustic)** — Room Acoustic (Cycle 113)
  Simulates a physical room: draw width/depth, pick wall materials, drag source/listener — C-major chord
  sounds through the computed impulse response. 9 presets from Closet to Cathedral.

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

## In progress / partial

Nothing blocked. `76-cymatics-on-piano-path` still waiting on Welcome Home track IDs.

## Open questions for Karel

1. **Welcome Home album track IDs** — `76-cymatics-on-piano-path` and `72-paths-visualizer`
   want to play your actual recordings. Needs audio IDs from the `journey_paths` table.
2. **New loves?** Votes API still shows only `82` and `83`. Worth a listen:
   `98-kids-drum-circle` (new), `80-room-acoustic`, `96-projection-mapping-sandbox`.
3. **Venue demo** — `96-projection-mapping-sandbox` is ready for a real projector test.
