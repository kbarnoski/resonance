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

---

## 2026-05-21 — Cycle 86 research sweep

### 147. ShaderVine — WebGPU WGSL Shader Editor with Genetic Evolution + MCP Server (April 2026)
**Source**: https://meditations.metavert.io/p/shadervine-a-webgpu-shader-editor

Browser-native WGSL shader editor (Monaco-powered) with live preview, 16 built-in GPU compute simulations (Conway's Life, fluid dynamics, reaction-diffusion, particle swarms, erosion, physarum networks, falling sand, DLA, domain warping, turbulence, and more). Key differentiator: a **genetic evolution system** — generates mutated shader variants and lets users select aesthetic favorites to "breed" together, addressing the text-bottleneck for visual authoring. Runs in-browser, MIT licensed, no installation. Includes a full **Model Context Protocol server** that exposes every creative operation as a callable tool so AI agents (including Claude Code) can search galleries, create/modify shaders, and trigger evolution programmatically.

**Could become a prototype**: `shader-evolve` — a stripped-down "genetic shader gallery" built into the dream zone: start from the `68-wgsl-synth` default shader, spawn 4 random mutations (by randomly perturbing the audio-uniform math operations), display all four as 2×2 WebGPU canvases, let Karel click "keep" on favorites → breed them. Zero new deps, same WebGPU pipeline as `68-wgsl-synth`. The genetic loop adds a new creative paradigm the sandbox hasn't seen: *natural selection of shaders*. ShaderVine is also a partner tool to `claude-shader` (needs ANTHROPIC_API_KEY) — together they cover the full spectrum from hand-written WGSL to AI-generated to genetically-evolved.

---

### 148. Voice Composer — Multi-Algorithm Real-Time Pitch Detection in Browser (Hacker News, Jan 2026)
**Source**: https://news.ycombinator.com/item?id=46581431

Browser-based tool running **four pitch detection algorithms simultaneously** on microphone input: CREPE (deep learning via TensorFlow.js — most accurate but CPU-heavy), YIN (autocorrelation variant — fast, reliable for monophonic), FFT with Harmonic Product Spectrum (HPS — handles harmonic-rich tones), and AMDF (Average Magnitude Difference Function — lightweight fallback). All four display estimates simultaneously; user switches algorithms based on their specific input characteristics. Outputs: visual piano roll, downloadable MIDI files, and Strudel/TidalCycles code for live-coding environments. Entirely client-side.

**Could become a prototype**: `pitch-algo-compare` — run all four algorithms (skip CREPE, which needs TF.js CDN dep — use only the three zero-dep ones: YIN, HPS, autocorrelation) simultaneously on mic input. Display all three estimates as colored horizontal cursors on a piano roll canvas — see where they agree (three overlapping lines) and where they diverge (noisy or polyphonic input). A consensus vote: if two of three agree within ±2 semitones, highlight the consensus pitch in gold. Education + utility: pianists see in real time which algorithm is more confused by chords, which handles the bottom octave better. Zero new npm deps (YIN and HPS are ~30 lines each of pure JS). Informs future `neural-pitch` upgrade decision. One-cycle build.

---

### 149. Demucs-web: Browser-native AI Stem Separation via ONNX + WebGPU (April 2026)
**Source**: https://github.com/timcsy/demucs-web · https://github.com/nikhilunni/demucs-rs

Demucs v4 (htdemucs) running entirely in the browser via ONNX Runtime Web + WebGPU acceleration, no server. Also: demucs-rs, a Rust port compiled to WASM. Processes a 4-minute song locally in 3–5 minutes (WebGPU-accelerated; slower on CPU fallback). Web Workers prevent UI blocking during inference. Outputs 4 stems: drums, bass, other, vocals. Privacy: audio bytes never leave the device. Model weights cached after first load. The ONNX Runtime Web 1.26 WebGPU EP (confirmed §72) makes this practical.

**Could become a prototype**: `browser-stems` — upload any audio file → WebGPU-accelerated Demucs separates it into 4 stems in-browser (3–5 min, progress bar) → each stem plays through a dedicated HRTF PannerNode: drums from above (+60°), bass from below (−30°), other from front-left (−25°), vocals/melody from front-right (+25°). Canvas: same top-down sphere as `29-scene-spatial` and `53-ghost-sfx`. This is `54-maestro-stems` but with YOUR audio — a recording you made, your favorite piece of music, a Resonance session. Zero API cost, zero data upload, fully private. Needs Karel OK on: ~200MB ONNX model (cached after first load), CDN ONNX Runtime Web dep. Two-cycle build (model integration + HRTF routing).

---

### 150. Art2Mus — Direct Artwork-to-Music Generation via Visual Conditioning (arxiv 2602.17599, Feb 2026)
**Source**: https://arxiv.org/abs/2602.17599

Generates music directly from artworks by projecting visual embeddings into the conditioning space of a latent diffusion music model — no text intermediate step. Trained on ArtSound, a dataset of 105,884 artwork-music pairs with dual-modality captions (visual and sonic description). Key innovation: bypasses the image→text→music pipeline, which loses visual subtlety. The result: music semantically aligned to the artwork's style, color temperature, and cultural context. Validated on paintings (Monet, Rothko, Basquiat) — each produces distinctly different soundscapes.

**Could become a prototype**: `art-to-music` — the natural companion to `58-music-to-ghost` (audio → Ghost image). Here the direction reverses: drop a Ghost scene image → receive ambient music shaped by its visual mood. A Cosmic Ascension image should produce expansive, high-frequency music; a Stone Chamber image should produce slow, dark resonance. No public API yet; monitor fal.ai and Replicate. When available: one-cycle build. Meanwhile, a zero-dep approximation is possible: extract dominant HSL from the image (color temperature + brightness) → map to valence/arousal → feed into the `38-mood-xy` synthesis engine. Instant, zero API, zero dep — just image processing.

---

### 151. Music of Changing Lines — I-Ching + LLM + Lyria Musical Oracle (arxiv 2605.20386, May 2026)
**Source**: https://arxiv.org/abs/2605.20386

Interactive system combining traditional I-Ching divination (coin casting → hexagram) with LLM interpretation (Gemini analyzes the hexagram contextually for the user's inquiry) and Lyria music generation (interpretation text → 30s ambient piece). The designers position AI as "an interpretive intermediary rather than a compositional authority" — meaning-making stays with the human, the AI expands what the hexagram might mean. The paper finds that users reported the AI's musical response felt "surprisingly fitting" to their inquiry, even though no personal data was processed.

**Could become a prototype**: `oracle-music` — a zero-dep, zero-API version of this concept. Map all 64 I-Ching hexagrams to musical parameters (each hexagram has an associated element, season, and archetypal quality in classical commentary): hexagram 1 (Creative/Heaven) → pentatonic C major, bright register, 80 BPM, full sustained chords; hexagram 2 (Receptive/Earth) → slow minor arpeggio, low register, 35 BPM, sparse; hexagram 29 (Abysmal/Water) → descending chromatic lines, deep bass, 50 BPM; hexagram 30 (Clinging/Fire) → rising diminished scales, 120 BPM, bright treble. Visual: coin animation (three coins thrown three times → six-line hexagram), hexagram symbol drawn with line-by-line animation, English name + title, then music begins. "Consult the oracle — it answers in sound." First prototype connecting music to a divination system. Zero deps. High surprise factor. One-cycle build. NEEDS_GEMINI is optional (could add Lyria call as a premium layer, but zero-dep version is self-contained).

---

### 152. AuDirector — Multi-Agent Long-Form Audio Narrative System (arxiv 2605.11866, May 2026)
**Source**: https://arxiv.org/abs/2605.11866

Multi-agent AI framework for generating coherent long-form audio narratives. Three modules: (1) **Identity-Aware Pre-production** — transforms narrative text into character profiles (voice character, speech rate, emotional range) + utterance-level emotional instructions per line; (2) **Collaborative Synthesis and Correction** — self-auditing loop that detects and regenerates problematic audio sections (wrong voice, broken prosody); (3) **Human-Guided Interactive Refinement** — accepts natural language feedback to modify scripts and regenerate. Key insight: character consistency across long narratives requires both top-down character profiles and bottom-up per-utterance emotional direction.

**Relevance to sandbox**: Not a standalone prototype — but an architectural model for future Ghost narrative evolution. The `66-chatterbox-ghost` prototype already has paralinguistic tags (bottom-up direction); what it lacks is the character profile layer (top-down consistency) and the self-auditing loop (regenerate bad takes). If a future `ghost-narrative-arc` prototype generates the full 6-scene Ghost journey as one continuous audio experience across multiple TTS calls, AuDirector's three-module structure is the right architecture to follow. Monitor for API deployment; the self-correction loop (module 2) is the unique contribution worth watching.

---

### 153. Musical Attention Transformer + ICME 2026 Text-to-Music Winners (arxiv 2605.21081 and 2605.21433, May 2026)
**Source**: https://arxiv.org/abs/2605.21081 · https://arxiv.org/abs/2605.21433

Two papers from May 2026 representing the state of the art in text-to-music generation as of this cycle. Musical Attention Transformer adds music-domain metadata (tempo, key signature) to standard attention, reducing repetitive note patterns by 18%. The ICME 2026 Challenge winner uses a Diffusion Transformer with auxiliary conditioning branches for better style adherence and melodic coherence. Both models outperform ACE-Step on long-term structure and stylistic variety. Neither has a fal.ai endpoint yet.

**Relevance to sandbox**: `6-compose` (built Cycle 65) uses ACE-Step, which was state-of-the-art in early 2026. These new models suggest a generation quality jump is coming to fal.ai in the next 1–3 months. When the ICME winner arrives on fal.ai (likely as a named model endpoint), upgrading `6-compose` to the new backend would be a one-cycle polish. Monitor fal.ai explore/audio-models for new arrivals. Also: the text-to-music quality improvements would directly benefit `62-collage-compose` (which depends on ACE-Step for audio-to-audio quality).

---

### 154. Browser-Native AI Stem Separation: Performance Report (April 2026 blog post)
**Source**: https://earezki.com/ai-news/2026-04-24-i-ran-a-neural-network-in-a-browser-tab-to-split-a-song-into-stems/ (403, but secondary sources confirm)

April 2026 developer report: htdemucs running in a browser tab via ONNX Runtime Web + Web Workers, processing a 4-minute song in approximately 3–5 minutes on a modern laptop with WebGPU acceleration (longer on CPU fallback). Drums, bass, other, vocals correctly separated. Audio never leaves the device. Progress bar prevents the user experience from feeling frozen. Model weights are ~150–200MB, cached after first download. The combination of ONNX Runtime Web 1.26 (WebGPU EP default, §72) and Web Workers makes this practical as a real prototype.

**Key production detail**: Use `navigator.gpu.requestAdapter()` to detect WebGPU; fall back to CPU WASM path with a warning that processing will take 15–20 min. Display a progress estimate. Most laptops with discrete GPU: ~3 min for a 3-minute song. Confirms `browser-stems` (§149) is buildable with a clear UX: upload → progress bar ("Separating stems… ~2 min remaining") → 4 stem player. The in-browser privacy angle is a strong differentiator from fal.ai-based approaches.

---

### 155. Inworld TTS-1.5 Max — Viseme Timing for Character Animation (Jan 2026, fal.ai)
**Source**: https://blog.fal.ai/inworld-tts-1-5-max-now-available-on-fal/ · https://fal.ai/models/fal-ai/inworld-tts

Extension of §105: new detail identified this cycle. Inworld TTS-1.5 Max outputs **timestamp alignments at character, word, phoneme, and viseme levels** — synchronization data for animating digital avatars and lips. A "viseme" is the mouth shape corresponding to a phoneme (e.g., the "oo" viseme for the "u" sound). With viseme timestamps, a Ghost character's mouth could be animated in sync with the narration without any additional model. P90 time-to-first-audio: 250ms (Max), 130ms (Mini). Streaming WebSocket delivery.

**Could become a prototype**: `ghost-lip` — extend `66-chatterbox-ghost` (or `56-ghost-voice`) with a simple animated Ghost face canvas. An SVG or Canvas2D outline of a stylized face: just eyes (slow blink every 4–7s) and a mouth path (closed curve at rest). When Inworld TTS generates narration, the viseme timing data drives the mouth open/close shape — a set of 6–8 simple mouth positions keyed to viseme IDs. The result: the Ghost's voice comes from a face that moves its lips. Not a realistic avatar — a stark, ghost-like abstraction of a speaking presence. FAL_KEY in use, ~$0.005/min generation. Zero new deps (Canvas2D mouth path animation). One-cycle build.

---

### 156. Pitch Algorithm Comparison: YIN vs. HPS vs. Autocorrelation (2026 browser implementations)
**Source**: https://pitchdetector.com/real-time-browser-pitch-detection-explained/ · Voice Composer (§148)

The three mainstream zero-dep browser pitch detection approaches have different performance profiles: **Autocorrelation** (our current approach in `13-piano-canvas`, `24-piano-roll`, etc.) — good for clean monophonic signals, degrades on noisy/polyphonic input; **YIN** — autocorrelation variant with aperiodicity check, ~15% fewer octave errors than basic autocorrelation, same computational cost; **HPS (Harmonic Product Spectrum)** — multiplies harmonically downsampled spectra, better for harmonic-rich instruments (piano, violin) but poorly defined for pure tones. Key insight from the 2026 browser implementations: YIN and HPS are each ~25–40 lines of pure JS and run in <1ms on a 2048-sample FFT buffer. We could easily add both as alternatives in `_shared/` and let each prototype pick which one it uses.

**Prototype specification**: `pitch-algo-compare` (Route: `/dream/69-pitch-algo-compare`) — run all three on live mic input simultaneously. Canvas shows three horizontal pitch cursors on a piano roll grid: **orange** = autocorrelation (current), **blue** = YIN, **green** = HPS. When all three agree within ±1 semitone, display the consensus pitch in bold gold. When they diverge, show the spread. A "confidence" bar per algorithm (YIN outputs an aperiodicity metric; HPS outputs peak salience; autocorrelation outputs peak correlation). Play each detected pitch as a faint piano tone so you can hear the difference when algorithms disagree. First prototype to make pitch detection internals *visible*. Zero new deps. One-cycle build. Directly informs whether the `neural-pitch` (§61) upgrade is worth the CDN dependency.

---

## 2026-05-21 — Cycle 90 research sweep

### 157. CassetteAI Music Generator on fal.ai (2026)
**Source**: https://fal.ai/models/cassetteai/music-generator · https://blog.fal.ai/cassetteai-music-creation-models-available-on-fal/

New fast music generation model on fal.ai. Endpoint: `cassetteai/music-generator`. Generates 30-second sample in under 2 seconds and a full 3-minute track in under 10 seconds at 44.1 kHz stereo — dramatically faster than ACE-Step (~20–40s for 30s). Supports any genre; key and tempo can be specified directly in the prompt string (e.g., "jazz piano trio, Key: D Minor, Tempo: 90 BPM"). Pricing: $0.02/output minute (3-min track ≈ $0.06 — same order as MiniMax $0.03, cheaper than ACE-Step for longer tracks). Companion model: `cassetteai/sound-effects-generator` for short SFX up to 30s, generated in ~1s. Instrumental only — no vocal support. Commercial use permitted.

**Relevance to sandbox**: `6-compose` and `48-arc-compose` currently use ACE-Step. CassetteAI is 10× faster and at similar cost. The most valuable upgrade: in `6-compose`, the user types a mood prompt and waits 20–40 seconds — with CassetteAI that wait drops to 2 seconds. Second use: the SFX model could replace the ElevenLabs SFX calls in `53-ghost-sfx` at lower cost and lower latency. No new approvals needed (FAL_KEY already in use). Worth testing as a backend swap in `6-compose` before committing. **Prototype idea**: **`cassette-speed-test`** — side-by-side generation comparison: same prompt sent to CassetteAI vs. ACE-Step simultaneously, both play back through the bloom visualizer. Proves the speed difference to Karel in real time. Alternatively, just upgrade `6-compose`'s server route to use CassetteAI as the primary backend with ACE-Step as fallback.

---

### 158. xAI TTS — Inline Action Tags + Semantic Wrapping Tags (fal.ai 2026)
**Source**: https://fal.ai/models/xai/tts/v1/api

xAI (Grok) text-to-speech is now available on fal.ai at endpoint `xai/tts/v1`. Five expressive voices: **eve** (energetic, upbeat), **ara** (warm, friendly), **rex** (confident, clear), **sal** (smooth, balanced), **leo** (authoritative, strong). What makes xAI TTS unique in the current sandbox ecosystem: it supports **two distinct tag styles simultaneously** — (1) inline action tags at any position: `[laugh]`, `[pause]`, `[sigh]`, `[clears_throat]`; and (2) semantic wrapping tags applied to a span of text: `<whisper>text</whisper>`, `<slow>text</slow>`. This is a genuinely different paradigm from all four TTS models already in the sandbox: Gemini (global style_instructions), Orpheus (per-word `<emotion>XML</emotion>`), ElevenLabs V3 (per-phrase inline `[tag]` beats), Chatterbox (voice clone + physical action tags). xAI uniquely combines the inline-position approach AND the span-wrapping approach in one call. Output: MP3 at 24 kHz / 128 kbps. FAL_KEY in use. Max input: 15,000 characters.

**Could become a prototype**: Add xAI TTS as column E in `/dream/61-orpheus-voice`, completing a full 5-way Ghost TTS paradigm comparison. Pre-loaded example:
- Stone Chamber: `[pause] The resonance here [pause] is ancient. <whisper>Let yourself be absorbed by it.</whisper>`
- Cosmic Ascension: `[sigh] You are not rising. [pause] <slow>The world is receding.</slow>`

The combination of `[pause]` before a phrase AND `<slow>` around words is a natural fit for the Ghost character's measured, contemplative delivery. Standalone as `/dream/72-xai-ghost` or added to the existing comparison prototype. Zero new deps. FAL_KEY in use. One-cycle build.

---

### 159. Strudel Flow — Visual Node-Based Live Coding (2026)
**Source**: https://xyflow.com/labs/strudel-flow · https://strudel.cc/

Strudel is TidalCycles ported to JavaScript (existing knowledge). New in 2026: **Strudel Flow**, an experimental visual node-based interface for Strudel that transforms its text-based patterns into a drag-and-connect node graph. Instrument nodes connect to effect nodes, which connect to output nodes. No code required — you build the sound graph visually. Runs entirely in the browser.

**Key insight for the sandbox**: The Web Audio API is, architecturally, *already* a directed routing graph — every AudioNode is a graph vertex; every `node.connect(otherNode)` call is a directed edge. The Web Audio API was designed to be patched. What if we made that graph literal and interactive? **`node-synth`**: a Canvas2D canvas with colored node blocks (OscillatorNode = blue, GainNode = green, BiquadFilterNode = cyan, ConvolverNode = purple, DelayNode = amber, PannerNode = teal, DestinationNode = white). Drag to position. Click two nodes to draw a connection. Right-click edge to disconnect. Each node has a minimal inline parameter panel (frequency slider for oscillator, gain for gain, frequency+type for filter). Click **▶ Run** to compile the Web Audio graph from the visual spec and play it. Click **■ Stop** to tear it down. Pre-loaded "Hello Synth" patch: Oscillator → Filter → Gain → Destination. The modular synthesis paradigm, rendered as the Web Audio routing graph it actually is. Zero external deps, zero API. High live-performance relevance: patch a custom signal chain in 30 seconds. One-cycle build.

---

### 160. AI vs Human Music: Preference ≠ Emotional Effectiveness (arxiv 2506.02856, Jun 2026)
**Source**: https://arxiv.org/abs/2506.02856

A carefully designed study: 140 participants listened to AI-generated and human-composed music in calm and upbeat conditions, with correct labeling, swapped labeling, and no labeling. Key findings: (1) participants *preferred* AI-generated music, but *rated* human-composed music as more effective at eliciting the target emotion; (2) quantitative emotion measurement showed **no significant difference** between AI and human music in actual emotional response; (3) perceived authorship ("human vs AI") significantly modulated subjective judgments, with listeners associating human music with "imperfection, flow, soul."

**Relevance to the sandbox**: The disconnect between preference and perceived efficacy reveals that how AI music is *labeled and framed* matters as much as the music itself. For Resonance: presenting AI-generated music as "the Ghost's voice" or "the journey's score" — assigning authorship to a character rather than "AI" — may bypass the "soul" deficit. The `57-sound-to-image` and `58-music-to-ghost` prototypes already do this implicitly (the music belongs to the Ghost, not to ACE-Step). Future prototypes should frame AI music as character-authored or journey-authored. Not a prototype idea, but the most psychologically important research finding this cycle.

---

### 161. FM Synthesis — 2–4 Operator Frequency Modulation via Web Audio (DDX7, arxiv 2208.06169)
**Source**: https://arxiv.org/abs/2208.06169 · Yamaha DX7 operator spec · Web Audio API spec

FM synthesis (Frequency Modulation synthesis, Chowning 1973) works by connecting an OscillatorNode (the **modulator**) to the `frequency` AudioParam of a second OscillatorNode (the **carrier**). Modulator output amplitude scales the frequency deviation of the carrier; modulator-to-carrier frequency ratio and modulation index together determine the resulting timbre. Simple ratios (1:1, 1:2, 3:2) produce harmonic spectra resembling real instruments; irrational ratios produce metallic or noisy spectra. Classic DX7 algorithm 5 (2 operators): C:M ratio 1:1, index 2.5 → electric piano; C:M ratio 1:3.5, index 4 → tubular bell; C:M ratio 1:1, index 1.5 → bass clarinet. Web Audio API makes this trivial: `oscillator.connect(modGain); modGain.connect(carrier.frequency)`. The DDX7 paper (2022) proved neural networks can learn DX7 FM parameters directly from audio.

**Relevance to sandbox**: 71 prototypes, none implement FM synthesis — the most historically significant synthesis technique in the digital era. The Yamaha DX7 defined the sonic vocabulary of the 1980s (every electric piano, bell, and synth bass in pop music). FM synthesis is also ideal for live performance: a subtle change to the modulation index transforms a piano timbre into a metallic bell, and then into noisy chaos — the entire sonic range lives in 2 continuous parameters. **`fm-explorer`**: 2-operator FM synth with live sliders (C:M ratio, index, ADSR) + real-time spectrum display showing the sideband structure. Audio-reactive: bass energy → index (grittier bass → more harmonic complexity), onset → ADSR retrigger. Preset patch banks: DX Piano, DX Bell, Bass, Reed, Metallic. Zero deps. One-cycle build.

---

### 162. AcoustiVision Pro — Web-Based Room Impulse Response Analysis Platform (arxiv 2602.12299, Feb 2026)
**Source**: https://arxiv.org/abs/2602.12299

Open-source web-based platform for comprehensive room impulse response (RIR) analysis. Key capability: **real-time auralization via FFT-based convolution** — upload a dry audio clip and a room IR, hear how the dry audio sounds in that acoustic space. Computes 12 acoustic parameters (RT60, EDT, clarity, definition, IACC, etc.). 3D visualization of early reflections. Checks compliance with ANSI S12.60 and ISO 3382 standards. The accompanying RIRMega dataset (HuggingFace) contains thousands of simulated room impulse responses with full metadata. CC-BY 4.0 license.

**Relevance to sandbox**: While AcoustiVision Pro analyzes existing IRs, it inspires a generative direction — **`room-acoustic`**: a 2D canvas where the user draws or selects a room shape (shoe-box concert hall, bathroom, cathedral, forest clearing) and the browser synthesizes an approximate impulse response using the **image-source method** (early reflections from a rectangular room, ~60 lines of JS) loaded into a Web Audio `ConvolverNode`. Hear how a piano chord sounds in Carnegie Hall vs. a tiled bathroom vs. a cave. Wall material presets set absorption coefficients. RT60 display. Demo audio: the same plucked string from `36-pluck-field`. Ghost scene connection: each Ghost scene (stone chamber, underground pool, forest dawn) has an implied acoustic space — this prototype lets Karel design and tune those spaces. Zero external deps. One-cycle build. "Build a room. Hear what it sounds like."

---

### 163. Sound to Video — Automated Music Video Generation Pipeline (arxiv 2509.00029, Aug 2025)
**Source**: https://arxiv.org/abs/2509.00029

Workshop paper (AISTORY at ACM MM 2025) presenting a pipeline for generating music videos from audio: (1) extract latent audio features (emotional cues, instrument patterns); (2) convert to text descriptions via language model; (3) generate video clips with generative model. User evaluation confirmed "storytelling potential, visual coherency, and emotional alignment with music." Not browser-deployable directly (Python pipeline). CC-BY-NC-SA license.

**Relevance to sandbox**: Conceptual extension of `57-sound-to-image` (already built, Cycle 71). Where `57-sound-to-image` generates a single still image, the natural next step is a short video — `sound-to-video`. After the 10-second audio capture + analysis, instead of calling Flux Schnell, call a video generation model on fal.ai (e.g., Kling 3.0 `fal-ai/kling-video/v2/standard` or `fal-ai/hunyuan-video`). The image from `57-sound-to-image` becomes the first frame; the emotional analysis becomes the motion prompt. Budget: ~$0.14–0.40/clip depending on model. FAL_KEY in use. This would be a straightforward 1-cycle extension of an existing prototype. Not a standalone new prototype — flag as a `57-sound-to-image` extension item.

---

### 164. Strudel Flow + LLM-Generated Pattern Code (Hacker News, 2026)
**Source**: https://news.ycombinator.com/item?id=45243084

A Hacker News project (Nov 2025) demonstrates using LLMs to generate Strudel/TidalCycles pattern code that plays in real time in the browser. The user types a natural-language description ("slow jazz waltz with a broken piano chord pattern and a lazy bass line") → the LLM suggests Strudel-syntax pattern code → the code plays back immediately in the browser. The project confirms that: (a) Strudel's mini-notation is learnable from a small system prompt; (b) LLMs produce valid Strudel patterns from English descriptions reliably; (c) the feedback loop (describe → hear → describe again) is tight enough for live performance.

**Relevance to sandbox**: Directly inspires **`llm-pattern`** (needs ANTHROPIC_API_KEY — same dependency as `claude-shader`). Unlike `41-code-vis` (fixed DSL, user writes note-by-note), `llm-pattern` accepts a natural language description and returns a synthesized audio pattern. The LLM acts as a translator between musical intent and Web Audio node scheduling. Could be combined with `claude-shader` (same API key): describe a pattern AND a visualization at once — the full dream session design from a single natural language prompt. Not buildable until ANTHROPIC_API_KEY is confirmed in Vercel env.

---

### 165. Selective Auditory Attention Decoding via Consumer EEG (arxiv 2512.05528, Dec 2025)
**Source**: https://arxiv.org/abs/2512.05528

Research showing that selective auditory attention to musical elements (melody, rhythm, harmony) can be decoded from EEG signals captured with a 4-channel consumer EEG headset, even during real studio-produced music. Performance was above chance for novel songs and across unseen subjects. Applications identified: music education (training selective listening), wellness interventions promoting mindful music listening.

**Relevance to sandbox**: Not immediately browser-deployable (EEG hardware required). But the concept — attention to specific musical elements — translates to a **"guided listening"** prototype without EEG: **`listen-guide`**. Present a music excerpt and direct the listener's attention to a specific element each 15-second segment: "Now listen only to the bass." / "Notice the chord changes." / "What does the rhythm feel like?" The canvas highlights the corresponding FFT frequency region (bass bands glow for "listen to bass," etc.) and a visualization specific to that element fills the screen. A structured listening exercise that trains musical attention. Zero deps, zero API. Different from all 71 existing prototypes (they respond to audio input — this one directs the listener's perception of existing audio). One-cycle build. Not queued yet — but the research direction (active listening vs. passive reaction) is worth noting.

---

## 2026-05-21 — Cycle 95 research sweep

### 166. WebGPU MLS-MPM Fluid Simulation in the Browser (Feb 2025 — foundational, still frontier)
**Source**: https://tympanus.net/codrops/2025/02/26/webgpu-fluid-simulations-high-performance-real-time-rendering/ · https://github.com/matsuoka-601/webgpu-ocean · https://webgpu-ocean.netlify.app/

Open-source WebGPU fluid simulation using the **MLS-MPM** algorithm (Moving Least Squares Material Point Method) — the same hybrid particle-grid method used in Houdini's fluid solvers and the MPM solver behind Disney's "Frozen" snow. Unlike Navier-Stokes finite-difference (what `3-fluid` does), MLS-MPM handles fluid surfaces, splashes, and free surfaces natively. The browser implementation achieves ~100,000 particles at 60fps on integrated GPUs. Screen-Space Fluid Rendering (SSFR): depth + thickness maps → bilateral filter → surface normals → realistic water surface with reflection/refraction. Live demo at webgpu-ocean.netlify.app. MIT license. The author notes WebGPU's `atomicAdd` in compute shaders makes physics GPGPU "more intuitive" than WebGL. [foundational — Feb 2025, but browser-side MPM remains frontier tech through 2026]

**Could become a prototype**: **`84-wave-fluid`** — audio-reactive MLS-MPM WebGPU ocean surface. Bass energy = continuous particle injection (wave height), treble energy = surface turbulence parameter, onset = localized splash event (a wave burst at a random position). WGSL compute shader runs the MPM grid transfer + particle advection; fragment shader applies SSFR. The visual: Karel plays piano → bass notes swell the ocean → high notes fracture the surface → sudden attacks splash. Directly inspired by the Houdini "Paradigm GPU liquid solver" pattern (April 2026) and TD GLSL TOP fluid simulation. Zero API. WebGPU required (graceful fallback message). Two-cycle build.

---

### 167. Seedance 2.0 + Veo 3.1 + LTX-2.3 — Audio-Native Video Generation on fal.ai (2026)
**Source**: https://fal.ai/seedance-2.0 (April 9, 2026) · https://fal.ai/models/fal-ai/veo3.1 (Jan 2026) · https://fal.ai/models/fal-ai/ltx-2.3/text-to-video (Jan 2026)

Three new video generation models landed on fal.ai in Q1–Q2 2026, all with native audio synthesis — not separate post-processing, but audio generated in the same pass as the video. **Seedance 2.0** (`bytedance/seedance-2.0/image-to-video`) from ByteDance accepts text + image + audio inputs simultaneously; generates cinematic output with real-world physics, native audio, and director-level camera control. **Veo 3.1** (`fal-ai/veo3.1`) from Google DeepMind: 4K, built-in lip-sync, reference-to-video (up to 4 reference images), video extension to 148s, first/last frame control. Pricing: $0.40/s with audio at 1080p. **LTX-2.3** (`fal-ai/ltx-2.3/text-to-video`) from Lightricks: open source (Apache 2.0), cheapest at $0.04/s (fast, 1080p), 6-20 second output, native audio. All three meaningfully improve on the mid-2025 state of the art.

**Could become a prototype**: **`86-sound-to-video`** — extend `57-sound-to-image` with a second generation step: capture 10s of piano audio → emotional analysis (valence, arousal, tempo) → FLUX.2 Dev image ($0.012/MP) → LTX-2.3 fast video clip ($0.04/s × 6s = $0.24/clip). The image becomes the first frame; the audio analysis drives the motion prompt ("slow ethereal ripple, delicate piano, introspective, the landscape breathes"). Total cost: ~$0.25–0.35 per generation. This is "AI image gen INSIDE an AV experiment" exactly as Karel directed — the audio IS the generative input, not a parallel output. Two modes: standard (FLUX → LTX) and cinematic (FLUX → Veo 3.1 at higher budget). FAL_KEY in use. One-cycle build.

---

### 168. FLUX.2 + Nano Banana 2 — Next-Generation Image Models on fal.ai (2026)
**Source**: https://fal.ai/flux-2 · https://fal.ai/nano-banana-2 · https://fal.ai/models/fal-ai/nano-banana-2

Two major image generation upgrades landed on fal.ai in 2026. **FLUX.2** (Black Forest Labs, 32B parameters) replaces FLUX.1 Schnell across all quality tiers: Dev (`fal-ai/flux-2`, $0.012/MP), Pro (`fal-ai/flux-2-pro`, $0.03/MP), Flash variant (`fal-ai/flux-2/flash`, $0.005/MP, 8-step distilled, 6× faster than base). Major improvements over FLUX.1: better typography (crisp text rendering), hex color accuracy, and a notable quality jump at equivalent cost. **Nano Banana 2** (Google Gemini 3.1 Flash Image, `fal-ai/nano-banana-2`): reasoning-guided generation, character consistency across up to 5 people, accurate text rendering in multiple languages, multi-resolution output. Pricing: ~$0.015/image. Nano Banana Pro (Gemini 3 Pro Image, `fal-ai/nano-banana-pro`): $0.15/image, production quality, semantic understanding.

**Relevance to sandbox**: `57-sound-to-image`, `43-stable-extend`, `75-houdini-particle-flock` (queued) all use `fal-ai/flux/schnell` ($0.003/MP) — the cheapest but oldest generation. **Upgrade path**: swap `fal-ai/flux/schnell` → `fal-ai/flux-2/flash` in new prototypes for better quality at same cost tier ($0.005 vs $0.003/MP — +67% cost, visible quality jump). For the `86-sound-to-video` prototype, FLUX.2 Dev ($0.012/MP) is the right tier. Nano Banana 2 is a strong alternative to Flux Schnell for embedded image gen in AV experiments — reasoning-guided prompting means more intentional responses to audio analysis descriptions.

---

### 169. Marpi Studio — "New Nature" at ARTECHOUSE (2026) + Audio-Reactive Entity Technique
**Source**: https://www.artechouse.com/news/announcing-new-nature-by-marpi/ · https://new.marpi.pl/ · https://www.patreon.com/marpistudio

Marpi Studio's 2026 installation "New Nature" at ARTECHOUSE creates a procedurally generated ecosystem of entities — insects, plants, creatures — driven by visitor sensory input including sound. The artist describes the technique: "an experiment in randomness, mixing user input, pseudo random function generators, Perlin noise, Brownian motion, Voronoi patterns and realtime sound synthesizers, bringing infinite variation of moving shapes, sounds and colors." Each entity has internal state (a "metabolism") that sound drives: amplitude → growth rate, spectral centroid → color temperature, onset → reproduction events. The entities are not pre-designed shapes — they emerge from parameterized curve/segment systems with Voronoi adjacency graphs controlling spatial relationships. Multi-user: simultaneous visitors create simultaneous entities, their audio merging into a collective ecosystem.

**Could become a prototype**: **`88-marpi-void`** — a single audio-reactive organism living in a dark void. The organism is a radial structure: 8–16 "arms" extending from a central nucleus, each arm a Bezier curve with Perlin-noise-jittered control points. Nucleus size = sustained amplitude. Arm extension = bass energy. Arm curvature jitter = treble energy. Onset = a reproductive "bud" spawns at an arm tip, grows into a secondary organism over 3s. Each organism drifts slowly across the canvas under Brownian motion. After ~2 min, the canvas holds a small colony of organisms, each tracking a different frequency band. Color palette: violet (bass organisms) → cyan (mid) → rose (treble), following AGENT.md color tokens. WebGPU compute for curve updates; Canvas2D for stroke rendering. Zero API. One-cycle build.

---

### 170. Matchmaker — Open-Source Real-Time Piano Score Following (ISMIR 2025, Oct 2025)
**Source**: https://arxiv.org/abs/2510.10087 · ISMIR 2025 proceedings

Open-source Python library for real-time music alignment ("score following") — tracking a live piano performance against a known musical score, publishing a position cursor that advances in sync with the performer. Tested on ASAP, Batik, and Vienna4x22 piano datasets. Two algorithm families: dynamic programming and probabilistic models. Key insight: chromagram features (pitch class profiles) outperform raw spectral features for alignment accuracy and reduce latency — a direct connection to our existing `28-chord-canvas` chromagram work. While Python-based, the core algorithm (chromagram-based DTW matching) is ~100 lines of JS. The library outputs: current score position (beat index), tempo estimate, confidence metric, position error in beats. It's designed for live accompaniment systems — a human performer is followed in real time.

**Could become a prototype**: **`87-piano-transcript`** — real-time piano → flowing score transcription. Use YIN pitch detection (§156) + onset detection to capture note events from mic, build a running note list. Render as a living score: a Canvas2D "paper roll" that grows rightward as notes arrive. Each note drawn as a filled rectangle (height = pitch, width = duration). Color gradient: low notes = warm amber, high notes = cool violet (Resonance color tokens). When a phrase resolves (2-beat rest), the phrase is "finalized" with a subtle glow. The score accumulates over the session — by the end of a 5-minute improvisation you see the whole piece rendered as a piano-roll score. "Watch your improvisation become notation in real time." Zero API, zero deps, pure Web Audio + Canvas2D. One-cycle build. Aligns with Karel's direction to "use his real music as input" — this prototype captures whatever he plays live.


---

## 2026-05-22 — Cycle 117 research sweep

### 171. Veo 3 on fal.ai — Native Audio Video Generation (April–May 2026)
**Source**: https://fal.ai/models/fal-ai/veo3

Google's Veo 3 is now available on fal.ai. Standard endpoint (`fal-ai/veo3`): $0.50/s without audio, $0.75/s with native audio. Fast endpoint: $0.25/s without audio, $0.40/s with native audio. Native synchronized audio (dialogue, ambience, foley, music) generated in the same pass as the video — not post-processed or added separately. Text-to-video with 1080p output. Most expensive but highest quality available video generation option as of 2026.

**Relevance to sandbox**: The long-queued `ghost-animate` idea (cinematic Ghost short film) now has a clear implementation path. Ghost LoRA image → Veo 3 Fast ($0.40/s × 5–8s = $2–3.20/clip) generates a cinematic animated sequence with atmospheric audio synchronized. Budget per clip is ~$2–3.20. Admin-only gate via `guard(req)`. This closes the "Ghost needs motion" gap identified in the original brief. Inspires **`veo3-ghost`** prototype.

---

### 172. Seedance 2.0 on fal.ai — Budget Audio+Video (April 9, 2026)
**Source**: https://fal.ai/models/bytedance/seedance-2.0/image-to-video

ByteDance's Seedance 2.0 unified audio-video model. Endpoint: `bytedance/seedance-2.0/image-to-video`. Native audio + video in a single generation pass. Pricing: Fast variant $0.11–0.14/s including audio. Supports multi-shot editing and up to 9 reference images as keyframes. Director-level camera control. The most budget-friendly native audio+video option — approximately 3× cheaper than Veo 3 Fast.

**Relevance to sandbox**: For `veo3-ghost`, Seedance 2.0 is a strong budget alternative to Veo 3 (same native audio capability at ~1/3 the cost per second). A comparison mode (Seedance vs. Veo 3 Fast, same Ghost prompt) would be high-signal for Karel — analogous to the `81-cassette-speed` CassetteAI/ACE-Step comparison. Could extend `veo3-ghost` to a 2-panel comparison (Seedance Fast / Veo 3 Fast) if budget is approved.

---

### 173. ElevenMusic — AI Music Generation App and API (April 1, 2026)
**Source**: ElevenLabs product launch, April 2026

ElevenLabs launched ElevenMusic, an AI music generation application and API. Free tier: 7 songs per day via iOS app + API access. Text prompt → full song with vocals, instrumentation, and production. Pro tier: $9.99/mo for 500 tracks/mo. The API follows ElevenLabs' standard authentication pattern (ELEVENLABS_API_KEY, same as voice TTS). Quality focus: ElevenLabs positions ElevenMusic as production-quality music, not sketch-quality.

**Relevance to sandbox**: A fourth music generation backend for the sandbox alongside ACE-Step, CassetteAI, and existing voice TTS. Unlike ACE-Step (instrumental only) and CassetteAI (fast sketches), ElevenMusic generates full songs with vocals. Directly enables a `compose` upgrade for voiced music. The free tier (7/day) makes prototyping budget-friendly. Requires ELEVENLABS_API_KEY — if already in the Vercel environment (ElevenLabs TTS is integrated in Ghost prototypes, so the key may already be present), this is immediately buildable.

---

### 174. Artisans d'Idées — Immersive Garden (Awwwards SOTD 2026)
**Source**: https://artisansdidees.com · Awwwards Site of the Day 2026

Immersive Garden's "Artisans d'Idées" website was awarded Awwwards Site of the Day 2026. Key technique: "rendered almost entirely in shadow, with **audio coupled to camera state instead of a clock**." Every navigation gesture — scroll, orbit, dolly — carries acoustic weight. Sound design by Mooders. The innovation is the paradigm inversion: camera position IS the musical interface. You don't listen to music while navigating; your navigation IS the music. Low camera angle → bass foundation. High camera angle → treble air. Fast orbiting → rapid melodic phrases. Hovering stationary → sustained tones. The three.js scene renders ~12 scene "nodes" (workshop areas), each with its own acoustic identity activated as the camera approaches.

**Relevance to sandbox**: Most novel paradigm found in this research sweep. Directly inspires **`camera-song`**: a React Three Fiber scene with 6 glowing orbs representing Karel's 6 journey themes (Cosmic Homecoming, Earth Grounding, Inner Sanctuary, Ocean Breath, Snowflake, Ghost) arranged in 3D space. Camera azimuth + elevation selects the in-focus orb (front-center, maximum gain). Off-axis orbs receive inverse-angle gain falloff via Web Audio `PannerNode` (HRTF mode). As the user orbits with mouse, the music shifts continuously. "You're not playing music. You're walking through it." Zero new deps (R3F + drei + postprocessing already in the repo). One-cycle build.

---

### 175. Memo Akten — "The Thinking Ocean" (Whitney Museum artport, February 3, 2026)
**Source**: https://artport.whitney.org/commissions/the-thinking-ocean/

Memo Akten's "The Thinking Ocean," commissioned by the Whitney Museum artport (February 3, 2026). WebGPU + Three.js fluid simulation. "The motion of an abstract human form in the distance generates currents in the habitat — the ocean embodies agency and presence." The human figure's movement through the virtual ocean creates disturbance fields in the fluid. Audio component by Paige Emery — synthesized from the fluid velocity field, not played independently. Part of Akten's Cosmosapience series. The piece simulates a natural body of water shifting between fluid dynamics and computational code. WebGPU Consultant credited.

**Relevance to sandbox**: Presence-driven (not audio-driven) fluid generating audio from velocity — the inverse of the typical audio-reactive pattern. Inspires **`ocean-presence`**: a WebGPU fluid simulation driven by mouse/touch position (cursor = presence disturbance). Fluid flows around/toward the cursor. Fluid velocity field extracts synthesis parameters: high-velocity vortex regions → sine tones proportional to velocity magnitude; dense pressure zones → FM modulation depth; quiet still regions → ambient pad drone. Adapt MLS-MPM approach from `84-wave-fluid` (Cycle 107). Audio emerges from the physics, not from playback. Two-cycle build (WebGPU required).

---

### 176. DATALAND — Refik Anadol Museum of AI Arts (Opening June 20, 2026, Los Angeles)
**Source**: https://dataland.com · Opening announcement 2026

DATALAND opens June 20, 2026 in Los Angeles — the world's first Museum of AI Arts, founded by Refik Anadol. "Large Nature Model" trained on ecological data from the Smithsonian Institution and Cornell Lab of Ornithology. Featured exhibition: "Machine Dreams: Rainforest" across 5 galleries. The Infinity Room uses "World Models" — generative AI that comprehends real-world physics and spatial dynamics — to create the first immersive environment built using World Models. Each gallery generates emergent imagery from species interaction data: predator-prey relationships, migration patterns, climate cycles.

**Relevance to sandbox**: Multi-species ecosystem with emergent behavior generating both visuals and sound. Inspires **`ecosystem-sim`**: a 2D canvas ecosystem with 3–5 species (modeled as particle swarms, each with distinct behavior rules). Each species is sonified: population density → amplitude of a sustained pad tone, predator-prey interactions → percussive onset events, migration → pitch glide. User introduces disturbance (click = food source or predator event) and watches the ecosystem respond ecologically and acoustically. "The species interact; the sound emerges." Connects to Karel's "Earth Grounding" journey theme. Zero API. Two-cycle build.

---

### 177. Elekktronaut TouchDesigner Tutorial #65 — particlesGPU + camSequencer + CHOPs (May 12, 2026)
**Source**: https://www.youtube.com/@Elekktronaut / Tutorial #65

New Elekktronaut tutorial (May 12, 2026): extending the foundational audio-reactive particle cloud with **camSequencer** — a camera animation sequencing tool for TouchDesigner. Defines 6 preset camera positions as keyframes, uses a CHOP-driven trigger (onset beat detection from audio) to snap the camera hard to the next preset on each beat. The hard cut (zero interpolation) is intentional — it creates a cinematic "montage" effect vs. the smooth orbital follow common in music videos. Combined with particlesGPU, the result looks like professional VJ footage: particles flocking, hard-cut camera angles synced to drums. @FunctionStore's camSequencer tool credited. Tutorial available to Patreon supporters.

**Relevance to sandbox**: Direct inspiration for **`beat-cut`**: R3F particle flock (6,000 particles, Boids rules from `75-houdini-particle-flock` rebuilt standalone) + 6 preset camera positions as azimuth/elevation pairs (one per journey theme). An onset detector fires → `useFrame` immediately snaps drei `OrbitControls` to the next preset (no lerp — hard cut). Inter-onset tempo sets a cooldown so rapid beats snap fast; slow music changes angles slowly. Demo mode: 6 LFO oscillators at varied rates. Mic mode: live piano/drumming drives the cuts. Zero new deps (R3F + drei already installed). One-cycle build.

---

Key findings from Cycle 117 (2026-05-22):
- Veo 3 on fal.ai (§171) — $0.40/s Fast with native audio, `fal-ai/veo3`. Closes the ghost-animate gap. Inspires `veo3-ghost`.
- Seedance 2.0 (§172) — $0.11–0.14/s native audio+video, budget Veo 3 alternative. Ghost comparison candidate.
- ElevenMusic (§173) — ElevenLabs music API, April 2026, 7/day free, vocals included. Fourth music backend candidate.
- Artisans d'Idées (§174) — camera state IS the music interface (Awwwards SOTD 2026). Navigation = composition. Inspires `camera-song` (6 journey orbs, HRTF gain falloff by angle).
- Memo Akten "The Thinking Ocean" (§175) — presence-driven WebGPU fluid → audio from velocity field. Inspires `ocean-presence`.
- DATALAND (§176) — Refik Anadol Museum of AI Arts, June 2026, multi-species ecosystem + World Models. Inspires `ecosystem-sim`.
- Elekktronaut TD Tutorial #65 (§177) — camSequencer hard-cut beats. Inspires `beat-cut` (particles + onset-snapped camera presets, hard cut not orbit).

---

## 2026-05-23 — Cycle 126 kids research sweep

### 178. Bouncy — Minimal Physics Ball Plays Pentatonic Notes on Wall Collision (F-Droid, open-source)
**Source**: https://github.com/ebraminio/bouncy · https://f-droid.org/packages/io.github.ebraminio.bouncy/

A tiny open-source Android app: fling a ball, it bounces off the four walls, each collision triggers a note from the diatonic scale. Simple physics (elastic wall reflection, slight energy damping). No game logic, no goals — just perpetual bouncing music. Zero ads, zero tracking, ~15KB. The pentatonic version of this pattern would be appropriate for a kids prototype.

**Could become a prototype**: `kids-bounce-notes` — Canvas2D + Web Audio. One or more glowing balls bounce inside the canvas (gravity + elastic walls + slight energy loss). Each wall collision plays a pentatonic note (bottom wall = lowest, top = highest, left/right = mid register — or map collision velocity to note selection). Tap anywhere to spawn another ball (max 5). Colors match pitch register. All notes from C-major pentatonic so every collision sounds good. First physics-based prototype in the kids zone — the music is completely generative and self-playing; the child just adds more balls.

---

### 179. Shape Your Music — Draw Polygons, Hear Them Loop (shapeyourmusic.dev, Elias Jarzombek)
**Source**: https://shapeyourmusic.dev · https://github.com/ejarzo/Shape-Your-Music

Browser-native Web Audio app: draw any polygon on a canvas, a traversal point moves along its perimeter at constant speed, triggering a note at each vertex. Note pitch is determined by vertex Y position. Multiple shapes loop simultaneously (polyphony from drawing). Rate depends on perimeter length (small shapes = faster loops, large = slower). User can change tempo, mode (major/minor/pentatonic/dorian), key. Export as audio or MIDI. Built with React + Tone.js. GitHub repo active.

**Could become a prototype**: `kids-shape-loop` — simplified kids version. Draw any closed shape with a finger (lift to close). System detects direction-change points along the drawn path (corners, inflections) as note triggers, Y position = pitch (C-major pentatonic). Shape immediately starts looping. Multiple shapes stack. Tap-to-erase. No tempo or mode controls — just draw and hear. Different from `100-kids-paint-song` (linear path, plays once) and `104-kids-mirror-draw` (symmetry, bilateral path): this makes closed shapes that LOOP forever, enabling the child to build up a polyphonic composition by drawing overlapping loops.

---

### 180. BANDIMAL — Kalimba-Inspired "Bar Height = Pitch" Interaction (Apple Design Award 2018, Yatatoy)
**Source**: https://apps.apple.com/us/app/bandimal/id1065440354 · Fast Company review

Children's music app that received the Apple Design Award 2018. Key design principle: **bar HEIGHT = pitch, bar count = note count in loop**. Inspired by the African kalimba (thumb piano), where tine length determines pitch. No note names shown to children — just "longer bar = lower/longer note, shorter bar = higher/shorter note." Drag a bar up to raise it (higher note); down to lower it. Set up a drum loop, choose animals as instrument voices. Every note guaranteed in-key (pentatonic scale). Genuinely novel interaction model that teaches pitch through physical analogy (longer = lower, like a guitar string or piano key's length correlates to pitch).

**Could become a prototype**: `kids-kalimba` — 8 vertical glowing bars in a horizontal row. Tap any bar to pluck it (Karplus-Strong-style synthesis, same as `105-pluck-field` but simplified). Bar height = pitch (tallest bar = lowest note C2, shortest = highest note A4 — same visual-physical analogy as real kalimba tines). Drag a bar vertically to retune it while it plays. No note names shown. A gentle ambient pad in C-major plays from first tap. Bars light up and ripple on tap. Multi-touch: multiple bars play simultaneously. "Why it's fresh": directly extends the `82-kids-color-piano` paradigm (tap → note) but adds a *physical tuning model* the child can explore. The analogy is teachable without words.

---

### 181. CHI 2025 Touchscreen + Children Research — Self-Control Matters
**Source**: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1613625/full (Frontiers, 2025)

Systematic review of 47 studies (2015–2025) on touchscreen digital exposure and children's social development. Key finding for interactive music design: **when children operate the device themselves, they learn task mechanics through repetition; when caregivers operate, children focus on vocabulary/comprehension**. Implication: children's apps must give CHILDREN full control from the first tap — not "demo mode" followed by hand-off. A secondary finding: **collaborative multi-touch** (parent + child on same device) increases shared attention and joint referencing behavior compared to solo use. Both findings validate the design of `93-kids-share-screen` (two-finger joint play) and our "start screen → hand device to child" pattern.

**Relevance to sandbox**: No immediate new prototype, but validates: (1) our kids-first control model is correct; (2) `kids-share-screen` is the right direction for parent+child collaborative play — worth a polish cycle or a sequel. A `kids-share-screen-v2` with a more musical "conversation" (call-and-response between the two voices, not just simultaneous) would build directly on the joint-referencing finding.

---

### 182. Sound2Hap — Audio-to-Vibrotactile Haptic Generation (arxiv 2601.12245, Jan 2026)
**Source**: https://arxiv.org/abs/2601.12245 · Arizona State University

CNN-based model trained on 34 participants' vibration preference ratings across 1,000 diverse environmental sounds. Generates perceptually aligned vibrotactile haptic feedback from any audio signal. Beats signal-processing baselines on audio-vibration match. Published January 2026, dataset on HuggingFace.

**Relevance to sandbox**: Browser haptics are currently limited to the Web Vibration API, which supports only binary on/off patterns (no frequency or amplitude shaping). Not directly buildable in the dream zone today. **Monitor**: iOS 26's new Haptic Engine API (announced WWDC 2026, not yet web-exposed) may change this. When/if the browser Vibration API gains continuous waveform control, `kids-haptic-rhythm` becomes viable: tap a rhythm, feel the groove through the screen. Tag [emerging, not yet buildable].

---

### 183. Conducting Gesture → Music (arxiv 2604.27957, Apr 2026) + Soundbrenner Spark (kids wearable)
**Source**: https://arxiv.org/abs/2604.27957 · https://www.soundbrenner.com/blogs/articles/the-science-behind-why-kids-learn-music-better-with-haptic-feedback-soundbrenner-spark-preview

Two related findings: (1) Conducting gesture recognition paper (Apr 2026): real-time skeleton tracking from camera → live music tempo/dynamics control. MediaPipe HandLandmarker + velocity analysis extracts "conducting beat pattern" with 87ms latency. (2) Soundbrenner Spark: kid-sized wearable (ages 6-12) that converts rhythm to vibration for music practice. Demonstrates market demand for **embodied rhythm tools for children**.

**Could become a prototype**: `kids-conductor-wand` — a simplified, gesture-driven ensemble conductor that requires NO camera (avoids MediaPipe CDN dep and privacy considerations). Pure touch: drag a glowing wand across the screen. Y-position = register (high = bright treble voices, low = deep bass). Horizontal sweep speed = tempo (fast swipe = faster, slow drag = slower). Swipe in a leftward arc = strings; rightward arc = winds; quick center tap = percussion hit. 4 preset orchestras (Kids, Space, Forest, Ocean). The wand leaves a bright color trail as it moves. Zero deps, zero API, zero permissions — just a finger drawing musical "gestures." First prototype where the finger trajectory IS the conducting score.

---

Key findings from Cycle 126 (2026-05-23) — kids research sweep:
- Bouncy (§178, ebraminio) — physics ball + pentatonic wall notes, open-source. First physics-music prototype missing from kids zone. Inspires `kids-bounce-notes`.
- Shape Your Music (§179, shapeyourmusic.dev) — draw polygon → looping melody, polyphonic. Inspires `kids-shape-loop` (simplified: closed drawn path → looping notes).
- BANDIMAL (§180, Apple Design Award 2018) — bar height = pitch, kalimba design, zero note literacy needed. Inspires `kids-kalimba` — the most Resonance-aligned new kids prototype.
- CHI 2025 touchscreen review (§181) — children learn best when self-controlling; collaborative multi-touch increases joint attention. Validates kids-first design; suggests `kids-share-screen-v2` call-and-response sequel.
- Sound2Hap (§182, arxiv 2601.12245, Jan 2026) — audio→haptic CNN. Browser Vibration API too coarse for this today; tag [emerging]. Monitor iOS 26 Haptic Engine API.
- Conducting gesture paper (§183, arxiv 2604.27957, Apr 2026) — skeleton tracking → tempo/dynamics, 87ms. Inspires `kids-conductor-wand` (touch-only, no MediaPipe, pure finger gesture).

---

## 2026-05-23 — Cycle 129 adult research sweep

### 184. Break-the-Beat! — Controllable MIDI-to-Drum Synthesis with Timbral Reference (arxiv 2605.14555, May 2026)
**Source**: https://arxiv.org/abs/2605.14555 · [Freshest paper this cycle — May 2026]

Break-the-Beat! fine-tunes a pre-trained text-to-audio model to synthesize drum audio from MIDI input while adopting the timbre of a reference audio sample. Given a MIDI drum pattern + a reference drum recording, it renders the MIDI with the sonic character of the reference — enabling sample-library-free, timbral-customizable polyphonic drum synthesis. The model uses a content encoder and hybrid conditioning mechanism to bridge MIDI input and audio output. Evaluated on audio quality, rhythmic alignment, and beat continuity.

**Could become a prototype**: `midi-drum-forge` — an 8-row × 16-step sequencer where each drum row can be "timbral-imprinted" by dragging a WAV sample file onto it. In-browser approximation: spectral envelope estimation (FFT magnitude profile of the reference sample) + AudioBuffer resampling at each step's start position shapes the synthesized percussive burst toward the reference character. Demo loads 4 preset timbres (acoustic kick, electronic snare, jazz hi-hat, lo-fi clap). Rows color-coded; loop plays via `AudioContext.currentTime` scheduling. BPM slider. First drum/rhythm prototype in the sandbox. Zero new npm deps. One-cycle build. Research basis: §184.

---

### 185. LUMIA — Handheld Camera as Compositional Instrument (arxiv 2512.17228, December 2025)
**Source**: https://arxiv.org/abs/2512.17228 · December 2025

LUMIA enables "composition through looking" — users point a device camera at their environment; a vision-language model analyzes the imagery and generates structured prompts that feed a text-to-music pipeline (Stable Audio), producing loopable musical segments that can be layered in real-time. The paradigm shift: music-making through framing and perceiving rather than parameter programming. The system performs embodied musical composition — your attention (where you look) is the score.

**Could become a prototype**: `webcam-compose` — camera as synthesizer controller, zero API, zero ML inference. Webcam → `getImageData()` frame analysis → extract 4 zone average HSL values (top-left, top-right, bottom-left, bottom-right) → map directly to synthesizer parameters: dominant hue → chord quality (warm 0°–60° = major, cool 180°–270° = minor), brightness → register (dark = bass, bright = treble), saturation → harmonic richness (1–6 simultaneous OscillatorNodes), frame-delta brightness → effective tempo (static = 40 BPM, changing = 120 BPM). Canvas split: left = live camera feed with color-zone overlays, right = audio-reactive 6-band bloom ring (`1-live` style). "Point your camera at anything — it becomes music." Webcam permission required; graceful fallback to LFO demo mode. Zero API, zero external deps. One-cycle build. Directly inspired by LUMIA's "compose through looking" paradigm but achieved without any server inference.

---

### 186. WebGPU SPH Ocean — Smoothed Particle Hydrodynamics at 60 FPS in Browser (2025–2026)
**Source**: https://github.com/jeantimex/fluid · https://github.com/matsuoka-601/WebGPU-Ocean · 2025–2026

Two independent open-source projects implement WebGPU SPH (Smoothed Particle Hydrodynamics) fluid simulations running at 60 FPS in the browser. Unlike ping-pong texture advection (used in `107-ocean-presence`), SPH explicitly simulates each fluid particle's position, velocity, and pressure forces — producing physically accurate vortex formation, splash dynamics, and surface tension. GPU spatial sorting via parallel Prefix-Sum enables 10,000–50,000 particles at 60 FPS with WebGPU compute shaders. Neither project is audio-reactive — that gap is wide open.

**Could become a prototype**: `sph-ocean-av` — port the jeantimex/fluid SPH compute shader pipeline and add audio pressure events: bass energy → inverted gravity field (fluid rises instead of falls); onset → explosion pressure impulse at a random position; spectral centroid → particle color (low centroid = blue, high = red); mic amplitude → fluid viscosity (quiet = thick/slow, loud = runny/fast). The result is physically accurate fluid dynamics that respond to music — qualitatively different from `107-ocean-presence`'s visual-only advection: real particle collisions, surface tension, vortex streets. WebGPU required. Two-cycle build (SPH port is non-trivial). Zero deps (pure WGSL compute shaders). Needs Karel OK on complexity. See jeantimex/fluid for reference WGSL code.

---

### 187. Superradiance — Embodied Simulation: Bodies in Living Landscapes (Memo Akten + Katie Hofstadter, Feb 2026)
**Source**: https://grayarea.org/exhibitions/superradiance-memo-akten-katie-hofstadter/ · Gray Area San Francisco, Feb 11–15, 2026

Superradiance (Gray Area SF, Feb 2026) uses "embodied simulation" — invisible dancers are embedded in AI-generated forests, oceans, and deserts so that viewers feel the dancers' movements in their own bodies. Generative AI, game engines, and code weave simulated landscapes with captured dance performance into a multi-channel large-format film experience. The core technique: biometric data from performers (movement, breath, rhythm) drives procedural landscape deformation, making the environment an extension of the body. [Date verified: Feb 11–15, 2026, Gray Area San Francisco.]

**Could become a prototype**: `landscape-resonance` — a full-canvas procedural 3D landscape (simplex-noise terrain rendered via WebGL GLSL, camera flying forward over rolling hills) where audio energy deforms the terrain in real-time: bass energy → terrain height scale (loud bass = towering peaks); treble → surface roughness (high frequency noise texture on terrain mesh); onset → lightning flash + brief terrain inversion; mic amplitude → atmospheric fog density. The landscape breathes and deforms with the music — inspired by Superradiance's technique of making the environment respond to the performer's body. Different from all existing fluid/particle prototypes: a recognizable 3D landscape, not abstract geometry. Flying-through perspective gives live-performance projector-screen quality. Zero deps (WebGL + GLSL). One-cycle build.

---

### 188. DATALAND — World's First AI Arts Museum + Large Nature Model (Refik Anadol, June 2026)
**Source**: https://dataland.art · https://www.npr.org/2026/04/25/nx-s1-5799511/dataland-refik-anadol-los-angeles-ai-art-museum · Opens June 20, 2026

Refik Anadol opens DATALAND, the world's first Museum of AI Arts, on June 20, 2026 in downtown Los Angeles (The Grand LA, Frank Gehry building). The inaugural exhibition "Machine Dreams: Rainforest" uses his Large Nature Model (LNM) — open-source, trained on millions of ecological images and sounds from 16 rainforests, the Smithsonian, Cornell Lab of Ornithology, Getty, iNaturalist, and London's Natural History Museum — to generate "digital sculptures" of alternate, possible rainforests that evolve continuously based on interaction. Five multi-sensory galleries: data becomes pigment. [Date verified: NPR article April 25, 2026; museum opening confirmed June 20, 2026.]

**Could become a prototype**: `bio-echo` — mic input → real-time 6-band FFT → generates an "ecological" generative canvas animated from audio energy. Five visual layers that mirror five ecological strata: (1) sub-bass → soil/root tendrils growing upward from the canvas bottom (dark violet particle paths); (2) low-mid → tree trunk column (amber vertical strokes that grow tallest at peak bass); (3) mid → canopy particle system (emerald leaf-like particles swirling at mid-height); (4) high-mid → bird arc trajectories (white curved short trails at top of canvas, each onset fires one bird arc); (5) treble → sky shimmer (small star-like dots, density = treble energy). The canvas accumulates over the session — by the end of a piano piece, a living forest has grown. Download as PNG. Zero deps, zero API. One-cycle build. "Your music grows a forest." Inspired by Anadol's metaphor of data as pigment, ecological structure as visual grammar.

---

### 189. Pay Cross-Attention to Melody — Single-Encoder Melodic Harmonization (arxiv 2601.16150, January 2026)
**Source**: https://arxiv.org/abs/2601.16150 · January 2026

A transformer-based system for automatic melodic harmonization using "curriculum masking" and a single shared encoder for both melody and harmony representations. Unlike dual-encoder architectures, the single-encoder approach learns the relationship between melodic and harmonic material in a shared representation space, enabling coherent chord-melody integration. Trained on the HookTheory dataset; evaluated on chord diversity, harmony-melody alignment, and rhythmic coherence. The result: given partial melody input, the system can predict plausible chord progressions mid-phrase — not just detect what's already there.

**Could become a prototype**: `live-harmonize` — mic → autocorrelation pitch detection (same as `13-piano-canvas`) accumulates the last 4 detected notes → template-matches against 24 built-in progressions (I-IV-V-vi, ii-V-I jazz, I-V-vi-IV, III-IV-I-V, etc.) → finds the best-fit chord given the partial phrase → synthesizes the predicted chord via OscillatorNode stack (sustained, soft, panned slightly left at −15°) while the user's detected melody note plays at center. Three-panel display: top = detected melody (mini piano roll, warm orange bars), bottom left = predicted harmony (chord name in large type, e.g. "Am"), bottom right = chromagram showing all 12 pitch classes. Key label updates live. "You play a melody — the system supplies the harmony, live." Distinct from `28-chord-canvas` (detects chords from what IS playing) — this predicts what chord would fit the melody phrase so far, even mid-phrase. Zero deps. One-cycle build.

---

### 190. Audio-Visual Intelligence in Large Foundation Models — Survey (arxiv 2605.04045, May 2026)
**Source**: https://arxiv.org/abs/2605.04045 · May 2026

Comprehensive survey of how foundation models integrate audio and visual data — submitted May 2026, covering three capability tiers: understanding (speech recognition, sound localization, audio-visual correspondence), generation (audio-driven video synthesis, video-to-audio), and interaction (dialogue agents, embodied AI interfaces). Identifies "embodied agentic interfaces" — systems that see AND hear to produce behavioral outputs — as the current open frontier. Cross-modal attention fusion and multimodal tokenization are the dominant technical approaches. [Date verified: May 2026, arxiv submission.]

**Relevance to Resonance**: Confirms the trajectory of AV AI is toward embodied, interactive, agent-mediated interfaces — Karel's "what does Resonance look like as an immersive installation" question is the correct forward direction. The "interaction" tier (embodied agents that see + hear) is where the sandbox has barely explored — `webcam-compose` (§185) is the first prototype in this space without server inference. Long-term: a Resonance "AV agent" that perceives the room's visual environment and adapts the audio-visual session arc in real-time. No new prototype yet; note direction for future research cycles. [older-research: tag if revisited — this is a survey, moves slowly]

---

Key findings from Cycle 129 (2026-05-23) — adult research sweep:
- Break-the-Beat! (§184, arxiv 2605.14555, May 2026) — MIDI pattern + reference audio timbre → drum synthesis. Freshest paper this cycle. Inspires `midi-drum-forge` (step sequencer + timbral imprinting, in-browser approximation via AudioBuffer).
- LUMIA (§185, arxiv 2512.17228, Dec 2025) — handheld camera → music generation. "Compose through looking." Inspires `webcam-compose` — pure image analysis → synthesizer control, zero API, zero ML, one cycle.
- WebGPU SPH Ocean (§186, GitHub, 2025–2026) — physically accurate SPH fluid at 60 FPS in browser. Neither existing project is audio-reactive — obvious gap. Inspires `sph-ocean-av` (audio pressure events → particle physics). Two-cycle build.
- Superradiance (§187, Memo Akten, Feb 2026 Gray Area SF) — embodied simulation: invisible dancers in AI-generated landscapes. Inspires `landscape-resonance` — procedural terrain that breathes with music. Zero deps, one cycle.
- DATALAND (§188, Refik Anadol, opens June 20 2026 LA) — Large Nature Model, ecological data as pigment. Inspires `bio-echo` — mic → ecological canvas (bass=roots, mid=canopy, treble=birds). Zero deps, one cycle.
- Pay Cross-Attention to Melody (§189, arxiv 2601.16150, Jan 2026) — single-encoder harmonization, mid-phrase chord prediction. Inspires `live-harmonize` — predict harmony from partial melody, not just detect existing chords. Zero deps, one cycle.
- Audio-Visual Foundation Models Survey (§190, arxiv 2605.04045, May 2026) — confirms embodied AV agents as the open frontier. Directional signal for future research; no immediate prototype.
- **Strongest next-cycle kids build**: `kids-kalimba` — one-cycle, zero deps, zero API, BANDIMAL-inspired, directly extends loved `82-kids-color-piano` paradigm.

---

## 2026-05-23 — Cycle 137 adult research sweep

### 191. MusicRFM — Real-Time Latent Steering of Frozen Music Generation Models (ICLR 2026, arxiv 2510.19127)
**Source**: https://arxiv.org/abs/2510.19127 · Published ICLR 2026

Trains lightweight Recursive Feature Machine (RFM) probes on MusicGen-Large's 48 decoder blocks to discover "concept directions" for music-theoretic attributes: chord quality (major/minor/diminished/augmented), scale mode (Dorian, Mixolydian, etc.), and intervallic relationships (perfect fifth, tritone). During inference, discovered directions are injected back into the model's hidden states — steering output without retraining, without extra inference passes. Crucially: **time-based schedules** modulate steering strength over the generation timeline — linear fades, sinusoidal patterns, stochastic on/off bursts. A chord quality can fade from "bright major" (strength 1.0) to "minor" (strength 0.0) over 10 seconds during an active 30-second generation.

**Could become a prototype**: `arc-steer` — a 6-phase journey arc editor. Each phase gets a mood descriptor (editable textarea): "sparse major, introspective" → "building minor, rhythmic" → "dense chromatic, tense" → "bright peak, triumphant" → "bittersweet descending, resolving" → "open fifth, silence fading." Click ▶ Start Journey → sends each descriptor in sequence to ACE-Step on fal.ai (30s × 6 = 3-minute journey arc, ~$0.036). Each 30s chunk streams through the bloom visualizer; phase indicators advance live. The user has authored the emotional arc; the AI realized it as music. No direct activation steering (no browser API for that), but the text-prompt chain approximates MusicRFM's temporal steering schedule concept. FAL_KEY in use. One-cycle build.

---

### 192. Ryoji Ikeda — data-cosm [n°1] (180 Studios London, Oct 2025 – Feb 2026)
**Source**: https://www.180studios.com/data-cosm · https://www.factmag.com/2025/10/08/ryoji-ikeda-data-cosm-no-1-180-studios/ · [older, foundational]

Immersive audio-visual installation charting the full spectrum of data in nature — from quantum/particle physics to astrophysical scale — rendered with mathematical precision. Visitors lie under a vast LED ceiling while a torrent of data begins at the microscopic level (particle tracks, collision matrices) and gradually zooms outward (atomic, molecular, geological, cosmic web). Aesthetic: pure monochrome — white scrolling monospace number matrices on black, fragmenting and reforming. Audio: Ikeda's signature sub-bass hum (felt more than heard), sharp piercing high-frequency sine tones, rhythmic data-burst clicks. Extended by popular demand from October 2025 to February 2026.

**Could become a prototype**: `data-cosm` — synthetic particle physics event stream as audio-visual material. The visual: a full-canvas grid of monospace white text on black; rows scroll upward showing synthetic event data (particle type label, energy, momentum components, eta, phi — all synthetic but formatted exactly as CERN CMS output). Each "collision" event triggers: 300ms text scatter animation (each number flies to a random offset and snaps back), a 4kHz sine pulse (30ms attack, 80ms decay, gain 0.3), and a brief white particle trail. Continuous sub-bass at 38Hz (OscillatorNode gain 0.06) underlies. Three "scales" advance every 40s via timeline indicator: Quantum (fast, dense events, high sine), Biological (slow, sparse, mid sine 440Hz), Cosmic (very slow, single events, sub-bass only). Typography: `font-mono`, 9px rows for the matrix, 48px for the current scale label. Transition between scales: a full-canvas white flash + all numbers scatter. "What if all of nature's data is the same material?" Zero deps, zero API. One-cycle build. Research basis: §192.

---

### 193. Memo Akten & Katie Hofstadter — "The Thinking Ocean" (Whitney Museum Artport, 2026)
**Source**: https://whitney.org/exhibitions/the-thinking-ocean · Whitney Museum commission, 2026

A web-based artwork (Cosmosapience series) using WebGPU API + Navier-Stokes equations to simulate a dynamic body of water that morphs between realistic ocean and abstract data patterns — "demonstrating that fluids and computers are expressions of the same underlying principles." A faintly visible humanoid form generates fluid currents; drifting clouds of particulate matter and swirling bubbles populate the scene. As viewers navigate, the environment becomes increasingly abstracted into patterns resembling cellular structures, circuitry, and code. A real-time generative non-linear poem accompanies — dynamically generated voice/text that shifts as the fluid state changes. Requires recent Apple operating systems for WebGPU. [Date: 2026, Whitney Artport commission, current.]

**Could become a prototype**: `poem-fluid` — WebGL Navier-Stokes fluid (same ping-pong texture approach as `3-fluid`) with a generative Markov text overlay keyed to fluid vorticity magnitude. Mouse/touch disturbs the fluid. A vorticity compute pass (curl of velocity field) produces a scalar vorticity map; the max vorticity in any cell drives the poem display state: `vorticity < 0.1` → long full sentence from Ghost narrative (e.g., "The resonance here is ancient — let yourself be absorbed."); `0.1–0.4` → short 3-5 word phrase; `vorticity > 0.4` → single isolated word. 40 pre-written fragments from the 6 Ghost scenes. Text renders at minimum `text-white/80` opacity, `font-mono`, centered, `text-2xl`. A `mix-blend-mode: screen` CSS property lets the text glow through the dark fluid. When vorticity drops back to zero (fluid stills), the text fades over 3s. "The fluid speaks in fragments." Zero deps, zero API. One-cycle build. Research basis: §193.

---

### 194. Elekktronaut — Audioreactive Particle Cloud (New) (TouchDesigner, 2026)
**Source**: https://www.elekktronaut.com/tutorials/audioreactive-particle-cloud-new · 2026 tutorial update

Bileam Tschepe's updated Audioreactive Particle Cloud tutorial: particlesGPU component in TouchDesigner combined with CHOP (audio Channel Operator) analysis — per-frequency-band audio energy drives particle birth rate, velocity injection, color hue, and size per particle species. Each audio band = one species; species coexist on screen simultaneously. The particlesGPU component is GPU-native in TD; particles live in texture memory (position/velocity as rgba16float render textures). CHOPs provide frame-by-frame scalar values per band. This is exactly the TouchDesigner equivalent of: `AnalyserNode.getByteFrequencyData()` → uniform buffer → WebGPU compute shader → per-species velocity injection.

**WebGPU port approach**: A flat `struct Particle { vec2 pos; vec2 vel; float age; float species; }` buffer. Compute shader reads `band_energy[6]` uniforms each frame (from JS-side FFT). Per-species physics in the compute shader: species 0 (sub-bass) → strong downward gravity, large radius, slow birth rate; species 5 (treble) → no gravity, tiny radius, fast birth rate, repulsive neighbor force. 2,000 particles × 6 species = 12,000 total. Render pass: instanced quads with per-particle color from `species` attribute. The visual: 6 simultaneous glowing particle clouds, each responding to one frequency band, physically distinct from each other.

**Could become a prototype**: `audio-cloud` — 6-species audio-reactive WebGPU particle cloud, Elekktronaut technique ported to browser. Zero API, zero npm deps (raw WebGPU). Demo mode: 6 LFO oscillators. Mic mode: live FFT. Camera slow-rotates via `requestAnimationFrame`. Different from `75-houdini-particle-flock` (Boids flocking, journey-themed, R3F) — this is pure physics per species, no flocking. The behavior difference is subtle but real: bass particles literally fall (gravity), treble particles scatter (repel). Two-cycle build (compute shader setup complex). WebGPU required. Research basis: §194.

---

### 195. MediaPipe PoseLandmarker — Full-Body Music Control in the Browser (confirmed 2026)
**Source**: https://bristolbathcreative.org/article/mediapipe-to-osc-camera-based-motion-tracking-for-expanded-performance · https://mediapipe.org/ · 2026

MediaPipe PoseLandmarker tracks 33 body landmarks (head to feet) at 30fps, entirely in-browser via WebAssembly + WebGPU acceleration. Model available via CDN (~8MB one-time download, `@mediapipe/tasks-vision` from jsDelivr). Bristol+Bath Creative R&D's mediapipe2osc project demonstrates streaming these landmarks to audio environments (Max/MSP, JUCE) via OSC. For a browser prototype, the OSC layer is unnecessary — landmarks can drive synthesizer parameters directly in the same JS context. The 33 landmark coordinates give: hand positions (8 per hand), elbow angles, shoulder width, hip position, knee bend, foot position, and full-body movement velocity (frame-delta of all 33 points).

**Could become a prototype**: `body-conductor` — webcam → MediaPipe PoseLandmarker (CDN, same approach as `31-gesture-music` HandLandmarker) → 33 body landmarks → synthesizer. Mapping: right wrist Y → melody pitch (C2–C7, pentatonic snapping); left wrist Y → bass drone frequency; wrist-to-wrist horizontal distance → stereo width (arms wide = ±0.8 pan, arms together = mono); right elbow angle (forearm-to-upper-arm) → harmonic richness (1–6 OscillatorNode harmonics); hip center Y → register (crouching = bass, standing = treble); overall body motion (sum of frame-delta across all 33 points) → amplitude envelope + arpeggiation speed. Canvas: webcam feed with skeleton overlay (glowing violet joint dots + connection lines in Resonance color) + secondary bloom strip. "Dance and the music follows." CDN dep ~8MB; needs Karel OK. One-cycle build. Research basis: §195.

---

### 196. Mozualization — Multimodal Music Creation via Image, Text, and Audio Input (arxiv 2504.13891, April 2026)
**Source**: https://arxiv.org/abs/2504.13891 · April 2026

A music creation and editing system that accepts diverse multimodal inputs — keywords, images, audio clips (music segments, environmental sounds) — and transforms them into cohesive multi-style compositions. Rooted in how humans naturally express emotion across modalities: visual tone (warm/cool images), textual mood (mood-descriptive text), sonic atmosphere (reference sounds). Validated via user study (9 music enthusiasts); high ratings for engagement and emotional impact. No browser API available; server-side ML pipeline. [Date: April 2026, arxiv preprint.]

**Could become a prototype**: `image-chord` — a zero-dep, zero-API conceptual port. User drags a photo onto the canvas or picks from 8 preset palette swatches (one per journey theme). JS extracts the dominant hue (H), average saturation (S), and average brightness (L) from the image/swatch via `getImageData()`. Synthesis mappings: H angle → chord quality (0°–60° warm orange/red = major, 120°–180° green = minor, 210°–270° cool blue/violet = minor 7th, 280°–360° violet/magenta = diminished/mystery); S → harmonic richness (desaturated = 1 voice, saturated = 5 voices + subtle delay); L → register and tempo (dark = bass, slow arpeggios; bright = treble, fast arpeggios). Four sustained OscillatorNode voices per chord tone + gain modulation. Canvas shows the image/swatch behind an animated FFT bloom. "Your visual sense becomes music." Distinct from `38-mood-xy` (explicit arousal/valence control) — this is implicit: choose an image, music emerges without theory knowledge. One-cycle build. Research basis: §196.

---

Key findings from Cycle 137 (2026-05-23) — adult research sweep:
- MusicRFM (§191, ICLR 2026, arxiv 2510.19127) — RFM probe steering of frozen MusicGen for real-time chord/scale control with time-based schedules. No browser API. Concept inspires `arc-steer`: text mood descriptors per journey phase → ACE-Step call chain → 3-minute musical arc. FAL_KEY in use.
- Ryoji Ikeda data-cosm (§192, 180 Studios Oct 2025–Feb 2026) [older, foundational] — particle physics to cosmic scale as mathematical AV material. White monospace matrix scrolling on black + sub-bass + sine tones. Inspires `data-cosm`: synthetic event data stream + Ikeda aesthetic. Zero deps, one cycle, HIGHEST surprise of this batch.
- Memo Akten "The Thinking Ocean" (§193, Whitney Artport 2026) — WebGPU Navier-Stokes fluid + generative real-time poem keyed to vorticity state. Inspires `poem-fluid`: WebGL fluid + Markov Ghost narrative text overlay. Zero deps, one cycle.
- Elekktronaut particlesGPU + CHOP audio (§194, elekktronaut.com 2026) — TD tutorial: per-band audio energy → particle species physics. Port to WebGPU: `band_energy[6]` uniforms → 6-species particle compute shader. Inspires `audio-cloud`. Zero deps, two cycles, WebGPU required.
- MediaPipe PoseLandmarker (§195, confirmed 2026) — 33 body landmarks at 30fps, CDN-loadable. Inspires `body-conductor`: full-body pose → synthesizer. CDN dep ~8MB. One cycle, needs Karel OK on CDN.
- Mozualization (§196, arxiv 2504.13891, April 2026) — multimodal image/text/audio → music gen. Zero-dep port inspires `image-chord`: drag image → extract HSL → chord quality/richness/tempo/register. One cycle, zero deps, zero API.
- Refik Anadol Latent City [context, not new prototype] (BRUSK Bruges, May 8–Nov 8 2026) — centuries of city data + real-time urban rhythms → AI-driven immersive environments. Confirms the "accumulated data as visual pigment" trajectory Karel values. `data-cosm` and `bio-echo` are the browser-native equivalents.
- **Strongest next adult build**: `data-cosm` — zero deps, zero API, one cycle, Ikeda aesthetic completely new to sandbox. Second: `poem-fluid` (fluid already well-explored, but poem layer is genuinely novel).
- **Strongest next kids build**: check KIDS.md; `kids-bloom-garden` was the top candidate from Cycle 136 notes.

---

## 2026-05-24 — Cycle 151 research sweep

### 197. Lyria 3 Pro on fal.ai — Google's Music Model Now via FAL_KEY (May 2026)
**Source**: https://fal.ai/models/fal-ai/lyria3/pro · May 2026

Lyria 3 Pro is now available directly on fal.ai as `fal-ai/lyria3/pro` at **$0.08/generation**, using FAL_KEY (already in use). Previously, Lyria was only accessible via Google AI Studio / Gemini API — the MORNING.md open question "GEMINI_API_KEY: unlocks 30-lyria-jam, 43-lyria-ghost, 44-binaural-lyria" is now **resolved**: none of those prototypes require a GEMINI_API_KEY anymore. Input: a text prompt describing the desired music. Output: MP3 + metadata including detected BPM. The API follows the same fal.subscribe pattern as ACE-Step and MiniMax. Generation time: ~5–10s for a 30s clip.

**Could become a prototype**: `128-lyria3-journey` — six Ghost scene preset prompts → Lyria 3 Pro → 30s MP3 → bloom visualizer with BPM-synced animation. Zero new npm deps. FAL_KEY in use. One-cycle build. Also unblocks `43-lyria-ghost` (previously needed GEMINI_API_KEY, now buildable with FAL_KEY version). Upgrade `30-lyria-jam` similarly.

---

### 198. Live Music Diffusion Models — Real-Time Interactive Music Generation on Consumer Hardware (arXiv:2605.22717, May 21, 2026)
**Source**: https://arxiv.org/abs/2605.22717 · May 21, 2026 (3 days ago)

Live Music Diffusion Models (LMDMs) adapt audio diffusion models for real-time interactive music generation on a consumer gaming laptop using block-wise KV Caching. Unlike offline diffusion models with bidirectional processing, LMDMs generate incrementally in streaming blocks. Applications demonstrated: text-conditioned generation, sketch-based synthesis, live musician **jamming**, and — the most interesting for Resonance — a "generative delay" mode where the system listens to an improvised phrase and responds with a transformed musical echo after a short buffer delay. The post-training "ARC-Forcing paradigm" reduces error accumulation without explicit RL. No browser deployment yet, but the architecture (block-wise streaming) is conceptually similar to ACE-Step's generation approach, and the "generative delay" concept is directly prototype-able via ACE-Step + chroma analysis.

**Could become a prototype**: `132-lmdm-echo` — user plays piano via mic → phrase captured (4–8 bars) → chroma analysis extracts harmonic character → constructs ACE-Step style prompt → generates 30s "echo" response → plays alongside original (left = original panned, right = echo panned). "The piano echoes back — transformed." FAL_KEY in use, $0.006/echo. Different from `vocal-bgm` (which uses audio-to-audio remix of the raw signal) — this uses harmonic analysis to generate a compositional response. One-cycle build. [Date: May 21, 2026 — 3 days ago, freshest paper this cycle.]

---

### 199. Pixal3D — SIGGRAPH 2026: Single Image → High-Fidelity 3D GLB Model (May 2026)
**Source**: https://github.com/TencentARC/Pixal3D · https://fal.ai/models/fal-ai/pixal3d · SIGGRAPH 2026 (May 2026 release on fal.ai)

Pixal3D (TencentARC, accepted SIGGRAPH 2026) converts a single 2D image into a high-fidelity 3D GLB model by back-projecting pixel features into 3D space rather than loosely injecting via attention — achieving near-reconstruction-level fidelity with detailed geometry and PBR textures. Updated May 2026 on an improved Trellis.2 backbone. Available on fal.ai as `fal-ai/pixal3d` with three tiers: 1024p ($0.30), 2048p ($0.42), 4096p ($0.42). Accepts JPEG/PNG/WebP. Output: a `.glb` file loadable in Three.js via `GLTFLoader` (already installed via `@react-three/drei`'s `useGLTF` hook). Processing time: ~15–30s.

**Could become a prototype**: `129-ghost-3d-orbit` — Admin-only. Generate Ghost LoRA image via existing `/api/ai-image/generate` → pass URL to `fal-ai/pixal3d` ($0.30) → receive GLB → load in R3F scene via `useGLTF` → audio-reactive displacement (bass → subtle scale pulse, treble → vertex shimmer via TSL positionNode) → OrbitControls → bloom post-processing. "The Ghost character becomes a 3D sculpture you can orbit." First prototype that makes the Ghost image spatial and interactive. Zero new npm deps (drei, three, R3F all installed). Budget: ~$0.30 + Ghost LoRA cost. FAL_KEY in use. Two-cycle build (GLB loading + audio displacement). [Date: SIGGRAPH 2026 accepted + May 2026 fal.ai release.]

---

### 200. Three.js TSL Compute Shaders — Production-Ready Particle Physics Without WGSL Strings (Jan 2026, confirmed baseline)
**Source**: https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/ · Jan 2026

The Maxime Heckel "Field Guide to TSL and WebGPU" documents how Three.js TSL (Three Shading Language) now exposes compute shaders via pure JavaScript node syntax — no raw WGSL string-writing needed. `Fn(() => { ... })` defines a compute kernel; `instancedMesh` + `storageObject` replaces the old FBO-based GPGPU hack entirely. The blog demonstrates a 50,000-particle Lorenz attractor implemented in ~50 lines of TSL JavaScript, running at 60fps. Key insight: storage buffers for particle state (position, velocity, age) + compute dispatch for physics update + instanced render pass = the full GPU particle pipeline, clean and readable. Post-processing with compute shaders (Sobel edge detection pre-pass) shows additional capability. WebGPU Baseline as of January 2026 (all major browsers + Safari 26 on iOS). [Date: Jan 2026 blog post, confirmed 2026 baseline.]

**Could become a prototype**: `130-tsl-particle-compute` — 50,000 particles following a Lorenz strange attractor using TSL compute shaders (the clean approach vs. `16-particle-life-gpu`'s FBO hack). Bass energy → σ (Lorenz sigma parameter), treble → ρ (rho), onset → positional scatter. Color from particle speed magnitude. OrbitControls. Zero new deps (three@0.182 + R3F already installed). WebGPU required (graceful fallback to `10-strange`). One-cycle build. This also simplifies the `audio-cloud` two-cycle plan: the TSL approach makes per-species compute shaders achievable in a single cycle.

---

### 201. MUTEK 2026 — Kali Malone, ELECTRONICOS FANTASTICOS!, Fennesz & Lillevan (August 25–30, Montreal)
**Source**: https://montreal.mutek.org/en/news/mutek-montreal-announces-full-2026-lineup · May 2026

MUTEK Montréal's 27th edition (Aug 25–30, 2026, theme: "Amplify & Resonate") features 120 artists from 28 countries. Three acts of particular relevance to Resonance: (1) **Kali Malone** — composer of slowly-evolving harmonic music with pipe organs and electronics, known for sustained tones held for minutes at a time, intervals derived from pure ratio arithmetic (Tonnetz-adjacent), and extreme patience as a compositional tool. (2) **ELECTRONICOS FANTASTICOS!** (Ei Wada, Japan) — collective that repurposes e-waste (CRT televisions, electric fans) into electromagnetic instruments and performs participatory orchestral concerts. The "repurposing everyday signals" aesthetic is directly relevant to Resonance's "transcendent listening" thesis: a CRT scan line IS a sound wave. (3) **Fennesz & Lillevan** — Austrian electronic musician + visual artist duo; Fennesz's sustained guitar+electronics textured sound + Lillevan's abstract video art. The X/Visions series at Maison Symphonique emphasizes "textures, nuances, and gradual transformations." [Date: confirmed 2026 festival, May 2026 announcement.]

**Could become prototypes**: `131-kali-sustain` — long-tone harmonic meditation: two OscillatorNodes, root drone + harmony voice that slowly glides between natural ratio intervals (3:2, 4:3, 5:4) via `linearRampToValueAtTime` over 12s each. "Ratio clock" canvas indicator. Mic mode: detect user's long tone → play drone at that pitch → begin glide sequence. "Hold a note. The world shifts beneath it." Zero deps, zero API. One-cycle build. Also: `electronicos-phantom` could repurpose "raw data signals" (audio FFT frequency bin values rendered as waveforms + tones) into instrument-like performance — the data IS the music.

---

### 202. ACE-Step 1.5 + LongCat-AudioDiT in HuggingFace Diffusers (May 2026)
**Source**: https://releasebot.io/updates/huggingface · May 2026

HuggingFace diffusers library (May 2026 release) added two new audio generation pipelines: (1) **ACE-Step 1.5** — now available as a diffusers pipeline (`AceStepPipeline`), pairing a Qwen3-based LM planner with a Diffusion Transformer synthesizer. Generates variable-length stereo audio at 48kHz (10s to 10 minutes) from text + optional lyrics. More robust than the earlier ACE-Step used in `6-compose`, `44-vocal-bgm`, `62-collage-compose`, and `126-arc-steer` (all use `fal-ai/ace-step` which likely already runs 1.5). (2) **LongCat-AudioDiT** (Meituan LongCat) — a text-to-audio diffusion model optimized for longer audio generation. No fal.ai endpoint found yet; monitor HuggingFace for Spaces deployment. [Date: May 2026, freshly added to diffusers.]

**Could become a prototype**: `lmcat-ambient` — LongCat text-to-audio for 3–5 minute ambient journey soundscapes (longer than ACE-Step's 30s ceiling). If fal.ai endpoint appears, build as a Resonance "ambient generator" that produces multi-minute background music from journey theme prompts. Monitor.

---

### 203. AUDIOLAB — React Three Fiber Audio Visualizer Unified Tree Pattern (WebGPU Community, May 2026)
**Source**: https://www.webgpu.com/showcase/audiolab-react-three-fiber-audio-visualizer/ · May 2026

AUDIOLAB (Abel Gudino) demonstrates a clean architectural pattern for combining React Three Fiber 3D geometry with Web Audio API reactivity: "the FFT data flows into the GPU work, and the UI flows around the same React tree." Rather than maintaining separate audio-node and R3F render contexts with brittle bridges between them, AUDIOLAB keeps everything in one React tree where audio playback state and 3D reactive geometry share the same update cycle. The result: UI controls (play/pause, track selection) and reactive 3D forms are natural siblings in JSX, not adversarial systems fighting over state ownership. Pattern directly applicable to `21-three-mesh-av`, `49-anemone-av`, and any future Three.js prototype that needs both interactive controls and frame-level audio reactivity. [Date: May 2026 showcase on webgpu.com.]

**Technique note** (not a new prototype — a polish/architecture improvement): any existing Three.js prototype that currently uses a ref-based audio bridge (e.g. `audioContextRef + analyserRef` passed down as props) could be refactored to the AUDIOLAB unified tree pattern for cleaner state management. Apply to `130-tsl-particle-compute` as the reference architecture for new R3F audio-reactive prototypes.

---

Key findings from Cycle 151 (2026-05-24) — adult research sweep:
- **Lyria 3 Pro on fal.ai** (§197, May 2026) — $0.08/generation via FAL_KEY. **Resolves MORNING.md open question about GEMINI_API_KEY**. `43-lyria-ghost`, `44-binaural-lyria`, `30-lyria-jam` can now be rebuilt using `fal-ai/lyria3/pro` without waiting for Gemini key. Inspires `128-lyria3-journey` — one cycle, zero new deps, highest-priority build next adult cycle.
- **Live Music Diffusion Models** (§198, arXiv:2605.22717, May 21, 2026 — 3 days ago!) — block-wise KV caching for real-time diffusion streaming + "generative delay" musician improvisation mode. Most fresh paper this cycle. Inspires `132-lmdm-echo` — ACE-Step-based harmonic echo response to pianist's phrase. FAL_KEY in use.
- **Pixal3D SIGGRAPH 2026** (§199, TencentARC, May 2026 fal.ai release) — $0.30 image→3D GLB, zero new deps (drei already installed). Inspires `129-ghost-3d-orbit` — Ghost image becomes an orbitable, audio-reactive 3D sculpture. Two-cycle build, highest surprise factor of batch.
- **Three.js TSL Compute Shaders** (§200, Jan 2026 confirmed baseline) — clean particle physics via `Fn()` compute nodes. Simplifies `audio-cloud` from 2-cycle to potentially 1-cycle. Inspires `130-tsl-particle-compute` — 50k-particle Lorenz attractor with TSL, zero new deps. One-cycle build.
- **MUTEK 2026 + Kali Malone** (§201, Aug 25–30 announcement May 2026) — slowly evolving harmonic meditation aesthetic. Inspires `131-kali-sustain` — long-tone drone with natural ratio glides, zero deps, zero API. Fills the "contemplative, static, patient" prototype gap.
- **ACE-Step 1.5 + LongCat-AudioDiT in diffusers** (§202, May 2026) — ACE-Step upgrade likely already live on fal.ai; LongCat needs endpoint. Monitor.
- **AUDIOLAB unified React tree pattern** (§203, May 2026) — apply to all future Three.js prototypes for cleaner audio + 3D state management.
- **Priority next adult build**: `128-lyria3-journey` (one cycle, zero new deps, FAL_KEY, directly unblocks 3+ waiting prototypes). Second: `130-tsl-particle-compute` (one cycle, WebGPU, zero new deps, TSL is the correct tool now). Third: `131-kali-sustain` (one cycle, zero deps/API, contemplative aesthetic gap).
- **Priority next two-cycle build**: `129-ghost-3d-orbit` (Pixal3D, SIGGRAPH 2026 quality, highest surprise).

---

## Cycle 169 — Adult research sweep (2026-05-25 UTC)

Sources: arXiv cs.SD recent listings, Stability AI announcement, Refik Anadol studio/events, fal.ai model pages, HuggingFace, Three.js 2026 state-of-the-art summary, MediaPipe browser guide (March 2026), CHI 2026 arXiv.

---

### §204 — Stable Audio 3.0 family (Stability AI / fal.ai, May 20, 2026)
**Source**: https://stability.ai/news-updates/meet-stable-audio-3-the-model-family-built-for-artistic-experimentation-with-open-weight-models · Announced May 20, 2026

Stability AI released a four-model family: **Small SFX** (459M, mobile/on-device SFX), **Small** (459M, up to 2-min music, open-weight), **Medium** (1.4B, up to 6+ min music, open-weight on HuggingFace), **Large** (2.7B, music platforms, via Stability AI API + partner fal.ai only). All models share a semantic-acoustic autoencoder that generates audio in a compact latent space. Key capabilities over SA2.5:

- **Variable-length generation at per-second granularity** — finally fills the gap between 30s (ACE-Step, MiniMax) and unlimited (real instruments). Medium generates up to 6+ minutes.
- **Inpainting + causal continuation** — record Karel's piano → call SA3 Large in "causal continuation" mode → AI extends the recording for several more minutes in the same style.
- **Fast inference** — less than 2s on H200; a few seconds on MacBook Pro M4. SA3 Medium open-weight is self-hostable.
- **fal.ai partner endpoint** — SA3 Large is accessible via fal.ai (specific endpoint ID not yet confirmed at time of research — check `fal-ai/stable-audio-3` or `fal-ai/stable-audio-3/large`; FAL_KEY already in use). SA3 Medium is open-weight on HuggingFace (`stabilityai/stable-audio-3-medium`).
- **LoRA fine-tuning** — Small and Medium models support LoRA training on a user's audio library. Future: a "Karel Piano LoRA" that generates Resonance-flavored ambient music.

**Resonance fit**: Very high. Karel said "let his existing music be the input." SA3's causal continuation does exactly this — play 30s of piano, get 5 more minutes of continuation in the same key/tempo/mood. The Medium model is also free to run locally after a one-time download. 

**Could become prototype**: `144-sa3-journey` — two modes: (A) text prompt → 3–6 minute journey track ("Inner Sanctuary meditation, slow reverbed piano, soft cello, 3 minutes"); (B) record 30s of mic input → SA3 Large extends it to 3–5 min via causal continuation (Karel's playing, extended). Both modes play through the six-band bloom radial visualizer. Waveform strip shows full duration. Download MP3 button. FAL_KEY in use. Budget estimate: ~$0.20–0.50 per generation for Large (not yet confirmed — fallback to SA3 Medium locally or via HuggingFace Inference if fal.ai endpoint isn't live). One-cycle build. [Date: May 20, 2026 — 5 days ago]

---

### §205 — WavFlow: Audio Generation in Raw Waveform Space (arXiv:2605.18749, May 18, 2026)
**Source**: https://arxiv.org/abs/2605.18749 · Submitted May 18, 2026

WavFlow generates high-fidelity audio directly in raw waveform space without intermediate latent representations. Technical innovations: waveform patchify (2D token grids for sequence manageability), amplitude lifting (scale alignment for stable optimization), flow matching (direct x-prediction). Trained on 5M video-text-audio triplets. Strong performance on both text-to-audio (AudioCaps) and video-to-audio (VGGSound) benchmarks, matching or beating prior SOTA.

**Resonance fit**: Moderate, server-only. The waveform-space approach means lower-latency round-trips vs. latent-space models in theory. Video-to-audio is directly relevant to the Ghost video pipeline (extend Ghost images → video → audio in one pipeline). No fal.ai endpoint yet; monitor for future video-to-audio model on fal.ai. No immediate prototype — foundational finding. [Date: May 18, 2026]

**Could become prototype**: Not immediately — when/if a video-to-audio fal.ai endpoint appears using WavFlow or similar architecture, it can replace/upgrade the MMAudio V2 step in the Ghost pipeline.

---

### §206 — Refik Anadol: DATALAND + Machine Dreams: Rainforest (2026)
**Sources**: https://refikanadol.com/events/ · https://mymodernmet.com/dataland-ai-museum-refik-anadol/ · Various museum press releases, May 2026

Three simultaneous major Anadol presentations in 2026:

1. **DATALAND** — World's first AI arts museum, co-founded by Anadol, opening June 20, 2026 at The Grand LA (Frank Gehry building), downtown Los Angeles. 35,000 sq ft, multiple galleries. Inaugural exhibition: **Machine Dreams: Rainforest** — vast quantities of ecological data (birdsongs, plant life cycles, weather patterns) processed into generative "digital sculptures." The data doesn't decorate the walls — it IS the material. Anadol's phrase: "data as the site of an evolving architecture."

2. **Latent City** — at BRUSK museum, Bruges, Belgium (May 8–Nov 8, 2026). Centuries of Bruges' architectural, archival, and urban memory → immersive AI-driven environments. Real-time city data feeds ongoing generation. First solo Belgium exhibition.

3. **Earth Dreams** — Museum of the Future, Dubai. Four interconnected chapters narrating large nature-themed datasets through dynamic visuals.

**Technique to port to browser**: Ecological data → generative audio-visual synthesis:
- Birdsong catalog → Karplus-Strong "plucked string" synthesis (bird calls = short resonant transients). 5 pentatonic notes, 5 bird species.
- Plant branching patterns → L-system fractal tree canvas visualization (deterministic angle + length ratios that grow organically over 30–60 seconds).
- Weather layers → atmospheric noise (white noise low-pass = rain; brownian noise high-pass = wind), intensity driven by a "weather" slider.
- Growth = time: the canvas gains complexity as the session continues; each new branch sprouts a new sonic voice.

**Resonance fit**: Very high. Inner Sanctuary journey ("a forest sanctuary, ancient, present"), Earth Grounding journey, Cosmic Homecoming (emergence aesthetic). Opposite of existing prototypes — these are synthetic, generative, autonomous rather than reactive to mic. The patient aesthetic (slow growth over minutes) complements the busy, beat-reactive majority of the sandbox.

**Could become prototype**: `143-kids-seed-song` — plant a tree seed by tapping the canvas; watch it grow as Karplus-Strong bird calls emerge at each branch node. 5 pentatonic notes, 3 branch species. Simple enough for a 4-year-old. No mic needed. Kids build.

**Could also become**: `145-eco-bloom` (adult version) — full L-system + 5-layer atmospheric synthesis (rain, wind, bass drone, birdsong voices, root resonance). A procedural ecosystem you inhabit rather than control. Zero deps, zero API. High surprise. [Date: June 20, 2026 opening, Latent City May 8, 2026]

---

### §207 — Beyond Faders: 6DoF Gesture Ecologies in Music Mixing (CHI 2026, arXiv:2602.23090, Feb 2026)
**Source**: https://arxiv.org/abs/2602.23090 · February 2026, published at CHI 2026

Ecological study of spatial gesture interaction for audio mixing in XR. Participants wore VR headsets and used spatial "levers" (3D handles for audio faders and eq knobs) at physical locations in their environment. Key finding: **embodied spatial control makes mixing feel more musical** — participants preferred sculpting the soundscape physically over precise numerical GUI control, even when accuracy suffered. DAW faders reduce mixing to a visual/cognitive task; spatial mixing keeps it physical and musical.

**Browser port strategy** (no XR headset needed): Replace 6DoF with 2D canvas drag + mouse wheel = depth. Synthesis voices as colored dots on a canvas; X = stereo pan, Y = pitch, scroll wheel = reverb/filter. Dragging a dot moves a sound through stereo space and pitch space simultaneously. Multiple voices overlap and interact. This is spatially less expressive than XR but browser-accessible.

**Resonance fit**: Strong for live performance fitness priority. The "sculpting" metaphor — rather than tweaking sliders — is much closer to how pianists think about performance. A live performer using this could genuinely *place* sounds in the room.

**Could become prototype**: `146-spatial-palette` — 6–8 colored synthesis voices (each a different Karplus-Strong or sine timbre) as draggable dots on a full-screen dark canvas. X → stereo pan, Y → pitch (C2–C7), scroll → filter fc + reverb amount. Tap-to-add, right-click-to-remove. Demo mode: pre-placed chord voicing (C major triad, spread stereo). Mic: onset detection → brief brightness flash on the nearest voice. "Sculpt your soundscape." Zero deps, one cycle. [Date: Feb 2026, CHI 2026 — slightly older, foundational]

---

### §208 — MediaPipe Browser 2026: Simultaneous Multi-Modal Tracking at 60fps (March 2026)
**Source**: https://levelup.gitconnected.com/hand-tracking-face-detection-gesture-recognition-with-mediapipe-in-the-browser · March 2026

March 2026 comprehensive state-of-the-art: MediaPipe HandLandmarker (21 pts/hand), FaceLandmarker (468 pts), PoseLandmarker (33 pts) confirmed running simultaneously in browser via WASM + GPU delegate at 30–60 fps. Privacy-safe on-device inference. Architecture: detection-once + tracking model for subsequent frames (re-detects when confidence drops). No network round-trip.

**Key for Resonance**: FaceLandmarker's 468 landmarks include precise jaw/mouth opening, eyebrow height, head tilt, cheek movement, and eye gaze direction — all of which map intuitively to music synthesis parameters. A performer playing with their face as an expressive instrument has very different creative opportunities than a performer using their hands.

**Specific parameter mappings** (mapped from face landmarks to synthesis params):
- Jaw opening (inner-lip distance normalized by face height) → filter cutoff 400–8000 Hz (VCF sweep)
- Inner eyebrow height (above neutral) → harmonic count 1→8 (timbre richness)
- Head tilt angle (left/right from neutral) → stereo pan –1→+1
- Mouth corner spread (smile width) → major/minor chord quality blend
- Nose tip Z-depth (forward lean) → reverb send level

**Could become prototype**: `147-face-synth` — MediaPipe FaceLandmarker loaded from CDN (~5MB WASM, one-time). Webcam feed at 30% opacity. Skeleton overlay on face with 5 parameter readouts. Pure triangle-wave chord synthesis (C pentatonic major). Canvas: live Lissajous figure of the stereo output (same as `20-scope`) to show what the face is sculpting. "Your face is the instrument." Needs Karel OK on CDN dep (~5MB). One cycle. [Date: March 2026 confirmed baseline]

---

Key findings from Cycle 169 (2026-05-25) — adult research sweep:
- **Stable Audio 3** (§204, May 20, 2026 — 5 days ago!) — four-model family, Medium open-weight on HuggingFace, Large on fal.ai. Up to 6+ min. Causal continuation of user's recordings. Resolves the "Karel's music as input for long-form generation" gap. Inspires `144-sa3-journey` — highest-priority adult build next cycle.
- **WavFlow** (§205, May 18, 2026) — waveform-space audio gen. Server-only, no immediate browser prototype. Monitor for fal.ai video-to-audio endpoint.
- **Refik Anadol DATALAND + Machine Dreams: Rainforest** (§206, opens June 20, 2026 + already running May 8) — ecological data → digital sculptures. Technique: L-system tree + Karplus-Strong birdsong + weather noise. Inspires `143-kids-seed-song` (kids: plant a seed, hear it grow), `145-eco-bloom` (adult: full procedural ecosystem).
- **6DoF Gesture / CHI 2026** (§207, Feb 2026) — spatial sculpting > precision sliders for musical mixing. Inspires `146-spatial-palette` — draggable voices on canvas. Zero deps.
- **MediaPipe 2026 simultaneous tracking** (§208, March 2026) — 468 face landmarks + 33 body + 21 hand/hand at 60fps in browser. Inspires `147-face-synth` — face expression → VCF/timbre/pan synthesis. CDN dep, needs Karel OK.
- **Priority next kids build (Cycle 170)**: `143-kids-seed-song` (plant seed → L-system tree grows → Karplus-Strong notes, zero deps, zero API, pure magic).
- **Priority next adult build (Cycle 171)**: `144-sa3-journey` (SA3 Large on fal.ai, 6-min journey generation + causal piano continuation — directly addresses Karel's "his music as input" directive).

---

## Cycle 177 — Adult research sweep (2026-05-25 UTC)

Sources: arXiv cs.SD + cs.HC + cs.MM recent listings (2025–2026 filtered), fal.ai model catalog, Replicate explore, HuggingFace audio-to-audio trending, GitHub trending (weekly + monthly), Hacker News front page, targeted paper fetches.

---

### §209 — ViTex: Visual Texture Control for Multi-Track Symbolic Music (arXiv:2603.01984, March 2026)
**Source**: https://arxiv.org/abs/2603.01984 · March 2026

ViTex conditions a discrete diffusion model on visual canvas input to generate multi-track symbolic music (8-measure compositions). The visual encoding is intuitive: **color = instrument choice** (each hue maps to a distinct instrument family), **spatial position = pitch and time** (Y = pitch, X = temporal position within the bar), **stroke properties = local texture/dynamics**. Users "paint" their compositional intent rather than specifying notation or text. Built on a diffusion model backbone with chord-progression conditioning. Demo materials available.

**Resonance fit**: Very high for the "composition as painting" axis. A browser prototype could replicate the interaction without the ML: use fixed color→waveform mappings (violet=sine/piano, amber=triangle/brass, teal=sawtooth/strings, rose=pulse/woodwind) and treat canvas stroke Y-position as pitch, X as temporal position in a looping bar. A playback cursor sweeps the canvas left-to-right, firing OscillatorNodes for each stroke it intersects. The result: a visual score that is also music. Zero API version is fully achievable.

**Could become prototype**: `151-paint-compose` — dark canvas with 4 color brushes, each tied to an instrument timbre. Draw freely; loop playback cursor sweeps and plays what you painted. Y = pitch (C3–C6). A 4-bar loop. Download canvas as PNG. "Paint your score." Zero deps, zero API, one-cycle build. [Date: March 2026]

---

### §210 — "Abstraction Beats Realism": Abstract Physiological Visualizations Outperform Realistic VR Video at Concert Emotional Peaks (arXiv:2603.19730, March 2026)
**Source**: https://arxiv.org/abs/2603.19730 · March 2026

EEG/EDA study at a live concert, then three VR recreations: (1) 360° realistic video, (2) hybrid video+visualization, (3) fully abstract physiological visualization. **Result**: the fully abstract condition achieved the strongest Dynamic Time Warping correlation with original live audience arousal patterns, especially at musical climax moments. Realistic 360° video showed NO correlation at peaks. The researchers conclude: "abstraction may be more effective than realism for evoking authentic collective engagement in VR cultural recreations."

**Resonance fit**: This is science-level validation for Resonance's entire design philosophy. The product is built around abstract, data-driven audio-visual synthesis — not concert footage, not photorealistic avatars, not realistic environments. This study says: that approach is not an artistic tradeoff, it is the more emotionally effective choice. Worth quoting to Karel in the morning digest as a "why this matters" finding.

**Could become prototype**: No direct build needed — this is research backing. However, it suggests a "side-by-side study" prototype (`153-abstract-study`) where the user hears the same piece through: (A) abstract 6-band bloom viz, (B) literal waveform display, (C) photorealistic spectrogram. Karel could compare them live to confirm the finding. Low priority given the queue; file under "research backing." [Date: March 2026]

---

### §211 — PianoFlow: Music-Aware Streaming Piano Motion Generation with Bimanual Coordination (arXiv:2604.12856, April 2026)
**Source**: https://arxiv.org/abs/2604.12856 · April 2026

PianoFlow generates coordinated bimanual piano hand animation from audio input using a flow-matching framework. Key: MIDI used during training but not at inference — audio-only at runtime. Achieves **9× speedup** over prior methods and handles arbitrarily long sequences via an autoregressive continuation scheme. An "asymmetric role-gated interaction module" handles cross-hand dynamics (which hand leads, which follows).

**Browser port**: Can't run the model in-browser (Python/PyTorch), but the *concept* directly inspires a zero-ML browser prototype: autocorrelation pitch detection (same algorithm as `13-piano-canvas`) already detects which piano key is being played. A canvas piano keyboard with animated "ghost hands" descending to press detected keys is entirely doable with Web Audio + Canvas2D. Left-hand register (C3–B3) = violet ghost finger; right-hand (C4–B4) = rose ghost finger. Detection fires → finger animation descends, key highlights, lifts. Demo mode: plays a Bach phrase and self-detects.

**Could become prototype**: `152-piano-hands` — 2-octave keyboard (C3–B4) rendered in Canvas2D at center. Autocorrelation pitch detection → animated ghost fingers. "See WHERE on the keyboard you're playing." First "annotated keyboard" prototype in the sandbox; all others (24-piano-roll, 22-code-score) show pitch abstractly. Zero API, zero deps, one-cycle build. [Date: April 2026]

---

### §212 — Music of Changing Lines: I-Ching Divination + Generative Music (arXiv:2605.20386, May 2026)
**Source**: https://arxiv.org/abs/2605.20386 · May 2026 (very fresh)

An interactive system where users perform the Wen Wang Fa I-Ching coin-tossing ritual. The resulting hexagram is interpreted contextually by Gemini (LLM), which generates a musical prompt describing the emotional and sonic qualities of the hexagram. That prompt drives Google's Lyria model for real-time music generation. The system positions "AI as interpretive intermediary rather than compositional authority" — the I-Ching's philosophical framework drives the creative process, not algorithmic randomness.

**Browser port**: Lyria 3 Pro is ALREADY live in the sandbox at `129-lyria3-journey` — the fal.ai endpoint works and FAL_KEY is in use. A coin-toss simulation requires no external API (just Math.random() × 3 toss results → hexagram lookup). All 64 hexagrams have traditional names and brief interpretations in the public domain (no LLM needed — a small static lookup table of 64 entries). The resulting hexagram name + 2-sentence poetic description becomes the Lyria prompt directly. Cost: ~$0.08/generation (same as `129-lyria3-journey`). This is the most *ritualistic and transcendent* prototype concept in the entire queue — it positions Resonance as a vehicle for genuine musical divination.

**Could become prototype**: `150-ritual-compose` — animated three-coin toss (six times = hexagram). Hexagram name + brief interpretation shown. One click → Lyria 3 Pro generates 30s of ambient journey music. Bloom visualizer plays. "The oracle speaks in music." FAL_KEY in use. ~$0.08/generation. One-cycle build. Directly addresses Karel's "surprise" priority. [Date: May 2026 — freshest paper this cycle]

---

### §213 — MiniMax Music 2.6 Confirmed on Replicate (May 2026)
**Source**: https://replicate.com/explore · Replicate model catalog, May 2026 observation

MiniMax Music 2.6 is confirmed live on Replicate with 6,800+ runs. Generates "full-length songs or instrumentals from text prompts with optional auto-generated lyrics." This is an upgrade from 2.5 referenced in earlier research. The Replicate endpoint is `minimax/music-2.6`. Compatible with FAL-style API calls if a fal.ai endpoint is also available.

**Resonance fit**: Directly validates the `arc-compose` plan (section-based structured music generation). The auto-lyrics feature is new — could be used to generate vocal Ghost narrative phrases over a journey track. Budget: ~$0.035/track (same as 2.5). One of the most affordable music generation APIs in the queue.

**Could become prototype**: Activates `arc-compose` as planned — route `/dream/153-arc-compose` (or nearby). Write a journey arc as 4–6 plain-language section descriptions, MiniMax Music 2.6 generates a coherent multi-section track. First prototype where the music output IS structured by the user's section plan. FAL_KEY needed if on fal.ai, or Replicate API key. [Date: May 2026 observed]

---

### §214 — ACE-Step 1.5 and ace-step-ui: Open-Source Music UI Trending (GitHub, May 2026)
**Source**: https://github.com/trending/javascript?since=monthly · GitHub monthly trending, May 2026

Repository `ace-step-ui` ("The Ultimate Open Source Suno Alternative - Professional UI for ACE-Step 1.5 AI Music Generation") is trending at 3,952 stars. This signals that ACE-Step has released version 1.5 with significant improvements over 1.0 (which powers `6-compose`, `126-arc-steer`, `138-lmdm-echo` in the sandbox). The 1.5 version appears to offer better musical coherence, faster generation, and a richer feature set.

**Resonance fit**: The sandbox already uses ACE-Step heavily via `fal-ai/ace-step`. If the fal.ai endpoint has been updated to 1.5, all existing prototypes get a free quality upgrade. Worth checking the fal.ai endpoint response at the next API-using build cycle to confirm version.

**Could become prototype**: No new prototype needed — this is a quality upgrade to existing endpoints. The main action: at the next `arc-steer` or `lmdm-echo` build, check if `fal-ai/ace-step` has bumped to 1.5 and note it in the commit. [Date: May 2026 trending observation]

---

Key findings from Cycle 177 (2026-05-25) — adult research sweep:
- **ViTex** (§209, March 2026) — color = instrument, position = pitch/time on canvas → symbolic music. Inspires `151-paint-compose`: zero API canvas score prototype.
- **Abstraction Beats Realism** (§210, March 2026) — abstract AV scientifically outperforms realistic video at concert peaks. Validates Resonance's core design thesis.
- **PianoFlow** (§211, April 2026) — streaming piano hand motion at 9× speedup. Inspires `152-piano-hands`: animated ghost fingers on canvas keyboard from autocorrelation detection.
- **I-Ching Music System** (§212, May 2026 — freshest paper) — divination ritual → Lyria music. Inspires `150-ritual-compose`: highest-surprise prototype in the queue, FAL_KEY ready.
- **MiniMax Music 2.6** (§213, May 2026) — confirmed on Replicate, auto-lyrics feature added. Activates `arc-compose` plan.
- **ACE-Step 1.5** (§214, May 2026 trending) — open-source UI trending at 3,952 stars; fal.ai endpoint may have upgraded silently.
- **Priority build next adult cycle (179)**: `150-ritual-compose` — I-Ching → Lyria. Highest surprise, uses FAL_KEY already in use, one-cycle build, fully transcendent.

---

## Cycle 196 — Kids research sweep (2026-05-26)

### §215 — Sago Mini Music Machine (2026)
**Source**: https://sagomini.com/apps — Sago Mini World update catalog, May 2026 observation

Sago Mini World's 2026 updates include a "Music Machine" mini-game where kids can "tinker with tunes,
add new sounds, and make the songs their own." This is a construction-based music mechanic — distinct
from Toca Band's character-tap approach. Kids interact with a machine that makes music, not characters
that perform. The app is part of the Piknik subscription bundle (Toca Boca + Sago Mini + Originator).

**Resonance fit**: Validates the `kids-marble-run` design space. Confirms that construction-first
music interaction (build the machine → watch it play) is a direction the major players are pursuing
in 2026. Our differentiation: free-draw ramps on a canvas vs. fixed machine nodes. The physical marble
metaphor is stronger for kids than abstract node-based sequencing.

**Could become prototype**: Directly activates `kids-marble-run` (route `/dream/168-kids-marble-run`).
Draw ramps → marbles fall → bounce = notes. One-cycle build. Zero deps. [Date: May 2026 observed]

### §216 — BooSnoo (2026 — Rube Goldberg meets marble run for kids)
**Source**: https://www.boosnoo.com — BooSnoo show website, 2026

BooSnoo is described as "a show that follows a red ball, as it triggers art, mechanics, music and
sensory moments in a calming, slow Rube Goldberg meets marble run format." Designed for young children.
The "calming, slow" descriptor is significant — most marble-run content is high-tempo and chaotic.
BooSnoo proves that a slow, deliberate marble-run aesthetic works specifically for young children.

**Resonance fit**: Reinforces the `kids-marble-run` prototype concept AND the production aesthetic.
The Resonance version should feel calm: soft bounce sounds (triangle wave, not sharp percussion),
gentle marble trails, ambient pad underneath. Not a high-energy action game — a meditative machine.

**Could become prototype**: Further validates `kids-marble-run` as the top priority seed. The
"calming, slow" tone specifically matches Resonance Kids' design language. [Date: 2026 observed]

### §217 — Embodied Music for Kids (Dalcroze, IJMEC 2025–2026)
**Source**: https://intellectdiscover.com/content/journals/10.1386/ijmec_00011_1 — International Journal
of Music Education in Childhood, 2025 issue

Recent Dalcroze-inspired research confirmed that embodied learning (whole-body gesture + music creation)
is the gold standard for early childhood music education. The specific study analyzed a project where
students made music videos using tablets, combining movement + music. Tablets "served as easy and
manageable digital tools for meaning-making and multimodal expression."

**Resonance fit**: Validates our core design philosophy (gesture-as-instrument, full-canvas interaction).
The research specifically supports: (1) full-arm gestures (like drawing a ramp across the full iPad
screen) over small tap targets; (2) immediate sound feedback from movement; (3) multi-sensory (visual
+ audio + motor) reinforcement. All three are central to our kids zone design.

**Could become prototype**: Doesn't directly seed a new prototype, but reinforces existing direction.
The `kids-marble-run` ramp-drawing gesture is a full-arm sweep — embodied in the Dalcroze sense.
[Date: IJMEC 2025, accessed May 2026]

### §218 — MIROR-Impro: Reflexive Music System for Children (CHI history, NIH 2025)
**Source**: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5266797/ — Child-Computer Interaction
at Beginner Stage of Music Learning, PMC 2017 (still actively cited in 2025–2026 kids music HCI)

The MIROR-Impro system allows children to improvise on a keyboard and receive a "reflexive" response —
the system mirrors their inputs with repetitions and variations. Children showed increased musical
engagement and improvisation willingness when the system responded to them vs. pre-programmed music.
The reflexive interaction model directly validates the `aria-companion` design for adults.

**Resonance fit**: Suggests a kids version of aria-companion would be well-received. Children
specifically respond well to being "listened to and echoed" — the core mechanism of `167-aria-companion`.
A simplified kids version: child taps 3–4 big colored circles → system echoes + extends with a Markov
bigram → pentatonic round-trip. Simpler visuals than the piano-roll, bigger tap targets.

**Could become prototype**: `kids-echo-aria` — child taps 3–4 colored circles (C3/E3/G3/A3/C4);
after 1.5s silence, the same colors light up in a new order (Markov bigram response). Visual: the
tapped circles flash in sequence. No piano roll — just colors and sounds. Zero deps. For kids 4+.
This is weaker than `kids-marble-run` for the next cycle but worth seeding. [Date: first published
2017, actively cited in 2025–2026 kids music HCI research]

Key findings from Cycle 196 (2026-05-26) — kids research sweep:
- **Sago Mini Music Machine** (§215, May 2026) — construction-based music machine in Sago Mini World. Validates `kids-marble-run`.
- **BooSnoo** (§216, 2026) — calming slow Rube Goldberg + marble run show for kids. Aesthetic match for `kids-marble-run`.
- **Embodied music for kids** (§217, IJMEC 2025) — full-arm gestures + immediate sound reinforced as gold standard. Validates ramp-drawing gesture.
- **MIROR-Impro** (§218, 2017→2026 cited) — kids respond to reflexive music systems. Seeds `kids-echo-aria` as future idea.
- **Priority build (Cycle 198 kids)**: `kids-marble-run` — most validated idea, most novel interaction (construction-first), directly inspired by Karel's loves.

---

## Research cycle — Cycle 203 (2026-05-26)

### §219 — AI Harmonizer: Real-Time Vocal SATB Harmonization (NIME 2025, Jun 2025)
**Source**: https://arxiv.org/abs/2506.18143 — AI Harmonizer: Expanding Vocal Expression with a
Generative Neurosymbolic Music AI System. Blanchard, Holt, Paradiso. NIME 2025, Canberra.

Real-time vocal harmonization: mic → Basic Pitch (open-source voice-to-MIDI, no external API) →
Anticipatory Music Transformer → four-part SATB choral harmony generated without prior harmonic
input from the user. "Anticipatory" model pre-generates the next bars so harmonies feel responsive.
Choral texture: soprano + alto + tenor + bass, all auto-voiced to avoid voice crossing.

Key for Resonance: a zero-dep browser version is achievable with autocorrelation pitch detection
(already in sandbox) + three OscillatorNodes tuned to +4 / +7 / -12 semitones from detected pitch.
The SATB-style HRTF spatialization (soprano upper-left, alto upper-right, bass below) makes the
result feel choral rather than just chord-stacking. Four colored orbs arranged in a semicircle —
user at center bottom — visualize the spatial formation.

**Could become prototype**: `vocal-choir` — you sing a pitch; three harmony voices appear around you
in 3D space. Zero deps, zero API, one cycle. Aligns with `148-spatial-palette` ❤️ love (spatial
synthesis). First "choir" prototype in the sandbox. [Date: Jun 2025, NIME 2025 proceedings]

### §220 — NeoLightning: 3D Gesture Sound Design via MediaPipe (ICMC 2025, May 2025)
**Source**: https://arxiv.org/abs/2505.10686 — NeoLightning: A Modern Reimagination of Gesture-Based
Sound Design. ICMC 2025, May 2025.

Modernizes Don Buchla's Lightning (1990s IR gesture instrument) using MediaPipe Hands for 3D hand
skeleton at 30fps, <30ms latency. Key insight: 3D hand pose as a 6-DOF control surface — not just
X/Y but finger curl, wrist angle, hand velocity, palm spread. Bilateral asymmetry (left hand = one
parameter set, right = another) enables continuous simultaneous control of independent parameters.
"Depth-as-reverb" (hand scale → camera Z estimate → reverb decay) is highly intuitive.

New vs. the `31-gesture-music` spec already in IDEAS.md: add depth-as-reverb mapping and
bilateral asymmetry. Left wrist Y → bass drone pitch; right wrist Y → melody pitch; left palm Z →
reverb decay; right palm Z → harmonic count; both wrist distance → stereo spread.

**Updates `31-gesture-music` spec**. Confirms MediaPipe CDN approach is right. [Date: May 2025, ICMC]

### §221 — Structure-Aware Piano Accompaniment via Style Plan (arxiv 2602.15074, Feb 2026)
**Source**: https://arxiv.org/abs/2602.15074 — Structure-Aware Piano Accompaniment via Style Planning
and Dataset-Aligned Pattern Retrieval. Feb 16, 2026.

Lightweight transformer predicts per-measure style plan (sparse/dense, legato/staccato,
arpeggiated/block-chord) conditioned on section structure + functional harmony. Retriever selects
human-performed patterns from a corpus and reharmonizes them. The style plan — a sequence of symbols
like [sparse, legato] → [dense, arpeggiated] — is interpretable and visualizable as a timeline.

Resonance relevance: the style plan VISUALIZATION is the novel part. A horizontal timeline strip
showing "what kind of playing happened here" per section gives pianists structural feedback. Nothing
like this exists in the sandbox — all existing prototypes show signal (FFT, pitch, tempo) but none
analyze *compositional character* per section.

**Could become prototype**: `score-structure` — mic → chord detection + density analysis → build a
scrolling timeline grid. Each 4-bar section gets: chord label, density rating, register label.
Accumulated view shows the *architecture* of Karel's improvisation. Zero deps. [Date: Feb 2026]

### §222 — WebSplatter: 3D Gaussian Splatting in Browser via WebGPU (arxiv 2602.03207, Feb 2026)
**Source**: https://arxiv.org/abs/2602.03207 — WebSplatter: Enabling Cross-Device Efficient Gaussian
Splatting in Web Browsers via WebGPU. Feb 2026.

First WebGPU framework for real-time 3D Gaussian Splat rendering in browser. Visual quality:
objects appear as overlapping soft oriented ellipses that collectively form photorealistic scenes.
Not particles, not meshes — oriented Gaussian densities with position/rotation/scale/color/opacity.
Demo works on Chrome 120+ desktop and mobile at 30–60fps.

The *visual language* of splatting is what matters for Resonance: soft, organic, photographic.
All 173 existing prototypes use particles (points), fluid (density fields), 3D meshes, or 2D canvas.
Oriented soft ellipses is qualitatively different — the same technique that makes photographs look
volumetric is achievable in Canvas2D with oriented ellipses and screen-blend compositing.

**Could become prototype**: `splat-bloom` — 500 Canvas2D oriented ellipses, audio-reactive. No
WebGPU needed; Canvas2D + transform matrix. Bass = nearby splats bloom outward; treble = rotation
drift; onset = scatter + coalesce. Zero deps, one cycle. [Date: Feb 2026, arxiv 2602.03207]

### §223 — Voxtral Mini 4B + Web Speech API: Spoken-Word AV Control (Feb 2026)
**Source**: https://huggingface.co/spaces/mistralai/Voxtral-Realtime-WebGPU — Voxtral Realtime WebGPU
demo. Feb 2026. Mistral AI Apache 2.0.

Voxtral Mini 4B runs entirely in browser via WebGPU+WASM (2.5GB quantized). 480ms latency.
The concept for Resonance is more important than the specific model: spoken-word control of AV
parameters. The simpler path: the browser-native Web SpeechRecognition API (zero model, zero deps,
<50ms latency on Chrome) achieves the same control loop.

Novel interaction: what if a pianist could SPEAK intent while playing? "Slower" → BPM decreases.
"Ocean" → visual mode shifts. "Ghost" → theme activates. Live performance use: speak a scene name
into a lapel mic before playing each piece. This closes the gap between conscious intent (language)
and system state — all 173 prototypes are gestural but none respond to direct language commands.

**Could become prototype**: `voice-scene` — Web Speech API → spoken scene token → AV mode switch.
8 mode tokens (ocean / fire / ghost / rain / storm / forest / space / night), each with a distinct
visual + ambient sound. Zero deps, zero API key. Chrome-only graceful fallback. [Date: Feb 2026]

### §224 — MUTEK Montréal 2026: Sphaîra + Architectural Acoustics (announced May 2026)
**Source**: https://montreal.mutek.org/en/news/mutek-montreal-announces-full-2026-lineup —
MUTEK Montréal 2026 full lineup. Aug 25–30, 2026.

Key for Resonance: **Sphaîra** (Sara Persico + Mika Oki) — draws from acoustic properties of Oscar
Niemeyer's dome in Tripoli. Voice + architecture + light feedback loop: the dome's resonant modes
shape the music; the music shapes the projected light. Core concept: the *room is an instrument*.
Also: Noémi Büchi (Exuvie) — new electroacoustic + immersive spatial sound; drone aesthetic
with architectural resonance. Confirms the "architectural drone" aesthetic has traction at the
highest level of the AV art world.

**Could become prototype**: `sdf-cave` — SDF ray-marching WebGL fragment shader renders a cave-like
interior space. Bass = walls pulse; treble = ceiling deforms; centroid = color temperature. User
is *inside* a space that responds to what they play. First prototype in sandbox where the viewer is
inside the visual space rather than observing it. Zero new deps (inline GLSL). [Date: May 2026 ann.]

### §225 — Revision 2026 Shader Showdown: SDF smin Audio-Reactive (Apr 2026)
**Source**: https://www.shadertoy.com/view/ffXSRj — Revision 2026 Shader Showdown 2. Apr 8, 2026.

Premier demoscene demoparty. 2026 Shader Showdown shaders on Shadertoy feature real-time SDF
ray-marching with smooth-min (smin) blending — distance field primitives melt into each other
rather than hard-intersecting. Audio-reactive uniforms drive the blend factor and noise displacement.
Visual: surreal architectural spaces and organic forms, dark palette.

Key technique: `smin(a, b, k)` where k is driven by bass energy → shapes melt together on bass
hits and separate on silence. Creates organic rhythmic morphing that no particle/fluid simulation
produces. Combined with domain repetition (infinite cave tunnels) and Blinn-Phong lighting in a
deep-violet palette = visually stunning interior environment.

**Also seeds `sdf-cave`** alongside §224. Fragment-shader-only: just `<canvas>` + inline GLSL
string, zero external deps. [Date: Revision demoparty, Apr 2026]

### §226 — Real-Time Gesture Control via MediaPipe Body Landmarks (arxiv 2504.19460, Apr 2026)
**Source**: https://arxiv.org/abs/2504.19460 — A Real-Time Gesture-Based Control Framework. Apr 2026.

MediaPipe PoseLandmarker (33 body joints at 30fps) → musical parameter control. Key finding:
relative joint distances normalize better for live performance than absolute positions. Wrist-to-wrist
distance, elbow-to-hip distance — these don't change with where you stand on stage. Velocity
estimates (EMA of joint position deltas) give "gesture expressiveness" without gesture recognition.

Non-linear mapping insight: small movements = fine control; large movements = dramatic effect.
Achieved via a cubic curve: `param = movement³` for the low range + linear saturation above 0.7.

**Updates `body-conductor` spec**: use relative joint distances instead of absolute Y. Add velocity
as arousal estimator (fast movement → higher BPM + harmonic density). [Date: Apr 2026, arxiv 2504.19460]

Key findings from Cycle 203 (2026-05-26) — adult research sweep:
- AI Harmonizer (§219, NIME Jun 2025) — real-time vocal SATB harmony from mic. Seeds `vocal-choir`.
- NeoLightning (§220, ICMC May 2025) — 3D gesture synthesis, depth-as-reverb. Updates `gesture-music`.
- Structure-Aware Piano Accompaniment (§221, Feb 2026) — style plan visualization. Seeds `score-structure`.
- WebSplatter (§222, Feb 2026) — Gaussian splat visual language, Canvas2D approach. Seeds `splat-bloom`.
- Voxtral + Web Speech API (§223, Feb 2026) — spoken-word AV control, zero deps. Seeds `voice-scene`.
- MUTEK 2026 Sphaîra (§224, May 2026) — architectural acoustics as instrument. Seeds `sdf-cave`.
- Revision 2026 Shader Showdown (§225, Apr 2026) — SDF smin blending, audio-reactive. Also seeds `sdf-cave`.
- Gesture-Based Control Framework (§226, Apr 2026) — relative joint distances. Updates `body-conductor`.

---

## 2026-05-27 — Cycle 213 research sweep

### §227 — Stable Audio 3 (arxiv 2605.17991, May 18, 2026)
**Source**: https://arxiv.org/abs/2605.17991

Stability AI's next-gen latent diffusion family (small/medium/large) for variable-length audio
generation and editing. Key advances: semantic-acoustic autoencoder for compact latent representation,
adversarial post-training for fast inference — generates several minutes of audio in under 2s on an
H200, a few seconds on a MacBook M4. Supports inpainting (targeted audio editing) and continuation
(extend a short recording). Small + medium weights publicly released for consumer hardware.

**Impact for dream zone**: upgrade path for `43-stable-extend` when Stable Audio 3 appears on fal.ai.
Small model could also run locally on Karel's M4 Mac — first truly offline AI audio extension. Also
seeds a new **live-extend** interaction: record a phrase, model extends it in <5s (vs. 10–30s for SA
2.5), enabling a near-real-time call-and-response feel. [Date: May 2026, arxiv 2605.17991]

---

### §228 — Music of Changing Lines: I-Ching as Real-Time Music Generator (arxiv 2605.20386, May 2026)
**Source**: https://arxiv.org/abs/2605.20386 — presented at ICMC 2026.

Traditional Wen Wang Fa coin casting ritual (three coins thrown six times → hexagram) fed into
Gemini LLM for contextual interpretation, then Lyria real-time music generation. The ritual act IS
the music input — not a typed prompt, not mic, not MIDI. Each of the 64 I-Ching hexagrams generates
unique music. "Controlled randomness as sacred input": you cast to discover what the music wants
to be. First published system connecting ceremonial gesture to AI music at ICMC.

**Could become prototype**: `ritual-generate` — six rounds of virtual coin throws (tap screen 3
times per round, coin results shown as solid/broken lines), 6 rounds builds a hexagram. The hexagram
number (1–64) maps to one of Resonance's Ghost journey themes + an ambient music prompt sent to
Lyria 3 Pro. Canvas shows the hexagram symbol building line by line with ink-brush animation. After
6 casts: "Generate" → 30s ambient piece plays through live-bloom visualizer. Six casts → six-line
hexagram → one meditation. Ceremonial, non-Western, genuinely surprising.
Needs GEMINI_API_KEY (same key already planned). One-cycle build. [Date: May 2026, arxiv 2605.20386]

---

### §229 — PianoFlow: Streaming Bimanual Piano Motion Synthesis (arxiv 2604.12856, April 2026)
**Source**: https://arxiv.org/abs/2604.12856

Flow-matching architecture for real-time bimanual piano hand motion synthesis from audio. 9×
faster than prior SOTA; autoregressive flow continuation enables streaming for arbitrarily long
pieces. Uses MIDI as a privileged training modality (better motion realism) while remaining
audio-only at inference. Output: continuous skeletal hand/finger positions synchronized to audio.

**Could become prototype**: `piano-motion` — load Karel's piano track via `/api/audio/[id]`,
run offline pitch detection (autocorrelation, same as `13-piano-canvas`) to extract note events.
Animate simplified top-down piano hands on Canvas2D: each note event moves the appropriate hand
(left=below C4, right=C4+) to the correct key position, with a brief "finger press" animation
(mild scale + subtle drop shadow). No ML needed — rule-based hand animation derived from pitch data.
Hands follow smooth spring-interpolated trajectories between notes. "Watch your music being played."
First prototype that visualizes the ACT of piano performance rather than the audio output. Zero deps.
Incorporates Karel's real music (AGENT.md directive). One-cycle build. [Date: Apr 2026, arxiv 2604.12856]

---

### §230 — SAMUeL: 15M-Param Real-Time Vocal Accompaniment (arxiv 2507.19991, Jul 2025)
**Source**: https://arxiv.org/abs/2507.19991

Ultra-compact (15M params, 220× smaller than SOTA) latent diffusion model for vocal-conditioned
accompaniment. Soft alignment attention mechanism adapts between local and global temporal
dependencies per diffusion timestep — enables 52× faster inference, real-time on consumer hardware.
Take vocal input → generate synchronized musical accompaniment.

**Note for queue**: `44-vocal-bgm` already queued uses ACE-Step (one-shot, ~5–10s generation).
SAMUeL's key advantage is **streaming real-time**: vocal phrase → accompaniment starts in <0.5s.
No public fal.ai or WASM port confirmed. If SAMUeL releases a fal.ai endpoint, upgrade `44-vocal-bgm`
to use it for substantially lower latency. Monitor for fal.ai listing. [Date: Jul 2025, arxiv 2507.19991]

---

### §231 — LUMIA: Handheld Vision-to-Music Composition (arxiv 2512.17228, Dec 2025)
**Source**: https://arxiv.org/abs/2512.17228 — NeurIPS 2025 Creative AI track.

Camera-based "compose through looking" system: photograph a scene → GPT-4V interprets the visual
content → structured music prompt → Stable Audio generates a loopable segment. Users layer multiple
segments from different camera angles; user-selected instrumentation guides each generation.
"An improvisational practice driven by contextual, sensory engagement." Published Dec 2025.

**Could become prototype**: `camera-compose` — webcam snapshot button → Gemini Flash vision API
(describe scene in ≤40 words) → Lyria 3 Pro prompt ("ambient [description], 60 BPM, minimal,
contemplative") → 30s ambient piece plays through live-bloom radial visualizer. Simple UI: large
"📷 Take snapshot" button, generated scene description shown in secondary text, waveform player.
"Take a photo. Hear its music." Admin-only gate (GEMINI_API_KEY, same key). Zero new npm deps.
One-cycle build. Unique in sandbox: all 181 prior prototypes use mic or demo tones — this is the
first that reads the visual world. [Date: Dec 2025, arxiv 2512.17228]

---

### §232 — Lyria 3 Pro on fal.ai (new, May 2026)
**Source**: https://fal.ai/models — model ID `fal-ai/lyria3/pro`, tagged as newly added, May 2026.

Lyria 3 Pro is now listed on fal.ai as the "latest music model from Google" — an upgrade over the
previously catalogued Lyria 3 Clip (`lyria-3-clip-preview`). Same API family, presumably higher
quality and/or more control. Same GEMINI_API_KEY path. All queued Lyria prototypes should reference
this endpoint.

**Impact**: update `43-lyria-ghost`, `44-binaural-lyria`, `45-piano-to-ghost` specs to use
`fal-ai/lyria3/pro`. Also enables `camera-compose` (§231) and `ritual-generate` (§228) without
additional API approval, since GEMINI_API_KEY is already planned for those prototypes. [Date: May 2026, fal.ai]

---

### §233 — Mirelo AI SFX 1.6 Full Suite Update (fal.ai, new 2026)
**Source**: https://fal.ai/models?categories=audio — Mirelo suite newly expanded.

Mirelo AI SFX 1.6 expanded from basic text-to-audio to a four-endpoint suite:
- `mirelo-ai/sfx1.6/text-to-audio` — text → ambient SFX
- `mirelo-ai/sfx1.6/video-to-video` — synchronized video SFX (now up to 60s)
- `mirelo-ai/sfx1.6/extend-audio` — seamless audio continuation from a clip
- `mirelo-ai/sfx1.6/inpaint-audio` — selective regeneration of audio segments

**Impact**: `extend-audio` endpoint enables `41-mirelo-ghost-loop` to create 60s seamless Ghost
soundscapes (was 30s). `inpaint-audio` opens a new interaction: select a segment of a generated
soundscape → regenerate just that part → iterate toward the perfect Ghost scene atmosphere.
Also: in `43-stable-extend`, use Mirelo `extend-audio` as a cheaper alternative for ambient/SFX
content (Stable Audio 3 for music, Mirelo for environmental sound). [Date: May 2026, fal.ai]

Key findings from Cycle 213 (2026-05-27) — adult research sweep:
- Stable Audio 3 (§227, May 2026) — sub-2s generation, inpainting/continuation, public weights. Upgrade path for `43-stable-extend`.
- I-Ching + Lyria (§228, ICMC May 2026) — ceremonial coin casting → AI music. Seeds `ritual-generate`.
- PianoFlow (§229, Apr 2026) — 9× faster bimanual piano motion synthesis. Seeds `piano-motion`.
- SAMUeL (§230, Jul 2025) — 15M real-time vocal accompaniment, 52× faster. Monitor for fal.ai.
- LUMIA vision-to-music (§231, Dec 2025) — webcam → Gemini vision → ambient track. Seeds `camera-compose`.
- Lyria 3 Pro on fal.ai (§232, May 2026) — new fal.ai endpoint. Upgrades all Lyria-based queued specs.
- Mirelo SFX 1.6 full suite (§233, May 2026) — extend-audio + inpaint-audio added. Upgrades `ghost-loop` + `stable-extend`.

---

## 2026-05-29 — Cycle 233 research note

### §234 — DEMON: Real-Time Diffusion-Based Expressive Music Instrument
**Source**: https://arxiv.org/abs/2605.28657 (May 27, 2026)

DEMON (Diffusion-based Expressive Music instrument cONtrol) is a real-time playable instrument
that maps arbitrary high-dimensional parameter vectors to generated audio via a latent diffusion
model trained specifically for low-latency synthesis. Key property: parameters don't map to
individual knobs — they form *layers* that propagate through a hierarchy, so moving one control
reshapes dozens of synthesis dimensions simultaneously. The authors demo it as a playable live
instrument at <100ms latency. Training corpus: diverse timbres; any sound in the latent space is
reachable by interpolating parameter vectors.

**Could become a prototype**: `param-layer` — a zero-dep browser instrument where 4 concentric
ring controls (each a drag-ring, not a slider) broadcast their values as a parameter vector
through a 4-layer harmonic synthesis graph. Outer ring = fundamental / "mass"; next ring = odd/even
harmonic balance; next = inharmonicity (stretch factor); inner ring = amplitude envelope shape.
Each ring influences *all* layers below it, mimicking DEMON's hierarchical propagation. No
diffusion model needed — the same perceptual effect (one gesture, global timbre reshape) can be
approximated with the harmonic-series engine built in `200-harmonic-series`. Zero deps, zero API,
one cycle scope.

**Also seeds**: `membrane-drum` — a 2D finite-difference wave equation drumhead. A circular
membrane whose tension, damping, and strike position are controlled by the same concentric ring
UI. Tapping anywhere on the drum surface strikes it; the wave propagates outward visible on canvas.
Physically accurate overtone ratios (not integer — real drums are inharmonic like bells). Zero deps.

Key findings from Cycle 233 (2026-05-29) — research note (brief, build cycle):
- DEMON (§234, May 2026) — hierarchical parameter propagation instrument. Seeds `param-layer` and `membrane-drum`.

---

## 2026-05-30 — Cycle 247 research sweep

### §235 — DiscoForcing: Streaming Audio-Driven Full-Body Character Animation (ICML 2026)
**Source**: https://arxiv.org/abs/2605.28491 (May 27, 2026)

DiscoForcing generates full-body skeleton animations synchronized to music in real time. A causal music
encoder captures rhythmic structure and phase dynamics; a diffusion-forcing sequence model with
heterogeneous noise levels handles streaming. Strictly causal, bounded-latency — handles abrupt tempo
shifts and audio changes that defeat offline systems. Accepted ICML 2026. EchoAvatar (§236) extends
the idea to 3D + LLM intent.

**Browser adaptation**: `dance-avatar` — a 12-joint spring-physics skeleton (head, shoulders×2,
elbows×2, hands×2, hips, knees×2, feet×2) animated by FFT bands. No ML, no CDN. Bass → hip sway
amplitude; treble → arm elevation angle; onset → upward joint velocity impulse; spectral centroid →
forward/backward lean. Joints as `{pos, vel, restPos}` objects; per-frame `pos += vel; vel += k(rest-pos) - damping*vel`.
Canvas2D glow-line skeleton on black background. "Your music finds a body." Paradigm gap: 213 existing
prototypes, none animate a human figure. Live-performance fitness: project on stage next to the pianist.
Zero deps, one cycle. [Date: May 27, 2026, ICML 2026, arXiv:2605.28491]

---

### §236 — EchoAvatar: 3D Character Motion from Audio with LLM Intent (arXiv:2605.28272, May 2026)
**Source**: https://arxiv.org/abs/2605.28272 (May 27, 2026)

Synthesizes high-fidelity 3D character motion from audio with an LLM integration layer that bridges
reactive animation (frame-by-frame) with intent-driven behavior (long-horizon goal). Designed for
interactive avatar deployment (games, virtual performances). Not browser-feasible as an ML model.

**Note for queue**: confirms §235's core claim — audio-driven character animation is a live frontier
(two simultaneous ICML-accepted papers). The intent/goal modeling layer from EchoAvatar is something
the `33-aria-companion` Markov chain approximates at the musical level. Future: combine DiscoForcing's
motion style with Aria's turn-taking structure for a "Ghost dancer" that responds to your playing phrase
by phrase rather than frame by frame. [Date: May 27, 2026, arXiv:2605.28272]

---

### §237 — V2M-Zero: Zero-Pair Video-to-Music Generation (arXiv:2603.11042, Mar/May 2026)
**Source**: https://arxiv.org/abs/2603.11042 (March 2026, updated May 2026)

Generates music from video without any paired video-music training data. Key technique: match temporal
structure within modalities (video rhythm ↔ music rhythm) rather than cross-modal alignment, avoiding
paired-data scarcity. State-of-the-art video-music synchronization on benchmarks.

**Could become prototype**: `optical-flow-music` — inverts V2M-Zero's direction: webcam optical flow
(frame differencing, Canvas2D, no MediaPipe) → synthesis parameters. Extract total motion magnitude,
horizontal bias (left/right flow asymmetry), vertical bias (up/down). Map: magnitude → filter cutoff
+ arpeggiation speed; horizontal → pitch glide (C3–C5); vertical → reverb depth. Show webcam at 40%
opacity with flow arrows drawn as glowing gradient lines. "Dance in front of the camera — movement IS
the music." First prototype using optical flow synthesis without a CDN dep. Different from `31-gesture-music`
(MediaPipe hand landmarks) — this is pure pixel math. Zero deps, one cycle.
[Date: March/May 2026, arXiv:2603.11042]

---

### §238 — BEAT: Uniform Beat-Based Tokenization for Symbolic Music Generation (arXiv:2604.19532, April 2026)
**Source**: https://arxiv.org/abs/2604.19532 (April 2026, submitted May 2026)

Proposes beat-based tokenization where each beat is one fixed-length token rather than a variable-length
event sequence. Uniform time progression enables better long-range pattern capture and structural coherence
in music generation. Outperforms event-based baselines on accompaniment generation tasks.

**Note for queue**: no browser API yet; server-side LM. Foundational insight: beat-quantized representation
is computationally superior for structural coherence. Informs design of future `beat-looper` prototype —
a zero-dep browser beat grid where each column = one beat, user draws patterns, system plays them
beat-quantized. Not the same as `48-tap-rhythm` (which detects free-tapped rhythm) — this would be
a structured grid with explicit beat identity. One-cycle build candidate. [Date: April 2026, arXiv:2604.19532]

---

### §239 — ACE-Step 1.5 Local UI Trending on GitHub (May 2026)
**Source**: https://github.com/trending/javascript (week of May 30, 2026)

`ace-step-ui` (fspecii) gained 1,940 GitHub stars THIS MONTH (3,999 total) — top-trending JS audio repo.
Described as "Professional UI for ACE-Step 1.5 AI Music Generation — free, local alternative to paid
music platforms." Confirms ACE-Step 1.5 is the most actively used community music generation model.

**Impact**: validates timing of `44-vocal-bgm` (ACE-Step audio-to-audio) and `48-arc-compose` (ACE-Step
section-tagged generation). The local-UI trend also suggests Karel may want a local-first dream lab mode
(Tauri build running ACE-Step locally, no API cost). Tag for Tauri installation-mode discussion.
[Date: May 2026, GitHub trending]

---

### §240 — Seedance 2.0: Top Video Model on Replicate (438.5K Runs, May 2026)
**Source**: https://replicate.com/explore (May 2026); also on fal.ai

Seedance 2.0 (ByteDance) is the top-usage video model on Replicate with 438.5K runs. Accepts multimodal
inputs: text + image + audio reference + up to 3 reference videos → cinematic video with native audio.
Also available on fal.ai with identical functionality.

**Impact on `ghost-animate`**: previous plan used Ghost LoRA image alone as Seedance input. Can now also
supply an audio reference clip (e.g., a 10s ambient Ghost soundscape generated by Mirelo SFX 1.6) so the
resulting video's native audio is coherent with the scene's acoustic character. Estimated budget:
~$0.05–0.15/clip. Plan update: (1) generate Ghost LoRA image, (2) generate Ghost ambient SFX clip
(Mirelo text-to-audio), (3) supply both as Seedance 2.0 inputs → one cinematic clip with matched audio.
Admin-only. FAL_KEY in use. [Date: May 2026, Replicate explore]

---

### §241 — FM Synthesis: Foundational Browser Gap in the Dream Sandbox (synthesis research note, 2026-05-30)
**Source**: Web Audio API spec + synthesis literature (John Chowning 1973; Yamaha DX7 1983); no external URL.

FM (frequency modulation) synthesis: output = carrier_freq + sin(modulator_phase) × FM_index × modulator_freq.
Implemented in Web Audio with two `OscillatorNode`s and one `AudioParam.connect()`:

```js
const carrier = actx.createOscillator();
const modulator = actx.createOscillator();
const modGain = actx.createGain();   // FM index
modulator.connect(modGain);
modGain.connect(carrier.frequency);  // modulates carrier frequency
carrier.connect(actx.destination);
```

Timbral space: ratio 1:1 (same frequency) + varying index → metallic growl; ratio 2:1 + high index → bell
partials; ratio 3.5:1 + low index → woody; ratio 7:4 + sweeping index → bass FM growl (classic 808-style).
213 existing prototypes — none use FM synthesis despite being a foundational technique (DX7 is the best-selling
synthesizer ever made). The paradigm gap is complete.

**Could become prototype**: `fm-explorer` — Route `/dream/215-fm-explorer`. A 2D canvas: X axis = carrier
pitch (C2–C7 log), Y axis = modulator-to-carrier ratio (0.5–8.0). Mouse/touch position determines pitch and
ratio. FM index driven by mouse distance from canvas center (or a large slider). A background color field
shows timbral complexity (spectral richness estimate: low-ratio/low-index = smooth, high-ratio/high-index =
complex). Moving across the canvas sweeps through hundreds of timbres without reading any labels. Mic mode:
RMS amplitude → FM index (quiet → simple tone, loud → complex metallic). Presets: Bell (E4, √2 ratio, index 8),
Rhodes (C3, 2:1, index 3.5), Clangy (G3, 3.5:1, index 12), Sub-bass (A1, 1:1, index 2). Zero deps, zero API.
One cycle. [Date: 2026-05-30, synthesis note]

---

### §242 — Web Audio `createPeriodicWave`: Draw-Your-Waveform Interaction (API research note, 2026-05-30)
**Source**: W3C Web Audio API spec (https://www.w3.org/TR/webaudio/#dom-baseaudiocontext-createperiodicwave)

`AudioContext.createPeriodicWave(cosineTerms: Float32Array, sineTerms: Float32Array)` creates an arbitrary
periodic waveform from Fourier coefficients, which can then be set on an `OscillatorNode` via
`OscillatorNode.setPeriodicWave()`. The waveform updates in real time — no click, no restart needed. To
convert a user-drawn curve to Fourier coefficients: sample the curve at N=512 evenly-spaced points into
a Float32Array, compute the forward DFT (written inline in ~20 lines, or use a pre-baked Cooley-Tukey FFT),
extract the real (cosine) and imaginary (sine) parts → `createPeriodicWave(cosTerms, sinTerms)`.

213 existing prototypes — none use `createPeriodicWave`. Every prototype uses preset oscillator types
(`sine`, `square`, `sawtooth`, `triangle`) or audio input. No prototype lets the user sculpt the synthesis
source directly.

**Could become prototype**: `waveshape-draw` — Route `/dream/216-waveshape-draw`. Canvas shows a 1-period
sine wave. User draws directly on the canvas (drag up/down to deform the wave). Each `pointermove`:
re-sample the drawn curve → DFT → `createPeriodicWave` → `setPeriodicWave()`. Timbre changes in real time
as you draw. Secondary horizontal strip shows harmonic spectrum (bar chart of DFT magnitude bins 1–32).
Preset buttons: Sine, Square, Sawtooth, Triangle, and "Piano" (pre-loaded 32-coefficient shape approximating
a piano's harmonic series). Pitch slider C2–C7. Mic input: RMS → draw pressure (louder = more distortion
applied to current shape). "Draw the voice of your instrument." Paradigm inversion: all prior prototypes
react to or visualize sound; this sculpts the source. Zero deps, zero API. One cycle.
[Date: 2026-05-30, API research note]

---

### §243 — Spring-Physics Dance Avatar: Design Sketch (design note, 2026-05-30)

Derived from §235 (DiscoForcing). A 12-joint skeleton for 2D Canvas2D:

```
Joints: head, shoulderL, shoulderR, elbowL, elbowR, handL, handR, hip, kneeL, kneeR, footL, footR
Segments: head-shoulderL, head-shoulderR, shoulderL-elbowL, elbowL-handL, shoulderR-elbowR, elbowR-handR,
          hip-shoulderL (via torso), hip-shoulderR, hip-kneeL, kneeL-footL, hip-kneeR, kneeR-footR
```

Per-frame update: `vel += (restPos - pos) * k - vel * damping; pos += vel`. Audio mappings to rest positions:
- `restPos[hip].x = center + sin(t * 1.2) * bass * 40` (bass → hip sway amplitude)
- `restPos[handL].y = center - mid * 80; restPos[handR].y = center - mid * 80` (mid → arm raise)
- `restPos[head].x = center + treble * 12` (treble → head tilt)
- On onset: all `vel.y -= onset * 120` (upward impulse → jump)
- `restPos[shoulderL].x = center - (1 + centroid * 0.3) * 45` (centroid → posture width)

Render: each limb as a glowing line (`lineWidth=3`, `shadowBlur=12`, hue shifts with audio band —
sub-bass=violet, bass=teal, mid=amber, treble=rose). Head as a circle, radius 18px. Black background.
Optional: draw a subtle echo of the figure 5 frames behind at 30% opacity (motion trail effect).

"Why zero deps": spring physics is 10 lines of JS. No skeletal rig library needed. The figure does not need
anatomically correct anatomy — an abstracted Matisse-cutout silhouette, simple and expressive, is better.
One-cycle build. Route `/dream/214-dance-avatar`. [Date: 2026-05-30, design note]

---

### §244 — Webcam Optical Flow Synthesis: Frame-Differencing Approach (design note, 2026-05-30)

Derived from §237 (V2M-Zero). No MediaPipe, no CDN dep. Pure Canvas2D pixel math:

1. `getUserMedia({ video: true })` → `<video>` element
2. Each animation frame: draw video frame to an offscreen canvas, call `getImageData()` to get current pixels
3. Compute per-pixel delta from previous frame: `delta = |curr_gray - prev_gray|` where `gray = 0.299R + 0.587G + 0.114B`
4. Downsample to a 20×15 grid (8 cells per cell). Per cell: `magnitude = avg(deltas in cell)`, `dx = avg(right-half − left-half deltas)`, `dy = avg(bottom-half − top-half deltas)`
5. Global features: `totalMag = sum(magnitude) / 300`, `hBias = sum(dx) / 300` (positive = rightward flow), `vBias = sum(dy) / 300`

Web Audio synthesis:
- `totalMag` → `filter.frequency.value = 400 + totalMag * 5600` (still=dark, moving=bright)
- `hBias` → pitch via `oscillator.frequency.value = 220 * Math.pow(2, hBias * 2.5)` (left=down, right=up, ~±2.5 octaves)
- `vBias` → `reverbGain.gain.value = Math.max(0, vBias * 2)` (downward flow = more reverb)
- `totalMag` → arpeggiation rate: `noteInterval = Math.max(0.05, 0.8 - totalMag)` seconds per note

Display: webcam at 40% opacity. Per grid cell: a glowing gradient line from cell center in the direction
of `(dx, dy)`, length proportional to `magnitude`. 6-band spectrum bar at the bottom (same style as `1-live`).
Zero deps, zero CDN, one cycle. Route `/dream/217-optical-flow-music`. [Date: 2026-05-30, design note]

---

## 2026-06-01 — Cycle 267 research dive (15-min, per Ambition mandate)

### §245 — Earthquake Pulse Map & the silent-globe gap (showcase + USGS feed, current)

**Source:** webgpu.com showcase — *"Earthquake Pulse Map: A Century of Seismic
Activity on a WebGL Globe"* (plots M6+ quakes 1900–2026 + a live USGS 2.5_week
feed on a three.js globe with custom GLSL shaders and binary-packed data).
Supporting: USGS real-time GeoJSON feeds
(`earthquake.usgs.gov/earthquakes/feed/v1.0/`, public, keyless, CORS-open), and
the **"Sounds of Seismic" (SOS)** / **IRIS SeisSound** sonification tradition.

**Why it's surprising / relevant:** The visualization community has thoroughly
mined USGS seismicity as a *visual* dataset — spinning globes, pulse maps, heat
layers — but these globes are **silent**. Meanwhile the seismology-education
world has a deep sonification tradition (time-compress a seismogram into the
audible band), but it stays at the single-station-waveform level, not the
*global event catalog as a sequenced composition*. Nobody has joined the two:
a live globe where each plotted quake also *sounds*, sequenced in compressed
real time, with magnitude/depth/longitude mapped to pitch/timbre/pan.

**Could become a prototype that:** pulls the USGS `all_day` feed, time-compresses
24h into ~2.5 min, and plays each quake as a sounding event over a pulsing r3f
globe — bigger = deeper boom, deeper = muffled, longitude = stereo. → **Built
this cycle as `233-earth-pulse`.** Also seeds: a `weather-score` (NOAA/SWPC
space-weather Kp index → drone texture), a `transit-pulse` (live flight/AIS
positions → spatial arpeggio), and an `iss-pass` sonifier — the whole
*real-world-data-sonification* category the lab is empty on.

---

Key findings from Cycle 247 (2026-05-30) — full research sweep:
- DiscoForcing (§235, ICML 2026, May 2026) — streaming audio-driven character animation. Browser adaptation seeds `dance-avatar` (spring physics, zero deps, human-figure paradigm gap, live performance).
- EchoAvatar (§236, May 2026) — audio + LLM → 3D character motion. Server-side; directional only.
- V2M-Zero (§237, Mar/May 2026) — video-to-music without paired training. Validates `optical-flow-music` concept (frame differencing → synthesis, zero CDN).
- BEAT tokenization (§238, April 2026) — beat-quantized token = better structural coherence. Seeds future `beat-looper` idea.
- ACE-Step UI trending (§239, May 2026) — 1,940 stars/month. Confirms `vocal-bgm` and `arc-compose` timing.
- Seedance 2.0 (§240, May 2026) — 438.5K Replicate runs, multimodal (image + audio ref). Updates `ghost-animate` to supply audio reference.
- FM synthesis gap (§241, synthesis note) — 213 prototypes, none use FM. Seeds `fm-explorer` (2D timbral landscape, zero deps).
- createPeriodicWave gap (§242, API note) — most underused Web Audio primitive. Seeds `waveshape-draw` (draw → timbre, paradigm inversion).
- Dance avatar design (§243, design note) — 12-joint spring-physics skeleton, zero deps, one cycle. Route `/dream/214-dance-avatar`.
- Optical flow synthesis design (§244, design note) — frame differencing → pitch/filter/reverb, zero CDN. Route `/dream/217-optical-flow-music`.
- DEMON (§234, May 2026) — real-time diffusion music instrument with hierarchical parameter propagation. Seeds `param-layer` and `membrane-drum`.

---

## 2026-06-01 — Cycle 268 research dive (15-min, per mandate)

### MediaPipe Hands + three.js as a hand-conducted instrument — and the kids gap
**Sources**: Derivative, "Hand Tracking Master Class in TouchDesigner with MediaPipe" (derivative.ca community tutorial) · Google Research, "On-Device, Real-Time Hand Tracking with MediaPipe" (21 3D keypoints from a single frame) · spite/clicktorelease, "Vertex displacement with a noise function using GLSL and three.js" (the canonical Perlin-noise blob shader).

What's surprising: the TouchDesigner community has fully normalized MediaPipe hand/pose landmarks as a *conducting* surface for real-time 3D visuals (the Derivative master class treats 21 hand keypoints like CHOP channels driving geometry), and the browser has the exact same primitives for free — `@mediapipe/tasks-vision` HandLandmarker loads from jsDelivr at runtime (no build dep) and runs `detectForVideo` at 30fps on-device. Yet **the Resonance lab has never shipped a single MediaPipe prototype** (all are queued: `31-gesture-music`, `119-body-conductor`, `147-face-synth`) and **no kids prototype has ever used three.js** — the entire kids zone is touch + canvas2d. The two silos (TD-style body-conducted 3D, and the kids-music space) have never met.

**Could become a prototype**: a 3D creature a child grows and plays *without touching the screen* — hand height/openness (MediaPipe) or voice pitch/loudness (mic autocorrelation) drives a Perlin-displaced blob (three.js) and rings a pentatonic call-and-response. This cycle's build chain (DEEP, 2 parallel approaches: `234-kids-hand-creature` camera, `235-kids-sing-creature` voice) implements this hook directly. First MediaPipe-or-3D piece in the kids zone; breaks the touch+canvas2d local minimum the diversity audit flagged.

---

## 2026-06-01 — Cycle 269 research dive (15-min, per mandate)

### WebGPU/WebGL emergent "Particle Life" has gone mainstream-browser — and nobody has *sonified the emergence*
**Sources**: lisyarus, "Particle Life simulation in browser using WebGPU" (lisyarus.github.io blog, 2026) · Markaicode, "WebGPU Game Physics: Simulating 1M Particles in the Browser" (markaicode.com, 2026) · WebGPU community showcase "Party — a WebGPU particle physics playground" (webgpu.com) · the "Medusae" audio-reactive GPU-physics piece referenced in the 2026 WebGPU graphics roundups. Lineage of the algorithm: Jeffrey Ventrella's *Clusters*, Tom Mohr / CodeParade's *Particle Life*.

What's surprising: as of 2026, WebGPU compute shaders make **1M+ interacting particles at 60fps** routine *in a browser tab*, and the creative-coding community has standardized "Particle Life" (an asymmetric S×S inter-species attraction matrix → astonishing emergent cells, membranes, chasers) as the go-to demo. But every example is **silent eye-candy** — even "Medusae," which is explicitly audio-*reactive*, runs the causality backwards (audio drives particles). **Nobody runs it forward: let the self-organization BE the score.** The Resonance lab has never used particle-life, GPGPU ping-pong textures, or any emergent-simulation technique — it's a wide-open, never-touched paradigm. The hook: map each species to a pentatonic voice whose gain/brightness swells with that species' local clustering, so when a swarm condenses into a tight cell you *hear its note bloom*. Music ABOUT emergence, not music visualized.

**Could become a prototype that**: runs ~3–8k particles via three.js `GPUComputationRenderer`, computes a per-species clustering metric each frame, and drives one Web Audio voice per species → built this cycle as `236-particle-life-song` (one of three WIDE explorers; siblings `235-spectral-terrain` and `237-tonnetz-lattice`). Also seeds future `particle-life-conductor` (mic onset perturbs the matrix) and a `reaction-diffusion-voice` companion in the same emergent-sonification family the lab is empty on.

---

## 2026-06-01 — Cycle 270 research dive (15-min, mandatory)

### Tilt-as-instrument: browser accelerometer marble physics is mainstream-feasible
**Source**: https://www.kikkupico.com/posts/vibe-discovery/ ("Inertia", kikkupico, 2026) · cross-ref embodied-music-cognition (movement reciprocally shapes pitch perception; Reggio Emilia sensorimotor learning).

What's surprising: a full WebGL marble game — `ondevicemotion`/`ondeviceorientation` → real marble physics over procedural terrain, dynamic camera, browser-only — was built on an old Android phone with Claude Code, no native code. Tilt-as-input is now trivially feasible on the web. Yet across the lab's ~110 kids prototypes, **not one uses the device's own motion to play in a 3D world** — they are all fingers on flat 2D glass. The one prior tilt piece (`83-kids-tilt-rain` ❤️) is a 2D basket-catch. Embodied-music-cognition research says this matters pedagogically: a 4-year-old who *leans the tablet to roll a ball onto a note* is learning pitch through whole-body movement, not abstract symbol-pointing — the strongest sensorimotor path KIDS.md endorses.

**Could become a prototype that**: tilts the iPad to roll a glowing marble across a 3D musical hill-world (three.js heightfield with real downhill gravity), ringing C-pentatonic note-pads with StereoPanner spatial audio that tracks the ball — built this cycle as `238-kids-tilt-world` (winner of a WIDE 3-builder kids fire; siblings `239-kids-sing-garden` + `240-kids-wave-band` banked in IDEAS.md). Also seeds a future adult `tilt-orbit` (tilt to steer a body through a gravitational soundscape) and a `tilt-fluid` (accelerometer drives a fluid-sim sloshing audio reactively).
