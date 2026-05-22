# Morning digest — last updated 2026-05-22 UTC (Cycle 103)

## New since yesterday

- **[/dream/86-sound-to-video](https://getresonance.vercel.app/dream/86-sound-to-video)** — Sound → Image → Video
  10 seconds of audio → acoustic fingerprint → **FLUX.2 Dev 16:9 scene image** → **LTX-Video 5-second animated clip**.
  Progressive reveal: image fades in after ~15–25s while video is still generating; video appears below it
  with no extra wait feeling. Six scene archetypes driven by energy × spectral character:
  quiet + bass-heavy → stone chamber (candle, mist, ancient walls);
  energetic + treble-bright → cosmic nebula (swirling gas, star clusters).
  Motion prompt adapts to energy: soft playing = meditative drift; loud = elemental sweep.
  **Try it: play your softest chord → watch the stone chamber drift; play loud and fast → cosmic.
  Then compare: the image and video tell the same acoustic story.**
  ~$0.25/generation. FAL_KEY in use. Demo mode (no mic) shows C-major → warm courtyard or forest dawn.

## Surprise finding

The two-phase pipeline (image first, then video) is a better UX than waiting for the final video alone.
You have something beautiful to look at during the longest wait, and it mentally prepares you for
the motion you're about to see. The transition from static image to animated clip feels like
the scene coming alive rather than a cold reveal. Worth applying to future image→video prototypes.

## Kids zone status

| Cycle | Prototype | Status | Notes |
|-------|-----------|--------|-------|
| 92 | `82-kids-color-piano` | demoable | **Karel loved ❤** |
| 96 | `83-kids-tilt-rain` | demoable | **Karel loved ❤** |
| 98 | `88-kids-hum-to-paint` | demoable | mic → voice paints canvas |
| 100 | `90-kids-puddle-jumper` | demoable | tap pond → ripples; zero permissions |
| 102 | `91-kids-character-band` | demoable | 5 animals, Toca Band-style |

## Previous (Cycle 102)

- **[/dream/91-kids-character-band](https://getresonance.vercel.app/dream/91-kids-character-band)** — Character Band (kids)
  Five animal characters, each with a 4-note pentatonic phrase. Tap two: they harmonize.
  Frog + Bear = quick arpeggio over slow deep bass, feels like a piano duo.

## Open questions for Karel

1. **Welcome Home album IDs** — `72-paths-visualizer` is queued but needs the Supabase audio URL
   pattern for `journey_paths` tracks to fetch your actual piano recordings at runtime.
2. **Next cycle (104) is a kids cycle** — building `92-kids-piano-path` (your Welcome Home album
   playing → color animations) OR a simpler tap-shapes prototype. Do you have a preference?
3. **Cycle 105 direction** — `84-wave-fluid` (WebGPU MLS-MPM ocean surface, 2 cycles, most visually
   spectacular in queue) vs `73-journey-arc-spread` (5 journey themes cycling through distinct shaders).
4. **Any new loves?** Votes API still shows only `82` and `83`. Anything new worth deepening?
