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

---

## 2026-05-18 — Cycle 23 research sweep

### 22. HappyHorse-1.0 — #1 Ranked Joint Audio-Video Model (Alibaba / fal.ai, April 2026)
**Source**: https://fal.ai/happyhorse-1.0 · https://fal.ai/learn/devs/happyhorse-1-0-what-do-we-know-so-far

Alibaba's 15B-parameter unified Transformer that generates video and audio in a single forward pass — no separate audio post-processing step. Debuted April 26, 2026 on fal.ai and immediately topped the Artificial Analysis Video Arena over Seedance 2.0 and Kling 3.0 for both text-to-video and image-to-video. Outputs 5-8 second 1080p clips with natively generated dialogue, ambient sound, and Foley effects. Multilingual lip-sync in 7 languages. Pricing not officially published yet; comparable models on fal run $0.05-0.50/sec.

**Could become a prototype**: upgrades the queued `ghost-animate` plan. HappyHorse's joint audio-video in one pass means cleaner audio-visual sync than the Seedance 2.0 + MMAudio V2 two-step pipeline originally planned. Ghost LoRA image → HappyHorse image-to-video → cinematic 5-8s scene with native atmospheric sound. Admin-only, needs FAL_KEY + Karel approval.

---

### 23. Google Veo 3.1 — 4K Video with Native Audio (May 2026, fal.ai)
**Source**: https://fal.ai/models/fal-ai/veo3.1

Google DeepMind's Veo 3.1 is available on fal.ai. Standard pricing: $0.20/sec (no audio) or $0.40/sec (with audio) for 1080p; $0.40/sec or $0.60/sec for 4K. Supports text-to-video, image-to-video, and video extension chaining (up to ~2.5 minutes via 20 × 7-second extension steps). Veo 3.1 improves on Veo 3 for dialogue clarity, audio-visual sync, and reference image adherence. A 5-second Ghost scene with audio costs ~$2.00 on Standard.

**Could become a prototype**: second-best option for `ghost-animate` after HappyHorse-1.0. Video extension is uniquely useful — could extend a Ghost cinematic scene into a 30-60 second journey arc clip by chaining generations. More expensive than HappyHorse per second but Google's quality family is different. Needs FAL_KEY + Karel budget approval.

---

### 24. Latent Granular Resynthesis via Neural Audio Codecs (arxiv 2507.19202)
**Source**: https://arxiv.org/abs/2507.19202

Training-free cross-timbre synthesis via granular synthesis at the neural codec latent level. Encodes a "source" sound (cello, thunderstorm, didgeridoo) into a latent codebook of vector segments. Then matches each latent grain of a "target" audio signal (your piano) to its nearest codebook entry. Decoding the hybrid sequence produces audio with the temporal structure of your playing but the timbre of the source sound — your piano notes, but voiced as a cello or a thunderstorm. No training required. Hugging Face Spaces demo available. Latency for real-time not assessed; likely needs server-side inference.

**Could become a prototype**: `latent-granular-timbre` — extension of `18-granular`. Load a short reference sound (< 10s) as the "timbre donor." Mic input feeds the granular system as the target. Grains are matched to the reference codebook and decoded. Your piano playing comes back sounding like the reference instrument. The visual: scatter plot like 18-granular but color encodes match distance to nearest codebook entry (close = source color, far = target color). Needs API call (Hugging Face Spaces or self-hosted model) — evaluate feasibility next cycle.

---

### 25. Three.js TSL Audio-Reactive 3D Mesh — Active Community (2026)
**Source**: https://www.webgpu.com/showcase/audiolab-react-three-fiber-audio-visualizer/ · https://tympanus.net/codrops/2025/06/18/coding-a-3d-audio-visualizer-with-three-js-gsap-web-audio-api/

The WebGPU creative community in 2026 is building audio-reactive 3D deforming meshes using Three.js TSL (Three Shading Language) node materials. TSL compiles transparently to WGSL (WebGPU) or GLSL (WebGL) depending on the browser, and node materials can take `AnalyserNode` FFT data as uniform inputs to drive vertex displacement and fragment color. A bioluminescent sea anemone visualizer (updated Feb 2026, custom GLSL + FFT, Three.js WebGPU) demonstrates the aesthetic: organic 3D geometry that breathes and ripples with music, glowing in the dark. Radically different visual space from particles or fluid.

**Could become a prototype**: `three-mesh-av` — a single audio-reactive 3D mesh (sphere, torus, or organic form built with `IcosahedronGeometry` + displacement). `@react-three/fiber`, `three`, and `@react-three/drei` are already installed in Resonance (three@0.182, r3f@9.5). TSL node materials map frequency band energies to per-vertex displacement amplitude. Additive point-light positioned at centroid frequency. Demo mode uses oscillators; mic mode uses live FFT. Zero new dependencies. Completely new aesthetic vs. all 20 existing prototypes.

---

### 26. ÆTHRA — Music Programming Language as Code (Feb 2026, Hacker News)
**Source**: https://github.com/TanmayCzax/AETHRA · https://news.ycombinator.com/item?id=46820691

ÆTHRA is a domain-specific language (v0.8, C#) for composing music by writing code: notes, chords, tempo, dynamics, emotional arc, and instrument specification as readable commands. Multiple HN submissions in early 2026 with active discussion. Not browser-native, but the concept — "your musical intent as structured text, evaluated to sound" — translates directly to Web Audio + Canvas. A browser-native version could use a textarea as the score, parse note/chord commands via JavaScript, route them through OscillatorNodes, and paint the resulting melody as a canvas painting.

**Could become a prototype**: `code-score` — a minimal browser music DSL + visualizer. Type `C4 Q E4 Q G4 H pause H A3 H` (note, duration, rest) in a textarea. Evaluate to OscillatorNode + GainNode schedule. Simultaneously paint each note as a brush stroke on the persistent canvas from `13-piano-canvas`. "Write a melody, see it paint itself." No dependencies. Demo mode pre-loads a short Bach prelude fragment. Useful as a Resonance "score as session" concept.

---

### 27. Phase Vocoder Pitch Shifting in Web Audio AudioWorklet (2026)
**Source**: https://github.com/olvb/phaze (real-time Web Audio worklet, phase vocoder pitch shift)

The `phaze` library is a working AudioWorklet implementation of real-time phase vocoder pitch shifting. Takes mic input, outputs pitch-shifted audio at arbitrary semitone offsets with ~10ms latency. Phase vocoder produces some metallic artifacts on piano but is clean enough for harmonic enrichment (5th, octave). This is a native browser capability that none of the 20 dream prototypes exploit: real-time audio transformation (not just analysis or synthesis).

**Could become a prototype**: `pitch-harmonize` — mic input → AudioWorklet phase vocoder → pitch-shifted copy (+7 semitones = fifth, +12 = octave, -12 = sub-octave) → HRTF pan the copy to a different position than the dry signal. You play piano; the harmony floats in a different 3D position in your headphones. Visual: the original signal as one scope trail (from `20-scope` phase portrait), the pitch-shifted copy as a second overlapping trail in a complementary color. "You become your own accompanist." Zero new deps — `phaze` is an AudioWorklet source (inline-able, no npm).

---

### 28. GAPT Extension of ReaLchords — No Public API Yet (2025/2026)
**Source**: https://realchords-gapt.github.io/ · https://arxiv.org/abs/2506.14723

A Generative Adversarial Post-Training (GAPT) improvement to the original ReaLchords model for melody-to-chord accompaniment. Adversarial post-training improves harmonic and temporal coherency vs. the baseline. Research-only for now — no public API, no MIDI/mic integration, no browser WebSocket endpoint. The original ReaLchords demo (https://storage.googleapis.com/realchords/index.html) shows pre-recorded examples of melody + chord generation but doesn't support live input. The field is moving fast; a usable real-time API may emerge in the next few months.

**Could become a prototype**: when a public API lands — mic melody → ReaLchords/GAPT chord generation → HRTF spatial mix of generated chords. You play melody, AI harmonizes live, harmony floats in 3D space around you. Still the most exciting future prototype in the queue. Monitor every research cycle.

---

## Cycle 27 — 2026-05-19

### 29. A Design Space for Live Music Agents (arxiv 2602.05064, Feb 2026)
**Source**: https://arxiv.org/abs/2602.05064

Comprehensive taxonomy of 184 live music agent systems across four dimensions: usage contexts (practice, performance, composition, installation), interactions (synchronous/asynchronous, reactive/proactive), technologies (rule-based, ML, hybrid), and ecosystems (standalone, integrated, networked). Released as a "living artifact" — annotated system registry. Addresses fragmentation across HCI, AI, and computer music communities.

**Why it matters for Resonance**: The design space validates Resonance's live performance direction. Among the 184 systems surveyed, very few are browser-native and fully zero-latency — most require server inference or native plug-ins. The dream sandbox is unusual in operating entirely in-browser with no backend. That's a genuine differentiator worth emphasizing.

**Could become a prototype**: The taxonomy itself isn't a prototype, but the gaps it identifies are. Notably: "proactive" music agents (agent initiates musical events rather than responding) + browser + audio-reactive viz is an underexplored corner. `25-cellular` (cellular automaton composer) fills that gap — the grid "acts first," you react to it.

---

### 30. Real-Time Human-AI Musical Co-Performance with Latent Diffusion (arxiv 2604.07612, Apr 2026)
**Source**: https://arxiv.org/abs/2604.07612

Framework for real-time AI accompaniment: performer plays into MAX/MSP, a latent diffusion model generates instrumental accompaniment from a sliding audio context window, delivered via OSC/UDP. Key result: consistency distillation reduces sampling time 5.4×, enabling near-real-time response. Tradeoff: longer look-ahead window improves quality but increases latency.

**Why it matters**: Proves that real-time AI accompaniment (not just visualization) is achievable at ~1s latency on current hardware. The browser equivalent would need ACE-Step or MiniMax as the inference backend. The MAX/MSP front-end is architecturally analogous to the Web Audio API + fetch pattern already used in `2-ghost-lab`.

**Could become a prototype**: An upgraded `6-compose` — not just "type mood → get music" but "record 4 bars via mic → get AI accompaniment → loop it while you play on top." Needs FAL_KEY (ACE-Step, $0.0002/s). Budget: ~$0.01 per 30-second loop generation. The visual: whichever prototype (fluid/live/acoustic-trail) visualizes the playback in real time. "Your piano, given a living AI accompaniment."

---

### 31. Score Following + Piano Transcription (arxiv 2505.05078 + 2510.10087, 2025–2026)
**Source**: https://arxiv.org/abs/2505.05078 · https://arxiv.org/abs/2510.10087

Two complementary papers: (1) Real-time piano transcription paired with symbol-level score tracking — 174ms latency from mic to "current score position." Outperforms audio-only methods on both precision and robustness. (2) Matchmaker open-source library (Python) for real-time audio-based score following. Both use "online time warping" to handle the performer's natural tempo variations.

**Why it matters**: Score following is the missing interactive layer in Resonance. The dream sandbox already has pitch detection (13-piano-canvas) and score notation (22-code-score). Connecting them — piano input tracks position in a displayed score — is a one-cycle build using entirely existing primitives.

**Could become a prototype**: `26-score-follow` — display the 22-code-score Bach fragment as a scrolling piano roll. Play along via mic. Autocorrelation pitch detection matches each detected note to the nearest score note; a cursor advances through the score. Colored "actual" bars overlay the notated "target" bars. "The score lights up as you play it." Zero deps. See IDEAS.md.

---

### 32. WaveRoll — Browser Piano Roll Visualization (arxiv 2511.09562, Nov 2025)
**Source**: https://arxiv.org/abs/2511.09562

JavaScript library for comparative MIDI piano roll visualization in the browser. Displays multiple MIDI tracks on a single time-aligned scrolling grid with synchronized playback. Designed for AMT evaluation (compare transcription model output vs. ground truth). MIDI-only input — not live audio.

**Why it matters**: Confirms that scrolling piano roll rendering in plain JavaScript/Canvas2D is well-trodden and lightweight. The WaveRoll approach (time-aligned grid, color-coded tracks, scrolling) is directly adaptable for `24-piano-roll` using live pitch detection instead of MIDI input.

**Could become a prototype**: `24-piano-roll` — live scrolling piano roll from mic via autocorrelation pitch detection. Each detected note → colored rectangle (pitch = vertical position, duration = width, color = frequency→hue same as 1-live). Scrolls left at constant tempo. Demo mode: plays a silent oscillator sequence. "Your improvisation as notation — in real time." Natural companion to `13-piano-canvas`. See IDEAS.md.

---

### 33. CLAVIER-36 — Cellular Automaton Music Programming (HN Sep 2025)
**Source**: https://news.ycombinator.com/item?id=45232299 · https://clavier36.com/about

Browser + native generative music environment inspired by ORCA. Programs are 2D grids that evolve over time via local rules (like cellular automata). Each grid cell can trigger notes; sequences emerge from rule interactions. Includes an integrated sampler. Browser version available with limitations (no MIDI output, 1MB sample limit). Started as a from-scratch ORCA implementation, diverged by adding self-contained audio — "a complete instrument, not just a control surface."

**Why it matters**: None of the 23 existing dream prototypes treat music as *emergent from autonomous rules*. All react to mic input or generate via API. CLAVIER-36 points at a completely different generative paradigm: the music writes itself from initial conditions.

**Could become a prototype**: `25-cellular` — Conway's Game of Life grid where living cells trigger pitched notes (column → pitch, low-left = bass to high-right = treble). Each Life generation tick plays the active columns as a chord moment. Gliders trace repeating melodic loops; oscillators create rhythmic patterns; chaos produces cluster chords. User clicks to toggle cells. BPM slider. Demo preset: a glider pattern that produces a 4-note repeating loop. Visualizer: glowing cells with additive blending; note bursts on triggered columns. Zero deps. Pure Web Audio + Canvas2D. See IDEAS.md.

---

### 34. WASM in AudioWorklet — 2026 Standard for Browser DSP
**Source**: https://blog.weskill.org/2026/03/web-audio-api-immersive-soundscapes-for.html · https://emscripten.org/docs/api_reference/wasm_audio_worklets.html

In 2026, Rust → WebAssembly → AudioWorklet is the established standard for serious browser DSP. The pattern: write DSP code in Rust (or C++), compile to WASM, load into an AudioWorklet via the Emscripten WASM Audio Worklets API. Enables near-native performance: 256 simultaneous voices, physical modeling (Karplus-Strong), FFT-based effects. Latency: AudioWorklet buffers stay at 128 samples (~3ms at 44.1kHz).

**Why it matters for the dream sandbox**: `23-pitch-harmonize` uses a ring-buffer pitch shifter that sounds metallic on transients. A WASM-based FFT phase vocoder would fix this cleanly. However, compiling Rust requires a build toolchain not available in the dream zone (can't run `cargo build --target wasm32-unknown-unknown` from within `src/app/dream/`). A pre-built `.wasm` binary checked into the repo would work — but then Karel or a human with the Rust toolchain must build it. Flag this for discussion.

**Could become a prototype**: WASM path needs Karel input. Short-term: could check in a tiny pre-compiled Karplus-Strong WASM binary (< 20KB) as `src/app/dream/_shared/ks.wasm`. The prototype `28-karplus` would then load it into an AudioWorklet: play piano notes via mic, detected pitch triggers a Karplus-Strong string synthesis at that frequency. Visual: string vibration mode visualization (wave on a line, same frequency as the string). "Your rhythm, synthesized as a plucked string." Needs Karel approval on the WASM approach.

---

### 35. Kling 3.0 — Multi-Shot Storyboarding + Native Audio (fal.ai, Feb 2026)
**Source**: https://fal.ai/kling-3 · https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video

Kling 3.0 supports: text-to-video, image-to-video, start+end frame-to-video, element referencing (character/style consistency across shots), multi-shot storyboarding, and native audio generation. Output: up to 15 seconds, 1080p. Multilingual audio (Chinese, English, Japanese, Korean, Spanish). "Biggest architectural leap yet" in the Kling family.

**Why it matters for ghost-animate**: Single-shot Ghost image → 5-8s cinematic clip is what HappyHorse-1.0 does best. But a *journey arc* — stone chamber → root portal → underground pool → cosmic ascension — requires 4 separate clips that feel cinematically unified. Kling 3.0's element referencing (character consistency across shots) + multi-shot storyboarding enables this: define 4 shots with the Ghost character reference + style reference, get 4 coherent 5-second clips that chain into a ~20-second journey sequence. Budget estimate: ~$1.00–2.00/arc (4 × 5s @ $0.10–0.15/s pro). Needs FAL_KEY + Karel budget approval.

**Update to ghost-animate plan**: For single-clip Ghost animation, HappyHorse-1.0 remains the best option (April 2026 benchmark winner). For a full multi-shot journey arc, Kling 3.0 is the unique option (HappyHorse doesn't support multi-shot). Plan: implement both paths in `2-ghost-lab` extension — single scene → HappyHorse, arc sequence → Kling 3.0.

---

### 36. WebGPU Additive Synthesis via Compute Shaders
**Source**: https://gist.github.com/JolifantoBambla/0a4e9c2a0a8bc475f081bc6f9d1aa5a8 · https://blog.weskill.org/2026/04/webgpu-future-of-graphics-building-2026.html

WebGPU compute shaders can write float32 audio sample data into a GPU buffer, which can then be mapped to CPU and enqueued into the Web Audio API AudioContext. This means the GPU can synthesize audio: compute shaders accumulate a sum of sinusoids (additive synthesis) — one thread per partial, running thousands in parallel. A 2019 GPU paper "Making Music with Shaders" (HN discussion, now feasible in-browser via WebGPU) showed this approach.

**Why it matters**: Every existing dream prototype separates audio (Web Audio API, CPU) from visuals (GPU). This collapses the boundary. The GPU particle simulation (`16-particle-life-gpu`) already runs physics on GPU. If particles also *are* Fourier partials — particle X-position = harmonic number, Y = amplitude — then the physics directly synthesizes audio. The swarm IS the sound.

**Could become a prototype**: `27-gpu-additive` — extend `16-particle-life-gpu`. Each of the 9,000 particles is assigned a harmonic partial index (1–9000, mapped to 8 octave range). The compute shader runs particle physics (attraction/repulsion between partials as "consonance forces" — partials that are harmonically related attract). Every frame: read particle Y-amplitudes back to CPU via `mapAsync`, enqueue 128 samples of the synthesized waveform into an AudioWorkletProcessor. Audio output IS the swarm state. Visual: same particle rendering as 16-particle-life-gpu. "The swarm is the synthesizer." Requires WebGPU. One of the most technically ambitious ideas in the queue — may need 2 cycles.

---

## 2026-05-19 — Cycle 31 research sweep

### 37. Lyria RealTime API — Infinite Streaming AI Music via WebSocket
**Source**: https://ai.google.dev/gemini-api/docs/realtime-music-generation · https://magenta.withgoogle.com/lyria-realtime

Google DeepMind's Lyria RealTime API generates continuous 48kHz stereo music that never stops, delivered over a persistent WebSocket connection. Audio arrives in 2-second chunks; each chunk is conditioned on the last 10s of coarse audio context plus a style embedding controlled by the client. Controls: `set_weighted_prompts()` with text strings + numeric weights (blend multiple styles live), `set_music_generation_config()` for BPM (60–200), density, brightness, scale, key. A `reset_context()` call resets rhythmic state when changing BPM or scale. Requires a Gemini API key (available from aistudio.google.com). The open-weights cousin — **Magenta RealTime** — runs locally via Python/Colab on TPUs; same architecture (800M autoregressive transformer, MusicCoCa embeddings for text prompts), but not browser-callable without a local server. Standard Lyria RealTime via Gemini API IS browser-callable over WebSocket from JavaScript.

**Why it matters**: Every previous music-gen prototype (ACE-Step, MiniMax) generates a fixed clip. Lyria RealTime generates *forever* and responds to prompt changes within 2 seconds. The interaction model is completely different: instead of "generate then listen," it's "live-steer an infinite stream." Karel could type "add cello" mid-performance and the music absorbs it. BPM sync means it can lock to a real-time metronome. This is the most live-performance-relevant AI music capability discovered in any research cycle.

**Could become a prototype**: `28-lyria-jam` — two text prompt slots with weight sliders (0–2), BPM/density/brightness controls updated live. Mic input → RMS amplitude → auto-drives brightness for reactive feel. Generated PCM piped to `AnalyserNode` → feeds live-bloom visualizer (`1-live` style six-band radial). "The music never stops. You just steer it." Client-side only: Karel pastes Gemini API key into a settings field (stored in `sessionStorage`, never committed). Admin-only gate. Needs `GEMINI_API_KEY` discussion with Karel. Budget: Google AI Studio free tier has quota; Gemini 2.0 paid tier charges per minute of generated audio.

---

### 38. iOS 26 / Safari 26 — WebGPU Now Universal on All Platforms
**Source**: https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/ · https://brandlens.io/blog/the-untold-revolution-beneath-ios-26-webgpu-is-coming-everywhere-and-it-changes-everything/

Safari 26 (shipping with iOS 26, iPadOS 26, macOS 26, visionOS 26) adds full WebGPU support built on Apple Metal. Previously Safari on iOS/iPadOS was the last major holdout — macOS Safari 17+ had WebGPU but mobile Safari did not. As of iOS 26, WebGPU is supported in Chrome, Edge, Firefox, and all Safari variants (desktop + mobile). Three.js, Babylon.js, PlayCanvas, and ONNX Runtime all confirmed working in Safari 26 beta. WebGPU is now at effectively 100% coverage for any browser released in the last 6 months.

**Why it matters for the dream sandbox**: Karel reviews prototypes on his phone each morning. Previously, `15-webgpu-fluid`, `16-particle-life-gpu`, and the planned `27-gpu-additive` would have shown "WebGPU not supported" on his iPhone. With iOS 26, they all work. The "requires WebGPU" caveat in INDEX.md is now minor (only affects users on very old mobile browsers). The sandbox can confidently build WebGPU-first prototypes without mobile concerns.

---

### 39. SonoWorld — Image → Navigable 3D Spatial Audio Scene (arxiv 2603.28757, Mar 2026)
**Source**: https://arxiv.org/abs/2603.28757

Given a single RGB image, SonoWorld generates a navigable 3D audio-visual scene: (1) vision-language model identifies sounding objects in the image and their 3D positions; (2) spatially-appropriate audio is synthesized for each object (birds from canopy, water from left foreground, wind ambient); (3) encoded as First-Order Ambisonics (FOA, 4-channel spherical harmonics); (4) converted to binaural HRTF for headphones; (5) rendered in a public browser demo using Three.js + WebAudio API on a laptop CPU at 5.3ms latency (256-sample buffer at 48kHz). The entire browser demo requires no server — Three.js renders the visual, WebAudio HRTF renders the spatial audio.

**Why it matters**: The acoustic identity of a Ghost scene — "stone chamber: dry, narrow reverb, single piano note reverb tail" vs "cosmic ascension: vast reverberant space, harmonic drone" — is as definitive as the visual identity. SonoWorld proves a browser-native spatial audio experience from a single image is achievable without ML inference (the ML runs server-side in their pipeline; the browser demo only handles rendering). For Resonance, each Ghost preset scene has a known acoustic character that could be hand-authored rather than inferred.

**Could become a prototype**: `29-scene-spatial` — pick one of 6 Ghost preset scenes (stone chamber, root portal, underground pool, tiny planet, forest dawn, cosmic ascension). Each scene has hand-authored spatial audio: 3–5 WebAudio HRTF `PannerNode` sources placed at scene-appropriate positions (e.g. stone chamber = reverb-heavy piano from front-left, stone percussion from above; cosmic = pad drone from all directions, wind from front). Navigate by dragging the "listener" position on a canvas overhead view. Headphones required. Zero external deps — extends `7-spatial`'s HRTF approach with scene-specific source authoring. "Each Ghost scene has a sound as distinctive as its visuals." One-cycle build.

---

### 40. Veo 3.1 Fast — Halved Ghost-Animate Cost
**Source**: https://fal.ai/learn/tools/ai-video-generators · https://fal.ai/models

Veo 3.1 (Google DeepMind) adds a Fast tier: $0.10/sec without audio, $0.15/sec with audio, at 1080p — exactly half the cost of standard tier ($0.20/$0.40). A 5-second Ghost clip with native cinematic audio = ~$0.75 at Fast tier vs $2.00 standard. Seedance 2.0 (ByteDance, launched April 9, 2026) also on fal.ai: "cinematic output with native audio, real-world physics, director-level camera control." Kling 3.0 Pro updated (also at ~$0.15–0.20/sec).

**Why it matters**: Ghost-animate was previously flagged as expensive. At $0.75/clip for Veo 3.1 Fast, Karel could run 10 Ghost animation experiments for $7.50. Still needs FAL_KEY. HappyHorse-1.0 (Cycle 23 finding) remains the single-clip benchmark winner; Veo 3.1 Fast and Kling 3.0 Pro are now cost-competitive alternatives with different aesthetic characters. For a multi-shot journey arc (4 shots, character consistent), Kling 3.0 with element referencing is still the unique option.

---

### 41. Gesture2Music — Webcam Hand Gestures → Synthesized Notes (arxiv 2511.00793, Nov 2025)
**Source**: https://arxiv.org/abs/2511.00793

Custom dataset of 21 gesture-note classes spanning 7 tones × 3 pitch levels. Body + hand landmark detection (MediaPipe-style) → multilayer attention-gated RNN → note control events (pitch, octave, onset, sustain, amplitude). 30ms end-to-end latency. The system generates continuous music entirely from gesture — no audio input. Not browser-native (paper's implementation requires Python), but MediaPipe HandLandmarker runs entirely in browser as WASM (~8MB download) and produces the same hand landmarks at similar latency.

**Why it matters**: All 26 existing dream prototypes use audio as input or generate audio internally. None use the camera. Gesture2Music opens a completely new input modality: visual performance gesture as music control. A pianist conducting their own sound, a dancer playing frequencies with their body. Qualitatively different from mic input for live performance — more theatrical, more physical.

**Could become a prototype**: `30-gesture-music` — webcam → MediaPipe HandLandmarker (loaded from CDN as WASM, one-time 8MB download) → map 5 hand parameters to sound. Right hand Y-position → pitch (continuous glide); both-hands spread (palm-to-palm distance) → reverb decay; finger-curl count → harmonic richness (more curled = more harmonics); left hand Y → bass drone frequency; wrist velocity (fast movement) → percussive onset burst. Visual: hand skeleton overlay on webcam feed (canvas2D) + synthesized audio waveform strip below. "Conduct the music with your hands." Needs Karel approval on MediaPipe CDN dep (~8MB WASM). No API key required.

---

### 42. Chord Colourizer — Real-time Harmonic Analysis Visualization (arxiv 2510.10173, Oct 2025)
**Source**: https://arxiv.org/abs/2510.10173

Near real-time chord detection system using Constant-Q Transform chroma features. Extracts 12-bin chroma vector per audio frame, applies threshold-based filtering + tonal enhancement to identify root, third, and fifth. Maps detected chord to a color representation based on the circle of fifths. Designed as a GUI overlay for live music.

**Why it matters**: None of the 26 dream prototypes explicitly surfaces music theory — they all visualize audio signal properties (frequency, amplitude, timbre). Chord detection is the next layer up: not "what frequencies are present?" but "what musical structure do those frequencies form?" A pianist sees their chord progression annotated in real time. Bridges raw audio visualization and musical understanding.

**Could become a prototype**: `28-chord-canvas` — mic input → 2048-sample FFT → 12-bin chroma vector (sum FFT bins by semitone class) → template matching against 24 major/minor chord templates (correlation) → detect root + major/minor quality. Display: chord name in large monospace type (e.g. "F♯m") at top center; paint a colored rectangle onto a Canvas2D timeline strip — hue from root (same as `1-live` frequency→hue wheel), saturation from quality (major=vivid, minor=desaturated, dominant7=warm, diminished=cool-grey). Strip scrolls left; each chord block is as wide as its duration. "What chord are you playing — and what chord did you just play?" Zero external deps (pure FFT chroma). One-cycle build.

---

### 43. ACM IMX 2025 — AI-Driven Semantic Music Visualization
**Source**: https://dl.acm.org/doi/10.1145/3706370.3727869

System combining MIR (tempo, genre, mood, key, instruments) + LLM (to translate features into visual scene descriptions) + Image Generation (Stable Diffusion) to produce audio-reactive visuals that are semantically matched to the music, not just signal-matched. "Instead of mapping FFT → color, map genre:jazz → smoky nightclub visual style, mood:melancholy → desaturated blue palette." Audio features drive both which visual style is selected AND how fast/intense it changes.

**Why it matters for Resonance**: The current 26 prototypes are all signal-reactive (audio signal → visual signal). None are semantically reactive — they don't know if the music is jazz or classical, sad or joyful. A semantic layer would let Resonance's visualization style *understand the music*, not just react to its waveform. Longer-term direction; requires MIR classification inference in the browser (feasible with small pre-trained models via ONNX.js — 5MB classifier).

**Could become a prototype**: `31-mood-vis` — mic input → extract tempo + spectral centroid + zero-crossing rate + key confidence → classify into 6 mood/energy buckets (calm/energetic, bright/dark, complex/simple). Map each bucket to a visual mode (calm+bright = fluid/cymatics, energetic+dark = particles/tessellate, complex = reaction-diffusion). The visualizer *switches mode* as the music changes character. "A visualizer that listens." No ML needed for first version — rule-based classifier from audio features, one-cycle build.

---

## 2026-05-19 — Cycle 35 research sweep

### 44. Design Space for Live Music Agents (arxiv 2602.05064, Feb 2026)
**Source**: https://arxiv.org/abs/2602.05064

Survey paper analyzing 184 live music agent systems across academic literature and performance video. Proposes a 4-dimensional taxonomy: **usage contexts** (solo practice, duo collaboration, ensemble, installation), **interactions** (accompaniment, continuation, dialogue, layering), **technologies** (rule-based, statistical, neural, hybrid), and **ecosystems** (software-only, hardware-integrated, network-distributed). Identifies that "reaction latency" is the most common challenge cited (85% of papers), followed by "stylistic coherence" and "performer agency."

**Why it matters for Resonance**: The Resonance dream prototypes are building live music agents. This taxonomy positions the current 32 prototypes: `1-live` is a *visualization agent* (no generation); `4-operator` is a *control surface agent*; `23-pitch-harmonize` is a *transformation agent* (duo category). The gap the taxonomy highlights: no **dialogue** agents in the dream zone — systems that listen, then respond with their own musical contribution. The `aria-companion` idea (§45) fills this gap.

---

### 45. Aria-Duet — Real-Time Piano AI Duet at NeurIPS 2025 (arxiv 2511.01663)
**Source**: https://arxiv.org/abs/2511.01663 · https://neurips.cc/virtual/2025/loc/san-diego/123745

Interactive system for real-time piano AI duet on a Yamaha Disklavier. The interaction model is **turn-taking**: human plays a phrase → signals "over" → Aria (800M-parameter autoregressive transformer trained on 100k+ hours of solo piano, from a large-scale curated MIDI dataset) generates and plays back a musical continuation on the same acoustic piano via MIDI actuation. The model composes "one note at a time" in real-time, maintaining stylistic coherence and harmonic continuity with the human's phrase. Presented at NeurIPS 2025 as a demonstration paper.

**Why it matters**: All 32 dream prototypes respond to audio *immediately* and continuously. None wait, listen, then compose a response. The turn-taking paradigm is musically natural for pianists (jazz trading-4s, call-and-response improvisation) and creates a genuinely collaborative rather than just reactive relationship. The Disklavier is just a physical feedback mechanism — the turn-taking logic could work with Web Audio API synthesis for the AI's response.

**Could become a prototype**: `aria-companion` — mic → pitch detection → 4-bar buffer; after 2s of silence, if 8+ notes captured, generate a Markov-chain response (1st-order bigram pitch matrix built from the user's own notes + a small pentatonic bias for coherence) and play it back via piano-timbred OscillatorNode + short reverb. Visual: split dual piano roll — user's phrase on top (warm), AI response on bottom (cool). "The piano responds when you rest." Zero deps, no server, no ML inference — Markov chain is 20 lines of JS. Captures the *dialogue* paradigm without requiring a 40GB model. Research basis: arxiv 2511.01663, the "Ghost in the Keys" demo.

---

### 46. LoopGen — Training-Free Loopable Music Generation (arxiv 2504.04466, Apr 2026)
**Source**: https://arxiv.org/abs/2504.04466

Paper addressing a fundamental limitation of generative music models: they produce audio that does not loop cleanly (the start and end timestamps are acoustically inconsistent). LoopGen modifies MAGNeT (a non-autoregressive music transformer) to generate tokens in a circular pattern, explicitly conditioning the end of the sequence on the beginning. Result: 55% improvement in loop transition consistency score, 70% improvement in mean listener rating over baseline. The circular token generation adds ~15% inference time overhead.

**Why it matters for Resonance**: Resonance's journey engine currently loops ambient audio layers from pre-recorded samples. A generative ambient layer that loops seamlessly — synthesized on-the-fly to match the current phase's mood — would let the engine run indefinitely without ever repeating. This is the "infinite ambient" problem LoopGen solves at the generation level. More immediately: a loop-based prototype (`loop-station`) can use the *browser-side crossfade approach* (fade last 0.5s into first 0.5s) to approximate loop coherence without ML — good enough for a demo.

**Could become a prototype**: `loop-station` — 4 record slots, BPM-synced, each max 4 bars. Tap record → play → tap again to close and loop. Crossfade applied at loop boundary (smooth 200ms overlap-add). All slots phase-locked. Mini-waveform canvas per slot. Overdub mode. Demo loads 4 pre-built demo loops. "A loop station in your browser." Zero deps, pure Web Audio API (AudioBufferSourceNode with loop + playbackOffset). Performance-relevant: same paradigm as Boss RC-1 or Ableton session clips. This is the first prototype that lets you BUILD a multi-layer composition in the sandbox rather than just react to one.

---

### 47. Spectral Morphing — FFT Timbre Blending in the Browser
**Source**: https://daudio.dev/explore/SpectralMorphing · webglfundamentals.org/webgl/lessons/webgl-qna-how-to-get-audio-data-into-a-shader.html

Spectral morphing interpolates two audio signals at the frequency-domain level: FFT both signals simultaneously → linearly blend magnitude spectra (1−t)×|A| + t×|B| → preserve phases from source A → IFFT back to time domain. The output has the timbre fingerprint of A at t=0 and B at t=1, with a genuine acoustical hybrid at intermediate values (not just amplitude crossfade, which would just blend two waveforms). The browser AudioWorklet can implement this natively — two input channels → FFT (Float32Array, size 2048) → interpolate → IFFT → output — entirely at the audio thread with no main-thread involvement. Standard Web Audio API + `Float32Array.prototype.forEach`, zero dependencies.

**Why it matters**: All 32 dream prototypes treat audio as a source to analyze or transform (pitch shift, granular decompose, HRTF place). None resynthesize from blended spectral representations. Spectral morphing would be the first prototype that *creates hybrid timbres that cannot exist in nature* — the sound that is halfway between a saw wave and a sine wave is not just a mix of two sounds; it's a third thing. The AudioWorklet FFT approach has been feasible since 2020 but no dream prototype has used it.

**Could become a prototype**: `spectral-morph` — demo mode: two oscillators (sawtooth + sine wave at same pitch). AudioWorklet samples both, blends spectra based on morph slider. Visual: three stacked horizontal spectrum bars (source A bottom, blend center, source B top), each bar showing spectral magnitude distribution, colored with the `1-live` frequency→hue palette. Mic mode: mic as source A, synthesized tone as source B — morph between mic input and a target timbre. "The sound halfway between your piano and a flute." Zero deps. One-cycle build. Entirely new audio manipulation paradigm in the sandbox.

---

### 48. BRAVE — Low-Latency Neural Audio Synthesizer (arxiv 2503.11562, Mar 2026)
**Source**: https://arxiv.org/abs/2503.11562 · https://fcaspe.github.io/brave

BRAVE (Bravely Realtime Audio Variational autoEncoder) is an improvement of the RAVE model (previously in research log) focused specifically on latency for interactive musical use. Key architectural change: removes causal convolution look-ahead so the model can run with lower buffer sizes. Achieves "better pitch and loudness replication while showing timbre modification capabilities similar to RAVE" — takes mic input (piano, voice) and resynthesizes it through a learned latent space, effectively doing neural timbre transfer. Audio plugin implementation demonstrated; no browser/WASM version yet, but the RAVE lineage of models has WASM ports in the community.

**Why it matters**: The `23-pitch-harmonize` prototype does rule-based pitch shifting (AudioWorklet ring buffer). BRAVE would do neural timbre transfer — changing the *character* of an instrument (piano → string, voice → choir) in real time, not just the pitch. This is a qualitatively different transformation. No browser implementation exists yet — would require WASM compilation of the BRAVE inference engine — but it's worth tracking as a future `brave-timbre` prototype idea when a WASM port appears.

---

### 49. Web Audio API — Configurable Render Quantum (TPAC 2025 → Q4 2026 spec)
**Source**: https://www.w3.org/2025/11/TPAC/demo-audio-wg-update.html

The next Web Audio API revision (targeted for Q4 2026 spec completion) includes three relevant features: (1) **Configurable Render Quantum** — developers can set the audio processing buffer size below the current fixed 128-sample minimum, targeting sub-3ms latency for real-time interactive applications. Currently all Web Audio runs at 128 samples (~2.7ms at 48kHz) or larger; lower values would allow ~0.7ms at 128→32 samples. (2) **Performance.now() in AudioWorklet** — high-precision timer within the audio thread for drift correction and A/V sync. (3) **Playout Statistics API** — exposes glitch count and latency metrics on the AudioContext so prototypes can detect and respond to audio underruns.

**Why it matters**: Current dream prototypes target <50ms visual latency (achieved). Audio-to-screen latency for pitch detection in `13-piano-canvas` and `24-piano-roll` is ~20-30ms (within acceptable range). The Configurable Render Quantum would push audio-processing latency for `aria-companion` and `spectral-morph` below 3ms — potentially allowing real-time harmonic processing that feels like physical acoustics, not DSP. The Playout Stats API would let `loop-station` detect and auto-compensate for loop glitches. These changes land Q4 2026, so they'll be available but not yet standard for our current builds.

---

### 50. iPlug3 — WebGPU Audio Plugin Framework for the Agentic Era (Jan 2026)
**Source**: https://github.com/iPlug3

Ground-up reimagining of audio plug-in/app development started January 1, 2026. Tech stack: WebGPU Native (via Dawn), Skia Graphite (GPU-accelerated 2D), SDL3 (cross-platform windowing/events). Key claims: 120 FPS visualizations via GPU pipeline; scripts written in JS with APIs that mirror their web counterparts and can run in the browser with minimal changes; iPlug3 plug-ins can function as MCP servers (first framework to support MCP natively). The project "is designed for a world where agentic AI workflows dramatically accelerate iteration on DSP, UX, design." Early stage (started Jan 2026) but conceptually aligned with Resonance's Tauri/installation mode vision.

**Why it matters for Resonance**: The `4-operator` prototype sketches what a venue installation UI might look like. iPlug3 provides a concrete path: the same audio/visual code from the dream sandbox (which uses Web Audio + Canvas, mirroring browser APIs) could theoretically be ported to a native iPlug3 app running at 120 FPS on a venue laptop with a dedicated GPU. The MCP server feature could let the operator panel be controlled by a Claude agent in real time. Worth monitoring — this could be the technical foundation for "Resonance as an installation."

---

### 51. Revival — Live Audiovisual AI Musical Co-Performance (arxiv 2503.15498, Mar 2026)
**Source**: https://arxiv.org/abs/2503.15498

Live audiovisual performance system featuring real-time collaboration between a human percussionist, an electronic music artist, and AI musical agents. AI agents perform two roles: (1) *harmonic resonance* — listens to drummer's input, generates harmonic layers in real-time; (2) *structural scaffolding* — modulates the overall arc of the performance (build, climax, release) based on crowd energy. Audio-reactive visuals generated live and projected. Demonstrated at concert venues. Published March 2026, appears in ACM CHI 2026 proceedings.

**Why it matters for Resonance**: Revival is the closest academic analogue to what Resonance wants to be — an AI co-performer in a live setting, with aesthetic intent, not just technical reactivity. Their "structural scaffolding" role is directly analogous to Resonance's 6-phase journey arc. The paper's finding that AI agents work best as *co-performers with explicit roles* (rather than unconstrained free improvisation) validates Resonance's design decision to have a defined phase structure.

---

### 52. Kling 2.6 — Native Audio + Speech at $0.14/sec (Dec 2025)
**Source**: https://blog.fal.ai/kling-2-6-is-now-available-on-fal/ · https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video

Kling 2.6 Pro (released Dec 3, 2025, available day-0 on fal) generates 5s or 10s videos with native audio synthesis directly integrated into the video pipeline. $0.14/sec with audio on (5s clip = $0.70). Supports both text-to-video and image-to-video. Native speech: embed dialogue directly in prompts ("the Ghost stands still and whispers, 'I remember.'"), with lip-sync. Audio: environmental sound effects + ambient scored to visual content. Image-to-video mode takes a Ghost LoRA image + motion prompt → cinematic clip with native audio in one API call.

**Why it matters**: Ghost-animate (queued in IDEAS.md) has been planned for HappyHorse-1.0 (Cycle 23, single-clip winner) and Kling 3.0 (Cycle 27, multi-shot narrative). Kling 2.6 is a cost-effective middle option: $0.70 for a 5s Ghost clip with audio — cheaper than HappyHorse ($0.05-0.30 estimate) and Veo 3.1 Fast ($0.75). The speech capability is new: a Ghost image that *speaks* a line from the journey narrative is a different and potentially more powerful artifact than a Ghost that just moves. Worth a separate test in `2-ghost-lab` alongside the existing presets. Admin-only, needs FAL_KEY.

---

## 2026-05-19 — Cycle 39 research sweep

### 53. ReaLJam — Anticipation in Real-Time Human-AI Music Jamming (arxiv 2502.21267, CHI 2025)
**Source**: https://arxiv.org/abs/2502.21267

Real-time human-AI musical jamming system built around a Transformer agent trained with reinforcement learning. The key interaction innovation is **anticipation**: the AI continuously predicts how the performance will unfold and *visually conveys its plan to the user before executing it*. Ghost notes appear in the interface for the AI's predicted next move; as each note fires, the ghost solidifies. This makes the AI's intention legible, converting the interaction from "AI reacts" to "human-AI dialogue." Published at CHI 2025. The paper finds anticipation dramatically improves perceived collaboration quality compared to systems that just play without preview.

**Could become a prototype**: `39-anticipate` — extend `33-aria-companion` with ghost-note preview. When the Markov chain has a response planned, render it as semi-transparent bars in the lower piano roll 0.5s before each note fires. No latency increase — the ghost just shows what's coming. "Watch Aria decide before she plays." Zero deps, one-cycle upgrade of aria-companion.

---

### 54. Karplus-Strong Synthesis — Physical Modeling in Web Audio (3 nodes per string)
**Source**: https://ccrma.stanford.edu/~jos/pasp/Karplus_Strong_Algorithm.html · en.wikipedia.org/wiki/Karplus–Strong_string_synthesis

Karplus-Strong (1983) simulates a plucked string with a feedback delay loop: inject a short noise burst into a ring buffer, pass each sample through a one-pole lowpass filter (averaging two adjacent samples), and loop back with a gain < 1. In Web Audio API: one `DelayNode` (delay = 1/frequency), one `BiquadFilterNode(lowpass)` in the feedback path, one `GainNode(0.996)` for decay. Three nodes per string. Multiple strings ring simultaneously with no interaction. Zero deps, zero ml, no external calls.

**Why it matters for Resonance**: 35 prototypes exist in the dream sandbox; none use physical modeling synthesis. All synthesis so far is oscillators (sine, triangle, sawtooth) or granular decomposition. Karplus-Strong produces the distinctly organic sound of a plucked string (guitar, koto, harp, dulcimer) — qualitatively different from anything in the sandbox. It is also tactile: the act of "plucking" (injecting a noise burst) is intuitive, and multiple simultaneous strings ring and decay naturally.

**Could become a prototype**: `36-pluck-field` — a canvas of 24 virtual strings tuned to C pentatonic across 4 octaves, each implemented as 3 Web Audio nodes. Click any cell to pluck; mic onset events pluck random strings. Visual: damped sine wave animation per string cell, fading as the string decays. "What if the canvas was a harp?" Zero deps. One-cycle build. First physical modeling prototype.

---

### 55. LIMITER — Gamified Just Intonation Interface (arxiv 2507.08675, Jul 2025)
**Source**: https://arxiv.org/abs/2507.08675

LIMITER presents a digital musical instrument designed to make just intonation (JI) and microtonal music accessible. It uses color coding, geometric transformations, and game-like mechanics to help performers navigate the Tonnetz harmonic lattice without music-theory background. The paper introduces visualization strategies that make harmonic distance and consonance viscerally legible (nearby nodes = consonant; distant nodes = dissonant). Published Jul 2025, focuses on interaction design for alternative tuning systems.

**Why it matters for Resonance**: None of the 35 dream prototypes address tuning systems at all — they all assume 12-TET equal temperament. Just intonation makes perfect fifths and major thirds *purer* (less beating), which is directly relevant to piano playing and the "transcendent" aesthetic Resonance aims for. The Tonnetz lattice is also a beautiful, unfamiliar visualization that pianists rarely encounter. A JI explorer would be high "surprise" for Karel.

**Could become a prototype**: `37-ratio-lab` — an interactive 9×5 Tonnetz lattice on canvas. X axis = perfect fifths (×3/2), Y axis = major thirds (×5/4). Click any node to hear the just-intonation interval against a sustained drone. Color = consonance (warm = near 1/1, cool = far). Mic mode: pitch detection highlights the closest lattice node to detected pitch. "Navigate harmony as a landscape — where do you fall?" Zero deps. One-cycle build.

---

### 56. MusicGen in the Browser via Transformers.js — Zero-Cost AI Music Generation
**Source**: https://huggingface.co/posts/Xenova/489076696143187 · https://github.com/huggingface/transformers.js/

Meta's MusicGen (text→music autoregressive Transformer) runs entirely in the browser via Transformers.js + ONNX Runtime. The `facebook/musicgen-small` model (~390MB ONNX weights) downloads once, caches in browser, and generates up to 30s of audio with zero server/API calls. Streaming: first audio chunk available at ~5s using the `TextStreamer` API. Quality: coherent musical output with melody, harmony, rhythm — not just noise. The Xenova HuggingFace Space demo shows this works in Chrome at 2026-standard ONNX Runtime speeds.

**Why it matters**: The long-queued `6-compose` prototype has been blocked on FAL_KEY for ACE-Step. MusicGen browser needs no API key, no rate limits, and costs nothing per generation after the one-time model download. The 390MB download is significant (comparable to a HD video), but browsers cache it indefinitely. This makes a genuinely AI-generated music prototype possible with zero API dependency.

**Could become a prototype**: `40-browser-musicgen` — text prompt → MusicGen in-browser → plays through live-bloom radial visualizer. Needs Karel OK on (1) ~390MB CDN download and (2) adding `@xenova/transformers` to package.json (or loading from CDN as ESM). Could also be built as a CDN-only prototype using `import()` from jsDelivr to avoid package.json changes.

---

### 57. ASTRODITHER — Three.js TSL Audio-Reactive with Dithering and Time Warp
**Source**: https://discourse.threejs.org/t/astrodither-audio-reactive-tsl-experiment/87533

Community Three.js forum post showcasing an audio-reactive WebGPU experiment built with TSL (Three Shading Language). Techniques used: custom fluid simulation, selective bloom (only bright fragments get bloom), **ordered dithering** post-processing (halftone-like grain), and **time warp** (non-linear time acceleration of visual evolution tied to audio energy). The creator describes it as emerging from experimentation with TSL — a discovery rather than a plan.

**Why it matters for Resonance**: Dithering as a visual effect is absent from all 35 dream prototypes. Selective bloom (bloom only on the most displaced/brightest geometry) is more nuanced than the full-scene bloom in `21-three-mesh-av`. Time warp (speeding up a visual process with audio energy) is a technique that makes the visualizer feel *alive in time* rather than just bright or dark. All three techniques are available in Three.js r171+ via TSL and could be added to `21-three-mesh-av` in a polish cycle, or inform a new dedicated prototype.

**No new prototype recommended** from this finding — but worth incorporating into the next `21-three-mesh-av` polish cycle.

---

### 58. AffectMachine-Pop — Real-Time Emotion-Parameterized Music Synthesis (arxiv 2506.08200, Jun 2026)
**Source**: https://arxiv.org/abs/2506.08200

An expert system for generating retro-pop music controlled by **arousal** and **valence** — the two axes of Russell's circumplex model of affect (the dominant model of emotion in music psychology). Arousal (calm↔excited) and valence (sad↔happy) together span most of the emotional space of music. The system accepts real-time emotion parameter updates and adjusts its generative behavior continuously. Validated in a listening study showing high emotional alignment between target and perceived emotion. Published June 2026.

**Why it matters for Resonance**: The arousal × valence plane maps directly and intuitively to music parameters any pianist understands — tempo, loudness, chord quality, harmonic density, register. A browser implementation using rule-based Web Audio synthesis (no ML required for the synthesis itself) could make a genuinely new interaction: drag a dot on a 2D emotional plane and hear the music change in real time. This is distinct from all 35 existing prototypes, which use audio *as input*; this one uses it *as output from an emotional coordinate*.

**Could become a prototype**: `38-mood-xy` — a 2D canvas with valence (X) × arousal (Y). Drag a dot; Web Audio synthesizes: arousal → BPM (40–140), voice count (1–6), register; valence → chord quality (major/minor/diminished), brightness, duration. Background color tracks quadrant. Trail shows emotional journey. "Navigate your musical mood." Zero deps. One-cycle build.

---

### 59. DARC — Drum Accompaniment from Rhythm Input (arxiv 2601.02357, Jan 2026)
**Source**: https://arxiv.org/abs/2601.02357

DARC adds fine-grained rhythm control to drum generation: the model conditions on both musical context (other audio stems) and explicit rhythm prompts such as **beatboxing or tapping tracks**. Uses parameter-efficient fine-tuning of the STAGE model. The key innovation: a user can hum, tap, or beatbox a rhythm and the system generates a matching drum track that respects both the rhythmic pattern and the musical context. No browser demo; no public API at time of research.

**Why it matters**: The `35-loop-station` prototype lets users record loops via mic. A natural extension: instead of recording and looping raw audio, the user taps a rhythmic pattern (detected via onset/transient analysis), and the system synthesizes a drum track from Web Audio scheduled notes matching that rhythm. This would be the first prototype where the *rhythmic pattern* (not just audio energy) drives synthesis. No ML needed — browser-side: detect onsets → build a rhythm vector → schedule drum-pattern Web Audio nodes.

**Could become a prototype**: `drum-tap` — Route `/dream/36-drum-tap` (alternate to pluck-field). Mic: onset detection builds a rhythm buffer over 2 bars. After 2 bars of silence: quantize onsets to 16th-note grid, generate kick/snare/hihat pattern from grid density using Web Audio percussion synthesis (bandpass-filtered noise for snare, sine decay for kick). Visual: 2-bar grid canvas showing detected vs. quantized onsets. "Tap a rhythm; hear it as drums." Zero deps. One-cycle build.

---

### 60. Mozualization — Multimodal Emotion-to-Music Interface (arxiv 2504.13891, Apr 2026)
**Source**: https://arxiv.org/abs/2504.13891 (CHI 2025 submission)

A multimodal music generation tool that accepts keywords, images, and audio clips (music segments or environmental sounds) as combined creative inputs. Users express an emotion or scene through any combination of these media, and the AI generates a cohesive musical output. User study with nine music enthusiasts; published CHI 2025. The interface prioritizes real-world usability and low barriers.

**Why it matters for Resonance**: The idea of mixing multiple expressive modalities (image + text + sound → music) directly aligns with Resonance's multi-sensory philosophy. A browser version would need fal.ai or similar for the generation step, but the *interface concept* — upload a photo + type a mood word + hum a melody fragment → generate a scene's music — is compelling as a future `compose` prototype variant. More nuanced than just "type a text prompt."

**No new standalone prototype recommended** from this finding — it upgrades the planned `6-compose` spec (add image input alongside text). Note for when `6-compose` is built.

---

## 2026-05-19 — Cycle 44 research sweep

### 61. onnxcrepe — Neural Pitch Detection in the Browser (ONNX CREPE)
**Source**: https://github.com/yqzhishen/onnxcrepe · https://marl.github.io/crepe/

CREPE (Convolutional REpresentation for Pitch Estimation) is a deep neural network pitch tracker that significantly outperforms autocorrelation on noisy, complex, or lightly polyphonic audio. The onnxcrepe repo exports CREPE as ONNX weights in five sizes: tiny, small, medium, large, full. The tiny variant (~2MB, ONNX format) is realistic for browser loading via ONNX Runtime Web — loadable from CDN as an ES module with no package.json change, on demand when the user starts mic mode. Transformers.js v4 uses the same ONNX Runtime under the hood; CREPE-tiny is within its supported model class. Input: 1024-sample time-domain audio frame at 16kHz (one pitch estimate per ~65ms). Output: 360-bin pitch salience (20–1975 Hz, 20 cent resolution). A simple argmax + parabolic interpolation gives a pitch estimate with ±10 cent accuracy — vs. ±50+ cents for autocorrelation on complex signals.

**Why it matters for Resonance**: Six dream prototypes currently use autocorrelation pitch detection (`13-piano-canvas`, `24-piano-roll`, `26-score-follow`, `33-aria-companion`, `37-ratio-lab`, `39-anticipate`). Autocorrelation works for clean single-note piano but degrades with reverb, background noise, complex piano chords, and voice. CREPE-tiny would make pitch detection reliably accurate across all these conditions. It's also the first neural inference in `_shared/` — a template for bringing other ONNX models into the sandbox.

**Could become a prototype**: `neural-pitch` — add `src/app/dream/_shared/use-neural-pitch.ts` that loads CREPE-tiny from CDN on first mic-start, runs inference at 30Hz, and drops in as a replacement for the autocorrelation path in any prototype. Route: no new page (shared upgrade). Needs Karel OK on CDN ONNX dep (~2MB first-load). First neural inference in the dream zone; dramatic quality improvement for 6+ prototypes.

---

### 62. Magenta RealTime — Open-Weights Continuous Music Generation (Google DeepMind)
**Source**: https://magenta.withgoogle.com/magenta-realtime · https://arxiv.org/abs/2508.04651

Magenta RealTime (MagentaRT) is Google DeepMind's open-weights counterpart to the proprietary Lyria RealTime. 800M-parameter autoregressive transformer, Apache 2.0, available on GitHub and HuggingFace. Generates 48kHz stereo music continuously with RTF 0.625 (1.25s of computation per 2s of audio — faster than real-time on Colab TPU). Accepts text prompts and audio prompt embeddings for style steering. Supports "embedding arithmetic": style embeddings can be blended by weighted addition (`E_jazz × 0.7 + E_ambient × 0.3`) — a mathematically rigorous mixture that produces a genuine stylistic hybrid, not just a prompt interpolation. Trained on ~190k hours of stock instrumental music.

**Why it matters for Resonance**: Already queued `30-lyria-jam` uses the proprietary Lyria API requiring a Gemini key. Magenta RT is Apache 2.0 and self-hostable — a backend proxy in a Colab notebook (free TPU tier) could expose it to the browser prototype via WebSocket. The embedding arithmetic concept validates the `30-lyria-jam` slider design: mixing prompt weights is mathematically meaningful, not just a soft interpolation. Not browser-native yet (on-device roadmap not shipped), but the Colab-proxy approach gives a path. More interesting long-term: could be fine-tuned on Resonance's specific aesthetic, making it a Ghost-character music model.

**Could become a prototype**: `magenta-live` — browser connects to a Colab notebook backend via WebSocket, sends style prompt embeddings (two sliders with text labels, same design as `30-lyria-jam`), receives 48kHz PCM chunks. Karel pastes the Colab URL. The most realistic self-hosted AI music streaming prototype in the queue. Requires a running Colab session — not fully zero-backend, but zero API cost. Parallel to `30-lyria-jam`, not a replacement.

---

### 63. Mirelo AI SFX 1.6 Suite (fal.ai) — Audio Extension + Inpainting
**Source**: https://fal.ai/explore/models · https://fal.ai/ (Mirelo AI SFX section)

A new model family on fal.ai (not previously covered) with four capabilities: (1) **Text-to-Audio**: generate ambient soundscapes from text prompts, with loopable output; (2) **Video-to-Video**: take any video up to 60s and generate a synced audio soundtrack with text-prompt shaping (different from MMAudio V2 — the text prompt shapes the *type* of sound while the model matches video timing automatically); (3) **Audio Extension**: take any existing audio clip and extend it seamlessly with a natural tail; (4) **Audio Inpainting**: select any segment of a clip and replace it with AI-generated audio that matches the surrounding context. Extension and inpainting are genuinely new manipulation primitives — not previously available in the dream zone's API toolkit.

**Why it matters for Resonance**: The Ghost soundscape prototype (`9-ghost-sound`) generates a 10s scene-specific audio clip from a Ghost image. Mirelo Audio Extension could extend this to an infinite loop seamlessly — turning a 10s synthesized stone-chamber soundscape into a living ambient loop. Inpainting could let Karel edit Ghost soundscapes: select 3s of birdsong from the Forest Dawn scene and replace with wind, without regenerating the whole clip. These are composition-level tools, not just generation.

**Could become a prototype**: `mirelo-ghost-loop` — extend `9-ghost-sound`: after generating a Ghost audio clip via MMAudio V2, pipe it through Mirelo Audio Extension to produce a 30-60s loopable version. Auto-loop in the browser. Display a waveform with the original clip highlighted and the extended section in a different color. "Ghost scenes that breathe continuously." Admin-only, needs FAL_KEY. Budget: MMAudio V2 ($0.01) + Mirelo Extension (TBD, likely $0.002-0.005/clip).

---

### 64. Udio v4 — Audio Inpainting in Production (2026)
**Source**: https://ucstrategies.com/news/udio-v4-ai-music-editing-with-inpainting-stem-separation-2026/ · https://x.com/udiomusic/status/1788243716676759668

Udio v4 (2026) shipped AI audio inpainting as a production feature: select any time segment of a generated track (e.g., 3 bars around the chorus), press "regenerate" → the AI fills that section with new material that seamlessly connects to the surrounding bars. The surrounding context provides boundary conditions; the model maintains melodic and harmonic continuity. Also ships stem separation (isolate vocals, drums, bass, melody). No public API for either feature — Udio is consumer-only.

**Why it matters for Resonance**: The inpainting paradigm — "select a section and fix it" — is a qualitatively different creative workflow from the current dream zone approach (generate everything at once). It's the difference between painting and erasing+repainting. In combination with Mirelo's inpainting API (§63), this is now an achievable workflow in the dream zone: generate a Ghost soundscape → play it → select a weak moment → regenerate in context. The UX lesson from Udio: the timeline view with selection handles is the right interaction model. Could inform how `35-loop-station` evolves — not just record/loop, but select a bar → regenerate.

**No immediate prototype** — Udio has no public API, and Mirelo (§63) covers the technical path. But the inpainting UX paradigm should inform future compose+edit prototypes.

---

### 65. Live Music Models — Embedding Arithmetic for Style Navigation (arxiv 2508.04651)
**Source**: https://arxiv.org/abs/2508.04651

Formal paper from Google DeepMind establishing "Live Music Models" as a generative class: real-time continuous streaming music with human-in-the-loop style control. Introduces Lyria RealTime (proprietary) and Magenta RealTime (open-weights Apache 2.0, §62) together. Key technical contribution beyond the two model releases: **embedding arithmetic** as a first-class creative tool. Style embeddings derived from text or audio prompts are vectors in a shared latent space; blending them by weighted sum (`0.7 × E_jazz + 0.3 × E_ambient`) produces a musically valid hybrid. The paper demonstrates real-time navigation of this space by changing weights over time — the sound continuously morphs as the weights shift.

**Why it matters for Resonance's `30-lyria-jam`**: The existing spec uses two text-prompt sliders. This paper confirms the math: those sliders are literally navigating a vector space via weighted addition. The key design implication: a *2D canvas* (like `38-mood-xy`) is more natural than sliders for navigating a 2D style subspace. Drag a dot → position determines two style weights → music morphs continuously. This upgrades the `30-lyria-jam` spec: instead of sliders, a 2D draggable canvas where each corner is a distinct musical style. A 2D musical style navigator that never stops playing.

---

### 66. Transformers.js v4 — 53% Smaller Bundles, 10× Faster Loading (2026)
**Source**: https://huggingface.co/docs/transformers.js/index · https://www.pkgpulse.com/guides/transformersjs-vs-onnx-runtime-web-2026

Transformers.js v4 (released at Web AI Summit 2025, production-stable in early 2026) achieves 53% smaller bundle sizes and drops model load times from ~2s to ~200ms. Uses an optimized ONNX Runtime Web backend. Supports streaming token generation for text models and audio chunk generation for audio models. Model zoo has expanded: classification, ASR (Whisper), image segmentation, audio generation, pitch estimation, and more. Loading a model from CDN is now a ~200ms operation (cached immediately); first inference adds another ~100-500ms depending on model size.

**Why it matters for Resonance**: Two dream prototype ideas depend on browser ML inference: `40-browser-musicgen` (MusicGen-small, 390MB) and the proposed `neural-pitch` (CREPE-tiny, ~2MB). The v4 improvements make both significantly more feasible. CREPE-tiny (~2MB) would load in under a second on any connection and cache permanently. MusicGen-small (390MB) benefits from the 200ms startup after first load. The Transformers.js v4 improvement is not a new capability but a performance milestone that pushes browser ML from "experimental" to "viable for production prototypes."

**No new standalone prototype** — this is a platform improvement that enables §61 (`neural-pitch`) and §56 (`browser-musicgen`) to be built with higher confidence.

---

### 67. limut — Browser Live Coding Music + Visuals (WebAudio + WebGL + Shadertoy)
**Source**: https://github.com/sdclibbery/limut (updated May 11, 2026)

limut is a browser-based live coding environment for simultaneous music and visual synthesis, inspired by FoxDot. No installation — runs in any modern browser. Uses WebAudio API for synthesis + sample playback (including Salamander Grand Piano samples), WebGL for real-time graphics, and supports loading shaders directly from Shadertoy.com. The codebase uses a pattern-based notation where each line of code generates both audio and visuals simultaneously. Updated May 11, 2026 (56 stars). CodeMirror editor for syntax-highlighted live editing with eval-on-save.

**Why it matters for Resonance**: `22-code-score` builds a score DSL that plays and paints. limut goes further: a pattern language that generates audio AND visual patterns at the same time, with live editing. The design insight: the code is the score, the visualization, AND the performance interface simultaneously. No separate "play" button — the code runs continuously and you edit it live. This is a different paradigm from the existing `22-code-score` (write then play) — it's more like Hydra/Tidal for Resonance. The Shadertoy integration means you could load any fragment shader and drive it from the music pattern.

**Could become a prototype**: `code-vis` — Route `/dream/41-code-vis`. A split-screen: left = CodeMirror textarea (pattern DSL, auto-evaluates on change), right = canvas (visual output). DSL: `synth(220, "triangle").env(0.1, 0.5)  // plays a triangle wave at A3 with 0.1s attack`. Each synth line generates both audio and a corresponding visual element (particle, ring, bloom) on the canvas. Colors and sizes match the `1-live` frequency→hue palette. "The code plays; the code draws." Zero deps except CodeMirror (already available via CDN without package.json changes). Inspired by limut but built for Resonance's dark-theme aesthetic. One-cycle build.

---

### 68. Suno v5.5 — Voice Cloning + Custom Models + Generative Stems (March 2026)
**Source**: https://suno.com/blog/v5-5 · https://medium.com/ai-tomorrow/suno-just-released-v5-5-b32965eb153a

Suno v5.5 (March 26, 2026): three major additions. (1) **Voices**: upload a clean a cappella recording of your voice → AI generates complete songs sung in that specific voice. Works from mic recording, clean audio file, or finished tracks with backing music. (2) **Custom Models**: Pro/Premier subscribers can fine-tune v5.5 on their own music catalog to build a personalized model that generates music in their style (up to 3 custom models). (3) **Generative Stems**: v5 generates up to 12 individual stems (kick, bass, melody, harmony, texture, etc.) as separate audio tracks, not just a mixed-down stereo output. Also: "My Taste" — Suno learns your preference history.

**Why it matters for Resonance**: No public API for Voices or Custom Models. However, the **Generative Stems** feature is the most interesting for a dream prototype: 12 stems from a single generation means you can place each stem in 3D HRTF space (`7-spatial`). A `compose-spatial` prototype: type a text prompt → Suno generates a track → receive 12 stems → assign each stem to a 3D position (kick = below, piano = center-front, strings = above-left, etc.) → hear the AI music as a full 3D spatial experience. Needs Suno API (currently basic API available, stems endpoint TBD). The stems concept also suggests a future where `35-loop-station` receives AI-generated stems as individual tracks instead of recording them live. Watch for API expansion.

**Could become a prototype**: `suno-spatial` — type a prompt → call Suno API (if stems endpoint is available) → receive stems → auto-place stems in HRTF space → 3D spatial canvas (same design as `7-spatial`). Admin-only (needs Suno API key). If stems API not available: generate full mix → split via WebAudio 6-band filter bank → pseudo-spatial placement (approximation). Budget: Suno API ~$0.01-0.05/generation. Needs Karel OK on Suno API integration.

---

## 2026-05-19 — Cycle 48 research sweep

### 69. Lyria 3 — Google DeepMind Multimodal Music Generation via Gemini API (February 2026)
**Source**: https://ai.google.dev/gemini-api/docs/music-generation · https://blog.google/innovation-and-ai/technology/developers-tools/lyria-3-developers/

Google DeepMind launched Lyria 3 on February 18, 2026, via the Gemini API. Two endpoints: `lyria-3-clip-preview` (generates a 30-second MP3 clip) and `lyria-3-pro-preview` (full-length songs, a couple of minutes, WAV or MP3). Both use the standard `generateContent` method. Controls include: lyrics with section tags (`[Verse]`, `[Chorus]`), up to 10 images that influence mood/style/atmosphere, specific instrument requests, vocal gender/timbre/range control, and genre/key/mood/BPM/duration all specifiable in the prompt. Timestamps can target specific moments in the song. Available via the same `$GEMINI_API_KEY` as Lyria RealTime.

**Why it matters for Resonance**: This is the missing link between Ghost imagery and Ghost audio. Send a Ghost LoRA image (stone chamber, forest dawn, cosmic ascension) alongside a text prompt ("ambient score for this scene, slow tempo, piano and reverb, no vocals") and Lyria 3 Clip returns a 30-second ambient track shaped by the visual. Karel's existing Gemini key request (for `30-lyria-jam`) unlocks this too. Budget: free tier in AI Studio, then per-request billing.

**Could become a prototype**: `lyria-ghost` — UI shows the 5 Ghost scene presets (same names as `29-scene-spatial`). Click a scene, optionally upload a custom Ghost image. "Generate" calls Lyria 3 Clip with the image + a scene-specific text prompt. Returned audio plays through the live-bloom radial visualizer (`1-live`-style). Waveform player shows duration. Second track "Generate variation" calls again with the same image + a random seed. Admin-only. One-cycle build. Needs GEMINI_API_KEY.

---

### 70. Stable Audio 2.5 — Audio Continuation + Inpainting on fal.ai (2026)
**Source**: https://blog.fal.ai/stable-audio-2-5-now-available-on-fal/ · https://fal.ai/models/fal-ai/stable-audio-25/inpaint · https://stability.ai/stable-audio

Stability AI's Stable Audio 2.5 is available on fal.ai at **$0.20/audio** and open-source (GitHub: Stability-AI/stable-audio-tools). Two new capabilities over Stable Audio 2.0: (1) **Audio continuation** — upload an audio clip, specify a start point, AI extends it seamlessly into a longer piece; (2) **Audio inpainting** — select a segment within an existing track, AI regenerates only that section in context of the surrounding audio. Supports text-to-audio, audio-to-audio, inpainting workflows.

**Why it matters for Resonance**: This is the first browser-accessible "continue YOUR playing" API. A pianist records a phrase → sends it to Stable Audio 2.5 continuation → receives a 30-second extension of that idea. The extension is contextually aware of what was played (key, tempo, style) and continues in the same direction. Different from ACE-Step (text-to-music) and MiniMax (style-match): this one extends audio that exists. Also, the inpainting mode could be used to "fix" a loop that has an awkward splice point — same use case as Udio v4 inpainting.

**Could become a prototype**: `stable-extend` — mic records 4–8 bars (same mechanism as `35-loop-station` capture). "Extend" button sends the recording to `fal-ai/stable-audio-25/inpaint` (continuation mode). Progress bar during generation (~5–10s for 30s output). Returned audio plays through live-bloom visualizer automatically. Waveform shows original (highlighted) + extension side by side. Optional text prompt to guide style ("extend this into a cello-and-piano duet"). Admin-optional. Needs FAL_KEY (already in use). $0.20/generation. One-cycle build.

---

### 71. Suno Studio v5 Generative Stems — 12-Track AI Separation (March 2026)
**Source**: https://undetectr.com/blog/suno-studio-guide · https://neuronad.com/suno-vs-udio/

Suno Studio (released with v5) is a built-in DAW that generates up to 12 stems from any AI-generated track: vocal, backing vocals, drums (kick, snare, hi-hat separate), bass, piano, strings, guitar, pads, and more. Also includes Warp Markers (tempo adjustment), Remove FX (strip reverb/effects), Alternates (generate multiple versions of individual sections), EQ and level controls. Stems can be exported for use in external DAWs. Suno public API currently doesn't expose stems endpoint — stems are only accessible via the web UI. Watch for API expansion.

**Why it matters for Resonance**: When the Suno API exposes stems, it enables a uniquely spatial listening experience: generate a Ghost-themed track → receive 12 stems → place each in 3D HRTF space (piano center-front, strings above-left, bass below, kick behind). The resulting spatialized mix would surround the listener inside the Ghost world's music. The `35-loop-station` could also load individual AI stems as its 4 base tracks rather than recording them manually — no mic needed for a high-quality demo.

**Could become a prototype** (when API ready): `suno-stems-spatial` — type a Ghost scene prompt → call Suno API for a track + stems → auto-place each stem at a hand-authored 3D HRTF position → 3D canvas view (same design as `29-scene-spatial`). Needs Suno API key + stems endpoint. Monitor for API release. Fallback: generate a mix → WebAudio 6-band filter bank → pseudo-spatialize by frequency band (approximates stem separation using the `7-spatial` pattern, buildable today with existing FAL_KEY).

---

### 72. ONNX Runtime Web 1.26.0 — WebGPU Execution Provider Default (May 2026)
**Source**: https://www.npmjs.com/package/onnxruntime-web · https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html

ONNX Runtime Web 1.26.0 was published in May 2026 (approximately 11 days before this cycle). The WebGPU execution provider is now the recommended default over WebGL for GPU-accelerated inference. WebGL support is in maintenance mode. The WebAssembly EP runs at near-native CPU speed. With WebGPU EP on a discrete GPU (or integrated GPU with good WebGPU support), ONNX model inference runs ~5–10× faster than WASM EP. The update cadence is approximately quarterly; v1.26 is the latest stable release.

**Why it matters for Resonance**: The `neural-pitch` upgrade proposal (CREPE-tiny ONNX, ~2MB from CDN) was estimated to load in ~200ms and run inference in ~5ms per frame. With the 1.26 WebGPU EP: load is still ~200ms but inference drops to ~1ms per frame — essentially zero latency for pitch detection. This makes CREPE-tiny viable as the default pitch detector even in high-refresh-rate scenarios (120fps canvas + 60Hz pitch detection). Also, `40-browser-musicgen` (MusicGen-small, 390MB) would benefit from WebGPU EP for the forward pass, reducing generation time from ~15-30s to potentially ~8-15s.

**No new standalone prototype** — this is a platform improvement. Directly upgrades the viability of §61 (`neural-pitch`) and §56 (`browser-musicgen`). Flags the CDN dep question as even more worth asking Karel about.

---

### 73. Real-Time MIDI-to-Image via Emotional Analysis (ICCC 2024, arxiv 2407.05584)
**Source**: https://arxiv.org/abs/2407.05584

Published at the International Conference on Computational Creativity 2024. System pipeline: MIDI keyboard → harmonic analysis (chord quality, key, register) + emotional inference (arousal/valence from `38-mood-xy`-style coordinates) → generative AI image in real-time. User study with musicians confirmed they found the generated imagery novel and creatively inspiring during improvisation. The generated images respond to the emotional character of what's being played, not just individual notes.

**Why it matters for Resonance**: This paper validates the "playing → visual world" direction with a user study. Resonance already has mic→pitch (`13-piano-canvas`), mic→chord (`28-chord-canvas`), and emotion coordinates→music (`38-mood-xy`). The missing piece is: playing → Ghost image that matches the mood of what you're playing. The dream zone has all the building blocks. A `piano-to-ghost` prototype would close the loop: play piano → detect chords + valence/arousal → Lyria 3 Clip generates Ghost-themed ambient music in that mood → Ghost LoRA on fal.ai generates an image for that mood simultaneously. Both audio and image updated after each phrase.

**Could become a prototype**: `piano-to-ghost` — mic → autocorrelation pitch + chord detection → current arousal/valence coordinates (same logic as `38-mood-xy`) → after phrase ends (2s silence): (a) call Lyria 3 Clip with mood description + a Ghost scene name, (b) call fal.ai Ghost LoRA with a mood-matched prompt. Dual output: ambient music plays through live-bloom, Ghost image fills the canvas background. "Your playing generates your world." Needs GEMINI_API_KEY + FAL_KEY. Complex (2 concurrent API calls). Admin-only. ~$0.01-0.05/generation.

---

### 74. Music as "Controlled Hallucination" — Active Interoceptive Inference (Frontiers, 2026)
**Source**: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1759699/full

A 2026 Frontiers in Psychology paper presents a novel theoretical framework: musical emotion is an instance of "active interoceptive inference." The brain integrates musical structures (rhythm, harmony, timbre) with physiological signals and contextual cues to infer the somatic state of a "virtual body" implied by the music — a controlled hallucination of being the kind of person who would be in the emotional state the music suggests. This extends the "predictive processing" account of music to the interoceptive domain: we don't just predict the next note; we predict how our whole body should feel.

**Why it matters for Resonance**: This framework directly validates Resonance's "transcendent listening" vision at a neuroscientific level. The brain is not just hearing music — it's simulating a body inside the music. Binaural beats (`42-binaural`) are one of the most direct mechanisms for this: forcing brainwave entrainment literally reshapes the brain's prediction of its own state. The framework also explains why the Ghost journey arc feels meaningful: it's not triggering emotions, it's inducing a particular "virtual body" simulation. Could inform how Resonance describes its value to users: "We help your brain imagine a different version of itself."

**No new standalone prototype** — this is theoretical context. Informs the design rationale for `binaural-lyria` (§75) and validates the overall Resonance vision. Worth noting to Karel as a philosophical anchor.

---

### 75. MindMelody — Closed-Loop EEG-Driven Music Therapy (arxiv 2605.01235, May 2026)
**Source**: https://arxiv.org/abs/2605.01235

Published May 2026. A system for personalized music therapy that continuously monitors EEG brainwave state, formulates a therapeutic plan using a RAG-equipped LLM (retrieval from music therapy literature), and generates music via a Hierarchical EEG Controller. The feedback loop updates in real time: as the user's EEG shifts, the music adapts. Validated against established music therapy protocols and shows higher perceived helpfulness vs. fixed music playlists.

**Why it matters for Resonance**: This paper is the high-end version of what `42-binaural` does with the lowest possible technology (just Web Audio oscillators). The key concept is the **closed loop**: the system adjusts music based on brain state, and the music adjusts brain state. In the dream zone, we can approximate this loop without EEG hardware: binaural beats entrain the brain toward a target state; Lyria 3 generates ambient music calibrated to that same state; the user manually signals whether the entrainment is working (via the existing state selector). A soft closed loop without sensors.

**Could become a prototype**: `binaural-lyria` — upgrade of `42-binaural`. Step 1: user selects a target state (δ/θ/α/β/γ). Step 2: binaural beats play at the target frequency (same as current `42-binaural`). Step 3: "Generate ambient track" calls Lyria 3 Clip with a state-matched prompt (`"delta: deep ambient, 1-2 BPM, low drones, no rhythm, vast reverb"` / `"alpha: gentle piano meditation, 10 BPM, quiet, warm"` / etc.). The 30s track plays alongside the binaural beats, blended at a user-controlled mix level. A session timer shows how long you've been in the target state. After 30s the ambient track regenerates (seamless loop via Web Audio scheduling). Needs GEMINI_API_KEY. $0 with free tier. One-cycle build.

---

### 76. Three.js r174+ WebGPU/TSL — Production Maturity Across All Browsers (2026)
**Source**: https://www.oflight.co.jp/en/columns/threejs-webgpu-tsl-r3f-2026 · https://discourse.threejs.org/t/astrodither-audio-reactive-tsl-experiment/87533

Three.js r174 (2026) marks full production readiness of the WebGPU renderer and Three Shading Language (TSL). TSL is a node-based shader abstraction: one shader written in TSL compiles to both WGSL (WebGPU) and GLSL (WebGL) automatically, eliminating the need to maintain separate shader versions. With Safari WebGPU shipping in iOS/iPadOS 26, cross-browser WebGPU coverage is now universal. Compute shaders enable GPU-side physics, fluids, and particle systems with lower CPU overhead than WebGL. The community is actively building audio-reactive TSL experiments (ASTRODITHER: fluid sim + bloom + dithering + time warp, all in TSL).

**Why it matters for Resonance**: `27-gpu-additive` was always the most ambitious prototype in the queue (particles = Fourier partials, GPU physics = synthesizer). The platform risk was that WebGL2 ≠ WebGPU in feature set, and WGSL knowledge was required for compute shaders. TSL eliminates the WGSL requirement — you write TSL and it works everywhere. Three.js already installed in Resonance (0.182). The `21-three-mesh-av` prototype proves the R3F + Three.js pipeline works. The remaining question for `gpu-additive` is only complexity, not platform. Two cycles, probably. TSL also unlocks a polish pass on `21-three-mesh-av`: ASTRODITHER-style selective bloom + dithering would make the mesh significantly more beautiful.

**Could become a prototype**: `gpu-additive` — now more feasible with TSL universality. 9,000 particles, each assigned a harmonic partial index. Consonant ratios attract; dissonant repel. Particle Y-amplitudes → audio samples via AudioWorklet bridge. The swarm IS the synthesizer. Two-cycle build. Additionally, polish `21-three-mesh-av` with TSL dithering + selective bloom (one cycle, zero new APIs).

---

## 2026-05-20 — Cycle 51 research sweep

### 77. ACE-Step 1.5 — Vocal-to-BGM + Audio Remix on fal.ai (April 2026)
**Source**: https://ace-step.github.io/ace-step-v1.5.github.io/ · https://fal.ai/models/fal-ai/ace-step/audio-to-audio · https://github.com/ace-step/ACE-Step-1.5

ACE-Step 1.5 launched in April 2026 and unified multiple audio-to-audio editing modes: vocal-to-BGM (upload a sung/hummed melody → full backing track generated around it), remix (style transfer while preserving melody), repaint (regenerate a section in context), and cover generation. The XL variant (4B DiT decoder) produces higher quality audio at the same speed. Available on fal.ai at `fal-ai/ace-step/audio-to-audio` at **$0.0002/second** (~$0.006/30s). FAL_KEY already in use in Resonance. Key input parameters: `audio_url`, `original_tags`, `tags` (target style), `edit_mode` ("remix"/"lyrics"), `lyrics` (use `[inst]` for instrumental output). Model runs locally in <4GB VRAM; on fal.ai it's under 2s per generation.

**Why it matters**: `43-stable-extend` extends your recording from the end. ACE-Step audio-to-audio takes your recording as the melodic kernel and generates a full arrangement *around* it — drums, bass, chords, lead — rather than continuing forward. A pianist who hums a melody into the mic gets a full band. Different paradigm. FAL_KEY already approved. $0.006/generation is trivial.

**Could become a prototype**: `vocal-bgm` — hum or sing a melody for 5–15 seconds, press "Arrange →", receive a 30s track where your hummed melody is embedded in a full band arrangement. Audio-to-audio mode with `[inst]` lyrics forces instrumental output (no AI singing). Play back through the live-bloom radial visualizer. One-cycle build. Builds on the `43-stable-extend` route handler pattern. Route: `/dream/44-vocal-bgm`.

---

### 78. MusicRFM — Real-Time Note/Chord Steering via Activation Space (ICLR 2026)
**Source**: https://arxiv.org/abs/2510.19127 (ICLR 2026)

MusicRFM adapts Recursive Feature Machines to steer a frozen MUSICGEN-Large model during inference without retraining. Lightweight probes identify "concept directions" in the model's activation space corresponding to specific musical attributes (notes, chords, scale modes). At inference, probes inject steering vectors back into the model's residual stream in real-time. Target note accuracy improved from 0.23 to 0.82 while text prompt adherence dropped by only ~0.02. The system supports "dynamic, time-varying schedules" — so a specific chord can be targeted only during certain time windows of the generated audio. Code released alongside the paper.

**Why it matters**: Previous music generation control was limited to text prompts and high-level parameters (BPM, style). MusicRFM proves that you can control specific pitches and chords during generation at inference time, without any model fine-tuning. This is the music equivalent of attention manipulation in image diffusion. Currently server-side only (requires GPU inference), but the underlying technique suggests future APIs will expose "steer this chord at this timestamp" as a first-class operation.

**Could become a prototype**: `note-steer` — when a backend with MusicRFM becomes available, a piano keyboard UI where pressing specific keys sends steering vectors to the live music generation. You don't play the music; you guide the AI toward specific pitches. Like ReaLJam (`39-anticipate`) but inverted: instead of seeing the AI's intention, you set your intention and the AI accommodates. File in IDEAS queue; implement when a proxy API is available.

---

### 79. Composer Vector — Style-Space Blending for Symbolic Music Generation (April 2026)
**Source**: https://arxiv.org/abs/2604.03333

A transformer model for symbolic music generation learns identifiable "composer style directions" in its latent space. By steering generation along these directions at inference time (adding a weighted style vector to the residual stream), the output measurably shifts toward that composer's stylistic vocabulary. Blending two vectors (e.g., 70% Chopin + 30% Bach) produces a musically coherent hybrid — not a random interpolation but a genuine stylistic fusion. The work extends Magenta's embedding arithmetic principle (§65) to symbolic MIDI generation, confirming that music style spaces have well-defined compositional geometry.

**Why it matters**: Combined with MusicRFM (§78), this is now a body of evidence that music generation latent spaces are genuinely navigable: style, notes, and chords are all addressable as directional vectors. When these capabilities surface in browser-callable APIs, a 2D "style canvas" interaction becomes possible — drag a cursor through style space, hear the music adapt in real time (like `38-mood-xy` but for stylistic parameters rather than arousal/valence).

**Could become a prototype**: `style-map` — a 2D canvas with four corners labeled with musical styles (e.g., "Minimal", "Jazz", "Orchestral", "Ambient"). Dragging the dot generates music from a blended style prompt via ACE-Step text-to-audio or lyria-jam. Doesn't require Composer Vector's activation steering — text prompt blending ("70% jazz piano ambient 30% orchestral") is a reasonable approximation. Zero new API keys if using ACE-Step. One-cycle build.

---

### 80. AI-Assisted Music Therapy + Brainwave Entrainment — 2026 Research Cluster
**Source**: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1741463/full · https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2025.1552396/full · https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1832950/abstract

Three significant 2026 papers converge on the same direction. (1) A Frontiers in Psychology review proposes combining binaural beats + isochronic tones + AI-driven biofeedback into "personalized digital therapeutics" that adapt in real time to physiological state. (2) A second Frontiers paper validates AI-assisted music therapy for mental health, specifically calling out generative AI as enabling scalable, personalized interventions. (3) A third paper introduces "proactive music therapy" — AI doesn't respond to stated mood but proactively selects music to move the user from current state toward a target state along the Russell circumplex path.

**Why it matters**: `42-binaural` (already polished in Cycle 50) and `binaural-lyria` (in queue, needs Gemini key) are directly validated by all three papers. The "proactive" insight is new: rather than letting the user pick a brainwave state, guide them along a clinically reasonable path (anxious → alert → calm → meditative). The session timer in `42-binaural` already tracks time-in-state; a "guided session" mode would use that timer to suggest transitions.

**Could become a prototype**: `guided-session` — a standalone upgrade to the binaural experience. User selects a starting mood ("stressed / distracted / tired") and a target mood ("calm / focused / drowsy"). The system calculates a brainwave-state path and guides transitions with countdown timers and explicit prompts ("You've been in α for 8 minutes. Ready to deepen to θ?"). Synthesizes isochronic tones (speakers-compatible) along the path. Pink/brown noise layer adapts per state. Journal textarea (carried over from `42-binaural`). Zero deps. No API keys. Route: `/dream/44-guided-session`. One-cycle build.

---

### 81. WebXR Spatial Audio — Production-Ready for Immersive Ghost Experiences (2026)
**Source**: https://blog.weskill.org/2026/04/web-audio-api-immersive-soundscapes-for.html · https://www.madxr.io/webxr-browser-immersive-experiences-2026.html

WebXR is production-ready in 2026 on Chrome, Edge, Firefox, and Meta Quest browsers. Safari WebXR on iOS/Vision Pro is limited (device orientation works; full VR mode requires Safari 26 + entitlement). WebAudio HRTF PannerNode functions identically inside a WebXR context as outside — you can take the spatial audio graph from `29-scene-spatial` and run it inside a WebXR scene with no changes to the audio code. A 2026 wellness app (ZenSpace) does exactly this: Web Audio 3D nature soundscapes inside WebXR. No headset required for the "immersive flat" mode — Chrome desktop renders WebXR in a dragable 360° view; headset adds full immersion.

**Why it matters**: `29-scene-spatial` already has full Ghost scene spatial audio (stone chamber, forest dawn, cosmic ascension) built from synthesized sources (zero audio files). The jump to WebXR is primarily a new renderer: replace the Canvas2D sphere view with an A-Frame or raw WebXR scene where the user is inside the sphere. The HRTF audio graph is identical. Demo mode: drag to rotate on desktop. Headset mode: physically look around. This is the most immersive Ghost experience in the sandbox — you're inside the sound, not listening to it.

**Could become a prototype**: `ghost-xr` — A WebXR scene (using A-Frame, loaded from CDN or raw WebXR API) with the six Ghost scenes from `29-scene-spatial`. Enter a scene: the synthesized HRTF sources orbit you in 3D space. No headset required — Chrome desktop supports "immersive-vr" via simulated 360° viewport. Headset: full room-scale audio. Route: `/dream/45-ghost-xr`. One-cycle build if using A-Frame from CDN (~1MB). Needs Karel OK on CDN dep OR zero-dep raw WebXR (more code, same capability).

---

### 82. Oscilloscope Music — Stereo Lissajous Figure Composition (2026)
**Source**: https://mondniles.com/en/tools/oscilloscope · https://www.kickstarter.com/blog/the-process-oscilloscope-music · https://github.com/ThatXliner/ljv

"Oscilloscope music" is a genre where stereo audio is specifically composed to draw visual figures on an oscilloscope in XY mode (left channel = X axis, right channel = Y axis). Composers like Jerobeam Fenderson create tracks where Lissajous figures are intentional: a perfect fifth draws an ellipse; a minor third draws a three-loop figure; complex harmonics draw "roses" or "trefoils". A 2026 browser tool (mondniles.com) renders real-time Lissajous from audio with CRT phosphor persistence. The dream zone's `20-scope` already shows Lissajous figures as a visualization mode — but it's passive (it visualizes existing audio). An oscilloscope music composer inverts this: the user designs the figure and the system synthesizes the audio.

**Why it matters**: This is the other side of `20-scope`. The visual IS the sound: you draw the shape, you hear the audio that creates it. Musically, designing a specific Lissajous figure (a trefoil = frequency ratio 2:3 with a specific phase offset and amplitude balance) constrains the audio to specific intervals. An oscilloscope music composer teaches music theory through geometry. Zero deps, pure Web Audio API (two OscillatorNodes routed to L/R channels), one cycle.

**Could become a prototype**: `osc-composer` — A canvas shows the Lissajous figure in real time. Controls: Ratio (L:R frequency, e.g., 1:1, 2:3, 3:4, 4:5), Phase offset (0–360°), Amplitude balance (L/R). A "Preset shapes" panel shows geometric targets: Circle (1:1, 90°), Figure-8 (1:2, 0°), Trefoil (2:3), Rose (3:4), Hypocycloid (3:5). User adjusts controls to match the target shape — it's a tuning puzzle. Download stereo WAV that encodes the figure as audio. Route: `/dream/45-osc-composer`. Zero deps. One-cycle build.

---

### 83. Rust/WASM AudioWorklet — Browser-Native Production DSP (2026 Standard)
**Source**: https://github.com/Ameobea/web-synth · https://joellof.com/rs-wasm-ts-worklet/ · https://cprimozic.net/blog/fm-synth-rust-wasm-simd/

The "three-tier stack" (Web Audio API + WebAssembly + AudioWorklet) is now the 2026 standard for browser audio requiring more than Web Audio API primitives. Rust DSP code compiled to WASM runs inside an AudioWorkletProcessor at audio-thread sample rates with <1ms latency. The `web-synth` project (Ameobea) demonstrates a full browser DAW: polyphonic synthesizers, filters, envelope generators, effects chains — all running as pre-compiled WASM modules loaded from CDN or bundled. The underlying DSP libraries (WASM filters, SIMD-accelerated FFT) are available standalone as ~50–300KB binaries. No Rust toolchain needed by the end-user — WASM binary is pre-compiled.

**Why it matters**: Several dream-zone prototypes use ScriptProcessorNode (deprecated) or hand-rolled JS DSP that runs on the main thread. Upgrading to WASM AudioWorklet would: (1) move all audio processing to the audio thread, eliminating main-thread blocking; (2) allow SIMD-accelerated FFT for `34-spectral-morph` (currently hand-rolled Cooley-Tukey); (3) enable the `27-gpu-additive` AudioWorklet bridge to process samples fast enough for stable synthesis. A pre-built WASM FFT library (ported from FFTW or Rust FFT) would be a ~150KB CDN dep. Needs Karel OK.

**Could become a prototype**: `wasm-filter` — a browser modular synth demonstrating WASM AudioWorklet. Mic input → WASM formant filter (vowel shaping: A/E/I/O/U on a 2D canvas) → HRTF spatial output. The formant filter positions are draggable on a vowel space canvas. The WASM binary handles the IIR filter math; the Web Audio API handles routing. Route: `/dream/45-wasm-filter`. Needs Karel OK on ~150KB CDN WASM dep. One-cycle build once approved.

---

### 84. Proactive AI Music Therapy — Mood-Path Traversal Without EEG (Frontiers 2026)
**Source**: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1832950/abstract · https://arxiv.org/html/2603.07963v1

A 2026 Frontiers paper introduces "proactive AI music therapy": instead of asking the user how they feel and playing matching music (reactive), the system calculates a targeted intervention path and proactively plays music to guide the user from their current state toward a target state. The path is computed on the Russell circumplex (arousal × valence, same axes as `38-mood-xy`) using known music-to-mood mappings. Separately, a 2026 paper on music therapy for deaf/hard-of-hearing individuals demonstrates that tactile vibration + visual music feedback can substitute for auditory perception — relevant to the vibrational/haptic potential of Resonance's sub-bass frequencies.

**Why it matters**: `38-mood-xy` lets users manually navigate mood space. A proactive version would auto-navigate: "I'm stressed (high arousal, low valence) and I want to be calm (low arousal, moderate valence)" → the system plays a 10-minute sequence of music that moves through the circumplex from top-left to bottom-center. Combined with `42-binaural` (binaural beats matching the target arousal state), this becomes a clinically-grounded guided session. The session timer in `42-binaural` already tracks time-in-state; the `38-mood-xy` already synthesizes music from circumplex coordinates. The two prototypes, combined, ARE the proactive music therapy system.

**Could become a prototype**: `mood-journey` — user places two dots on the `38-mood-xy` canvas: "here" (current) and "there" (target). The system generates a 10-minute audio path: continuously shifts the synthesizer parameters along the Russell circumplex arc, stepping through intermediate coordinates every 30 seconds. A second layer: isochronic tones at the brainwave frequency matching the current arousal level (high arousal = γ/β, low arousal = α/θ). The path is visualized as a glowing trail on the canvas. No API keys. Zero deps (pure Web Audio). Route: `/dream/45-mood-journey`. One-cycle build.

---

## 2026-05-20 — Cycle 56 research sweep

### 85. Google Flow Music + Lyria 3 Pro — AI Music Studio with Stem Splitting (April 2026)
**Source**: https://aitoolly.com/ai-news/article/2026-04-25-google-launches-flow-music-an-all-in-one-ai-platform-for-song-composition-and-video-production · https://blog.google/innovation-and-ai/technology/ai/lyria-3-pro/ · https://deepmind.google/models/lyria/

Google launched Flow Music on April 18, 2026 (rebranded from ProducerAI), a standalone AI music studio powered by Lyria 3 Pro. Key new capabilities: (1) **Lyria 3 Pro** generates songs up to 3 minutes with intros/verses/choruses/bridges from text prompts or images; (2) **Stem Splitter** — any generated track can be split into isolated stems (vocals, drums, bass, piano/melodic layers) for further editing; (3) **Replace + Extend** — target any section of a track with natural language ("make this chorus more dramatic"), and the model regenerates only that section in context; (4) **Spaces** — shareable modular patch presets for consistent aesthetic across sessions; (5) **Vibe-code** — LLM-driven custom audio plugin and DAW creation. Same Lyria 3 model underlies both Flow Music and the Gemini API (same key already requested for `30-lyria-jam`).

**Why it matters**: The stem splitting is the biggest new capability. `suno-stems-spatial` has been blocked because Suno's stems API isn't public. If Lyria 3 (Gemini API) can generate a track AND a stem extraction model is available on fal.ai, the `stem-spatial` prototype becomes achievable: generate a 30s instrumental → split into stems → route each stem to a different HRTF 3D position. Separately, Lyria 3 Pro's 3-minute structured songs (with verse/chorus control) now make a properly-arc'd piece possible via the Gemini API — not just a 30s clip but a full 3-minute journey with deliberate sections.

**Could become prototypes**: (1) `arc-compose` — write a Resonance journey arc as prompted sections (available now via MiniMax 2.6, which has equivalent structural tag control; see §86); (2) `stem-spatial` — generate AI track → stem split → HRTF spatial positioning (2 cycles, FAL_KEY + stem model); (3) Polish `lyria-ghost` — once GEMINI_API_KEY is available, upgrade from 30s clip to 3-minute structured Ghost ambient piece.

---

### 86. MiniMax Music 2.6 — Structural Section Tags + Dual Prompt ($0.03, FAL_KEY)
**Source**: https://fal.ai/models/fal-ai/minimax-music/v2.6/api · https://www.minimax.io/news/minimax-music-25 · https://www.toolworthy.ai/tool/minimax-music-2-5

MiniMax Music v2.6 is now on fal.ai with 14+ song section tags: `[Intro]`, `[Verse]`, `[Pre Chorus]`, `[Chorus]`, `[Post Chorus]`, `[Hook]`, `[Bridge]`, `[Interlude]`, `[Transition]`, `[Build Up]`, `[Drop]`, `[Break]`, `[Inst]`, `[Solo]`, `[Outro]`. The **dual-prompt system** separates style direction (10–300 chars, controls mood/genre) from lyrics (10–3000 chars, controls text/sections). `[Inst]` tag suppresses vocals, generating pure instrumental. Each generation costs **$0.03**. FAL_KEY already in use. API endpoint: `fal-ai/minimax-music/v2.6`.

**Why it matters**: The `18-elevenlabs-compose` prototype was designed for structured section-based composition but at $1.13/generation — cost-prohibitive for experimentation. MiniMax 2.6 delivers the same section-level control at $0.03, 37× cheaper. More importantly, Resonance's journey arc has a direct analog in musical sections: an "intro" is sparse and ambient, a "build up" adds layers, a "chorus" is the psychedelic peak, an "outro" is the dissolution. Writing this arc as `[Intro] single piano note fading in, 15s [Build Up] cello enters low, pad swells, 20s [Chorus] full orchestral peak, drums, bright reverb, 20s [Outro] instruments fall away one by one, 10s` → a 65-second piece with exactly that structure. This is the prototype that turns the abstract arc concept (`5-arcs`) into actual generated music.

**Could become a prototype**: `arc-compose` — a textarea editor with section-tag helper buttons ([Intro], [Build Up], [Chorus], [Outro], [Bridge]). User writes a journey arc in musical language. Style prompt: "cinematic orchestra, dark ambient, major key resolution". Press "Compose Arc →". Server route calls `fal-ai/minimax-music/v2.6` with the composed sections as lyrics + style string. Returns 30–90s structured piece. Plays through the bloom visualizer. Download the generated MP3. FAL_KEY already in use. $0.03/generation. Route: `/dream/48-arc-compose`. One-cycle build.

---

### 87. AILive Mixer — Zero-Latency Deep Learning Live Music Mixer (arxiv 2603.15995, March 2026)
**Source**: https://arxiv.org/abs/2603.15995

First end-to-end deep learning system designed specifically for live music performance mixing. Inputs: multiple concurrent instrument channels (with acoustic bleed from co-located instruments). Output: a balanced mono mix at **zero added latency**. Architecture: transformer encoder block learns inter-channel context (e.g., which channels are currently dominant), followed by a GRU block for temporal context (momentum of levels), predicting per-channel gain coefficients. The GRU allows the system to track the dynamics of a performance in real time without buffering delays. Handles the specific live-performance problem that studio mixing tools can't: channels are inherently contaminated by neighboring instruments, so gain must account for bleed — not just signal strength.

**Why it matters**: Directly validates the AI mixing layer of the `4-operator` prototype. The `35-loop-station` already runs 4 simultaneous loop tracks — adding an "🤖 AI balance" toggle that normalizes each slot's RMS energy (a browser-feasible approximation of the DL model's gain prediction) would demonstrate the concept interactively. Full DL model is server-side, but energy-based RMS normalization in Web Audio is immediate and gives the correct qualitative behavior. Real venue use case: no sound engineer needed for a solo Resonance performance — the system auto-balances mic input vs backing layers.

**Could become**: a polish cycle on `35-loop-station` — "🤖 Auto-mix" toggle that uses a `GainNode` per slot driven by RMS metering (compute average energy over a 500ms window, normalize each slot so the sum stays constant, smooth via `setTargetAtTime` with 1s time constant). One polish cycle. Zero new deps.

---

### 88. Real-Time Human-AI Co-Performance via Latent Diffusion (arxiv 2604.07612, April 2026)
**Source**: https://arxiv.org/abs/2604.07612 · https://arxiv.org/html/2604.07612

Accompaniment generation as a **sliding-window look-ahead protocol**: the model predicts the next few seconds of accompaniment based on recent context audio, then continuously updates as the musician continues. Front-end: MAX/MSP (real-time audio environment). Back-end: Python inference server running a latent diffusion model. Communication: OSC/UDP messages. Consistency distillation reduces sampling time by **5.4×**, achieving real-time operation. Key design tension: longer look-ahead (more context for the model → better coherence) vs. shorter latency (responds faster to what the musician just played). The paper frames this tradeoff as the central architectural choice for any live AI accompaniment system.

**Why it matters**: The look-ahead concept is exactly what `39-anticipate`'s ghost-note display visualizes — Aria's planned notes appear before they play. `33-aria-companion` and `39-anticipate` are lightweight browser implementations of this pattern (Markov chain for the "model"). The difference between these prototypes and the full system is model fidelity: Markov chain is 20 lines of JS, consistent-diffusion is a 400M-parameter neural network. The tradeoff that this paper formalizes (longer look-ahead = better music, more latency) is already visible in `39-anticipate`: Aria's ghost notes are planned ~0.5s ahead. Extending the look-ahead to 2s would make the response more coherent but feel less reactive.

**Could become**: a polish cycle on `39-anticipate` — add a "Look-ahead" slider (0.5s / 1s / 2s) that changes how far ahead the ghost notes appear. At 2s look-ahead, Aria's full response is visible while you're still playing the last notes of your phrase. The visual representation becomes a clear demonstration of the coherence/latency tradeoff documented in the paper.

---

### 89. DARC — Tap-to-Drum Rhythm Accompaniment (arxiv 2601.02357, January 2026)
**Source**: https://arxiv.org/pdf/2601.02357 · https://www.researchgate.net/publication/399477230_DARC_Drum_accompaniment_generation_with_fine-grained_rhythm_control

DARC (Drum Accompaniment with Rhythm Control) takes rhythmic audio input — tapping, beatboxing, or any percussive sound — and generates drum accompaniment that matches the input's rhythm. NMF-based onset detection extracts rhythm from audio (onset times + timbre classes — distinguishing "kick-like" low-frequency taps from "snare-like" mid-frequency slaps). **Tap2Drum** mode: capture ~8 beats of tapping → generate a full drum pattern at that tempo, extrapolating the rhythm to a standard drum kit. Real-time generation is listed as future work, but the onset detection and pattern-matching components are browser-feasible today without any ML inference.

**Why it matters**: None of the 47 sandbox prototypes accept **rhythm as the primary input** (pitched melody as input: `33-aria-companion`, `39-anticipate`; recorded audio as input: `43-stable-extend`, `44-vocal-bgm`; tab/click as input: `36-pluck-field`). Rhythm-as-input is the most accessible entry point for non-pianists — anyone can clap, tap, or beatbox. Web Audio onset detection is already proven in the sandbox (`1-live`'s onset flash, `12-tessellate`'s mass tile flip, `36-pluck-field`'s mic mode). A browser implementation is: mic → onset detection → onset timestamps → beat-quantization to a 2-bar grid → Karplus-Strong drum synthesis at each grid position.

**Could become a prototype**: `tap-rhythm` — user taps any surface or claps into mic; onset detection captures the pattern over 2 bars; the pattern becomes a looping step sequencer. Each onset position triggers a drum hit synthesized via Web Audio (kick: low-frequency sine burst + distortion; snare: filtered noise burst; hi-hat: high-pass white noise with fast decay). Visual: circular step sequencer clock — dots light up on each hit position as the loop revolves. After the initial 2-bar capture, individual steps can be toggled (click the clock face). BPM slider. "Clear and re-tap" resets. Zero deps, zero API. Route: `/dream/48-tap-rhythm`. One-cycle build. High live-performance fitness.

---

### 90. Streaming Music Accompaniment — Latency/Coherence Architecture (arxiv 2510.22105, October 2025)
**Source**: https://arxiv.org/html/2510.22105v1 · https://arxiv.org/pdf/2510.22105

Formal model for streaming accompaniment generation, characterizing the fundamental tradeoff between two design parameters: **future visibility** (the time gap between when audio is played back and the latest input the model has seen — larger = more coherent but requires faster inference) and **output chunk duration** (larger chunks = better throughput, worse adaptability). The analysis shows that increasing future visibility improves accompaniment coherence but requires proportionally faster generation. A model generating at 1× real-time with 2s future visibility produces accompaniment that "looks ahead" 2 seconds — the system always knows what you just played before deciding what to play next.

**Why it matters**: This paper explains exactly why `30-lyria-jam` (Lyria RealTime) has a ~2s update latency when you change a slider, and why real-time AI music needs a fast backend. It also explains the fundamental constraint on in-browser AI music: browser inference can't match the latency target for high-quality accompaniment (would need ~2s real-time generation speed for a 2s look-ahead). This is the theoretical reason `33-aria-companion` uses a Markov chain (instant) rather than a diffusion model (seconds). It also suggests a design pattern for `48-arc-compose` or `30-lyria-jam`: display an explicit "pre-generating next section..." indicator 2s before the section plays, making the latency a designed feature rather than a bug.

**Research note**: Primarily architectural understanding. Reference when proposing latency-sensitive prototypes. No new prototype directly needed.

---

### 91. SonoCraftAR — Multi-Agent LLM Sound-Reactive Interface Generation (arxiv 2508.17597, August 2025)
**Source**: https://arxiv.org/abs/2508.17597 · https://makeabilitylab.cs.washington.edu/project/sonocraftar/

Multi-agent LLM pipeline that generates sound-reactive AR interfaces from typed natural language descriptions. Architecture: (1) **Prompt Enhancement agent** expands the user's description into structured implementation guidelines; (2) **Code Generation agent** produces Unity C# scripts using the Shapes vector graphics library; (3) **Code Checker agent** verifies compilation; (4) **Roslyn runtime compiler** compiles and runs the script in AR. Maps dominant audio frequency to visual properties (size, color, position). Designed for deaf/hard-of-hearing users to author sound visualizations without coding. Key demo: "make a bar that gets taller with low frequencies" → animated AR bar responding to bass.

**Why it matters**: The meta-idea is the most interesting: describe a visualization in natural language → get running code that implements it. The pipeline is Unity/C#/AR-specific, but the pattern is applicable to the dream zone's Web Audio + Canvas2D stack. A "describe your visualization, get a running prototype" tool would itself be a dream prototype — one that uses the Claude API to generate small self-contained audio-reactive canvas scripts. Every `page.tsx` in the sandbox follows the same structural pattern (AnalyserNode → FFT bands → Canvas2D draw loop); a code-generating agent constrained to this pattern would be well-scoped.

**Could become**: `claude-canvas` — textarea where the user describes an audio-reactive visualization ("a particle cloud that explodes on every beat, larger particles for lower pitches, color changes with harmony"). Claude API (claude-haiku-4-5 for speed + cost) generates a self-contained JavaScript sketch that runs in an isolated sandbox (iframe with postMessage for audio data). Admin-only, needs ANTHROPIC_API_KEY accessible from server route. This is a meta-prototype: the dream sandbox can generate its own prototypes from descriptions. Route: `/dream/48-claude-canvas`. Needs Karel OK on Claude API in dream zone environment.

---

### 92. Three.js/WebGPU Organic Audio-Reactive Forms + Bioluminescent AV (May 2026)
**Source**: https://threejsroadmap.com/blog/galaxy-simulation-webgpu-compute-shaders · https://github.com/sandner-art/Audio-Shader-Studio · https://www.webgpu.com/showcase/

The Three.js WebGPU community (r174+, May 2026) is producing audio-reactive experiments significantly beyond the geometric forms in the sandbox. Two standout patterns: (1) **Bioluminescent organic forms** — a sea-anemone-style 3D mesh with procedurally generated `TubeGeometry` branches; sub-bass sways the trunk; treble flickers the branch tips; bloom post-processing makes the whole structure glow softly against black. `21-three-mesh-av` uses an icosahedron (rigid geometric form); an organic branching form would feel alive rather than mathematical. (2) **GPU galaxy simulations** — 100,000 star particles with WebGPU compute shaders, N-body gravity, additive blending → spiral galaxy arms, core dense glow, audio-reactive temperature (RMS energy → particle velocity). Audio Shader Studio (github.com/sandner-art/Audio-Shader-Studio) is a dedicated WebGL browser platform for audio-reactive fragment shader experiments.

**Why it matters**: The sandbox has covered particles (`8-particle-life`, `16-particle-life-gpu`), fluids (`3-fluid`, `15-webgpu-fluid`), 3D mesh (`21-three-mesh-av`), and terrain (`11-terrain`). The **organic living form** aesthetic — something that breathes, sways, tentacles flickering — is not represented. `21-three-mesh-av` is the most visually polished prototype but it reads as a technical demo (a deforming platonic solid). An anemone form would read as alive. All dependencies (`three@0.182`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`) are **already installed in Resonance** — zero new package.json changes needed. TSL vertex displacement handles both WGSL (WebGPU) and GLSL (WebGL) automatically.

**Could become a prototype**: `anemone-av` — a Three.js R3F scene with a procedurally generated branching 3D form. Main trunk: 1 tube geometry, 8 branches, each branch 3–6 sub-branches. Sub-bass (20–100 Hz) drives a low-frequency sway rotation of the main trunk. High-mid energy (2–4 kHz) drives tip-flicker (rapid vertex oscillation on the outermost branches). A TSL displacement material handles both; bloom post-processing creates the bioluminescent glow. Demo mode: LFO oscillators animate the form without mic permissions. Dark background, deep violet → cyan → white glow gradient tracking frequency. Route: `/dream/48-anemone-av`. Zero new deps. One-cycle build.

---

## 2026-05-20 — Cycle 61 research sweep

### 93. AI Co-Artist — LLM-Powered GLSL Shader Evolution (arxiv 2512.08951, December 2025)
**Source**: https://arxiv.org/abs/2512.08951

Interactive system that uses GPT-4 to generate and evolve GLSL fragment shaders from natural language descriptions, with no coding required from the user. The LLM interprets typed descriptions ("a swirling vortex that expands on beats") and produces compilable GLSL; a "Picbreeder-style" evolutionary loop lets users select among variants and the LLM generates further mutations of the chosen path. Key insight: the same LLM that understands the user's creative intent also understands GLSL well enough to generate functional, compilable shaders from that intent — bridging natural language and code. The paper confirms this as broadly generalizable to any domain where LLMs can write code.

**Why it matters**: This is the published realization of the SonoCraftAR (§91) meta-idea, but for GLSL shaders instead of Unity C#. The dream sandbox's Web Audio + Canvas2D/WebGL stack is exactly the right substrate: every fullscreen canvas prototype sends FFT bands as uniforms to a fragment shader or draw loop. A `claude-shader` prototype would send a user's description to the Claude API → receive a GLSL fragment shader → compile it with WebGL → feed `uBass`, `uMid`, `uTreble`, `uOnset`, `uTime` uniforms from the live AnalyserNode. Result: any audio-reactive visualization the user can describe in words. Self-referential: Claude generates the shader that reacts to the music Karel is playing.

**Could become**: `claude-shader` — admin-only. Textarea: describe a visualization. Server route calls claude-haiku-4-5 with a constrained system prompt that defines the 5 available uniforms and requires a valid GLSL fragment shader body as output. WebGL canvas renders the result in real time. User can edit the raw GLSL inline (CodeMirror CDN for syntax highlighting). "Regenerate" → new variant from same description. Zero new npm deps (WebGL is native). Needs ANTHROPIC_API_KEY in Vercel env. Ask Karel. Route: `/dream/51-claude-shader`.

---

### 94. Discovering and Steering Interpretable Concepts in Large Generative Music Models (arxiv 2505.18186, March 2026)
**Source**: https://arxiv.org/abs/2505.18186

Sparse autoencoders (SAEs) trained on the residual stream of transformer music models extract **interpretable features** — both traditional music-theory constructs (chord progressions, rhythmic regularity, tonal brightness) and novel "uncodified" patterns the model has learned that have no established name. The key result: these extracted concepts can be used to **steer model generations** in real time, adjusting the generated music along the discovered concept dimensions without retraining. This is the music analog of latent-space concept arithmetic in image generation.

**Why it matters**: The concepts are labeled with recognizable musical vocabulary (brightness, density, regularity, complexity) because they emerged from the model's statistical learning of music. A browser synthesizer where these same conceptual axes are the primary controls would be the most musically literate synthesis interface in the sandbox — the user navigates music as named concepts, not as BPM numbers or abstract parameters. No ML inference needed for the synthesizer itself: just map the concept labels to synthesis parameters that match their semantic meaning.

**Could become**: `concept-steer` — 6-axis hexagonal radar chart on a canvas: **Brightness** (filter fc 400–6000 Hz), **Density** (voice count 1–5, BPM 40–140), **Regularity** (note quantization: free→grid), **Complexity** (chord voicings: unison→triad→7th→polychord), **Energy** (attack 0.8s→0.04s, velocity), **Mode** (chord quality: major→minor). Drag any vertex to adjust. The synthesis engine is the `38-mood-xy` oscillator stack extended to 6 dimensions. Canvas shows the hexagonal radar as the primary visual; a small chord-name label (from `28-chord-canvas` template matching) updates live. Zero deps. Route: `/dream/52-concept-steer`.

---

### 95. ElevenLabs Sound Effects Generation on fal.ai (May 2026)
**Source**: https://blog.fal.ai/elevenlabs-audio-suite-next-generation-voice-and-audio-ai-now-on-fal/ · https://fal.ai/elevenlabs

ElevenLabs' Sound Effects model — now available via fal.ai API — generates **high-fidelity sound effects from text descriptions**: "reverberant stone footstep in a large cave", "forest birdsong canopy from above", "distant thunder rolling across open sky". Duration is configurable (1–5s). The model targets video production and gaming but is general-purpose — any short ambient sound can be described and generated. FAL_KEY already in use.

**Why it matters**: `29-scene-spatial` hand-synthesizes all six Ghost scene sounds via OscillatorNodes — they are deterministic, correct, but recognizably synthetic. ElevenLabs SFX would generate naturalistic, recorded-quality sounds for each source. The spatial positioning code (HRTF PannerNodes) is identical: only the audio source changes. Each Ghost scene has 3–5 spatial sound sources, so generating them all would cost ~$0.03–0.10 per scene. Sounds can be cached after first generation.

**Could become**: `ghost-sfx` — six Ghost preset scenes, each with 3–4 pre-authored sound effect text prompts. Click "Generate sounds for [Stone Chamber]" → server route calls fal.ai ElevenLabs SFX for each prompt → clips stored in `sessionStorage` → decoded via `AudioContext.decodeAudioData` → played through HRTF PannerNodes at scene-specific positions (same sphere canvas as `29-scene-spatial`). Wear headphones — naturalistic sounds + HRTF spatialization is more immersive than synthesized sources. FAL_KEY in use. Budget: ~$0.05–0.15 total per session. Endpoint: confirm fal.ai ElevenLabs SFX endpoint before building. Route: `/dream/52-ghost-sfx`.

---

### 96. AI Harmonizer — Anticipatory Music Transformer 4-part Harmony (arxiv 2506.18143, June 2025)
**Source**: https://arxiv.org/abs/2506.18143

System that takes solo vocal or instrumental melody as input and generates four-part diatonic harmony (soprano, alto, tenor, bass) automatically, without the user specifying a key or using a keyboard. Uses the Anticipatory Music Transformer (AMT) — a pre-trained symbolic music model fine-tuned for accompaniment. The system integrates pitch detection, key inference, and voice-leading rules into a unified pipeline. Currently **offline only** (not browser-deployable as of 2025), but the GitHub release makes it available for local experimentation.

**Why it matters**: The concept is directly relevant to `23-pitch-harmonize` (which pitch-shifts the mic signal by a fixed interval). A diatonic harmony generator does something qualitatively different: it determines the *key* from your recent playing and then generates *chord-correct* additional voices — a major third AND fifth above in C major, or a minor third AND fifth in C minor. The AMT is too large for browser inference, but the harmonic logic can be implemented rule-based: key detection via chroma template matching (same as `28-chord-canvas`) + diatonic scale degree lookup + voice generation via OscillatorNode. The result sounds like a backing choir, not just a shifted copy of yourself.

**Could become**: `diatonic-harmony` — mic → autocorrelation pitch detection → chroma accumulation over last 8 notes → key/mode detection → for each detected note, generate 2 harmony voices (diatonic third above + diatonic fifth above within detected key). Voices: sine oscillators, 150ms attack/decay envelope, panned slightly left/right for separation. Visual: 3-track piano roll (your notes orange, third-voice light blue, fifth-voice deep blue) scrolling left. Key label and chord name update live. Demo mode: C major pentatonic phrase with automatic harmony. Zero deps. Route: `/dream/51-diatonic-harmony`. One-cycle build.

---

### 97. Token-Based Audio Inpainting via Discrete Diffusion (arxiv 2507.08333, July 2025 / Feb 2026)
**Source**: https://arxiv.org/abs/2507.08333

First application of **discrete diffusion over tokenized audio** representations for the tasks of audio inpainting (filling gaps) and music continuation (extending from a context prefix). Uses a pre-trained audio tokenizer (EnCodec-style) to convert waveforms to discrete token sequences, then applies masked diffusion to resample missing tokens conditioned on surrounding context. Handles gaps up to 750ms and arbitrary continuation lengths. Consistently outperforms strong baselines (including continuous-domain diffusion and waveform-level models) across gap lengths of 150ms+, especially for semantic coherence — the output sounds like it belongs to the same musical piece.

**Why it matters**: `43-stable-extend` uses fal.ai's Stable Audio 2.5 for continuation at $0.20/generation. This approach (if available via API) would give more semantically coherent continuations — the generated audio would "sound like the same piece" more reliably than a diffusion-based model that re-generates from scratch. Also: the inpainting capability (filling a hole in existing audio) is a new paradigm not covered by any prototype — could enable "regenerate this measure" in a loop station context. No fal.ai endpoint confirmed yet; monitor for a public API.

**Research note**: Architecture understanding + future prototype opportunity. If fal.ai or a similar platform offers this model, it upgrades `43-stable-extend` and enables an "inpaint" prototype variant (`loop-inpaint` — select a region of a loop and regenerate it in context).

---

### 98. Three.js WebGPU 2026 — Production-Ready Performance Benchmarks
**Source**: https://www.utsubo.com/blog/threejs-2026-what-changed · https://www.programming-helper.com/tech/webgpu-2026-browser-gpu-api-wgsl-ai-inference

Three.js r171+ (Dec 2025) introduced zero-config WebGPU imports: `import { WebGPURenderer } from 'three/webgpu'`. One documented case study achieved **100× performance improvement** when migrating a point-cloud platform from WebGL to WebGPU — smooth interaction with million-point datasets. A "Waves of Connection" public installation demo shows 1M+ particle simulation responsive to real-time input at 60fps. WebGPU also enables **compute shaders for ML inference** in the browser, opening paths for on-device audio ML without WASM. The library sees 2.7M weekly NPM downloads — ecosystem is mature and stable for production use.

**Why it matters**: `16-particle-life-gpu` demonstrated 9,000 particles via WebGPU compute shaders. The 100× gain would allow **900,000 particles** on the same hardware. `27-gpu-additive` (particle-IS-the-synthesizer, 9,000 particles) becomes substantially more ambitious: at 100× WebGPU performance, the particle count could be 100,000+ while maintaining 60fps and the audio-write feedback loop. Also confirms `21-three-mesh-av` is worth a polish cycle: WebGPU path would allow much higher vertex count for the mesh deformation.

**Research note**: Reinforces `gpu-additive` (§36 in IDEAS.md) and `three-mesh-av` polish as high-value next builds once simpler zero-dep prototypes are caught up.

---

### 99. Streaming Piano Transcription — Causal CNN+Transformer (arxiv 2503.01362, ISMIR 2024)
**Source**: https://arxiv.org/abs/2503.01362

Streaming audio-to-MIDI piano transcription system with three innovations: (1) **separate onset and offset decoders** — different time-frequency features are optimal for detecting note starts vs. note ends, so using one decoder per task outperforms a single decoder; (2) **sustain pedal validation** — pedal detection prevents false offset events while the pedal is held; (3) **causal convolutional encoder + Transformer decoder** — fully streaming, no look-ahead into future audio, making real-time processing feasible. Performance on MAESTRO dataset matches or exceeds offline methods. ISMIR 2024 acceptance = peer-reviewed validation.

**Why it matters**: The sandbox pitch detection (in `13-piano-canvas`, `24-piano-roll`, `26-score-follow`, `33-aria-companion`, `39-anticipate`) uses autocorrelation — which detects pitch but not **note duration** (onset-to-offset). This paper's streaming decoder detects the **complete note event**: onset time, pitch, velocity, and offset time. With this upgrade, piano roll notes in `24-piano-roll` would have correct durations (currently they just paint fixed-length bars). Also: sustain pedal detection would make `26-score-follow` dramatically more accurate for legato piano playing. Architecture is small enough (~10M params) to potentially run in WASM. No public browser deployment confirmed yet — monitor.

**Could become**: a `_shared/use-streaming-transcription.ts` hook: a WASM-compiled version of the causal CNN encoder + decoder that runs in an AudioWorklet at ~5ms latency. Would upgrade `24-piano-roll` (variable-duration note bars), `26-score-follow` (sustain pedal support), and `33-aria-companion` (full note events rather than pitch estimates). Needs Karel OK on ~15–30MB WASM dependency.

---

### 100. iPlug3 2026 — Agentic Audio Plugin Framework with WebGPU + MCP
**Source**: https://github.com/iPlug3 · https://github.com/topics/webaudio

iPlug3 launched January 1, 2026 as a "clean-slate reimagining" of audio plugin/app development designed for "a world where agentic AI workflows dramatically accelerate iteration on DSP, UX, and design." Graphics: SDL3 + WebGPU native + Skia Graphite → 120fps visualizations across Mac/Windows/Linux/browser (WASM). Audio: mirrors Web Audio API primitives, so code written for iPlug3 compiles to both native (VST3/AU/AAX) and browser (WASM). MCP integration: an agent (like this one) can drive the plugin development loop — write DSP code, compile, test, iterate — as an autonomous agent action. Cross-platform WASM output means a plugin built with iPlug3 runs in the browser as a `AudioWorkletProcessor` without modification.

**Why it matters**: This is the first audio plugin framework explicitly designed for the agent-era. For Resonance: the "installation mode" or "Tauri mode" imagined in IDEAS.md `4-operator` and throughout the priority list would be a native application. iPlug3 compiled to native (Mac/Windows) would give Karel a standalone Resonance performer app that runs outside the browser — no Vercel, no internet needed. The MCP integration means the dream agent could theoretically generate and test DSP code directly. The browser WASM output means Resonance's Web Audio prototypes could be compiled to native plugins for use in DAWs (Ableton, Logic) without rewriting.

**Research note**: This is a roadmap item, not a one-cycle prototype. The most concrete near-term use: build one prototype in iPlug3 (a WASM audio effect) and show it running both in the dream sandbox and as a standalone native app. Raise with Karel as a "Resonance native" direction question.

---

## 2026-05-20 — Cycle 66 research sweep

### 101. Beatoven.ai Maestro on fal.ai — 2.5-min Instrumental Tracks + Stems (May 2026)
**Source**: https://blog.fal.ai/beatoven-ais-maestro-model-is-now-live-on-fal/ · https://fal.ai/models/beatoven/music-generation

Beatoven.ai's Maestro model is now live on fal.ai with two APIs: **Music Generation** (endpoint `beatoven/music-generation`, $0.10/request) and **Sound Effects Generation** (layered soundscapes up to 35s, for film/game/AV). Music API: generates professional 44.1kHz instrumental tracks up to **2 minutes 30 seconds** in a single generation, across Jazz, Latin, Ambient, Cinematic, House, Techno, and other genres. Unique differentiator: **outputs individual stems** (drums, bass, melody, harmony) alongside the full mix. Trained on 3M+ licensed tracks — every generation is royalty-clean. FAL_KEY already in use.

**Why it matters**: ACE-Step (`fal-ai/ace-step`, used by `6-compose`) generates 30-second sketches. Maestro generates **5× longer** tracks (2.5 min) for the same $0.10 per request — appropriate for a full Resonance journey phase (a journey phase lasts 2–4 minutes in the current 6-phase arc). The stem output is the most exciting capability: stems → each stem decoded into an AudioBuffer → routed through HRTF PannerNodes at distinct 3D positions. You commissioned the band, and now they're playing around you in 3D space. The sound-effects API is a potential backup for `53-ghost-sfx` if the ElevenLabs SFX endpoint is wrong.

**Could become**: `maestro-stems-spatial` — generate a 2-minute cinematic piece via Maestro, receive 4 stems (drums, bass, melody, other), decode each into an AudioBuffer, route through a `7-spatial`-style HRTF PannerNode sphere. Canvas: same top-down sphere as `29-scene-spatial` with 4 colored stem-source dots. Drag to reposition. "The band plays around you." This is the `stem-spatial` prototype idea from the queue now implementable with Maestro as the generation backend — no separate Lyria Flow Music or stem-splitter model needed. FAL_KEY in use. $0.10/track. One-cycle build. Route: `/dream/54-maestro-stems`.

---

### 102. Three.js WebGPU Compute Audio + TSL Visual Feedback (May 2026)
**Source**: https://threejs.org/examples/webgpu_compute_audio.html · https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_compute_audio.html

Three.js r171+ ships a `webgpu_compute_audio` example that uses **TSL (Three.js Shader Language) compute shaders** to perform audio DSP directly on the GPU — no AudioWorklet, no WASM. The technique: load an AudioBuffer (MP3), write it to a GPU storage buffer; a TSL compute shader applies **pitch shifting via time-stretching** (reads original waveform at pitch-adjusted fractional indices) plus **6 cascading layered delays with decreasing amplitude** (reverb-style effect). The processed audio is written back to a playback buffer. Simultaneously, an `AnalyserNode` feeds a frequency texture that modulates the canvas background color in real time — GPU audio + GPU visual in one render pipeline. No separate AudioWorklet needed.

**Why it matters**: This is the proof-of-concept for `27-gpu-additive` (GPU particles = Fourier synthesis) but at a more approachable scope. The Three.js example demonstrates the full audio-to-GPU-to-visuals loop using only TSL — the same tooling already used in `21-three-mesh-av` and `49-anemone-av`. The "pitch-shift + layered delay + analyser feedback" combination produces rich, evolving textures from dry input — a guitar note through this pipeline sounds like a stadium reverb effect. More immediately buildable than `27-gpu-additive` and produces a demo Karel can immediately understand: any audio file → GPU-processed → visualized.

**Could become**: `webgpu-audio-fx` — a Three.js R3F scene with a WebGPU compute audio processor. Load an audio file (or use mic via `getUserMedia` → `MediaStreamAudioSourceNode` → `AudioWorklet` → GPU buffer) → TSL compute shader applies pitch-shift slider (0.5× to 2×) + reverb depth slider (0 → 100% delay mix) → visualize the frequency spectrum via a 3D bar chart or mesh deformation (same as `21-three-mesh-av` but driven by the GPU-processed output instead of mic FFT). "Hear what GPU audio sounds like." WebGPU required; clear fallback. Zero new npm deps (three@0.182 already installed). One-cycle build. Route: `/dream/54-webgpu-audio-fx`.

---

### 103. Art2Mus: Direct Artwork-to-Music via Visual Embeddings (arxiv 2602.17599, February 2026)
**Source**: https://arxiv.org/abs/2602.17599

Art2Mus introduces ArtSound, a dataset of 105,884 artwork-music pairs, and a framework that maps digitized visual artworks **directly** into the conditioning space of a latent diffusion music model — no image-to-text translation step, no language-based semantic supervision. A visual encoder (CLIP-style) projects the artwork embedding directly into the music LDM's conditioning stream. The model generates music whose sonic character matches the visual mood, color palette, and style of the artwork. Trained and evaluated on fine art paintings (Impressionist, Baroque, Abstract) but generalizes to photographic imagery. The paper reports that generated music is judged as "fitting" the artwork significantly better than text-prompted baselines.

**Why it matters**: Three existing prototypes in the sandbox approach the "Ghost image → music" direction: `lyria-ghost` (Gemini API, text prompt + optional image), `6-compose` (text-only), `48-arc-compose` (section tags). Art2Mus demonstrates that direct visual→music without text intermediary is achievable and produces better aesthetic alignment — the music "fits" the image in ways text cannot fully specify. No public API exists yet (February 2026 preprint). But the concept validates Resonance's direction: Ghost scene imagery as a first-class music conditioning input. When a public API or inference service appears (monitor fal.ai/replicate for Art2Mus or equivalent), this would upgrade `lyria-ghost` to skip the text-prompt step entirely — send the Ghost scene image, receive ambient music.

**Research note**: Monitor arxiv and fal.ai/replicate for Art2Mus implementation or equivalent model deployment. When available: upgrade `lyria-ghost` spec to direct visual conditioning. No new prototype needed now; `lyria-ghost` (blocked on GEMINI_API_KEY) already covers the use case.

---

### 104. TADA! — Activation Steering for Audio Diffusion Models (arxiv 2602.11910, February 2026)
**Source**: https://arxiv.org/abs/2602.11910

TADA uses **activation patching** to locate a "semantic bottleneck" layer in audio diffusion model transformers — specific attention layers that independently control instrument presence, vocal characteristics, and genre. By patching the activations of these layers (steering them toward a target concept representation), the model can be guided at inference time to emphasize or suppress instruments, add/remove vocals, or shift genre without retraining or additional prompting. The benchmark shows this establishes a new state-of-the-art in "audio concept modulation" compared to prompt-editing baselines.

**Why it matters**: `52-concept-steer` (Cycle 63) built a synthesizer whose axes are the vocabulary music AI models use internally (Brightness/Density/Regularity/Complexity/Energy/Mode). TADA demonstrates those same conceptual axes exist as steerably-accessible activations in diffusion-based music generators — not just as emergent statistical features. When an API becomes available (no public deployment confirmed as of February 2026), a `tada-steer` prototype would combine AI-generated music with real-time concept steering: generate a 30-second track via ACE-Step, then apply TADA activation patches to add a solo piano voice, reduce percussion, or shift from major to minor — all without re-generating. "Edit the music, not the prompt."

**Research note**: No public API. Monitor fal.ai and HuggingFace for a TADA inference endpoint. If Karel has access to a GPU server, could run locally. Theoretical prototype: `tada-steer`.

---

### 105. Inworld TTS-1.5 Max on fal.ai — Expressive TTS with Voice Cloning (March 2026)
**Source**: https://blog.fal.ai/ · https://fal.ai/elevenlabs

Inworld TTS-1.5 Max is a low-latency speech synthesis model now available on fal.ai, providing "sub-150ms time-to-first-sound" with expressive paralinguistic prompting and instant voice cloning. Features: multi-emotional control (happy, sad, fearful, whispery, etc.), consistent multi-turn voice identity, and custom voice cloning from short 10–30s audio samples. Also on fal.ai: **Chatterbox Turbo** (sub-150ms TTS, expressive voice cloning). Both models use FAL_KEY (already in use). Pricing not publicly listed in search results but typical TTS APIs on fal are $0.01–0.03 per generation.

**Why it matters**: No prototype in the sandbox gives the Ghost character a speaking voice. `29-scene-spatial` and `53-ghost-sfx` place synthesized/AI-generated ambient sounds in 3D space, but none of them include a human-like voice narrating the Ghost journey. A Ghost voice prototype would use pre-written one-line narrative fragments from the existing Ghost journey narrative text (Karel has this), generate a spoken line in a custom voice (sampled from 30s of human voice audio), and HRTF-position it at front-center in the scene's spatial audio field. The result: an AI actor speaks inside the Ghost scenes. Admin-only. Budget: ~$0.01–0.02/line.

**Could become**: `ghost-voice` — an extension of `29-scene-spatial` or `53-ghost-sfx`. A "Narration" toggle in the Ghost scene selector: ON → play the scene's spatial ambient sounds (from `53-ghost-sfx`) AND generate a 10-word narrative line via Inworld TTS at front-center HRTF position. Pre-written lines: e.g. "Stone Chamber: *The resonance here is ancient. Listen.*" / "Forest Dawn: *First light. A single note rises.*" Display a subtitle overlay for the spoken line. No new approvals needed (FAL_KEY in use). One-cycle add-on to `53-ghost-sfx` OR standalone prototype. Route: `/dream/55-ghost-voice`.

---

### 106. Virtual Orchestra Conducting via Gesture Recognition (arxiv 2604.27957, April 2026)
**Source**: https://arxiv.org/abs/2604.27957

Museum installation built for a dome theater: skeleton tracking captures visitor conducting gestures (arms, hands, baton trajectory); a hierarchical LSTM gesture classifier identifies beat patterns and dynamic cues from multiple conductor exemplars; real-time playback speed control drives a pre-recorded symphony performance. Visitors experience the subjective sensation of "conducting" an orchestra — moving arms faster accelerates the music; a grand gesture triggers a fortissimo moment. Evaluated through timing accuracy tests and field studies with actual museum visitors showing high engagement and perceived realism.

**Why it matters**: Three prototypes (`31-gesture-music`, `4-operator`) address gesture-based music control but neither specifically targets conducting — the most culturally legible performance gesture vocabulary. The paper confirms browser-feasible skeleton tracking (via MediaPipe or similar) can extract conducting features (tempo, dynamics) at latencies below the perceptual threshold for music interaction. The gesture vocabulary is universal: even non-musicians immediately understand that "large sweeping arms" = loud/fast. For Resonance live performance: a conducting-gesture mode where arm velocity controls BPM and arm height controls gain would be immediately usable on a stage without any UI.

**Could become**: `conductor` — webcam → MediaPipe Pose (loaded from CDN ~8MB, same CDN dep as `31-gesture-music`) → wrist velocity extraction → BPM control for any of the sandbox's looping prototypes (`5-arcs`, `25-cellular`, `35-loop-station`). Left wrist height → gain (dynamics). Right wrist sweep speed → BPM. Visual: webcam feed overlay with pose skeleton, plus a BPM/gain HUD. "Conduct the session from across the room." Requires MediaPipe CDN dep + Karel OK (same as `31-gesture-music` which is already in the queue). Route: `/dream/55-conductor`.

---

### 107. Web Audio API v2: Configurable Render Quantum in Q4 2026 Spec
**Source**: https://github.com/WebAudio/web-audio-api-v2 · https://www.w3.org/2025/11/TPAC/demo-audio-wg-update.html

The W3C Audio Working Group completed the Configurable Render Quantum spec for Web Audio API v2 in Q4 2026. Key changes: (1) **Configurable render quantum size** — default is 128 samples; v2 allows configuring down to 16 samples, reducing audio processing latency from ~3ms to ~0.4ms. (2) **`performance.now()` in AudioWorklet** — high-resolution timestamp available inside the audio processing thread, enabling precise per-sample timing (critical for accurate pitch detection and note onset timestamps). (3) **Output Buffer Bypass** — already shipped in Chrome; removes one 128-sample buffer of latency from the `AudioContext` → output pipeline. (4) **AudioContext interrupted state** — entered Chromium Origin Trial; allows apps to detect and recover from audio context suspension (phone calls, background tabs). Status: Q4 2026 target; Output Buffer Bypass already in production; rest in spec finalization or Origin Trials.

**Why it matters**: Every prototype in the sandbox that does real-time pitch detection is limited by the 128-sample render quantum (~3ms). With configurable quantum size (16 samples), `13-piano-canvas`, `24-piano-roll`, `26-score-follow`, `33-aria-companion`, `39-anticipate` all get 8× lower latency — piano note onset detection becomes nearly instantaneous. `performance.now()` in AudioWorklet is critical for `39-anticipate` (Aria's ghost note timing uses `AudioContext.currentTime` which is less precise than `performance.now()`). These changes require no code changes to existing prototypes — they just improve when the browser ships the API. Monitor browser release notes.

**Research note**: No prototype needed. Existing prototypes will automatically benefit when Chrome/Firefox ship the reduced render quantum. Add a note in `23-pitch-harmonize` and `33-aria-companion` READMEs when the feature ships.

---

### 108. TVTSyn: Real-Time Time-Varying Timbre Voice Conversion (arxiv 2602.09389, February 2026)
**Source**: https://arxiv.org/abs/2602.09389

TVTSyn achieves sub-80ms GPU latency real-time voice conversion by treating speaker identity as a **time-varying** rather than static vector — aligning it with speech content at the frame level. This prevents "over-smoothed timbre" (where the converted voice sounds uniform/robotic because the speaker identity is frozen throughout). The result: natural-sounding real-time voice conversion where the target voice's micro-variations in timbre (breathiness on consonants, warmth on vowels) are preserved in the converted output. Python/CUDA, no public browser deployment.

**Why it matters**: Three prototypes in the sandbox do audio transformation: `23-pitch-harmonize` (pitch shift), `34-spectral-morph` (spectral magnitude interpolation), `35-loop-station` (recording + looping). None perform **timbre transfer** — changing the tonal character of an instrument or voice while preserving pitch and rhythm. TVTSyn is 3 months from publication and not browser-ready, but the 80ms latency target confirms real-time timbre transfer will be browser-viable within 12–18 months (as BRAVE was predicted at Cycle 35 to arrive, and it has improved). The "piano to cello" timbre prototype concept (`brave-timbre` from §30 in the queue) is getting closer to implementable.

**Research note**: Monitor for WASM or ONNX port of TVTSyn or equivalent. When browser-ready: `timbre-morph` prototype — mic input piano → morph to cello/violin/organ in real time via timbre transfer. The `34-spectral-morph` prototype already demonstrates the visual paradigm (spectrum strip + morph slider); this would replace the FFT magnitude interpolation with a neural timbre encoder/decoder.

---

## 2026-05-20 — Cycle 70 research sweep

### 109. Inworld TTS Correct fal.ai Endpoint — `fal-ai/inworld-tts`
**Source**: https://fal.ai/models/fal-ai/inworld-tts/api

The `56-ghost-voice` prototype was using `fal-ai/inworld/tts` (guessed). The confirmed endpoint is `fal-ai/inworld-tts` (hyphenated, no slash). Input: `{text, voice, sample_rate_hertz}`. 70+ named voice presets (default "Craig (en)"). Output: `data.audio.url`. However, Inworld TTS uses named voice presets, not free-form style descriptions — which is a mismatch with the Ghost scene voice descriptions (e.g., "calm, androgynous, stone chamber reverb"). Gemini TTS is a better fit (§110).

**Could become a prototype**: no new prototype — the fix switches `56-ghost-voice` to Gemini TTS backend.

---

### 110. Gemini TTS on fal.ai — Natural-Language Style Prompting for Voice
**Source**: https://fal.ai/models/fal-ai/gemini-tts/api

`fal-ai/gemini-tts` (and `fal-ai/gemini-3.1-flash-tts`) supports a `style_instructions` parameter: natural-language voice direction ("Speak slowly as if from inside a vast stone chamber"). Input: `{prompt: text, voice: "Charon", style_instructions: "..."}`. 30+ voice presets (Kore, Charon, Zephyr, Puck, Aoede etc.). Output: `data.audio.url`, MP3 default. This is exactly the right model for Ghost Voice — the scene-specific descriptions ("calm, androgynous, very slow, stone chamber reverb, ancient and measured") work as `style_instructions`. FAL_KEY in use. Used this cycle to fix `56-ghost-voice`.

**Could become a prototype**: `57-gemini-voice-lab` — A/B tone director: write two style_instructions for the same Ghost scene line, compare how differently Gemini TTS renders the same text. Useful for Karel to tune the Ghost character voice.

---

### 111. Live Music Models: Magenta RealTime + Lyria RealTime (arxiv 2508.04651, Google DeepMind)
**Source**: https://arxiv.org/abs/2508.04651

Google DeepMind paper formalizing a new class of generative model: continuous streaming music with synchronized live user control. Releases two models: **Magenta RealTime** (open-weights Apache 2.0, outperforms other open-weights music models with fewer parameters) and **Lyria RealTime** (API, more controls). Key distinction from prior art: users steer *during* generation via text or audio prompts — the music shifts continuously without stopping. First-of-its-kind live generation capability. Magenta RealTime is open-weights but requires a Python inference server; Lyria RealTime is browser-callable via Gemini API key. Already in IDEAS.md as `30-lyria-jam`. This paper confirms the production-quality bar is now met.

**Could become a prototype**: upgrade `30-lyria-jam` to explicitly use Lyria RealTime's embedding arithmetic (2D style canvas instead of sliders, per Live Music Models §62 insight). Also: Magenta RealTime as a local inference backend if Karel sets up a Python proxy server.

---

### 112. Sound2Vision: Generating Images from Audio via Cross-Modal Latent Alignment (arxiv 2412.06209, December 2024)
**Source**: https://arxiv.org/abs/2412.06209

Maps in-the-wild audio clips to generated images of the corresponding visual scene via cross-modal latent alignment. Enriches audio features with visual information, translates to visual latent space, feeds into a pre-trained image generator. "Simple manipulations to the input waveform or latent space" control the generation output. No public API yet, but the concept is browser-buildable via acoustic analysis → text description → Flux image generation on fal.ai.

**Could become a prototype**: `57-sound-to-image`. Mic input (or demo oscillators) → 10s acoustic analysis → auto-generate a text description ("dark, resonant, low-frequency bass music with slow tempo, cave-like quality") → send to fal.ai Flux image gen → display generated image. "What does your music look like?" First prototype where audio produces a semantic *image* (not an abstract painting, not a real-time visualizer — a literal interpreted visual scene). FAL_KEY in use, $0.01–0.05/image. One-cycle build.

---

### 113. LARA-Gen: Continuous Emotion Control for Music Generation (arxiv 2510.05875, October 2025)
**Source**: https://arxiv.org/abs/2510.05875

Enables fine-grained continuous emotion control of music generation by aligning latent representations to a valence-arousal space. Disentangles emotional content from musical content (you can change the valence without changing the melody). No public API yet. Confirms the valence×arousal approach in `38-mood-xy` is academically validated and increasingly supported by generation models.

**Could become a prototype**: when a LARA-Gen-compatible API appears, upgrade `47-mood-journey` so the arc-traversal generates *actual AI music* (not just synthesized tones) that tracks the emotional trajectory. Monitor fal.ai for LARA-Gen endpoint.

---

### 114. Multi-Agent Semantic-Emotional Music-to-Image (arxiv 2512.23320, December 2024)
**Source**: https://arxiv.org/abs/2512.23320

Multi-agent framework that jointly encodes musical semantics AND affective dimensions → generates a matching image. Key insight: uses separate agents for musical semantics (tempo, instruments, key) and emotional content (valence, arousal) before combining for image generation. Confirmed feasibility of: detect chords+tempo → estimate emotion → generate matching Ghost image.

**Could become a prototype**: `58-music-to-ghost`. Analyze incoming audio (`28-chord-canvas` chroma + `38-mood-xy` emotion mapping) → after 10s, generate a Ghost LoRA image with a scene-matched prompt ("Ghost in cosmic ascension, energetic, bright, major key, 90 BPM, golden light"). Display image + waveform side by side. Different from `45-piano-to-ghost` (which is complex, two concurrent API calls, GEMINI_API_KEY needed). This version uses FAL_KEY only (Ghost LoRA image gen). One-cycle build.

---

### 115. Segment-Factorized Full-Song Generation on Symbolic Piano Music (arxiv 2510.05881, October 2025)
**Source**: https://arxiv.org/abs/2510.05881

SFS model achieves real-time streaming generation of full symbolic piano music with strong structural consistency and 10× faster inference than prior work. Enables human-AI co-creation via a web-based composition interface. Not browser-native (Python inference), but the streaming paradigm applies: generate the next phrase while the user plays the current one, interleave without gaps. Inspires upgrading `33-aria-companion` from a Markov chain to a streaming generative model (when an API becomes available).

**Could become a prototype**: when a browser-accessible SFS endpoint appears, upgrade `33-aria-companion` to generate structurally consistent piano responses rather than Markov-chain transitions. Monitor.

---

### 116. SynthVC: Low-Latency Streaming Zero-Shot Voice Conversion (arxiv 2510.09245, October 2025)
**Source**: https://arxiv.org/abs/2510.09245

77.1ms end-to-end latency streaming voice conversion using neural audio codec architecture. Zero-shot: converts voice timbre to any target without fine-tuning. In-context learning from a short reference clip. Not browser-native yet but the latency target (77ms) is approaching real-time performance suitable for live performance use.

**Could become a prototype**: `voice-morph` — record a 5s "target voice" sample, then speak/sing into the mic and hear your voice converted to the target timbre in near-real-time. If a browser WASM port or fal.ai endpoint appears, this becomes the first prototype that changes *who you sound like*. Monitor for WASM/fal.ai port.

---

## Cycle 74 research findings (2026-05-21 UTC)

---

### 117. Orpheus TTS on fal.ai (Canopy AI, March 2026)
**Source**: https://fal.ai/models/fal-ai/orpheus-tts

Llama-based Speech-LLM on fal.ai at `fal-ai/orpheus-tts`. $0.05 per 1000 characters (~$0.001/Ghost scene line). Key differentiator from Gemini TTS: **phrase-level emotional tags** embedded in text: `<sad>`, `<reverent>`, `<fearful>`, `<excited>`, `<happy>`, `<whispers>`, `<disgusted>`, `<surprised>`. Example: `"The <reverent>resonance</reverent> here is ancient. Let yourself be <whispers>absorbed</whispers> by it."` Gemini TTS takes a global style_instructions string; Orpheus takes inline brackets. Human-quality synthesis, ~200ms generation latency, 8 distinct voice emotion modes per phrase. FAL_KEY already in use.

**Could become a prototype**: `orpheus-voice` — extend `59-gemini-voice-lab` to add Orpheus as a 3rd track: C = Orpheus with emotional brackets. Side-by-side A (Gemini global style) vs B (Gemini experimental) vs C (Orpheus phrase-level). The bracket syntax is a fundamentally different control vocabulary: you direct individual words, not the overall voice character. Could find that "stone <whispers>chamber</whispers>" hits harder than "calm and reverent." Zero new deps, FAL_KEY in use, $0.001/line. One cycle.

---

### 118. ElevenLabs Music on fal.ai — Confirmed Composition Plan API
**Source**: https://fal.ai/models/fal-ai/elevenlabs/music/api

Confirmed fal.ai endpoint: `fal-ai/elevenlabs/music`. Input accepts `composition_plan` with `sections` array: each section has `section_name`, `duration_ms`, `positive_local_styles`, `negative_local_styles`, and `lines` (lyrics as an array of strings). Global styles via `positive_global_styles` / `negative_global_styles`. `respect_sections_durations: true` for strict timing. Duration range 3s–10min. Output: `audio.url` MP3. Price: $0.80/min. Key capability over MiniMax 2.6: **lyrics per section** — write actual words for each section and ElevenLabs will sing them. `force_instrumental: true` for purely musical tracks.

**Could become a prototype**: `lyrics-journey` — build a Ghost journey composition_plan with lyrics from the narrative. Each of the 6 Ghost scenes becomes a section with its own style + spoken/sung lines from the Ghost character. "The resonance here is ancient, let yourself be absorbed" (Stone Chamber), "You are not rising, the world is receding" (Cosmic Ascension). Full ~3-minute Ghost journey as a sung piece. Admin-only; ~$2.40/generation for a 3-min piece. First prototype where the Ghost sings. FAL_KEY in use.

---

### 119. StyleStream: Real-Time Zero-Shot Voice Style Conversion (arxiv 2602.20113, ICLR 2026)
**Source**: https://arxiv.org/abs/2602.20113

First streamable zero-shot voice style conversion model. Architecture: Destylizer removes style from source audio while preserving linguistic content; Stylizer (diffusion transformer) reintroduces a target style conditioned on a 2-3s reference clip. End-to-end latency: **1 second**. Fully non-autoregressive. Trained on 50k hours English; can induce accents, emotions, speaking styles. Published at ICLR 2026. No browser/WASM port yet; GitHub available (Berkeley-Speech-Group/StyleStream).

**Could become a prototype**: `voice-style` — record a 2-3s Ghost character reference clip (e.g., a calm breathy reading of one scene line), then run live mic input through StyleStream to convert incoming speech/piano-playing narration to the Ghost's voice in real time. 1s latency is usable. Needs a local Python server or a fal.ai endpoint. If Karel runs a local server, this becomes the first prototype that changes *who you sound like* in real time. Monitor for fal.ai deployment.

---

### 120. Music2Palette: Emotion-aligned Color Palette Generation (arxiv 2507.04758, ACM MM 2025)
**Source**: https://arxiv.org/abs/2507.04758

Generates a 5-color emotion-aligned palette from music audio using cross-modal representation learning. Music encoder + color decoder trained on MuCED: 2,634 expert-validated music-palette pairs aligned through Russell circumplex (valence-arousal) emotion vectors. Multi-objective optimization jointly enhances emotion alignment, color diversity, and palette coherence. Applications: music-driven image recoloring, video generation, data visualization. No public API.

**Could become a prototype**: `music-palette` — browser-native approximation using the existing arousal/valence audio analysis pipeline (`1-live` FFT → `38-mood-xy` emotion coordinates) to generate a 5-color HSL palette in real time: valence → hue (happy=45°-80° warm yellows; neutral=150° green-teal; sad=240°-270° blues), arousal → lightness (energetic=L70%, calm=L30%), saturation → harmonic clarity. 5 palette swatches update every second (EMA smoothing). Download as SVG. First prototype that connects audio analysis to a designed visual language. Zero deps, zero API. One cycle.

---

### 121. Mozualization: Crafting Music with Multimodal AI (arxiv 2504.13891, CHI 2025)
**Source**: https://arxiv.org/abs/2504.13891

Creative tool that generates music by integrating multimodal inputs: text keywords + images (color palette/mood) + audio clips (samples, ambient sounds). Three-stage pipeline: multimodal sonification → mixing → visualization. 9-participant user study showed users could blend visual-emotional cues with audio to guide music generation in ways they couldn't with text alone. No public API or open-source implementation.

**Could become a prototype**: `collage-compose` — upload a Ghost scene image + record 3-5s hum/piano + type a mood word. Extract: dominant color temperature from image (average HSL), pitch contour description from hum autocorrelation, combine all into a richly descriptive text prompt → send to ACE-Step or Sonauto V2. "Your world makes your music." The multimodal prompt is richer than a text description alone — a blue-dominant image pulls the color language toward "cold, vast, reverberant"; a hum establishes the key center and tempo feel. FAL_KEY in use, $0.006–$0.075/track. One cycle.

---

### 122. Sonic4D: Spatial Audio for Immersive 4D Scene Exploration (arxiv 2506.15759, February 2026)
**Source**: https://arxiv.org/abs/2506.15759

Framework for generating viewpoint-dependent spatial audio from monocular video in three stages: 4D scene + monaural audio extraction from pre-trained models → pixel-level visual source localization → physics-based spatial audio synthesis rendering. Training-free. Creates spatially consistent audio that adapts as the viewer moves through the synthesized scene. Research-stage; requires inference server. Not browser-deployable as-is.

**Could become a prototype**: future direction — given a Ghost scene video clip (from `ghost-animate` / HappyHorse), generate spatially consistent audio that matches the visual source positions. The Ghost figure's movement → audio follows. Would combine with HRTF playback for headphone immersion. Needs fal.ai Sonic4D endpoint or similar. Monitor.

---

### 123. Three.js r184 (March 2026) — WebGPU Baseline + Memory Optimization
**Source**: https://github.com/mrdoob/three.js/releases

Three.js r184 eliminates per-frame object allocations — previously, complex scenes generated hundreds of thousands of garbage-collected objects per second, causing jank. Now production-stable. Combined with the January 2026 WebGPU Baseline status (Chrome, Edge, Firefox, Safari 26 on all platforms), WebGPURenderer is drop-in: replace `WebGLRenderer` with `WebGPURenderer` in a single line and gain ~100× particle capacity. TSL (Three Shader Language) compiles to both WGSL + GLSL automatically.

**Could become a prototype**: all existing Three.js prototypes (`21-three-mesh-av`, `49-anemone-av`) can switch to WebGPURenderer for better performance — specifically `49-anemone-av` could push to 10,000 tip particles at 60fps vs. the current geometry-based approach. r184's memory fix makes long-session demos (the dream sandbox) dramatically more stable. Polish candidate: upgrade `49-anemone-av` to WebGPU + higher tentacle count.

---

### 124. AI-Driven Proactive Music Psychotherapy for Deaf / Hard-of-Hearing (arxiv 2603.07963, March 2026)
**Source**: https://arxiv.org/abs/2603.07963

Designs a music psychotherapy tool co-designed with therapists: conversational AI agent + music generative AI as therapeutic media. 23 Deaf/Hard-of-Hearing participants found AI-assisted song co-writing enabled "emotional release, reinterpretation, and deeper self-understanding." Key design pattern: collaborative lyric + melody authoring is itself the therapeutic act — the process matters as much as the output. Validates music generation as a therapeutic tool, not just an entertainment one.

**Could become a prototype**: `co-write` — a lyric+melody co-writing prototype: the user types a line of text and hums or plays a melody snippet; the system generates a musical phrase in response (ACE-Step audio-to-audio) that continues the user's emotional thread. Split screen: user's words on one side, generated continuation on the other. "The music finishes your thought." More interactive than `6-compose` (text-only) or `44-vocal-bgm` (melody-only). FAL_KEY in use. One cycle.

---

### 125. Sonauto V2 on fal.ai — Full Songs with BPM Control
**Source**: https://fal.ai/models/sonauto/v2/text-to-music/api

`sonauto/v2/text-to-music`: generates complete 1.5-min songs (vocals + instrumentals) from prompt + optional tags. $0.075/generation, FAL_KEY auth. V2.2 adds manual BPM configuration. Key differentiator from ACE-Step and MiniMax: **full songs with singer vocals by default** — the AI adds a vocalist unless `force_instrumental` is used. Seed-based reproducibility and tag explorer for iteration. Extension endpoint at `sonauto/v2/extend` listed but not documented; may enable continuation.

**Could become a prototype**: for the `collage-compose` idea, Sonauto V2 is a good backend choice since it automatically adds a vocalist — the multimodal prompt (image color + hum key + mood word) becomes a full song with singing. Alternatively: a simple "Ghost Ballad" prototype — each Ghost scene has a 4-line poem as lyrics → Sonauto V2 generates a sung version. No new deps, FAL_KEY in use, $0.075/song.

---

### 126. MuVi + SyncDIT: Video-to-Music and Audio-Visual Synchronization (arxiv 2410.12957, 2026)
**Source**: https://arxiv.org/abs/2410.12957

MuVi: generates music conditioned on video input, focusing on semantic alignment and rhythmic synchronization — the generated music's melody, rhythm, and dynamics harmonize with visual narratives (scene changes, motion, color). SyncDIT: generates video conditioned on audio, achieving state-of-the-art audio-visual alignment. Together: a closed loop where music and video inform each other. Not browser-native; requires inference servers.

**Could become a prototype**: future direction — given a Ghost journey video clip (HappyHorse output), MuVi could generate a matching music track shaped by the visual narrative arc. The Ghost rising → ascending musical phrase; Ghost still in stone → sparse, sustained tones. Closer to production than Sonic4D since fal.ai may host MuVi-like video-to-music models. Monitor for fal.ai endpoint. Currently no API; research direction only.

---

## Cycle 78 Research (2026-05-21)

### 127. ElevenLabs Eleven V3 — Inline Audio Tag Emotional Direction (February 2026)
**Source**: https://elevenlabs.io/blog/eleven-v3 · https://fal.ai/models/fal-ai/elevenlabs/tts/eleven-v3

ElevenLabs Eleven V3 introduces a bracketed inline audio tag system for per-phrase emotional control directly in the text: `[sigh]`, `[excited]`, `[nervous]`, `[whispers]`, `[laughs]`, `[pauses]`, `[stammers]`, `[resigned tone]`, `[flatly]`, `[playfully]`, etc. Unlike Gemini TTS's global `style_instructions` (whole-passage direction) or Orpheus TTS's XML `<tag>word</tag>` syntax (per-word), Eleven V3 tags work as emotional beats inserted mid-sentence — `[sigh] The resonance here [pauses] is ancient.` The model interprets the structural pauses and emotional beats as part of the text flow, producing nuanced within-sentence arcs. 70+ languages. $0.10/1000 chars (Ghost scene line ~50 chars → ~$0.005/line). fal.ai endpoint: `fal-ai/elevenlabs/tts/eleven-v3`. Also includes Text-to-Dialogue mode: a single call generates a multi-speaker conversation with matching prosody and emotional ranges.

**Could become a prototype**: `ghost-v3-voice` — extend `61-orpheus-voice`'s 3-way comparison to 4-way by adding Eleven V3 as column D, OR standalone 4-scene Ghost narration where inline tags are fully editable. The three-way control comparison is now: Gemini (global style) vs Orpheus (per-word XML) vs Eleven V3 (per-phrase inline tags). Each is a qualitatively different interaction paradigm. FAL_KEY in use, cheapest per character of the three. Also enables `eleven-dialogue`: Ghost scene as a 2-character dramatic exchange using Text-to-Dialogue. One cycle for either.

---

### 128. ACE-Step 1.5 Hybrid Reasoning-Diffusion Architecture (January 2026, arxiv 2602.00744)
**Source**: https://arxiv.org/abs/2602.00744

ACE-Step 1.5 introduces a Hybrid Reasoning-Diffusion Architecture that decouples structural planning from acoustic rendering. The reasoning module first generates a high-level musical plan (key, tempo, section structure) before passing it to the diffusion acoustic model — improving long-range coherence while enabling sub-second first-token inference on consumer hardware. Audio-to-audio mode (reference melody conditioning) is now a first-class supported mode, not a workaround. The architecture cleanly supports the `44-vocal-bgm` and `62-collage-compose` patterns already built in the sandbox.

**Could become a prototype**: validates the audio-to-audio approach of `44-vocal-bgm` and `62-collage-compose`. The sub-second first-token means a live "sing a phrase → hear an arrangement start" latency of <1s is achievable. Future polish: add a streaming progress bar to `44-vocal-bgm` that shows first-token arrival time to make the speed visible.

---

### 129. Dialogue in Resonance — Piano + Real-Time Score Transcription Dialogue (arxiv 2505.16259, May 2026)
**Source**: https://arxiv.org/abs/2505.16259

An interactive music composition for human pianist and computer-controlled piano. A real-time automatic transcription system captures the human's performance and a generative system responds — creating a musical dialogue that balances "composed structure with dynamic interaction." The piece uses a prepared score framework where the computer's responses are constrained to a musical vocabulary derived from the score, not purely improvised. This is the "score-constrained dialogue" paradigm: the AI doesn't just respond to your phrase freely but completes or continues a pre-existing musical structure. Performed and rehearsed with human pianists; the paper discusses the rehearsal/composition process as co-creation with the system.

**Could become a prototype**: `dialogue-score` — extend `33-aria-companion` with score-constrained responses. Instead of a pure Markov chain generating any notes, the AI response follows a melodic contour derived from the user's phrase direction (ascending → AI responds ascending, descending → AI continues or inverts). Show both phrase and AI response in the split piano roll from `33-aria-companion`. "The AI completes your musical thought — in the same key, in the same direction." More musically compelling than Markov because contour-matching gives the response a sense of musical logic rather than statistical imitation. Zero deps. One cycle.

---

### 130. ShaderVine — WebGPU Shader Editor Built for the Agentic Era (April 2026)
**Source**: https://meditations.metavert.io/p/shadervine-a-webgpu-shader-editor

Browser-based WebGPU shader editor with a Monaco-powered WGSL code editor and live preview. MIT-licensed. Includes 16 built-in GPU compute simulations (Conway's Game of Life, fluid dynamics, reaction-diffusion, others). An MCP server interface lets AI agents — Claude, GPT-4, etc. — directly read, write, and evolve shaders. Genetic evolution mode automatically mutates shader code and presents variations. Exports to Unity, Unreal, Blender, Three.js, HLSL. No audio-reactive hooks built in, but the architecture (agent writes WGSL → WebGPU renders → preview updates) is exactly the pattern needed for `claude-shader`.

**Could become a prototype**: `wgsl-synth` — a minimal ShaderVine-inspired editor in the dream zone, but with 6 pre-wired audio uniforms (uBass, uMid, uTreble, uOnset, uTime, uBPM). CodeMirror from CDN as the editor. The shader runs on a fullscreen canvas; audio input updates uniforms each frame. Pre-loaded example: an FM synthesizer shader where uBass drives carrier frequency and uOnset triggers amplitude envelopes — both drawn as a waveform canvas. Different from `claude-shader` (which calls Claude to generate the shader): this is a manual WGSL editor for users who want to write their own audio-reactive GPU code. Zero deps beyond CodeMirror CDN. Also: could pair with `55-webgpu-audio-fx` as a more advanced version where the audio DSP itself runs in the shader. Two cycles.

---

### 131. musicolors — Web-based Synesthetic Music Visualization Library (arxiv 2503.14220, March 2026)
**Source**: https://arxiv.org/abs/2503.14220

A real-time web-based music visualization library designed for synesthetic creative experiences. User study with composers, developers, and listeners identified three primary modes: (1) sketching musical ideas (the canvas captures a session's visual fingerprint), (2) integrating with external systems (DAW + canvas side-by-side), (3) synesthetic listening (color-sound associations as a new listening mode). The paper argues that effective music visualization should respond to multiple musical dimensions simultaneously — not just amplitude or pitch, but rhythm regularity, harmonic complexity, and spectral spread all at once.

**Could become a prototype**: `synesthetic-sketch` — multi-dimensional synesthetic canvas. NOT just color (already done in `1-live`, `60-music-palette`). Six independent audio features each control a separate VISUAL dimension on a single accumulated canvas: spectral centroid → hue; spectral bandwidth → shape complexity (circle=pure tone, star=spread, fractal=noise); rhythm regularity (IOR variance) → layout (random cloud=irregular, grid=regular); harmonic peak count → object count per frame; amplitude → scale; onset → spark burst at a random canvas position. Objects accumulate like `13-piano-canvas` strokes — the session leaves a record. "Not just what color your music is — what shape it is." The contrast with `13-piano-canvas`: that maps note events (pitch, velocity, duration) to brush strokes. This maps continuous audio features to morphological shape. Zero deps. One cycle.

---

### 132. SAMUeL — Efficient Vocal-Conditioned Music Generation (arxiv 2507.19991, 2026)
**Source**: https://arxiv.org/abs/2507.19991

Vocal-Conditioned Music Generation via Soft Alignment Attention and Latent Diffusion. Operates in the compressed latent space of a pre-trained VAE. Key result: 220× parameter reduction compared to SOTA systems while achieving 52× faster inference. Architecture uses soft alignment attention to match vocal input (hummed melody, sung phrase) with generated instrumental accompaniment. The speed advantage comes from the latent VAE compression — the diffusion operates in a 220× smaller space. No browser deployment yet; paper is research-stage.

**Could become a prototype**: future direction — when a fal.ai endpoint appears. SAMUeL's approach (vocal → accompaniment via latent diffusion) is the right architecture for `44-vocal-bgm`'s use case. If speed is genuinely 52× faster than current SOTA, hum → arrangement latency drops from ~5-10s to ~0.1-0.2s. Monitor for fal.ai deployment. Currently ACE-Step 1.5 is the practical choice; SAMUeL would be the upgrade.

---

### 133. BINAQUAL — Binaural Audio Localization Quality Metric (arxiv 2505.11915, 2026)
**Source**: https://arxiv.org/abs/2505.11915

Full-reference objective localization similarity metric for binaural audio. Quantifies how accurately HRTF-rendered audio preserves the intended spatial position relative to a reference rendering. This fills a long-standing gap: there was no reliable objective metric for spatial audio quality (only subjective listening tests). BINAQUAL enables automated evaluation of HRTF rendering pipelines.

**Relevance to sandbox**: validates the approach in `7-spatial`, `29-scene-spatial`, `53-ghost-sfx`, `54-maestro-stems` — all use Web Audio HRTF PannerNode, which is a simplified HRTF model. BINAQUAL would show how far simplified PannerNode diverges from measured HRTF for each elevation/azimuth position. Not a prototype idea, but a quality benchmark. If Karel wants to evaluate the spatial audio accuracy in any of these prototypes, BINAQUAL is the right tool. Research note for future polish.

---

### 134. Eleven V3 Text-to-Dialogue — Multi-Speaker Dramatic Scene Generation (February 2026)
**Source**: https://elevenlabs.io/blog/eleven-v3

ElevenLabs V3's Text-to-Dialogue mode weaves multiple character voices into a single seamless output — matching prosody, emotional range, and audio tag delivery across speakers. A single API call generates a 3–6 line dramatic exchange between two characters. Pricing: same $0.10/1000 chars as single-speaker mode.

**Could become a prototype**: `eleven-dialogue` — Ghost scene as a 2-character dramatic exchange. Six Ghost scenes, each with a scripted 3-line dialogue between the Ghost character and a visitor/listener character. Stone Chamber: Ghost `[slowly, reverently] The resonance here [pauses] is ancient.` · Visitor: `[nervous, awed] I didn't know it would feel this alive.` · Ghost: `[whispers] Everything that ever sounded here — still does. [pauses] If you know how to listen.` Each scene pre-written but with editable textarea for each character's lines. Generate → play. Canvas shows the two voice waveforms in different colors (Ghost warm orange, Visitor cool blue) with animated subtitle per line. "The Ghost is no longer alone." Different from `56-ghost-voice` (monologue) and `61-orpheus-voice` (A/B style comparison). This is drama. FAL_KEY in use, ~$0.02/scene. Zero new deps. One cycle.

---

### 135. WebGPU Audio: 2026 Status Report
**Source**: https://www.webgpusound.com/ · https://gist.github.com/JolifantoBambla/0a4e9c2a0a8bc475f081bc6f9d1aa1a8

WebGPU audio synthesis (generating audio samples in compute shaders) is now documented and demonstrated at webgpusound.com. The JolifantoBambla gist technique (already referenced in §36) has spawned a small community. The 2026 status: Chrome 129+, Firefox Nightly, Safari 26 all support the storage buffer → AudioWorklet read-back path needed for GPU-synthesized audio playback. Main remaining friction: the PCIe round-trip for reading GPU buffer back to CPU for the AudioWorklet is ~30–80ms — acceptable for offline effects, too slow for real-time feedback synthesis. Two patterns emerging: (1) GPU DSP on pre-recorded buffers (done in `55-webgpu-audio-fx`), (2) GPU-generated audio streamed to AudioWorklet via SharedArrayBuffer (requires COOP headers, which Vercel supports). Pattern (2) enables true real-time GPU synthesis.

**Could become a prototype**: upgrade `55-webgpu-audio-fx` to use SharedArrayBuffer streaming path for sub-10ms GPU audio → web audio latency. Enables real-time GPU FM synthesis where the shader IS the oscillator, reading audio uniforms at 44,100 Hz. This is the `27-gpu-additive` architecture in a simpler form. Would require confirming Vercel COOP header support (Cross-Origin-Opener-Policy + Cross-Origin-Embedder-Policy). Worth asking Karel.

---

### 136. ACM CHI 2026 — AI Creative Tools Interaction Patterns
**Source**: https://arxiv.org/abs/2504.14055 · https://link.springer.com/chapter/10.1007/978-981-95-8256-3_7

Two papers from CHI 2026 / CHI-adjacent venues relevant to the dream zone: (1) A web-based DAW for AI-generated music workflow — standardized API integrating symbolic music generation systems with a browser-based real-time audio renderer and "direct manipulation of musical elements." Visual interface with track timeline. (2) "Design of Creative AI Tools" (arxiv 2504.14055) — a taxonomy of human-AI creative interaction patterns; identifies four: reactive (AI responds to every action), compositional (AI generates from specification), dialogic (turn-taking), and generative (AI drives, human steers). The sandbox has strong reactive and compositional coverage; dialogic is only `33-aria-companion` and `39-anticipate`; generative (AI drives, human steers) is only `47-mood-journey`. The taxonomy suggests `lyria-jam` (Lyria RealTime — AI drives continuously, user steers prompts) would fill the most underrepresented slot.

**Could become a prototype**: `lyria-jam` remains the top-priority generative-mode prototype when Karel provides a Gemini API key. The CHI taxonomy confirms: of the four creative AI interaction modes, generative is the most underrepresented in the sandbox. `lyria-jam` would be the first prototype Karel could perform with live — infinite music, infinite steering, no "generate and wait." Also reinforces: build `dialogue-score` soon to deepen the dialogic category beyond the two existing entries.

---

## Cycle 82 Research (2026-05-21)

---

### 137. Chatterbox Turbo — Open-Source TTS with Voice Cloning + Paralinguistic Tags (Resemble AI, 2026)
**Source**: https://blog.fal.ai/chatterbox-turbo-is-now-available-on-fal/ · https://fal.ai/models/fal-ai/chatterbox/text-to-speech

Resemble AI's Chatterbox Turbo is a 350M-parameter open-source TTS model on fal.ai at endpoint `fal-ai/chatterbox/text-to-speech`. Price: $0.025/1000 characters — half of Orpheus ($0.05) and one-fourth of ElevenLabs V3 ($0.10). Key differentiators from the three prior TTS models in the sandbox (Gemini §110, Orpheus §117, ElevenLabs V3 §127):

1. **Voice cloning from 5 seconds** — pass any audio URL as a `audio_url` input and the output is rendered in that voice. No training, no fine-tuning. Immediate.
2. **Paralinguistic tags** — `[laugh]`, `[sigh]`, `[gasp]`, `[cough]`, `[throat clear]`, etc. inserted mid-sentence. Different paradigm from Orpheus XML (per-word) and ElevenLabs V3 (per-phrase acting direction): Chatterbox tags represent physical/vocal actions rather than emotional states.
3. **Sub-150ms first-sound latency** — real-time capable.
4. **`exaggeration` control** — float 0–1 scales emotional intensity from neutral to dramatic across the whole generation.

This is the first TTS in the sandbox where the voice itself can be cloned. The prior four prototypes all use pre-existing model voices; Chatterbox could render the Ghost in a real person's voice — including Karel's own voice, any actor's voice from a 5s sample, or a purpose-recorded "Ghost character" voice.

**Could become a prototype**: `chatterbox-ghost` — record a 5s "Ghost character" voice sample (or use any short reference clip hosted at a public URL). Six Ghost scene narrations rendered in that cloned voice with paralinguistic Chatterbox tags: `The resonance here is ancient. [sigh] Let yourself be absorbed by it.` / `[slowly] You are not rising. [gasp] The world is receding.` Add as column E to `61-orpheus-voice` (making it a 5-way TTS comparison) OR as a standalone prototype with a voice-clone UI: record/upload reference audio → type narration → generate. The voice-clone capability is qualitatively new — this is the first prototype that lets Karel hear the Ghost speak in a voice he chose. FAL_KEY in use. $0.025/1000 chars. Zero new deps. One cycle.

---

### 138. ImprovNet — Controllable Musical Improvisations via Iterative Corruption Refinement (arxiv 2502.04522, Feb 2026)
**Source**: https://arxiv.org/abs/2502.04522

ImprovNet is a transformer-based model for generating stylistically coherent musical improvisations from a seed composition. Architecture: self-supervised iterative corruption-refinement — the model is trained by progressively corrupting symbolic music and learning to reconstruct expressive variations. At inference: supply a seed phrase (even just 4-8 bars of melody), choose a style degree (0.0 = close to original, 1.0 = freely improvised), and optionally specify a target genre (jazz, classical, blues, bossa nova). The model generates a complete 16-32 bar structured improvisation that develops and transforms the seed material.

Cross-genre style transfer is a first-class capability: an 8-bar Bach invention seed can be transformed into a jazz improvisation that preserves the melodic skeleton while adding syncopation, chord extensions, and idiomatic embellishments. Objective + subjective evaluations confirm musical coherence at all style-transfer degrees. The model handles completion (infill a missing phrase), harmonization (add chords), and style transfer from a single architecture.

**Could become a prototype**: `improv-expand` — user plays an 8-bar phrase (or uses demo MIDI) → select genre and style degree slider → ImprovNet generates a 32-bar improvisation that develops the seed. Play through bloom visualizer; piano roll shows original seed (amber) and improvised continuation (blue). "Your phrase, developed." Zero new deps; needs a model API or HuggingFace Spaces endpoint. No fal.ai endpoint found yet — monitor. Also: once the API appears, this becomes the strongest dialogic prototype in the sandbox: the AI doesn't just respond (Aria, `33-aria-companion`) but develops the user's idea into a complete form.

---

### 139. Pianist Transformer — Human-Level Expressive Piano Performance Rendering (arxiv 2512.02652, Dec 2025)
**Source**: https://arxiv.org/abs/2512.02652 · https://huggingface.co/spaces/yhj137/pianist-transformer-rendering

A 135M-parameter Transformer (Apache 2.0) that converts a flat (unexpressive) MIDI score into a human-level expressive piano performance. Self-supervised pre-training on 10B tokens from unlabeled MIDI recordings eliminates the need for labeled expression annotations. Architecture: asymmetric encoder-decoder (10-layer encoder, 2-layer decoder) for longer context at lower cost. Result: outputs statistically indistinguishable from human pianists in blind listening tests. HuggingFace demo at https://huggingface.co/spaces/yhj137/pianist-transformer-rendering — inference runs via Spaces (no API key needed, free). Model hosted at `yhj137/pianist-transformer-rendering` in safetensors format; no direct HuggingFace Inference API deployment, but the demo Space is publicly callable.

**Could become a prototype**: `expressive-render` — user writes or plays a simple 8-bar melody (using `22-code-score` DSL, or via `26-score-follow` demo score), sends the flat MIDI to the Pianist Transformer HuggingFace Space, gets back an expressive human-like performance. Play through the `24-piano-roll` visualization so you can see the added dynamics and timing variations as the "performed" version deviates from the flat score. "Your melody, played as a human would." Needs a server route to proxy the HuggingFace Spaces demo (since no direct API). One cycle. No API key. Apache 2.0.

---

### 140. D3PIA — Piano Accompaniment Generation from Lead Sheet via Discrete Diffusion (arxiv 2602.03523, Feb 2026)
**Source**: https://arxiv.org/abs/2602.03523

KAIST paper. Generates a complete piano accompaniment from a lead sheet (melody + chord symbols) using a discrete denoising diffusion model. Core innovation: Neighborhood Attention (NA) modules capture local correlations between melody and accompaniment in piano-roll space, while the discrete diffusion process respects the symbolic nature of music better than continuous diffusion. Outperforms continuous diffusion and Transformer baselines on the POP909 benchmark for chord fidelity and musical coherence. Input: melody piano roll (pitch × time) + chord symbols (12-dim per bar). Output: accompaniment piano roll. Apache 2.0, MIDI-level output.

**Could become a prototype**: `lead-sheet` — user types a melody using `22-code-score` DSL (or uses the demo Bach fragment), specifies chord names via a row of chord pickers (Dm7, G7, Cmaj7...), sends the combined lead sheet to a D3PIA API endpoint → AI generates piano accompaniment. Play both melody (top track, orange) and AI accompaniment (bottom track, blue) through the piano roll visualization simultaneously. "You sing, the piano plays with you." Very relevant to Resonance: every pianist knows the lead-sheet format. No fal.ai endpoint found; monitor for deployment. Research direction for now.

---

### 141. PianoFlow — Music-Aware Streaming Bimanual Piano Hand Motion Generation (arxiv 2604.12856, Apr 2026)
**Source**: https://arxiv.org/abs/2604.12856

Generates realistic animated 3D piano hand motions synchronized to audio. Architecture: autoregressive flow-matching continuation scheme for real-time streaming of arbitrarily long sequences. Uses MIDI during training (for hand position labels) but requires only audio at inference. Role-gated interaction module coordinates left/right hand dynamics to avoid collision and maintain musical phrasing. 9× faster inference than prior state-of-the-art. Result: high-fidelity bimanual piano hand animations synchronized to any piano audio.

**Could become a prototype**: `piano-hands` — upload a piano audio file (or use mic capture) → stream through PianoFlow API → render 3D animated hand skeleton over a simplified keyboard model in Three.js R3F (all deps already installed). The keyboard could be the `36-pluck-field` grid or a standard 88-key piano layout. Seeing animated hands play music you know (Bach Invention, your own improvisation) is a high-surprise visual. No fal.ai endpoint found; model code on GitHub. Would need a backend. One future cycle when API available. Meanwhile, a simplified version: just render static hand pose silhouettes keyed to detected pitch, without the full PianoFlow model.

---

### 142. NCLMCTT — Neural Codec Language Model for Controllable Timbre Transfer (ICLR 2026, Amazon Science)
**Source**: https://proceedings.mlr.press/v303/liu26b.html · https://www.amazon.science/publications/neural-codec-language-model-for-controllable-timbre-transfer-in-music-synthesis

Zero-shot instrument timbre cloning: play a melody → hear it rendered in a different instrument's timbre from a 1–5s reference audio clip. Architecture: 385M-parameter transformer (coarse structure) + specialized upsampler (fine timbral detail). Zero-shot: no per-instrument training. Reference clip conditioning: 1–5s of any instrument is sufficient for convincing timbre transfer. Benchmark: first comprehensive controllable timbre transfer evaluation dataset (62,500 samples, 50 synthesizer presets). Results: 27.1% reduction in SI-SDR, 50.9% Mel Distance improvement vs. TokenSynth baseline. Melodic content preserved (Chroma Similarity: 0.85).

**Could become a prototype**: `timbre-clone` — record 3–5s of any instrument (violin, cello, marimba, theremin, or use a bundled demo clip), then play a melody into the mic → the melody is transcribed and rendered through the cloned instrument timbre. Play the re-timbred audio through the bloom visualizer. "Your melody — in any voice." Needs fal.ai or HuggingFace endpoint. No deployment found yet; monitor Amazon Science publications. Different from `34-spectral-morph` (which blends FFT spectra) — NCLMCTT does semantically coherent timbre replacement, not spectral mixing.

---

### 143. Self-Similarity Matrix Music Structure Analysis (arxiv 2603.27218, Mar 2026)
**Source**: https://arxiv.org/abs/2603.27218

Unsupervised music structure analysis using pre-trained deep audio embeddings + three segmentation algorithms. Key finding: Correlation Block-Matching (CBM) on bar-level deep embeddings consistently outperforms Foote's checkerboard kernels and spectral clustering. No labeled data required — embeddings from generic pre-trained models (like MusicBrainz or CLAP) are sufficient. The self-similarity matrix (SSM) — where entry (i,j) = cosine similarity between bar i and bar j embedding — reveals repetition structure visually: a chorus repeating three times creates bright 3×3 diagonal blocks.

**Could become a prototype**: `structure-viz` — mic → 30-60s of audio → compute bar-level FFT envelope vectors → build an SSM from cosine similarities → display as a colormap grid (dark = dissimilar, bright = similar) that auto-updates as you play. Use Correlation Block-Matching to detect section boundaries and draw them as colored dividers on a horizontal timeline strip at the bottom. No ML required — the SSM from FFT vectors (no deep embeddings) is a valid zero-dep approximation that reveals gross structure. When you play a repeating motif, the bright off-diagonal blocks appear in real time. "Your music as a map of itself." Zero deps; browser-native. One cycle. First prototype that shows STRUCTURE rather than just content.

---

### 144. Anchored Cyclic Generation for Long-Sequence Symbolic Music (arxiv 2604.05343, Apr 2026)
**Source**: https://arxiv.org/abs/2604.05343

Hi-ACG: hierarchical anchor-based cyclic generation that prevents semantic drift in autoregressive music models during long-sequence generation. Core insight: use anchor features from already-generated segments to constrain subsequent generation — the anchor "remembers" the established musical material and keeps the continuation coherent. Result: 34.7% reduction in cosine distance between predicted and target feature vectors vs. baseline autoregressive generation. Applied to music completion, style transfer, and full-piece generation tasks.

**Relevance to sandbox**: This paper validates the approach in `48-arc-compose` (where section tags act as structural anchors) and `33-aria-companion` + `65-dialogue-score` (where the Markov chain history acts as a statistical anchor). The key insight — hierarchical global-to-local anchoring — could be applied to future prototype builds. No prototype directly; research direction that reinforces existing design choices.

---

### 145. Expressive Piano Cover Generation — Etude System (arxiv 2509.16522, Sep 2025)
**Source**: https://arxiv.org/abs/2509.16522

Three-stage system for converting polyphonic music into pianistically idiomatic piano cover arrangements: (1) Extract melodic and harmonic content from the source (via AMT), (2) Structuralize the content into a pianistic reduction preserving voice leading, (3) Decode into an expressive MIDI performance with realistic dynamics and articulation. Target: covers that a human pianist could actually perform — not just correct notes but natural fingerings and phrasing. Results: subjectively preferred over prior piano cover generation systems.

**Could become a prototype**: `piano-cover` — upload any audio file (pop song, string quartet recording, hummed melody) → Etude generates a playable piano cover arrangement. Display as piano roll. Download as MIDI. "Any music, reduced to piano." Needs an API. No fal.ai endpoint found; research-stage. Future prototype when API appears. Note: the three-stage decompose-structuralize-decode pipeline mirrors Resonance's existing journey arc structure, suggesting a natural fit.

---

### 146. StreamMark — Semi-Fragile Audio Watermarking for Deepfake Detection (arxiv 2604.11917, Apr 2026)
**Source**: https://arxiv.org/abs/2604.11917

A deep-learning-based audio watermarking system designed to be robust against benign processing (compression, resampling, normalization) while fragile against deepfake manipulation. SNR 24.16 dB, PESQ 4.20 — effectively imperceptible. Architecture: encoder embeds a bit-string watermark into the audio; decoder detects presence and authenticity. A watermarked Ghost narration played through Resonance would retain its verification signature even after platform re-encoding, but the signature breaks if the audio is deepfaked or voice-cloned.

**Relevance to sandbox**: Interesting for the Ghost voice prototypes (`56-ghost-voice`, `61-orpheus-voice`, `64-eleven-dialogue`, future `chatterbox-ghost`) — the AI-generated Ghost narrations could be watermarked to mark them as AI-generated. Not a standalone prototype (too specialized), but a signal that audio provenance is a growing concern in AI-generated creative work. Karel should know: as Ghost TTS prototypes multiply, there's a research community building tools to track which outputs are AI-generated. Not a blocking concern, but worth awareness. No prototype recommended.

