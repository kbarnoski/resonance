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

---

## 2026-05-18 — Cycle 13 research sweep

### 9. WebGPU Now in ALL Major Desktop Browsers
**Source**: https://www.webgpu.com/news/webgpu-hits-critical-mass-all-major-browsers/

Chrome, Firefox (Windows 141, macOS 145), Safari 26, and Edge all ship WebGPU by default as of November 2025. The Cycle 4 estimate of "70%" was for early 2026 projection; the actual rollout landed earlier. Desktop coverage is effectively universal; mobile Android support is still in progress (Firefox Android ETA 2026). No more extension flags, no more `EXT_color_buffer_float` extension dance.

**Could become a prototype**: upgrade `3-fluid` from WebGL2 RGBA16F ping-pong to WebGPU compute shaders, raising resolution from 128×128 to 512×512. Also unblocks `9-particle-life-gpu` (50k+ particles). Both prototypes are now safe to build for Karel's review sessions without worrying about browser coverage gaps.

---

### 10. Art2Mus — Direct Image-to-Music Generation
**Source**: https://arxiv.org/html/2602.17599v1

Art2Mus (Feb 2026) generates 10-second musical audio directly from artwork images using CLIP/ImageBind visual embeddings fed into a frozen AudioLDM 2 latent diffusion model. Crucially, it bypasses text as an intermediate: "removing language-based semantic supervision preserves stylistic and compositional cues filtered through linguistic abstraction." Trained on a 105k artwork-music pair dataset (ArtSound). The 10s audio clips are stylistically matched to the visual content.

**Could become a prototype**: if the model appears on fal.ai or Replicate — "ghost-harmonize": Ghost LoRA images input directly to Art2Mus → get back a 10s ambient piece that matches the image's mood, not a text-prompted soundscape. Different from MMAudio V2 (which is video → synchronized audio); Art2Mus is image → music mood. Deeper Resonance fit: the ghost *becomes* its own ambient score.

---

### 11. BRAVE — 10ms Latency Neural Audio Timbre Transfer
**Source**: https://arxiv.org/html/2503.11562v2

BRAVE (Mar 2026) is a redesigned RAVE (neural audio VAE) with ~10ms latency and ~3ms jitter — approaching live instrumental performance specs. Achieved by reducing compression ratio (2048→128), lowering PQMF attenuation, and causal training. The model is one-third the size of RAVE (4.9M vs 17.6M params). Realistic real-time factor of 0.29 at block size 128 with RTNeural.

**Could become a prototype**: not browser-ready yet (WASM path unoptimized), but worth monitoring. Resonance long-game: play piano live → hear it instantly transformed into a custom AI-trained timbre (e.g. a "Ghost voice" timbre trained on reverbed piano + nature sounds). This is "AI presence in the instrument" rather than generated background music. Monitor for browser WASM deployment.

---

### 12. MiniMax Music 2.5 — Reference Audio Style Matching
**Source**: https://fal.ai/models/fal-ai/minimax-music · https://advenboost.com/minimax-2-5-review-setup-guide/

MiniMax Music 2.5 (Jan 2026, $0.035/track on fal.ai) added reference audio as an input alongside text prompt. Upload a short audio clip → the model generates new music that matches its style. Supports vocal + instrumental. This is qualitatively different from text-only generation: you hum a four-bar motif and the model extends it into a full piece in the same harmonic/rhythmic universe.

**Could become a prototype**: "reference-compose" — user records 8 bars of piano via mic, sends as reference to MiniMax Music 2.5, gets a 30s track back that sounds like an extension of their idea. Plays through the fluid or live-bloom visualizer. Resonance fit: "your phrase, extended." Budget: $0.035/generation. Needs FAL_KEY approval.

---

### 13. Foley Control — Video-to-Synchronized Sound Effects
**Source**: https://fal.ai/explore/models

Foley Control (fal.ai, 2026) takes a video clip + text prompt and generates perfectly synchronized sound effects. Different from MMAudio V2 in emphasis: Foley Control is tuned for diegetic sounds (footsteps, rustling, water, impacts), while MMAudio V2 generates ambient audio/music. Pricing not yet listed on the models page.

**Could become a prototype**: update ghost-sound to offer two modes: (A) MMAudio V2 for ambient music soundscaping, (B) Foley Control for environmental texture (stone chamber echoes, portal energy hum, cosmic wind). The two modes reveal different sonic characters in the same Ghost images. Also opens a new path: the 12 dream prototype screens as short animation loops, each with its own Foley-generated environmental sound.

---

### 14. Patchies — Browser-Based Audio/Visual Code Patcher
**Source**: https://github.com/heypoom/patchies · https://patchies.app

Patchies (AGPL-3.0) is a browser-native, code-first patching environment. You write small programs (in JS, Python, Ruby, Uiua, etc.) and connect them visually with patch cables — data flows from output to input. Supported visual libraries: P5.js, Three.js, Hydra, Shader Park, GLSL shaders. Audio: Strudel, Tone.js, Elementary Audio, Pure Data-style objects. I/O: MIDI, MQTT, WebRTC, VDO.Ninja. No install. AGPL.

**Could become a prototype**: "patchwork" — a stripped-down version of this idea but Resonance-native: a small patching surface where audio-source nodes (mic, demo oscillators) connect to analyzer nodes (FFT, onset, BPM) connect to visual renderer nodes (fluid, tessellate, terrain). The entire dream sandbox as a patchable system. Multi-cycle build; the concept is worth incubating.

---

### 15. Seedance 2.0 / Kling 4K — Cinematic Video with Native Audio
**Source**: https://fal.ai/explore/models

Multiple new video models on fal.ai (May 2026) accept image + text + audio inputs and generate cinematic video with native audio already synced. Seedance 2.0 (ByteDance): "real-world physics, director-level camera control," accepts text/image/audio. Kling Video v3 4K: 4K output with native audio, no post-production upscaling. Both accept reference images.

**Could become a prototype**: pass Ghost LoRA generated images through Seedance 2.0 with a cinematic atmosphere prompt → get a 5–10s video that animates the still into a living scene. This brings the Ghost character to life as a video artifact, not just an image. Combined with Foley Control or MMAudio V2 for the audio layer. Admin-only; budget ~$0.05–0.10/clip estimate.

---

## 2026-05-18 — Cycle 18 research sweep

### 16. Three.js WebGPU + TSL — Production-Ready 3D in 2026
**Source**: https://www.utsubo.com/blog/threejs-2026-what-changed · https://www.oflight.co.jp/en/columns/threejs-webgpu-tsl-r3f-2026 · https://vr.org/articles/webgpu-baseline-2026-three-js-webxr-default

Three.js r171 established WebGPU as the default renderer (WebGL fallback for older browsers) in 2026. TSL (Three Shading Language) is now the standard for node-based materials — instead of writing raw WGSL or GLSL, you compose visual logic from typed nodes that compile to the correct backend. Real-world benchmarks show 12k+ vertices updated at 60fps via TSL vertex displacement, making audio-reactive deforming mesh prototypes feasible without writing shader code. WebGPU is now "Baseline" — supported in all major browsers including Safari 26.

**Could become a prototype**: `three-mesh` — a subdivided sphere or torus mesh whose vertices are displaced in real-time by FFT bin energies via a TSL node graph. Bass bins expand the lower hemisphere; treble bins ripple the surface. Different aesthetic from our raw WGSL compute prototypes (which are particle/fluid), this would be geometry-level audio reaction. Could use React Three Fiber for the component structure, keeping it clean inside a Next.js page.

---

### 17. SoundPlot — 3D Acoustic Feature Space Visualization
**Source**: https://arxiv.org/html/2601.12752v1 (Jan 2026)

Open-source system (published January 2026) for visualizing audio in a 3D acoustic coordinate space: **spectral centroid → X** (brightness), **spectral bandwidth → Y** (richness/noisiness), **pitch → Z** (fundamental frequency). Built with Three.js for the browser. Renders a dual-viewport explorer: one view shows the 3D trail of the audio through feature space; the other plays back the original and synthesized audio at any selected point. Primarily used for birdsong analysis, but the coordinate mapping is universal.

**Could become a prototype**: `acoustic-trail` — plot live mic input (or demo oscillators) as a glowing 3D point trail in [centroid, bandwidth, pitch] space using WebGPU point rendering. Color = frequency energy gradient (same as `1-live`). The trail accumulates across the session; the shape of the cloud is the acoustic "body" of the music. Rising scales trace a diagonal Z-axis arc; complex chords spread the bandwidth axis; a single clean tone collapses to a thin vertical line. Zero external deps (WebGPU + Web Audio). One-cycle build. Inspired by SoundPlot but built from scratch without Three.js dependency.

---

### 18. ElevenLabs Music API — Streaming + Section-Level Control (2026)
**Source**: https://elevenlabs.io/docs/overview/capabilities/music · https://elevenlabs.io/music-api

ElevenLabs launched their Music API (April 2026) with capabilities beyond existing text-to-music models: (a) **streaming generation** — audio plays as it's generated, no waiting for a complete file; (b) **section-level composition** — specify "8 bars sparse piano, then 16-bar string build, then 4-bar drop" directly in the prompt; (c) **custom finetunes** — train on your own audio for consistent sonic identity; (d) **44.1kHz studio quality**, multiple output formats including Opus for streaming. Pricing: $0.80/minute. Significantly more expensive than MiniMax Music 2.5 ($0.035/track flat) but streaming + section control is a qualitatively different capability.

**Could become a prototype**: `elevenlabs-compose` — user writes a journey arc in plain language with section markers ("opening: sparse piano, one note every 2 beats, 20 seconds. build: add cello harmonics. peak: full orchestra wash. dissolve: silence except wind"). ElevenLabs Music streams back; audio plays in real time through the fluid or live-bloom visualizer. First prototype where the *structure* of the music is specified and delivered, not just the mood. Needs API key + Karel budget approval (~$0.80/min ≈ $0.40 per 30s generation).

---

### 19. Seedance 2.0 — Native Audio Confirmed (April 2026 Update)
**Source**: https://fal.ai/seedance-2.0

UPDATE on §15 (Cycle 13): Seedance 2.0 launched on fal.ai April 9, 2026 with the confirmed API. Native synchronized audio is generated at no extra cost alongside the video. Max 15 seconds per generation. Two pricing tiers: Standard (max quality) and Fast (cost-optimized for prototyping). JavaScript/Python SDKs available. Accepts image + text + optional audio reference as inputs.

**Impact on ghost-animate queue entry**: eliminates the MMAudio V2 post-step. Old plan was Ghost LoRA image → Seedance → video, then pipe video → MMAudio → add audio. Now it's one step: Ghost LoRA image + atmospheric prompt → Seedance 2.0 → 15s cinematic video with native audio. Budget estimate unchanged ($0.05–0.15/clip). Admin-only.

---

### 20. ReaLchords — Online Adaptive Chord Accompaniment
**Source**: https://arxiv.org/pdf/2506.14723 (2026)

ReaLchords is a deep learning model that generates adaptive chord accompaniments in real-time from a monophonic melody input stream. It adapts on-the-fly to the unfolding melody — each new note updates the chord generation. The paper mentions an interactive web demo (hosted on Google Cloud), suggesting a browser-compatible API path exists. No confirmed public API pricing as of May 2026.

**Could become a prototype**: `chord-companion` — mic input detects the melody (using the same autocorrelation pitch detector from `13-piano-canvas`) → sends note sequence to ReaLchords → chord accompaniment plays back through the HRTF spatial mixer (from `7-spatial`), positioned around the listener. You play melody; AI harmonizes in 3D space around you. Genuinely surprising live performance experience. Needs API access to be confirmed. Monitor for public release.

---

### 21. AI-Driven Music Visualization System (ACM IMX 2025)
**Source**: https://dl.acm.org/doi/10.1145/3706370.3727869 (ACM Interactive Media Experiences, 2025)

A system combining three stages: (1) MIR models extract time-varying musical features (genre, mood, tempo, energy) from audio in real-time; (2) an LLM translates those features into visual prompts; (3) an image generation model produces responsive imagery. The key insight is inferring *semantic* qualities (mood, genre) over longer temporal windows rather than just reacting to instant energy levels — giving visual output that reflects the *character* of the music, not just its loudness.

**Could become a prototype**: `semantic-viz` — a multi-stage pipeline prototype: mic input → feature extraction (local, Web Audio) → genre/mood classification (small ONNX model) → LLM prompt generation (Claude API) → fal.ai image generation → displayed as ambient background behind one of the existing visualizers. Most ambitious prototype yet — multi-API, budget-intensive (~$0.01/image + Claude tokens). Worth incubating. The mood-inference stage alone could be a standalone prototype.
