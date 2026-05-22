# Morning digest — last updated 2026-05-22 UTC (Cycle 115)

## New since yesterday

- **[/dream/81-cassette-speed](https://getresonance.vercel.app/dream/81-cassette-speed)** — CassetteAI vs ACE-Step Speed Race
  Five music presets (Forest Dawn, Stone Chamber, Cosmic Drift, Jazz Sketch, Ocean Breath) or type your own
  tags. Hit **Generate Both** — both AI backends start at the exact same moment with identical prompts.
  Left panel (violet) = CassetteAI, ~2–4s. Right panel (cyan) = ACE-Step, ~20–40s. Each panel shows a live
  millisecond timer, then a waveform strip, then a ▶ Play button. Six-band bloom visualizer activates during
  playback. Speed summary when both complete: "Cassette: X.Xs · ACE-Step: Y.Ys · X× faster."

  **Why open this**: empirical answer to a real question — does CassetteAI's 10× speed advantage cost
  anything you'd actually notice? The prototype lets you hear both outputs back-to-back with the same
  prompt. If the quality gap is negligible for ambient/sketch work, it's a strong case for swapping
  `6-compose`'s backend and cutting the wait from ~30s to ~3s. Useful before committing to any backend.

- **[/dream/98-kids-drum-circle](https://getresonance.vercel.app/dream/98-kids-drum-circle)** — Drum Circle (kids, Cycle 114)
  Six percussion pads, all synthesized (no samples): kick, snare, hihat, tom, clap, shaker. First kids
  prototype about rhythm rather than pitch — all 10 previous kids prototypes used C-major pentatonic notes.

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
2. **CassetteAI vs ACE-Step** — after running `81-cassette-speed`, is the quality gap acceptable
   for quick-sketch use? That decides whether `6-compose` should switch backends.
3. **New loves?** Votes API still shows only `82` and `83`. Worth a listen:
   `98-kids-drum-circle` (new), `81-cassette-speed` (new), `80-room-acoustic`.
4. **Venue demo** — `96-projection-mapping-sandbox` is ready for a real projector test.
