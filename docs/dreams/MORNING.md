# Morning digest — last updated 2026-05-23 UTC (Cycle 119)

## New since yesterday

- **[/dream/101-camera-song](/dream/101-camera-song)** — "camera-song"
  Six journey orbs in 3D space — orbit to look at one, its music rises in the mix. Turn away, it fades.
  Voices: Cosmic (detuned pad), Earth (deep bass), Sanctuary (FM warmth), Ocean (C major chord), Snowflake (crystalline high), Ghost (A-minor arpeggio).
  **Why open it**: put on headphones, click "Enter the space", and slowly orbit. The musical landscape shifts as you turn. This is the first prototype where your gaze IS the instrument.
  Zero permissions · Zero API · Zero deps · 3.06 kB. Headphones make it dramatic.

## Kids zone — full status (13 prototypes)

| Cycle | Prototype | Notes |
|-------|-----------|-------|
| 118 | `100-kids-paint-song` | Draw path → lift → melody plays |
| 116 | `99-kids-panning-safari` | 5 animals, spatial L/R panning 🎧 |
| 114 | `98-kids-drum-circle` | 6 percussion pads; first rhythm prototype |
| 112 | `97-kids-star-catch` | Tap falling stars → collect melody → replay |
| 110 | `95-kids-breath-bubbles` | Blow → floating bubbles + pentatonic pops |
| 108 | `94-kids-ghost-echo` | Tap → Ghost appears + fades; "spirit pond" |
| 106 | `93-kids-share-screen` | Two-finger co-play; always in harmony |
| 104 | `92-kids-ghost-lullaby` | Ghost floats; tap/drag → pentatonic notes |
| 102 | `91-kids-character-band` | 5 animals, Toca Band-style harmonizing phrases |
| 100 | `90-kids-puddle-jumper` | Tap pond → splash + ripples; zero permissions |
| 98 | `88-kids-hum-to-paint` | Hum/sing → glowing brush + scan-line replay |
| 96 | `83-kids-tilt-rain` | **Karel loved ❤** Tilt → catch colored drops |
| 92 | `82-kids-color-piano` | **Karel loved ❤** 8 pentatonic circles, glissando |

## Research findings worth a look (Cycle 117)

- **§174** — Artisans d'Idées (Awwwards SOTD 2026): camera navigation IS music. `camera-song` (just built) is the direct implementation.
- **§175** — Memo Akten's "The Thinking Ocean" (Whitney artport, Feb 2026): WebGPU fluid driven by presence → sound. `ocean-presence` queued (2-cycle build).
- **§171/172** — Veo 3 ($0.40/s) + Seedance 2.0 ($0.11–0.14/s): Ghost LoRA → cinematic video with native audio. `veo3-ghost` needs budget OK.
- **§173** — ElevenMusic (April 2026, 7/day free): full songs with vocals. Buildable if ELEVENLABS_API_KEY in Vercel env.

## Open questions for Karel

1. **Welcome Home album track IDs** — `76-cymatics-on-piano-path` and `72-paths-visualizer` want to play your actual recordings.
2. **Veo 3 budget OK?** — `veo3-ghost` = ~$2–3.20/clip (Veo 3) or ~$0.55–0.70 (Seedance). Closes the "Ghost needs motion" gap.
3. **ElevenMusic key?** — ELEVENLABS_API_KEY in Vercel env? If yes, songs-with-vocals prototype is free tier (7/day).
4. **New loves?** Votes API still shows only `82` and `83`. Worth trying: `101-camera-song` (headphones, orbit slowly), `100-kids-paint-song` (hand to a 4-year-old).
5. **CassetteAI vs ACE-Step** — after running `81-cassette-speed`, is the quality gap OK for quick-sketch use in `6-compose`?
