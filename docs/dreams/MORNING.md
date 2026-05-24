# Morning digest — last updated 2026-05-24 UTC (Cycle 157)

## New since yesterday

- **[/dream/132-shepard-tone](/dream/132-shepard-tone)** — Shepard Tone · *Cycle 157* · `demoable` 🆕
  An auditory illusion: a tone that climbs forever without resolving. Eight sine waves across eight octaves, each with a bell-curve gain envelope peaking at A4/A5. All eight glide upward together — when the highest fades out, the next cycle enters from below invisibly. **Put on headphones, close your eyes, let it run for 30 seconds.** Rate slider (0.5–30 BPM), Ascending/Descending, Glide/Whole-tone/Semitone modes, Freeze. Try Whole-tone at 5 BPM for the most musical version: you hear the major whole-tone scale (A→B→C#→D#→F→G→A) ascending with no ceiling. First psychoacoustics prototype in 132-prototype sandbox. Zero deps, zero API, zero cost.
  *Resonance angle: the Shepard tone is a proof that perceptual ascent can be unbounded — the listener travels far without going anywhere. That's the journey thesis in pure math.*

- **[/dream/131-kids-orbit](/dream/131-kids-orbit)** — Orbit Garden · *Cycle 156* · `demoable` 🆕
  Five glowing planets orbit a central sun. Tap any ring → planet appears, plays chime note, orbits forever. Inner rings fast+high, outer rings slow+low. Each planet plays again on every orbit completion — all five active = unpredictable polyrhythm from physics. Great before-sleep toy for kids 3+.

- **[/dream/130-tsl-particle-compute](/dream/130-tsl-particle-compute)** — Lorenz Attractor · *Cycle 155* · `demoable`
  50,000 GPU particles following the Lorenz equations. Butterfly shape emerges in ~5 seconds. WebGPU required.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- **Pixal3D (SIGGRAPH 2026)** — Ghost LoRA image → 3D GLB orbit, ~$0.30/gen via FAL_KEY. Waiting on budget OK.
- **Kali Malone drone / `kali-sustain`** — still queued. Zero cost, contemplative drone meditation. Moved to Cycle 159.
- **`anemone-av`** — organic bioluminescent 3D form (Three.js + all deps installed). One-cycle build, very different aesthetic.
- **`arc-compose`** — MiniMax Music 2.6 section tags, $0.03/gen. "Hear your 6-phase arc as AI music." FAL_KEY in use.

## Open questions for Karel

1. **Ghost 3D orbit budget** — Pixal3D: Ghost image → animated 3D figure, ~$0.30/generation via FAL_KEY. OK to build?
2. **Veo 3 Ghost animate** — waiting ~many cycles. ~$0.75/clip. Still want this?
3. **Welcome Home track IDs** — `72-paths-visualizer` / `76-cymatics-on-piano-path` blocked ~80 cycles.
4. **Shepard tone feedback** — does the Whole-tone mode (most musical version) feel right at 5 BPM? Worth a polish cycle for the triangle-paradox mode?
