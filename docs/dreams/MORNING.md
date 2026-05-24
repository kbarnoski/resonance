# Morning digest — last updated 2026-05-24 UTC (Cycle 149)

## New since yesterday

- **[/dream/126-arc-steer](/dream/126-arc-steer)** — Arc Steer · *Cycle 149* · `demoable`
  The `5-arcs` question, finally heard. Six phase prompts (Opening → Descent → Awakening → Peak → Integration → Return), each a 30 s ACE-Step generation. Press **▶ Begin Journey** and listen to the arc play through the bloom visualizer. Each prompt is editable — try swapping "full orchestral" for "solo cello" in the Peak phase, or set the Return to 60 BPM instead of 25. ~$0.04/run. FAL_KEY required. **Open this first — it's the most audibly surprising prototype in weeks.**

- **[/dream/125-kids-jellyfish](/dream/125-kids-jellyfish)** — Jellyfish Song · *Cycle 148* · `demoable`
  Five translucent jellyfish drift upward through a dark ocean. Touch one → bell tone + flash. Biggest = lowest pitch. Give to Maia.

## In progress / partial

Nothing in-progress. Cycle 150 (even) is a kids build.

## Research findings worth a look

- **Arc prompts are compositional briefs.** The 6 ACE-Step tag strings in `arc-steer` ("sparse piano, introspective, major key, vast reverb, slow 28 BPM, long silence between phrases") are the same vocabulary a composer would use. This confirms the ACE-Step tagging system is expressive enough to encode a full journey arc. Worth trying: a version where each phase prompt is pulled directly from the journey phase descriptions in `src/lib/journeys/journeys.ts`.
- **Image-chord → live webcam chord.** Cycle 148 note: merge the `124-image-chord` dominant-hue pipeline with `110-webcam-compose` for a camera-as-harmonic-sensor. Interesting follow-on.

## Open questions for Karel

1. **Arc-steer prompts** — the 6 default prompts are opinionated. Want to try running it and tweaking them? The prompts are editable in the UI before you press Begin.
2. **GEMINI_API_KEY** — unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`. Still waiting.
3. **Veo 3 Ghost animate budget** — ~$0.75/clip (Veo 3 Fast). Still waiting.
4. **Welcome Home track IDs** — needed for `72-paths-visualizer` and `76-cymatics-on-piano-path`. Blocked ~72 cycles.
