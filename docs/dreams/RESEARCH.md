# Resonance Dream — Research Log

Agent appends findings here during research cycles. Each entry: date, source, 2-3 sentence summary, prototype speculation.

---

## 2026-05-18 — Cycle 4 research sweep

### 1. Network Bending for Audio-Visual Diffusion Generation
**Source**: https://arxiv.org/abs/2406.19589

Technique that applies transforms (point-wise, tensor-wise, morphological) *inside* Stable Diffusion's layers rather than post-processing outputs, allowing continuous fine-grain audio-driven image manipulation. Audio features are extracted and mapped to "network bending" parameters, so a bass hit literally deforms intermediate activations — producing effects that feel alive rather than filtered. Supplementary video shows smooth morphing with music.

**Could become a prototype**: a "bender" page that streams short fal.ai image generations (1–2s clips) with audio-extracted parameters injected as prompt modifiers, giving a music-reactive visual that changes its *content* not just its color. Different from fluid/bloom — this changes what you're looking at, not just how it looks.

---

### 2. ACE-Step — Open-Source Music Generation Foundation Model
**Source**: https://arxiv.org/abs/2506.00045 · https://fal.ai/models/fal-ai/ace-step

3.5B-parameter music generation model available on fal.ai at **$0.0002/second** (~$0.012/minute). Generates up to 4 minutes in 20 seconds on A100. Supports voice cloning, lyric editing, remixing, lyric2vocal, and singing2accompaniment. Text → music with full melody/harmony/rhythm coherence.

**Could become a prototype**: "compose" — user types a mood or scene description ("forest dawn ceremony, slow 70 BPM, ceremonial drums and reverbed piano"), presses Generate, gets a 30-second musical sketch. The sketch plays through the fluid or live-bloom visualizer automatically. Could be Resonance's "create a journey soundtrack" workflow. Cost per generation: ~$0.006.

---

### 3. MMAudio V2 — Video-to-Synchronized-Audio
**Source**: https://fal.ai/models/fal-ai/mmaudio-v2

Takes a video + text prompt, generates temporally synchronized audio at **$0.001/second**. Duration configurable 1–30s. Works with MP4, MOV, WebM, GIF inputs.

**Could become a prototype**: "ghost-sound" — pipe Ghost LoRA generated images or short Seedance video clips through MMAudio with prompts like "ethereal wind, stone chamber reverb, single piano note." Then the ghost images don't just look transcendent; they *sound* it. Natural extension of ghost-lab. Requires admin (same as ghost-lab). Budget: ~$0.03 for a 30s soundscape.

---

### 4. WebGPU is Production-Ready in 2026 — 70% Browser Coverage
**Source**: https://byteiota.com/webgpu-2026-70-browser-support-15x-performance-gains/

Firefox 147 (Jan 2026) and Safari iOS 26 shipped WebGPU; Chrome/Edge already supported it. This means ~70% of active browsers now support WebGPU compute shaders natively, without extension flags. Performance gains: 15–30× vs WebGL for compute-heavy tasks. 1M particles with physics runs effortlessly.

**Could become a prototype**: upgrade the `3-fluid` sim to WebGPU compute shaders (eliminating the WebGL2 + RGBA16F extension dance), AND build a new "particle-life" prototype — millions of colored particles that attract/repel based on type, parameters modulated by audio energy. Bass tightens clusters; treble disperses; onsets scatter/reform. Visually hypnotic and genuinely different from any current prototype.

---

### 5. Binaural HRTF Spatial Audio via AudioWorklet
**Source**: https://blog.weskill.org/2026/03/web-audio-api-immersive-soundscapes-for.html · MDN PannerNode

In 2026, AudioWorklets are the standard for web audio DSP — run custom WASM/JS at the audio thread sample level with zero main-thread interference. PannerNode supports full HRTF spatialization in headphones. This means placing each frequency band or instrument in 3D space (bass below, treble above, piano left, cello right) is achievable in a browser today with no extra deps.

**Could become a prototype**: "spatial" — a binaural mixer prototype. Import any audio file or use mic. Analyze frequency bands. Place each band at a point on a 3D sphere using HRTF PannerNodes. Visualize the sphere with colored glowing dots per band. User drags dots to reposition sounds in 3D space. With headphones, you hear the music all around you. Live performance use case: immersive room-filling effect from a single laptop.

---

### 6. Strange Attractor Synthesizer (tmhglnd)
**Source**: https://github.com/tmhglnd/strange-attractor-synth

Synthesizer that drives FM synth parameters directly from the xyz coordinates of a Lorenz/Thomas/Aizawa attractor — the attractor's chaotic trajectory becomes the modulation signal. Combines chaos math with synthesis in one feedback loop.

**Could become a prototype**: the existing "strange" IDEAS entry gets richer: show the attractor as a 3D particle trail (WebGL instanced lines), while the attractor's current xyz position simultaneously drives tone/timbre. Bass energy adjusts σ (controls how tightly the orbit spirals); treble adjusts ρ (the "butterfly spread"). The user sees and hears the chaos evolving together. Could also run reversed: mic input changes σ/ρ/β, reshaping the attractor in real time.

---

### 7. Gray-Scott Reaction-Diffusion — No Audio Implementation Found Yet
**Source**: https://github.com/amandaghassaei/ReactionDiffusionShader · https://piellardj.github.io/reaction-diffusion-webgl/

Multiple solid WebGL Gray-Scott implementations exist (Ghassaei's with vector-field-guided diffusion is particularly interesting). None found with audio input. The parameter space is rich: feed rate (F) and kill rate (k) determine whether you get spots, stripes, coral, or labyrinth patterns.

**Could become a prototype**: map bass to F, treble to k. Low-energy ambient → stable spots or stripes; loud drumbeat → chaotic labyrinth eruption. The transition between pattern types when parameters cross bifurcation points is dramatic and visually striking. This + Resonance's dark palette could look genuinely psychedelic.

---

### 8. Particle Life (WebGPU) — Emergent Flocking Behavior
**Source**: https://lisyarus.github.io/blog/posts/particle-life-simulation-in-browser-using-webgpu.html

Particle Life is a simulation where N particle "species" attract/repel each other based on a random N×N interaction matrix. Emergent behavior: flocking, orbiting, predator-prey chains. Written in WebGPU compute shaders for millions of simultaneous particles.

**Could become a prototype**: 6 particle species mapped to 6 frequency bands. The attraction/repulsion matrix is static but the *temperature* (random velocity injection) scales with audio energy. Low amplitude: stable orbits and clusters. High amplitude: chaos, particles scatter and reform. Onset: random matrix reshuffle (new emergent behavior). Visually alien, performance-heavy but exactly what WebGPU enables.
