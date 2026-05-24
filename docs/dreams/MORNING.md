# Morning digest — last updated 2026-05-24 UTC (Cycle 151)

## New since yesterday

- **[/dream/127-kids-starfish](/dream/127-kids-starfish)** — Starfish Garden · *Cycle 150* · `demoable`
  Five starfish on an ocean floor. Touch one → all 5 notes of its pentatonic chord sound at once (reverb tail ~900ms), arms ripple outward. Biggest (amber) = G3 cluster; violet = C3; blue = C4. Every tap combination is consonant. First kids prototype where one tap = a full chord. Try tapping two starfish simultaneously.

- **[/dream/126-arc-steer](/dream/126-arc-steer)** — Arc Steer · *Cycle 149* · `demoable`
  Six phase prompts → six 30s ACE-Step generations → hear the Resonance journey arc as AI music. All prompts editable. ~$0.04/run. **Open this — most audibly surprising prototype in weeks.**

## Research cycle findings (Cycle 151 — this cycle)

No new prototype built. Instead: 14 cycles without research → swept current AV landscape. Key discoveries:

1. **🔑 Lyria 3 Pro on fal.ai — GEMINI_API_KEY no longer needed.** `fal-ai/lyria3/pro` at **$0.08/generation via FAL_KEY**. The open question from MORNING.md for ~70 cycles is resolved. Next adult cycle: `128-lyria3-journey` — six Ghost scenes → Lyria 3 music → BPM-synced bloom visualizer. One cycle, zero new deps.

2. **🪄 Pixal3D (SIGGRAPH 2026) — Ghost image → 3D GLB model.** $0.30 on fal.ai. Zero new npm deps (drei already installed). Prototype idea: `129-ghost-3d-orbit` — Ghost LoRA image → 3D sculpture you can orbit → audio-reactive vertex displacement. The Ghost character gains spatial depth for the first time. Two-cycle build.

3. **Three.js TSL compute shaders** are now the clean way to do GPU particle physics (no WGSL strings, no FBO hacks). Simplifies `audio-cloud` from 2-cycle to 1-cycle. Prototype: `130-tsl-particle-compute` — 50k-particle Lorenz attractor driven by bass/treble.

4. **MUTEK 2026** (August 25–30, Montreal) features **Kali Malone** — slowly-evolving harmonic music held for minutes. Inspired a gap-filling prototype: `131-kali-sustain` — root drone + harmony voice that glides between natural ratio intervals (3:2, 4:3, 5:4…) via 12-second linear ramps. Zero deps, zero API. None of 127 existing prototypes explore this aesthetic.

5. **Live Music Diffusion Models** (arXiv:2605.22717, May 21, 2026 — 3 days ago) — real-time diffusion on consumer hardware + "generative delay" for live musician improvisation. Inspires `132-lmdm-echo` — piano phrase → chroma analysis → ACE-Step echo response.

## In progress / partial

Nothing in-progress. Cycle 152 (even) is a kids cycle.

## Open questions for Karel

1. **GEMINI_API_KEY** — the wait is over for Lyria specifically. `fal-ai/lyria3/pro` is live on fal.ai at $0.08. Next adult cycle builds `128-lyria3-journey` using FAL_KEY only. `30-lyria-jam` (streaming) still benefits from the Gemini key for real-time control; `43-lyria-ghost` and `44-binaural-lyria` can now be rebuilt with the fal.ai version.
2. **Pixal3D budget** — `129-ghost-3d-orbit` costs ~$0.30/Ghost figure (Pixal3D) + the Ghost LoRA image cost. Both use FAL_KEY already in use. OK to proceed?
3. **Veo 3 Ghost animate budget** — ~$0.75/clip (Veo 3 Fast). Still waiting.
4. **Welcome Home track IDs** — needed for `72-paths-visualizer` and `76-cymatics-on-piano-path`. Blocked ~74 cycles.
5. **Kali Sustain prototype** — `131-kali-sustain` is zero deps, zero API, zero cost. Worth building for a future adult cycle?
