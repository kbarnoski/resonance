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
