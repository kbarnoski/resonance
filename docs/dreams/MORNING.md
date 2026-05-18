# Morning digest — last updated 2026-05-18 UTC (Cycle 4)

## New since yesterday

- **Cycle 4 was a research cycle** — no new prototype, but RESEARCH.md is now filled
  with 8 findings. Opened 4 new prototype ideas in the queue. Worth a scan.

- **RESEARCH.md** (new file) — read this. Highlights below.

## Research findings worth a look

1. **ACE-Step music generation on fal.ai** — $0.0002/second. Text → coherent
   music (up to 4 min) in 20s. Could become `/dream/6-compose`: type a mood,
   get a musical sketch, watch it run through the fluid visualizer. "Compose mode."

2. **MMAudio V2** — $0.001/s, adds synchronized ambient audio to video/images.
   Natural extension of ghost-lab: Ghost LoRA image → MMAudio → image that *sounds*
   transcendent. (ghost-sound prototype idea, admin-only, ~$0.01/gen.)

3. **WebGPU now at 70% browser coverage** (Firefox 147 + Safari iOS 26, Jan 2026).
   Compute shaders are mainstream. Opens door to: (a) cleaner fluid sim without
   the RGBA16F extension dance, (b) millions-of-particles "particle life" prototype
   that isn't feasible in WebGL.

4. **Binaural HRTF spatial audio** — zero-dep, pure Web Audio API, PannerNode
   in HRTF mode. Prototype: 6 frequency bands placed in 3D around a listener.
   With headphones: bass below you, treble above, piano left, cello right. No lib
   needed. Feels like nothing else in Resonance today.

5. **Strange attractor + FM synthesis** — the xyz trajectory of a Lorenz attractor
   can *drive FM synth parameters*, so you see AND hear chaos at once. Mic input
   changes σ/ρ/β, reshaping both the shape and the sound. RESEARCH.md §6.

6. **Gray-Scott reaction diffusion** — solid WebGL impls exist; none with audio.
   Bass → feed rate, treble → kill rate → dramatic bifurcations on loud hits.
   `reaction-diffusion` is already in the queue; more confident now it'll look great.

## In progress / partial

- Nothing mid-cycle. Queue is healthy; next cycle picks a new prototype.

## Open questions for Karel

1. **Next prototype priority**: `/dream/4-operator` (Tauri live-performance panel,
   the hardest UX design challenge) vs `/dream/6-compose` (ACE-Step music gen,
   most surprising and immediately demoable)?

2. **WebGPU for fluid**: now that WebGPU is 70%+ browsers, worth porting `3-fluid`
   to WebGPU compute for mobile Safari support? Or skip and just add a Canvas 2D
   fallback? (WebGL2 + float textures still exclude older iOS.)

3. **Ghost-sound budget**: MMAudio soundscaping would run on admin account; each
   10s generation = ~$0.01. Worth enabling for ghost-lab? Or defer until we're
   happier with the Ghost LoRA identity?

4. **HRTF spatial prototype**: this one works best with headphones. Is that OK for
   a "demo on your phone" workflow, or should the primary demo be speaker-friendly?

---

**Prototypes live**:
- `/dream/1-live` — mic visualizer (demoable)
- `/dream/2-ghost-lab` — Ghost LoRA A/B lab (demoable, admin)
- `/dream/3-fluid` — Navier-Stokes fluid (demoable) ← open this

**Preview**: https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream
