# Morning digest — last updated 2026-05-24 UTC (Cycle 152)

## New since yesterday

- **[/dream/128-kids-fish-tap](/dream/128-kids-fish-tap)** — Fish School · *Cycle 152* · `demoable`
  Seven glowing pentatonic fish swim in a loose boids school. Tap one → it stops, opens its mouth, plays its note (triangle + reverb), then the physics naturally reabsorbs it into the school. Color = pitch (violet=C3 low → rose=G4 high). Multi-touch chords. School constantly evolving — fish drift into clusters and regroup. Body waggle, caustic light shimmer, ambient ocean pad.
  **Try tapping two fish at once.** First kids prototype with emergent group behavior (flocking) as the core mechanic.

- **[/dream/127-kids-starfish](/dream/127-kids-starfish)** — Starfish Garden · *Cycle 150* · `demoable`
  Five starfish on an ocean floor, each tap plays a full 5-note pentatonic chord. First kids prototype where one tap = a full chord. Reverb + arm-ripple wiggle animation.

## Research findings (Cycle 151)

1. **Lyria 3 Pro on fal.ai** — `fal-ai/lyria3/pro` at $0.08/gen via FAL_KEY. Next adult cycle builds `129-lyria3-journey`.
2. **Pixal3D (SIGGRAPH 2026)** — Ghost image → 3D GLB, $0.30 on fal.ai. `129-ghost-3d-orbit` (two cycles).
3. **Three.js TSL compute shaders** — simplifies WebGPU particle work. `130-tsl-particle-compute`.
4. **Kali Malone / MUTEK 2026 aesthetic** — slowly-evolving harmonic drones, no existing prototype covers this. `131-kali-sustain` (zero deps/API).
5. **Live Music Diffusion Models** (arXiv 2605.22717, May 21, 2026) — real-time diffusion + "generative delay" for live pianist. `132-lmdm-echo`.

## In progress / partial

Nothing in-progress. Cycle 153 (odd) is an adult cycle — building `129-lyria3-journey`.

## Open questions for Karel

1. **GEMINI_API_KEY wait is over for Lyria** — `fal-ai/lyria3/pro` uses FAL_KEY. `43-lyria-ghost`, `44-binaural-lyria`, `30-lyria-jam` can now be rebuilt. Next adult cycle starts `129-lyria3-journey`.
2. **Pixal3D budget** — `130-ghost-3d-orbit` costs ~$0.30/Ghost figure. Both costs hit FAL_KEY. OK to proceed?
3. **Veo 3 Ghost animate** — ~$0.75/clip (Veo 3 Fast). Still waiting.
4. **Welcome Home track IDs** — needed for `72-paths-visualizer` / `76-cymatics-on-piano-path`. Blocked ~75 cycles.
5. **Kali Sustain** (`131-kali-sustain`) — zero cost, zero API. Worth a future adult slot?
