# Resonance Dream IDEAS — living queue

Each idea has a status (`queued` / `in-progress` / `demoable` / `polished` / `dead`),
a slug (becomes the route `/dream/<n>-<slug>`), and a spec terse enough for
the Dream Agent to build from. Add new ideas to the bottom; promote
items by editing status in place.

The agent appends new ideas here from research cycles. Karel adds ideas
via Claude Code conversation; assistant transcribes into this file.

---

## SEEDED — to build first

### 0. dashboard — turn /dream/ into a live single-bookmark dashboard `[queued, do FIRST]`

**Question**: when Karel opens one URL on his phone at 06:30, what's the
absolute best single-page experience?

**Spec**:
- Enhance `src/app/dream/page.tsx` (currently a static prototype list)
  into a real dashboard that reads three files at request time:
  - `docs/dreams/MORNING.md` — rendered as the top hero section
    ("This morning's digest")
  - `docs/dreams/STATE.md` — parse the latest 3-5 cycle entries and
    show them as a "Recent activity" stream (cycle number, UTC
    timestamp, one-line summary)
  - `docs/dreams/INDEX.md` OR the existing PROTOTYPES constant — list
    of prototypes with status badges, click-through to play
- Use Next.js server component + `fs/promises` to read the files at
  build time (Vercel rebuilds on every push, so each cycle's changes
  flow in automatically). Wrap with `export const dynamic = 'force-static'`
  for fast loads.
- Render MORNING.md and the STATE.md slices via a tiny markdown→jsx
  converter (no external deps — just handle headings, bullets, links,
  and code spans). Resist installing `react-markdown` for this; we
  want the dream zone dependency-free.
- Layout: dashboard top (hero MORNING + recent activity), prototypes
  middle, footer with links to (GitHub branch, Claude Code routines
  page at claude.ai/code/routines, this dream's README).
- Phone-first responsive. Dark theme already in place via dream layout.

**Why this first**: Karel wants ONE bookmark on his phone home screen
that surfaces everything. Right now he has to triangulate between
GitHub, Claude Code app, and the preview URL. This consolidates them.
It's also a perfect "agent's first autonomous task" — meaningful work
that proves the loop functions before launching into more speculative
prototypes.

**Acceptance**:
- Open `/dream/` on a phone-sized viewport — MORNING.md content visible
  immediately above the fold, no scrolling required to see "what's new"
- Recent cycles section shows actual cycle data from STATE.md (not
  placeholder text)
- Prototype list still works (clickable, status badges)
- Local `next build` succeeds, type-check clean

### 1. live — mic-input audio-reactive viz `[in-progress]`

**Question**: what if Resonance could respond to anything you play, live?

**Spec**:
- Route: `/dream/1-live`
- "Start mic" button → `getUserMedia({ audio: true })` → Web Audio AnalyserNode
- Split FFT into 6 bands: sub-bass (20-60Hz), bass (60-250), low-mid (250-500), mid (500-2k), high-mid (2k-4k), high (4k-20k)
- Map energy per band to color/intensity using:
  - sub-bass → deep violet/indigo (cool, heavy)
  - bass → cyan/teal (cool, fluid)
  - low-mid → green (transitional)
  - mid → yellow (warming)
  - high-mid → orange (warm, sharp)
  - high → red/magenta (hottest, finest detail)
- Canvas viz: full-screen, six radial color fields blooming from center, each band controlling one. Smooth interpolation (exponential moving average per band) so it breathes, not flickers.
- Onset detector → trigger a brief white flash for percussive hits
- Tempo estimate → BPM display in corner
- Sensitivity slider (live performance needs tunable mic gain)
- Latency target: <50ms input-to-screen

**Why this first**: it's the most-discoverable prototype (anyone with a mic can play), demonstrates the band→color mapping that informs all other prototypes, and proves the live-input pipeline works.

### 2. ghost-lab — A/B Ghost LoRA testing `[queued]`

**Question**: can we iterate the Ghost LoRA faster by comparing variants side-by-side?

**Spec**:
- Route: `/dream/2-ghost-lab`
- UI: prompt textarea, LoRA scale slider (0.5–1.5), seed input, "Generate A vs B" button
- Generates two images via `/api/ai-image/generate` with different scales OR different prompts
- Side-by-side display with vote buttons (👍 A, 👍 B, both, neither)
- Stores votes to localStorage to build intuition for what scales work for what scenes
- Pre-set "scenes" dropdown: "stone chamber back-view", "forest dawn full-body", "cosmic flying profile" — quick way to test the LoRA on key Ghost compositions without rewriting prompts
- Admin-only (reuses existing `isAdmin` gate)

**Why**: the LoRA tuning right now is "play Ghost, watch, guess what's wrong, change a number." This makes it deliberate.

### 3. fluid — Navier-Stokes fluid driven by audio `[queued]`

**Question**: what if the visualizer felt like ink in water reacting to sound?

**Spec**:
- Route: `/dream/3-fluid`
- GPU fluid simulation (port a small open-source shader-based solver — e.g. Pavel Dobryakov's WebGL fluid sim or a leaner variant)
- Mic input (reuse `/dream/1-live`'s analyser hook from `_shared/`)
- Audio mapping:
  - Bass energy → pressure pulses at center
  - Treble energy → curl/turbulence forces
  - Spectral centroid → injection color (low pitch = blue, high pitch = red)
  - Onset → splat at random position
- Touch/mouse stir as fallback when no mic
- Toggle: "react to mic" / "ambient drift"

**Why**: pure GPU, very different aesthetic from existing Resonance shaders, performs well on lower-end devices, captivating to interact with.

### 4. operator — Tauri-mode operator panel mock `[demoable]`

**Question**: what does running Resonance from a venue's booth look like?

**Spec**:
- Route: `/dream/4-operator`
- Two-pane UI: left = "performer view" (large viz preview + scene list), right = "operator controls" (scene picker, MIDI map, transition timer, fader for mic-input gain, BPM tap)
- Scene library: 6 pre-baked scenes (each is one of the dream prototypes or a Resonance journey snapshot), pickable, transitions with crossfade
- MIDI input (Web MIDI API): when a MIDI device is connected, show "MIDI: <device name>" and let user assign CC knobs to scene-blend fader / scene-trigger pads
- BPM tap button (spacebar) → drives any scene's pulse params
- Crowd-noise meter (mic input) — visual indicator only for now; later could trigger climax cues

**Why**: live performance is the highest-impact future for Resonance. Even a mock helps you (Karel) think through what controls a performer needs.

### 5. arcs — Journey engine v2 (non-psychedelic arcs) `[demoable]`

**Question**: what if journeys could have shapes other than the 6-phase psychedelic arc?

**Spec**:
- Route: `/dream/5-arcs`
- Arc picker: "Psychedelic (current)" / "EDM Build-and-Drop" / "Cinematic Three-Act" / "Ritual / Ceremony" / "Sleep Cycle"
- Each arc is its own phase definition (count, duration weights, shader rotation rules, post-fx curves, ambient layers)
- Audio source: looped sample (provide a short audio file in `public/dream/` per arc that matches the arc's shape, or use mic input)
- Visual demo of how each arc unfolds: timeline at bottom, phase chips light up, color/shader changes mid-arc
- Side panel: "what's different about this arc": text comparing it to the psychedelic baseline

**Why**: forces an explicit articulation of what "a Resonance journey" actually IS structurally, opens the door to non-introspective use cases (dance music, soundtracks, ambient sleep, ritual ceremonies).

---

## QUEUED — agent may pick up after seeded set

### strange — strange attractor viz `[demoable]`
Lorenz attractor in 3D with real-time FM synthesis driven by xyz coordinates. Shipped as `/dream/10-strange` (Cycle 10). Mic mode modulates σ live. See README for polish ideas: σ/ρ/β sliders, non-chaotic regime exploration, loop into fluid sim.

### tessellate — Penrose / Truchet tile rhythm `[demoable]`
Shipped as `/dream/12-tessellate` (Cycle 12). 40×28 Truchet grid, mass flip on onset,
bass drizzle, two-color complement, Path2D batched rendering, ellipse() for non-square tiles.
See README for polish ideas: spatial frequency split, progressive resolution, inverted mode.

### terrain — fly-through spectrogram `[queued]`
Last 60s of FFT history is a 3D terrain. Camera flies forward through it. Bass = mountain height, treble = surface detail. Like Audiosurf for any audio.

### typography — generative kinetic type `[queued]`
Live poetry from existing Resonance poetry system → animated 3D type that breaks/forms with music. Variable font weight modulated by amplitude.

### reaction-diffusion — Turing patterns alive `[queued]`
Gray-Scott RD simulation. Audio drives feed/kill rates. Patterns evolve like coral/leopard spots/stripes. Hypnotic.

### audience — multi-phone collective viz `[queued]`
WebRTC channel: multiple phones in a venue each contribute one color/shape, server (or peer mesh) composites into one shared visualizer. Tech-heavy; might require backend work outside the dream zone — flag for design discussion first.

---

## FROM RESEARCH (Cycle 4, 2026-05-18) — promoted to queue

### compose — AI journey soundtrack generator `[queued]`
Route: `/dream/6-compose`. User types a mood/scene ("forest dawn ceremony, 70 BPM, ceremonial drums, reverbed piano"). ACE-Step on fal.ai generates a 30-second musical sketch ($0.006). Plays back through the fluid/live visualizer automatically. "Create your journey soundtrack." Could become the prototype for Resonance's "compose mode."  
Full research notes: RESEARCH.md §2.

### spatial — binaural HRTF spatial audio mixer `[queued]`
Route: `/dream/7-spatial`. Import any audio file or use mic. Split into 6 frequency bands via AnalyserNode. Place each band at a point on a 3D sphere using HRTF PannerNodes. Visualize sphere with glowing colored dots. User drags dots to reposition. With headphones, music surrounds you in 3D space. No deps — all Web Audio API. Live performance: immersive room-filling feel from one laptop.  
Full research notes: RESEARCH.md §5.

### particle-life — WebGPU flocking driven by audio `[queued]`
Route: `/dream/8-particle-life`. 6 species mapped to 6 frequency bands. Attraction/repulsion matrix gives emergent flocking/orbit/predator behavior. Audio energy controls particle "temperature" (velocity injection). Onset reshuffles the matrix → new emergent pattern emerges. Requires WebGPU (2026: 70% browser coverage). Completely alien aesthetic.  
Full research notes: RESEARCH.md §§4, 8.

### ghost-sound — add soundscape to Ghost images `[queued]`
Route: `/dream/9-ghost-sound`. Extend ghost-lab: after generating a Ghost image, pipe it through MMAudio V2 on fal.ai ($0.001/s) with an auto-generated prompt ("ethereal wind, stone chamber reverb, single piano note sustain"). Returns a 10s video with synchronized ambient soundscape. Ghost images that *breathe*. Admin-only. Budget: ~$0.01/generation.  
Full research notes: RESEARCH.md §3.

---

---

## FROM RESEARCH (Cycle 13, 2026-05-18) — promoted to queue

### piano-canvas — your improvisation as a painting `[demoable — /dream/13-piano-canvas, Cycle 14]`
Route: `/dream/13-piano-canvas`. Mic input → pitch detection via AnalyserNode autocorrelation.
Each detected note leaves a brush stroke on the canvas: pitch → hue (C=red rotating through
spectrum), velocity → stroke weight (0–8px), duration → stroke length. Strokes accumulate across
the session; the canvas persists as a visual record of what you played. Dark background; the
painting glows with each new note. "Your improvisation becomes a painting."

Fallback (no mic / no pitched notes): demo mode plays 3-octave ascending piano scale with slow
random improv, leaving example strokes. Canvas saves as PNG (download button).

No external deps. Full Web Audio API — `OscillatorNode` for pitch detection signal, `AnalyserNode`
for autocorrelation. Zero-crossings method: reliable for piano/voice (monophonic), degrades
gracefully for chords (picks the dominant pitch).

Why this now: none of the 12 existing prototypes treat the musical session as a *persistent visual
artifact*. This is the first "record of a journey" rather than a real-time reaction. Also the most
intimate — it rewards careful, deliberate playing. Full research notes: RESEARCH.md §10 (Art2Mus
inspired the image↔music axis; this is the reverse direction: your music → your image).

### reference-compose — style-match a piano phrase into a full track `[queued, needs FAL_KEY]`
Route: `/dream/14-reference-compose`. Record 4–8 bars of piano via mic → encode as WAV blob →
send as reference audio to MiniMax Music 2.5 on fal.ai ($0.035/track) alongside a text prompt
("extend this phrase into a 30-second atmospheric piece"). Get back a full track that sounds like
an extension of the user's playing. Play through fluid/live-bloom visualizer automatically.

"Your phrase, extended." This is the compose prototype upgraded: instead of typing a mood, you
play one. The output track is in the same harmonic/rhythmic universe as your input. Needs FAL_KEY
+ Karel budget approval. Full research notes: RESEARCH.md §12.

### ghost-animate — Ghost images → cinematic video with native audio `[queued, needs FAL_KEY]`
Route: (extend `/dream/2-ghost-lab`). After generating a Ghost LoRA image, pass it through
Seedance 2.0 on fal.ai (image + atmospheric text → 5–10s cinematic video with native audio).
The still Ghost image becomes a living, moving scene. Option: also pipe through Foley Control
for environmental soundscape layer. Admin-only. Budget estimate: $0.05–0.15/clip. Full research
notes: RESEARCH.md §§13, 15.

### webgpu-fluid — upgrade 3-fluid to WebGPU render pipelines `[demoable — /dream/15-webgpu-fluid, Cycle 16]`
Shipped as `/dream/15-webgpu-fluid`. 512×512 rgba16float render pipeline approach (not compute
shaders — fragment shader ping-pong, simpler to implement and equally fast at this resolution).
Same audio mapping as 3-fluid. WebGPU required; clear fallback. See README for polish ideas:
vorticity confinement, curl-noise turbulence, resolution toggle based on GPU tier detection.

---

## RESEARCH BIN — agent appends here from research cycles

See RESEARCH.md for full dated entries with sources.

Key findings from Cycle 4 (2026-05-18):
- ACE-Step music generation on fal.ai ($0.0002/s) — text → coherent music in 20s
- MMAudio V2 ($0.001/s) — video + text → synchronized ambient audio
- WebGPU at 70% browser coverage — compute shaders without extension flags, 1M+ particles
- HRTF binaural PannerNode spatial audio — no-dep 3D sound placement in browsers
- Strange attractor synthesizer pattern — attractor xyz coords drive FM modulation
- Gray-Scott RD implementations in WebGL — no audio version found, opportunity exists
- Network bending for diffusion models — audio-reactive content generation (not just color)

Key findings from Cycle 13 (2026-05-18):
- WebGPU confirmed in ALL major desktop browsers (Chrome, Firefox, Safari 26, Edge) as of Nov 2025
- Art2Mus (arxiv Feb 2026) — direct image→music via CLIP + AudioLDM 2, no text intermediate
- BRAVE (arxiv Mar 2026) — 10ms latency neural audio timbre transfer, approaching browser-ready
- MiniMax Music 2.5 ($0.035/track) — reference audio style matching, better than ACE-Step for style-match
- Foley Control (fal.ai) — video → synchronized sound effects; extends ghost-sound options
- Patchies (patchies.app) — browser-based code+visual patcher, inspiration for modular Resonance surface
- Seedance 2.0 / Kling 4K — cinematic video with native audio from reference images

---

## FROM RESEARCH (Cycle 18, 2026-05-18) — promoted to queue

### acoustic-trail — 3D spectral coordinate space trail `[queued]`
Route: `/dream/17-acoustic-trail`. Mic input (or demo oscillators) → extract three audio features
per frame: **spectral centroid** (brightness), **spectral bandwidth** (richness/noisiness), and
**pitch** (autocorrelation, same algorithm as `13-piano-canvas`). Map to [X, Y, Z] in a 3D
coordinate space. Plot a glowing point trail: each frame leaves a small particle at the current
[centroid, bandwidth, pitch] position. Color = frequency energy gradient (same mapping as `1-live`).
Mouse drag rotates the space. The trail accumulates over the session — the shape of the cloud IS the
acoustic fingerprint of the performance.

Rendering: WebGPU point cloud. Points stored in a circular buffer (e.g., 8000 points), drawn via
instanced point rendering. Fade oldest points toward transparent. Grid lines on the XZ floor plane
(spectral centroid × pitch axes) for spatial reference. Background dark; glowing particles additive.

What makes this different from every other prototype: it maps audio to its *own* natural coordinate
system rather than using audio as a trigger for abstract visuals. A single clean pitch traces a
vertical column; a piano chord with rich harmonics spreads wide on the bandwidth axis; a bass note
pulls the trail toward the low-pitch low-centroid corner. The trajectory IS the music, not a
reaction to it.

Zero external deps (WebGPU + Web Audio). Demo mode: same wandering multi-oscillator signal used in
`11-terrain` and `13-piano-canvas`. One-cycle build. Inspired by SoundPlot (arxiv 2601.12752).

### elevenlabs-compose — structured AI journey music, streaming `[queued, needs API key + budget]`
Route: `/dream/18-elevenlabs-compose`. User writes a journey arc as plain-language section
descriptions: e.g. "sparse piano intro (20 seconds). slow cello build, add low drone (30 seconds).
full orchestral peak with percussion (15 seconds). long fade to silence (20 seconds)." Sends to
ElevenLabs Music API with section-level control. Music streams back at 44.1kHz; plays in real-time
through the fluid or live-bloom visualizer as it arrives.

This is the `5-arcs` prototype realized with *real generated music* instead of demo oscillators.
The user doesn't just see the arc — they hear a unique 85-second musical piece shaped to their
spec, generated once, played through the existing AV system. First prototype where the music itself
is AI-authored from a structured arc description.

Needs ElevenLabs API key + Karel budget approval ($0.80/min → ~$0.40/generation for 30s, ~$1.13
for 85s). More expensive than MiniMax ($0.035/flat) but streaming + section control is a different
capability — streaming means the visualizer can react to music that is still being generated.

### ghost-animate `[queued, updated — use HappyHorse-1.0, beats Seedance 2.0]`
Route: extend `/dream/2-ghost-lab`. Updated plan (Cycle 23): Ghost LoRA image + atmospheric prompt →
HappyHorse-1.0 API (fal.ai) → 5-8s 1080p cinematic video with native audio in single forward pass.
HappyHorse debuted April 26, 2026 and immediately topped Seedance 2.0 on benchmarks. No separate
MMAudio V2 or audio post-processing step. Backup: Google Veo 3.1 (image-to-video + audio, $0.40/sec,
can chain to ~2.5 min). Admin-only. Budget ~$0.05-0.30/clip depending on model. See RESEARCH.md §§22, 23.

### granular — granular synthesis cloud `[demoable — /dream/18-granular, Cycle 20]`
Route: `/dream/18-granular`. Shipped. Mic or demo oscillators → Web Audio analyser
time-domain buffer → grain extraction + Hann window → AudioBufferSourceNode with detune/pan.
Scatter plot visual: X = buffer position, Y = pitch shift, color = buffer age. Live sliders for
density, pitch range, grain size, scatter. See README for polish ideas: freeze mode, pitch envelope,
density automation from amplitude.

Key findings from Cycle 18 (2026-05-18):
- Three.js WebGPU + TSL production-ready across all browsers (r171+, 2026 baseline)
- SoundPlot (Jan 2026) — 3D acoustic feature space visualization (centroid/bandwidth/pitch axes)
- ElevenLabs Music API — streaming + section-level composition ($0.80/min), custom finetunes
- Seedance 2.0 native audio confirmed — one-step Ghost image → cinematic video with sound
- ReaLchords — online adaptive chord accompaniment from melody (web demo exists, no public API yet)
- ACM IMX 2025 — MIR + LLM + image gen pipeline for semantic music visualization

---

## FROM RESEARCH (Cycle 23, 2026-05-18) — promoted to queue

### three-mesh-av — audio-reactive 3D deforming mesh via Three.js R3F `[queued]`
Route: `/dream/21-three-mesh-av`. An `IcosahedronGeometry` (or torus knot) whose vertices displace
based on frequency band energies using Three.js TSL node materials. The displacement shader samples
a 6-band FFT uniform per frame; bass frequencies push outward from the equator, treble from the poles,
creating an organic breathing form. `@react-three/fiber`, `three@0.182`, and `@react-three/drei` are
all already installed in Resonance — zero new dependencies. Additive point-light tracks the current
spectral centroid position on the mesh surface. Demo mode: same LFO oscillators as other prototypes
(no permissions). Mic mode: live FFT mesh deformation. Post-processing: bloom from
`@react-three/postprocessing` (already installed). Dark background, glowing mesh.

Why now: none of the 20 existing prototypes use Three.js 3D geometry. This is the only remaining
visual paradigm space not covered: animated parametric 3D mesh. TSL means no raw WGSL — the shader
compiles to either WGSL (WebGPU) or GLSL (WebGL) depending on the browser, so full compatibility.
The bioluminescent/organic aesthetic is qualitatively different from particles, fluid, or canvas.
See RESEARCH.md §25.

### code-score — minimal browser music DSL with canvas visualization `[queued]`
Route: `/dream/22-code-score`. A textarea score editor on the left, a live canvas painting on the
right. Score syntax: `C4 Q` (C4 quarter note), `E4 H` (E4 half note), `rest Q` (quarter rest),
`[C4 E4 G4] H` (chord). Parser converts note names to frequencies (using standard A4=440Hz tuning),
durations to seconds (based on a BPM slider), schedules OscillatorNodes with Hann-windowed GainNode
envelopes. Simultaneously paints strokes on a canvas identical to `13-piano-canvas` (same brush
stroke logic). "Write a melody — watch it paint itself — hear it play."

Demo loads a short Bach fragment (BWV 772, 8 bars). Zero external deps (Web Audio + textarea).
Resonance angle: what if your session started with a written score? Or ended with the score as
an artifact? This is the reverse of `13-piano-canvas` — instead of playing → painting, you write →
both play and paint. See RESEARCH.md §26.

### pitch-harmonize — real-time harmonic doubling via AudioWorklet phase vocoder `[queued]`
Route: `/dream/23-pitch-harmonize`. Mic input → AudioWorklet phase vocoder (inline WASM-free
implementation, based on the `phaze` approach: overlap-add, 4× overlap, Hann window, phase locking)
→ pitch-shifted copy (+7 semitones = perfect fifth, or +12 = octave, or -12 = sub-octave, selectable)
→ HRTF PannerNode: dry signal center, shifted copy at a user-adjustable 3D position. You play piano;
the harmony floats above/beside you in 3D space. Visual: dual vectorscope (from `20-scope`) — dry
signal as warm orange trail, harmonized copy as cool blue trail, overlapping on the same canvas.
"Become your own accompanist."

AudioWorklet can be written as an inline string (no separate .js file needed in Next.js — use
`createObjectURL(new Blob([workerStr]))`). Zero npm deps. See RESEARCH.md §27.

Key findings from Cycle 23 (2026-05-18):
- HappyHorse-1.0 (Alibaba, April 2026) — #1 ranked joint audio-video model, single-pass 1080p. Upgrades ghost-animate plan.
- Google Veo 3.1 — 4K video + native audio on fal.ai, $0.40/sec with audio, video extension to ~2.5 min
- Latent Granular Resynthesis (arxiv 2507.19202) — training-free timbre transfer via neural codec
- Three.js TSL + R3F bioluminescent 3D mesh — active community, Three.js already in Resonance (0.182)
- ÆTHRA music DSL (Feb 2026) — browser-native equivalent: `code-score` prototype
- Phase vocoder AudioWorklet (`phaze`) — real-time pitch shift in browser, zero deps
- GAPT/ReaLchords — adversarial post-training improvement, still no public API; monitor

---

## FROM RESEARCH (Cycle 27, 2026-05-19) — promoted to queue

### piano-roll — live scrolling piano roll from mic `[queued]`
Route: `/dream/24-piano-roll`. Mic input → autocorrelation pitch detection (same algorithm as
`13-piano-canvas`) → note events → Canvas2D scrolling piano roll. Each detected note renders as
a colored horizontal rectangle: pitch = vertical MIDI position (C2=bottom, C6=top), duration =
bar width (scrolls left at constant speed), color = frequency→hue same as `1-live` and
`13-piano-canvas`. Additive blending + `shadowBlur` glow on each note bar.

Scroll speed tied to a BPM slider (default 60 BPM). Grid lines for C notes (octave markers).
Demo mode: plays the same Bach fragment from `22-code-score` silently via OscillatorNodes and
detects its own notes for an immediate visual. "What you played, as notation — in real time."

Why this now: the 23 existing prototypes visualize audio as abstract art (fluid, particles,
terrain) or playful geometry (cymatics, tessellate). This is the first that renders recognizable
musical notation from live input. A pianist will immediately understand it. Natural triptych with
`13-piano-canvas` (abstract painting) and `22-code-score` (written score): three representations
of the same musical event. Zero deps. Research basis: WaveRoll (RESEARCH.md §32), score-following
trend (§31).

### cellular — Conway cellular automaton composer `[queued]`
Route: `/dream/25-cellular`. A 64 × 16 Conway Game of Life grid. Each column maps to a musical
pitch (C2 left → C5 right, log-spaced across 3 octaves). On each Life generation tick, all
living cells in column X trigger a note at pitch X with a short triangle-wave envelope. Result:
emergent melodies from simple rules — gliders create repeating 4-note loops, oscillators make
rhythmic patterns, R-pentomino chaos evolves unpredictably.

Tick rate = BPM slider (40–120 BPM). Canvas: each live cell = a glowing dot (additive blending);
columns with active notes flash briefly brighter. Note burst particles per column on trigger.
User interactions: click/drag to toggle cells; preset buttons: Glider, Pulsar, Acorn, R-pentomino.
"Reset" to random fill (20% density). "What if generative music was also life?"

Why this now: none of the 23 existing prototypes treats music as *autonomous* — all either react
to mic input or generate via API. A cellular automaton "acts first"; the user shapes initial
conditions and watches the music write itself. Completely different aesthetic and interaction
paradigm. Surprise factor: high. Research basis: CLAVIER-36 (RESEARCH.md §33).

### score-follow — live score cursor that follows your playing `[queued]`
Route: `/dream/26-score-follow`. Displays the `22-code-score` Bach fragment as a static scrolling
piano roll (same grid as `24-piano-roll`). As the user plays piano via mic, autocorrelation pitch
detection runs at 30Hz. Each detected note is matched to the nearest upcoming score note (tolerance
= ±1 semitone). Matched notes illuminate green; a cursor bar advances through the score on each
match. Missed notes stay dim. Tempo is derived from match cadence (EMA of inter-match intervals).

The canvas shows two layers: score notes (outlined, grey-green), detected notes (filled, hue-colored
same as `13-piano-canvas`). The cursor moves forward when you match, pauses when you miss, snaps
back slightly on repeated misses (forgiveness mode). "The score lights up as you play it."

Alternative score: user can paste their own `22-code-score` DSL text and follow it. Demo mode:
auto-plays the score and self-detects — score cursor advances perfectly through the whole piece.
Zero deps (no ML — pure autocorrelation + symbol matching). One-cycle build. Research basis: score
following papers (RESEARCH.md §31).

### gpu-additive — GPU particle swarm IS the synthesizer `[queued, complex]`
Route: `/dream/27-gpu-additive`. Extends `16-particle-life-gpu`. Each of 9,000 particles is
assigned a harmonic partial index (1–450 per species × 6 species). Consonance forces: particles
whose harmonic ratios are simple (2:1, 3:2, 4:3) attract weakly; dissonant ratios repel. The
6×6 species interaction matrix becomes a "timbre matrix." Each frame: compute shader runs physics,
then a secondary pass reads particle Y-amplitudes (= partial amplitudes) into a mapped buffer.
An AudioWorkletProcessor reads the buffer and enqueues synthesized audio samples.

Audio output IS the swarm state. Emergent clusters = consonant harmonics → pure tones. Scattered
distributions = inharmonic → noisy textures. Reshuffles → timbre discontinuities. Mic input
injects velocity turbulence per species (same as `16-particle-life-gpu`). "The swarm is the
synthesizer."

Requires WebGPU. Technically the most ambitious idea in the queue — GPU compute shader must write
audio-rate data (44,100 samples/sec). The JolifantoBambla technique (RESEARCH.md §36) proves this
is feasible. May require 2 build cycles. Research basis: WebGPU additive synthesis (§36).

Key findings from Cycle 27 (2026-05-19):
- Score following is browser-feasible (arxiv 2505.05078) — autocorrelation + symbol matching, 174ms latency
- CLAVIER-36 (Sep 2025) — browser cellular automaton music env; inspires `cellular` prototype
- Kling 3.0 (fal.ai Feb 2026) — multi-shot storyboarding + native audio; enables Ghost journey arc sequences
- Real-Time AI Accompaniment (arxiv 2604.07612) — latent diffusion + consistency distillation at 5.4× speedup
- WaveRoll (arxiv Nov 2025) — browser piano roll JS library; confirms `piano-roll` is feasible
- WASM AudioWorklet — Rust→WASM DSP is 2026 standard; needs pre-built binary for dream zone
- WebGPU additive synthesis — compute shaders can write audio samples; enables `gpu-additive`
- GAPT/ReaLchords — still no public API; continue monitoring

---

## FROM RESEARCH (Cycle 31, 2026-05-19) — promoted to queue

### chord-canvas — real-time chord name + color timeline `[queued]`
Route: `/dream/28-chord-canvas`. Mic input → 2048-sample FFT → 12-bin chroma vector (sum FFT
magnitude by semitone class across all octaves) → template-match against 24 major/minor chord
templates (dot-product correlation) → detect root + quality. Display: chord name in large
monospace type at top center (e.g. "F♯m", "C", "Bdim"). Canvas2D timeline strip scrolls left;
each chord block is a colored rectangle: hue from root note (same `freqToHue`-style wheel as
`1-live`, but mapped to 12 pitch classes instead of frequency), saturation from quality
(major=vivid, minor=desaturated, dominant 7th=warm orange, diminished=cool grey). Duration =
how long the chord was held (wider block = longer hold).

Secondary display: 12-bar chromagram at the bottom showing current energy per pitch class as a
vertical bar chart. "Your pitch class is C, E, G — C major." Zero external deps (pure FFT chroma,
no ML). One-cycle build. Demo mode: plays a ii-V-I progression (Dm7 → G7 → Cmaj7) via triangle
oscillators. "What chord are you playing?" — the first prototype to explicitly surface music theory.

Why this now: 26 existing prototypes visualize audio signal properties. None name the musical
structure. This is the simplest bridge from signal to theory. Pianists will recognize their chords
immediately. Natural complement to `24-piano-roll` (pitch positions) and `22-code-score` (written
notation). Research basis: Chord Colourizer (RESEARCH.md §42).

### scene-spatial — Ghost preset scenes as spatial audio environments `[queued]`
Route: `/dream/29-scene-spatial`. Six Ghost preset scenes from the journey narrative, each with
hand-authored 3D HRTF audio: stone chamber (near-field piano reverb from front-left, stone
percussion hits from above, long tail), root portal (low root-tone drone from below + forest
ambience ahead), underground pool (water trickle from right, vast low-frequency resonance),
tiny planet (wind dome from all azimuths, bird calls from variable positions), forest dawn
(birdsong from tree canopy = high positions, stream from left-front, first piano tone from
front-right), cosmic ascension (ultra-high reverb pad from all around, harmonic series drone
rising in frequency as scene progresses).

UI: scene selector row at top (same names as `2-ghost-lab`). Main area: a First-Person "listener
head" circle in the center of a canvas, with 3–6 labeled sound sources as colored dots placed
in their spatial positions; user can drag them to reposition. Audio uses WebAudio HRTF PannerNode
(same as `7-spatial`). All sounds are synthesized via OscillatorNode + ConvolverNode + custom
impulse responses (no audio files needed). Wear headphones — scenes should feel like being there.
One-cycle build. Zero deps. "Each Ghost scene has a sound as distinctive as its visuals."
Research basis: SonoWorld (RESEARCH.md §39).

### lyria-jam — infinite AI music steering via Lyria RealTime API `[queued, needs GEMINI_API_KEY]`
Route: `/dream/30-lyria-jam`. Connect to Google's Lyria RealTime API via WebSocket (Gemini API).
UI: two text prompt slots with weight sliders (0–2) for live blending ("jazz piano" at 1.5 +
"ambient drone" at 0.5 → morph live by adjusting sliders). BPM slider (60–200), density slider,
brightness slider, key picker. All controls send `set_weighted_prompts()` or
`set_music_generation_config()` through the WebSocket in real time; music changes within ~2 seconds.
Mic input: amplitude → auto-drives brightness (louder playing → brighter, denser music).

Generated 48kHz PCM audio piped directly to `AnalyserNode` → live-bloom radial visualizer (same
6-band color mapping as `1-live`). Karel pastes his Gemini API key into a settings field;
stored only in `sessionStorage`, never committed. Admin-only gate. "The music never stops.
You just steer it." Budget: Google AI Studio free tier has daily quota; paid Gemini API charges
per minute of generated audio (track against Karel's existing Gemini billing). This is the most
live-performance-relevant AI music prototype in the queue — continuous, real-time, steerable.
Research basis: Lyria RealTime (RESEARCH.md §37).

### gesture-music — webcam hand gestures → real-time audio synthesis `[queued, needs MediaPipe CDN dep]`
Route: `/dream/31-gesture-music`. Webcam → MediaPipe HandLandmarker (loaded from jsDelivr CDN
as WASM, ~8MB one-time download) → hand skeleton landmarks → 5 synthesizer parameters: right
hand Y-position → pitch (continuous glide, C2–C7 range); palm-spread (thumb-to-pinky distance)
→ reverb decay (0.5–4s); left hand Y → bass drone frequency; curl-count (metacarpal-fingertip
angle sum) → harmonic richness (1–8 harmonics); wrist velocity (frame-delta) → percussive onset
trigger. Triangle-wave + convolver synthesis, all Web Audio.

Visual: canvas2D overlay on webcam feed shows hand skeleton as glowing dots + lines (additive
blending). A secondary audio-reactive strip below the feed shows a spectrum bar (1-live style).
"Conduct the music with your hands." No mic needed. Inspiration: Gesture2Music (30ms latency,
arxiv 2511.00793, RESEARCH.md §41). One-cycle build; needs Karel approval on CDN load (~8MB).

### mood-vis — semantic audio-reactive visualizer that switches modes `[queued]`
Route: `/dream/32-mood-vis`. Mic input → extract 4 real-time audio features: tempo estimate
(onset intervals), spectral centroid, zero-crossing rate, tonal clarity (HPS pitch confidence).
Rule-based classifier maps features to 6 mood/energy buckets: calm+bright, calm+dark,
energetic+bright, energetic+dark, complex, minimal. Each bucket maps to a visual mode drawn on
a single canvas: calm+bright = fluid-style ink diffusion; calm+dark = slow particle drift;
energetic+bright = cymatics-style radial bloom; energetic+dark = reaction-diffusion-style
growing patterns; complex = tessellate-style tile rewire; minimal = simple Lissajous circle.
A smooth 2-second crossfade transitions between modes. Current bucket and features shown as a
small overlay. "A visualizer that listens." No ML, no external deps. One-cycle build.
Research basis: ACM IMX 2025 semantic visualization (RESEARCH.md §43).

Key findings from Cycle 31 (2026-05-19):
- Lyria RealTime API (Google DeepMind) — WebSocket streaming infinite music, text prompt blending, BPM/density/brightness controls, browser-callable with Gemini API key. Most live-performance-relevant AI music capability found yet.
- Magenta RealTime — open-weights version of above; Python/Colab only, not browser-callable without local server.
- iOS 26 / Safari 26 — WebGPU now universal: full support on iOS, iPadOS, macOS, visionOS. Karel's phone can now run all WebGPU prototypes.
- Veo 3.1 Fast — $0.15/sec with audio (half of standard tier). Ghost-animate at ~$0.75/clip.
- SonoWorld (arxiv 2603.28757, Mar 2026) — image → navigable 3D spatial audio scene, Three.js + WebAudio HRTF, browser-native demo at 5.3ms latency. Inspires `scene-spatial`.
- Gesture2Music (arxiv 2511.00793) — 30ms webcam gesture → music control. Inspires `gesture-music` via MediaPipe.
- Chord Colourizer (arxiv 2510.10173) — CQT chroma → chord name + color. Inspires `chord-canvas`, first music-theory prototype.
- ACM IMX 2025 semantic visualization — MIR + rule-based classifier → visualizer mode switching. Inspires `mood-vis`.

---

## FROM RESEARCH (Cycle 35, 2026-05-19) — promoted to queue

### aria-companion — turn-taking piano AI companion `[queued]`
Route: `/dream/33-aria-companion`. Mic input → autocorrelation pitch detection → note event buffer.
After 2s of silence AND ≥8 notes captured: generate **Markov-chain response**: a 1st-order bigram
pitch transition table built from the user's own note sequence (what interval did you most often
play next?), plus a light pentatonic bias to prevent atonal chaos. Response plays as piano-timbred
OscillatorNode + short convolver reverb (same impulse technique as `29-scene-spatial`). Visual:
split dual piano roll — user phrase on top (warm orange), AI response on bottom (cool blue). After
the AI finishes, the system returns to "listening" mode. The longer you play, the more the Markov
table learns your style.

"The piano responds when you rest." Zero deps. No server. No ML inference — the Markov chain is
~20 lines of JS. This is the first **dialogue** prototype: not reactive (responding every frame) but
compositional (listening, then generating). Inspired by Aria-Duet (NeurIPS 2025, arxiv 2511.01663)
and the "Design Space for Live Music Agents" taxonomy that identifies dialogue agents as the least-
explored category. One-cycle build.

### spectral-morph — real-time FFT timbre blending `[queued]`
Route: `/dream/34-spectral-morph`. AudioWorklet receives two audio channels (source A, source B)
simultaneously → applies FFT (2048 samples) to each → linearly interpolates magnitude spectra:
|blend| = (1−t)×|A| + t×|B| → restores phase from source A → IFFT → output. A morph slider
(0→1) continuously adjusts t. Visual: three stacked horizontal spectrum strips (source A bottom,
blend center, source B top), each colored with the `1-live` frequency→hue palette, magnitude bars
scrolling right in real time.

Demo mode: source A = sawtooth oscillator, source B = pure sine, same pitch C3. At t=0.5 you hear
a triangle-like waveform — the FFT midpoint between saw and sine is acoustically real and distinct
from either. Mic mode: source A = mic input, source B = a selectable waveform (sine / triangle /
noise). "Morph between your piano and a flute."

Zero deps — pure AudioWorklet + Web Audio. First prototype in the sandbox that **resynthesizes from
spectral manipulation** rather than just visualizing or shifting frequency content. Inspired by
daudio.dev spectral morphing and the observation that 32 prototypes use FFT for analysis but none
have used it for resynthesis. One-cycle build. Full research notes: RESEARCH.md §47.

### loop-station — 4-slot live loop station `[queued]`
Route: `/dream/35-loop-station`. Four record slots. Each slot: BPM-synced length (1, 2, or 4 bars
selectable). Tap **REC** → record begins; tap again → close loop and start looping immediately.
Loop boundary crossfade (200ms overlap-add) removes the click at the loop point. All active slots
play phase-locked (all start from beat 1 simultaneously). Overdub: tap REC on a looping slot to
layer additional audio on top. Mute/unmute per slot. **Clear** stops and empties a slot.

Visual: each slot is a horizontal canvas mini-waveform (scrolling, color matches `1-live` band
palette for the slot's dominant frequency). A BPM tap-tempo button. Demo loads 4 pre-built 2-bar
loops (sub-bass drone, mid-range piano phrase, high arpeggiated figure, rhythmic click) so Karel
can try the interaction immediately without recording.

"Build a multi-layer performance in real time." Zero deps. Pure Web Audio API (AudioBufferSourceNode
with loop=true, scheduled via AudioContext.currentTime for phase lock). This is the first prototype
where you actively **construct** a composition over time rather than playing or watching. Natural live
performance tool — same paradigm as a Boss RC-1 looper or Ableton session clips. One-cycle build.
Inspired by LoopGen (arxiv 2504.04466, RESEARCH.md §46) and the "live performance fitness" priority
in the operating manual.

Key findings from Cycle 35 (2026-05-19):
- Aria-Duet / Ghost in the Keys (NeurIPS 2025, arxiv 2511.01663) — turn-taking piano AI duet on Disklavier. AI response generated by autoregressive transformer (Aria model). Inspires `aria-companion` — browser Markov-chain version, zero deps.
- LoopGen (arxiv 2504.04466, Apr 2026) — training-free loopable music: 55% better loop coherence, 70% better listener ratings. Inspires `loop-station`.
- Spectral Morphing — FFT magnitude interpolation → genuine acoustic hybrid timbres. Fully browser-native AudioWorklet approach. Inspires `spectral-morph`.
- Design Space for Live Music Agents (arxiv 2602.05064, Feb 2026) — 184-system taxonomy. Identifies "dialogue agents" as least-explored category — exactly what `aria-companion` fills.
- Web Audio API spec (TPAC 2025) — Configurable Render Quantum in Q4 2026: will push audio-processing latency below 3ms. Performance.now() in AudioWorklet. Playout Statistics API.
- BRAVE (arxiv 2503.11562, Mar 2026) — low-latency neural timbre transfer (RAVE upgrade). No browser/WASM port yet; monitor for future `brave-timbre` prototype.
- iPlug3 (Jan 2026) — WebGPU + SDL3 + MCP audio plugin framework. Scripts mirror web APIs. Potential foundation for "Resonance as an installation" (Tauri mode).
- Revival (arxiv 2503.15498, Mar 2026) — live concert with AI musical agents in two roles: harmonic resonance + structural scaffolding. Validates Resonance's phase-based design.
- Kling 2.6 — native audio + speech at $0.14/sec. Ghost image + motion prompt → 5s cinematic clip with audio + optional spoken Ghost line. Updates ghost-animate plan.

---

## FROM RESEARCH (Cycle 39, 2026-05-19) — promoted to queue

### pluck-field — Karplus-Strong virtual string field `[queued]`
Route: `/dream/36-pluck-field`. A canvas containing 24 virtual strings arranged in a 4×6 grid,
tuned to C pentatonic across 4 octaves (C2–B5). Each string is 3 Web Audio nodes: a `DelayNode`
(delay time = 1/frequency, e.g. C4 = 1/261.63 ≈ 3.82ms delay), a `BiquadFilterNode(lowpass,
fc=4000Hz)` in the feedback path, and a `GainNode(0.996)` for energy decay. To pluck: inject a
5ms white-noise burst into the delay line; the feedback loop sustains the string's natural
resonance as it decays over ~2s. Multiple strings ring simultaneously without interaction.

Visual: each string is an animated horizontal line across its grid cell. On pluck, the line
animates as a damped cosine wave — amplitude decreasing exponentially with the string's decay
time constant. Color = pitch hue (same C pentatonic mapping as `1-live`: low C = violet, high
B5 = warm orange). Dense rings of simultaneous strings glow like a harp. Dark background.
Click any cell to pluck. Mic: onset events pluck a random string. "What if the canvas was a
harp?" No academic paper needed — Karplus-Strong (1983) is the standard; Web Audio DelayNode
is exactly the right primitive. Zero external deps. First physical modeling synthesis prototype
in the sandbox. One-cycle build. Full research notes: RESEARCH.md §54.

### ratio-lab — Tonnetz just intonation harmonic lattice `[queued]`
Route: `/dream/37-ratio-lab`. A 9×5 canvas showing the Tonnetz lattice: X axis = perfect fifth
intervals (×3/2 ratio), Y axis = major third intervals (×5/4 ratio). Each node is a frequency
ratio from a base pitch of A3 = 220Hz. Click any node to hear it as a sustained sine tone against
a continuous 1/1 drone. Neighboring nodes (1–2 steps) are consonant intervals (perfect fifth,
major third, minor third); distant nodes are dissonant (tritone, complex ratios). Node color
encodes consonance: warm (consonant, nearby) → cool (dissonant, far). Large nodes = simple
ratios; small nodes = complex ones.

Mic mode: autocorrelation pitch detection (same algorithm as `13-piano-canvas`) highlights the
closest lattice node to the currently detected pitch, with a glowing ring. Hold a chord: multiple
glowing nodes form a subgraph — the shape IS the chord quality (a major chord = right-triangle
on the lattice; a minor chord = left-triangle; an augmented chord = equilateral). "Navigate
harmony as a landscape." First Resonance prototype about tuning systems rather than signal
processing. Zero deps. One-cycle build. Research basis: LIMITER (RESEARCH.md §55).

### mood-xy — Russell circumplex emotion synthesis `[queued]`
Route: `/dream/38-mood-xy`. A 2D canvas: valence (sad ← → happy) on X axis; arousal (calm ↑
excited) on Y axis. Drag a dot to any position. Web Audio synthesizes music in real time driven
by the coordinates: arousal → BPM (40–140), simultaneous voice count (1–6), register (bass vs.
treble), note attack time (slow pads vs. sharp staccato); valence → chord quality (major at +1,
minor at 0, diminished at −1), spectral brightness (filter fc), note duration (longer = sadder).

Four quadrant aesthetics: energetic+happy (bright major arpeggios at 120 BPM), energetic+sad
(dark chromatic runs at 110 BPM), calm+happy (sustained major pads at 55 BPM), calm+sad (sparse
minor chords at 40 BPM). Canvas background color shifts smoothly with the mood (warm quadrants =
amber background, sad quadrants = deep blue). The dot leaves a pastel trail showing where you've
been. A small text label reads the current quadrant (e.g. "calm · sad"). "Navigate your musical
mood." No ML, no API, zero external deps. First emotion-coordinate prototype in the sandbox.
One-cycle build. Research basis: AffectMachine-Pop, RESEARCH.md §58.

### anticipate — ReaLJam-inspired AI anticipation display `[queued]`
Route: `/dream/39-anticipate`. Extends `33-aria-companion`: same mic → autocorrelation pitch
detection → Markov chain response. Adds a ghost-note anticipation layer: when the Markov chain
computes a response (during the 2s silence window), the *planned* response notes are immediately
rendered as semi-transparent ghost bars in the ARIA (blue) piano roll panel, before each note
actually fires. As each note sounds, its ghost bar solidifies from 25% opacity to full color
with a brief flash. If the Markov chain re-samples a note (probability weighting), the ghost
updates instantly.

The user sees Aria's intention 0.5s before execution — the same "anticipation" design insight
from ReaLJam (CHI 2025, arxiv 2502.21267), which found this transparency dramatically improved
perceived collaboration quality. Visual effect: a wave of solidification sweeps through the ARIA
panel as the response plays. The top (YOU) panel is unchanged. "Watch Aria decide before she
plays." Zero deps. One-cycle build. Research basis: RESEARCH.md §53.

### browser-musicgen — In-browser MusicGen via Transformers.js `[queued, needs Karel OK on ~390MB model]`
Route: `/dream/40-browser-musicgen`. Loads `@xenova/transformers` and `facebook/musicgen-small`
ONNX weights (~390MB, browser-cached after first download) via CDN import — no package.json
change needed if imported as an ES module from jsDelivr. User types a text prompt ("forest piano
dawn, gentle 70 BPM, ceremonial drums") and presses Generate. Streaming: first audio chunk plays
at ~5s. Total generation: ~15–30s for 30s of music. Audio plays through the live-bloom radial
visualizer (same 6-band color mapping as `1-live`). A progress bar + "Model loading..." state
handles the one-time download gracefully. No API key. No per-generation cost.

This is the first dream prototype with in-browser ML inference. Different capability from
fal.ai-based compose: offline-capable after first load, no rate limits, zero API cost. Max 30s
output. Needs Karel OK on (1) ~390MB CDN dependency, (2) whether CDN ES module import (jsDelivr)
is acceptable vs. npm dep. Could become the `6-compose` prototype implementation with no API
dependencies. Research basis: RESEARCH.md §56.

Key findings from Cycle 39 (2026-05-19):
- Karplus-Strong synthesis: 3 Web Audio nodes = plucked string. 35 prototypes, none physical modeling. Gap filled by `pluck-field`.
- ReaLJam (CHI 2025, arxiv 2502.21267) — anticipation in AI jamming: ghost-note preview before execution. Inspires `anticipate`.
- LIMITER (arxiv 2507.08675, Jul 2025) — gamified just intonation; Tonnetz lattice visualization. Inspires `ratio-lab`.
- MusicGen browser via Transformers.js — ~390MB ONNX, zero API cost, 5s to first chunk. Inspires `browser-musicgen`.
- AffectMachine-Pop (arxiv 2506.08200, Jun 2026) — arousal×valence → real-time music. Inspires `mood-xy`.
- DARC (arxiv 2601.02357, Jan 2026) — drum accompaniment from tapping/beatboxing. Inspires future `drum-tap`.
- ASTRODITHER (Three.js forum) — TSL + dithering + time warp + selective bloom. Technique note for `21-three-mesh-av` polish.
- Three.js r171+ — WebGPU renderer production-ready, TSL compiles to WGSL+GLSL automatically. No migration needed.

---

## FROM RESEARCH (Cycle 44, 2026-05-19) — promoted to queue

### shepard-tone — auditory illusion: the endless staircase `[queued]`
Route: `/dream/40-shepard-tone`. A Shepard tone is a superposition of sine waves separated by
octaves (e.g. A2 + A3 + A4 + A5 + A6), each fading in at the bottom and fading out at the top,
creating the auditory illusion of a tone that rises (or falls) forever without ever resolving.
Discovered by Roger Shepard (1964). The most famous auditory illusion after the McGurk effect.

**Spec**: 8 sine oscillators, each one octave apart (A1–A8). Each oscillator's gain follows a
bell-curve envelope based on its current log-frequency position within the audible range
(peak at 440Hz, zero at ~55Hz and ~14kHz). A `rate` parameter controls how fast the shared
pitch glides upward: 0.5 BPM (very slow, meditative) to 30 BPM (dizzying). At any rate, the
fundamental pitch spirals upward while the perceived "height" is frozen — it always sounds like
it's rising. Toggle "descending" for the downward illusion (the tritone paradox: descending
Shepard tones are equally valid but flip the perceived direction).

**Interactions**: a `rate` slider; **Ascending / Descending** toggle; **interval** select
(chromatic glide / whole-tone / half-tone steps — each creates a distinct temporal rhythm to
the illusion); **freeze** (stops the glide mid-spiral, snaps the auditory illusion's "position");
**mic mode**: microphone amplitude modulates rate (play louder → tone ascends faster). Canvas:
the 8 oscillators as circles arranged in a vertical column, each glowing proportional to its
gain (bright at center of the stack, dim at top/bottom). A rotating logarithmic spiral
indicator shows the current pitch position. "An endless musical staircase."

**Why this now**: 39 existing prototypes cover audio-reactive viz, physical modeling, spatial
audio, emotion synthesis, pattern automata, timbre morphing, dialogue AI. None address auditory
illusions or psychoacoustics. Shepard tones are the canonical demonstration that what you hear
is not what is physically happening — deeply relevant to Resonance's "transcendent listening"
vision. Surprising to pianists who haven't encountered it. Zero external deps, one-cycle build,
no API keys. Research basis: RESEARCH.md §62 (style-space navigation analogy: the Shepard tone
"navigates" frequency space the same way embedding arithmetic navigates style space — continuous
motion with no apparent end).

### neural-pitch — shared CREPE-tiny ONNX pitch detection upgrade `[queued, needs Karel OK on CDN ONNX dep]`
Route: no new page — this is a `src/app/dream/_shared/use-neural-pitch.ts` upgrade. Load
CREPE-tiny (~2MB ONNX, loadable from CDN via ONNX Runtime Web) as an optional drop-in
replacement for the current autocorrelation pitch detection path. CREPE-tiny is loaded once
on first mic-start, cached permanently. It accepts 1024-sample audio frames at 16kHz and
returns a 360-bin pitch salience (20–1975 Hz, 20 cent resolution). Peak + parabolic
interpolation gives a pitch estimate 10× more accurate than autocorrelation on complex piano,
voice, and noisy signals.

Prototype approach: add `use-neural-pitch.ts` to `_shared/`, integrate it into `13-piano-canvas`
as the pitch source, compare with autocorrelation in real time (show both estimates side-by-side
in a small debug overlay). If accuracy is clearly better, offer to upgrade the shared hook across
all pitch-detecting prototypes. One-cycle build. Needs Karel OK on CDN ONNX Runtime Web dep.
Research basis: RESEARCH.md §61.

### mirelo-ghost-loop — extend Ghost soundscapes into seamless loops `[queued, needs FAL_KEY]`
Route: extend `/dream/9-ghost-sound` or standalone `/dream/41-mirelo-ghost-loop`. After
generating a Ghost scene audio clip (via MMAudio V2 or direct Mirelo Text-to-Audio), pipe it
through **Mirelo AI SFX Audio Extension** (fal.ai) to extend the 10s clip into a 30-60s
seamlessly looping ambient soundscape. Display: waveform player with the original clip highlighted
in one color and the extended section in another. Loop button: set the extended clip to play
continuously as a live ambient background for the Ghost scene image. Admin-only, needs FAL_KEY.
Budget: ~$0.01-0.02/clip (MMAudio V2 + Mirelo Extension). Research basis: RESEARCH.md §63.

### code-vis — live coding DSL that draws as it plays `[queued]`
Route: `/dream/41-code-vis`. Split-screen: left = CodeMirror textarea (CDN ESM, no package.json
change), right = canvas. A minimal pattern DSL: each line defines a synthesizer voice and its
visual: `A3 tri 0.8 // warm triangle at A3 = golden ring`. Evaluate on change (debounced 500ms).
Each active voice renders as a pulsing circle/ring on the canvas, sized by amplitude, colored
by frequency (same `1-live` hue mapping), updated every animation frame. Multiple voices = a
constellation of colored rings breathing together. "The code plays; the code draws."

Inspired by limut (§67) but much simpler: no pattern sequencer, just sustained tones as the
building block. A pianist can write a chord in 5 seconds and hear+see it. BPM slider drives
pulsing. Save canvas as PNG. Zero new npm deps (CodeMirror loaded from CDN). One-cycle build.

Key findings from Cycle 44 (2026-05-19):
- onnxcrepe (RESEARCH.md §61) — CREPE-tiny ONNX, ~2MB, browser-loadable. Neural pitch detection for 6+ existing prototypes.
- Magenta RealTime (§62) — open-weights 800M music model, Apache 2.0, embedding arithmetic style blending. Colab-proxy path.
- Mirelo AI SFX 1.6 (§63) — new fal.ai model: audio extension + inpainting. Extends Ghost soundscape workflow.
- Udio v4 Audio Inpainting (§64) — select-and-regenerate paradigm. No API, but informs future compose+edit UX.
- Live Music Models paper (§65) — embedding arithmetic is vector addition, not just prompt blending. 2D style canvas better than sliders for `30-lyria-jam`.
- Transformers.js v4 (§66) — 53% smaller bundles, 200ms load (was 2s). Makes browser ML fully viable.
- limut (§67) — browser live coding music+visuals, updated May 2026. Inspires `code-vis` prototype.
- Suno v5.5 (§68) — voice cloning + generative stems (12 tracks). Stems → `suno-spatial` prototype (needs Suno API).

---

## FROM RESEARCH (Cycle 48, 2026-05-19) — promoted to queue

### lyria-ghost — Ghost scene image → Lyria 3 Clip → 30s ambient Ghost soundtrack `[queued, needs GEMINI_API_KEY]`
Route: `/dream/43-lyria-ghost`. UI shows the five Ghost preset scenes (Stone Chamber, Root Portal,
Underground Pool, Tiny Planet, Forest Dawn, Cosmic Ascension) as a button row — same names as
`29-scene-spatial`. Click a scene: a scene-specific text prompt is pre-filled in an editable
textarea ("ambient score for a stone chamber, slow tempo, single reverbed piano chord, long decay,
no percussion"). Optionally drag-and-drop a custom Ghost image (or use a built-in placeholder
thumbnail per scene). Click "Generate" → call `lyria-3-clip-preview` via Gemini API → receive 30s
MP3 → decode via AudioContext → play through live-bloom radial visualizer (same as `1-live`).
Waveform player shows duration; "Generate variation" calls again with the same inputs + a new seed.

"Your Ghost scene, given a voice." Admin-only. Budget: free tier in Google AI Studio, then minimal
per-call billing. Needs GEMINI_API_KEY (same key as `30-lyria-jam`). Zero new npm deps — Gemini
API called via standard `fetch`. One-cycle build. RESEARCH.md §69.

### stable-extend — record a piano phrase, AI continues it `[queued, needs FAL_KEY]`
Route: `/dream/43-stable-extend`. Split screen: left = record controls (same mic-capture as
`35-loop-station`: tap ● REC to start, ■ STOP to close, waveform preview shows captured audio).
Right = generation panel: optional text prompt to guide style ("extend this into a cello duet",
"continue in a jazz register"), then "Extend →" button. Sends the captured audio to
`fal-ai/stable-audio-25/inpaint` (continuation mode) with the current audio as the prefix clip and a
target duration of 30s. Progress bar during generation (~5–10s). Returned audio is decoded and played
through the live-bloom radial visualizer. Waveform panel shows original clip (amber) + AI extension
(blue) side by side as a horizontal strip.

"What if your phrase kept going?" This is the first dream prototype that extends YOUR playing with AI
— `6-compose` generates from a text prompt; `14-reference-compose` style-matches; `stable-extend`
simply continues from where you stopped. Budget: $0.20/generation (FAL_KEY already in use). No new
approvals needed. Admin-optional. One-cycle build. RESEARCH.md §70.

### binaural-lyria — binaural brainwave entrainment + matched AI ambient music `[queued, needs GEMINI_API_KEY]`
Route: upgrade of `/dream/42-binaural` (or standalone `/dream/44-binaural-lyria`). Step 1: user
selects a target brainwave state (δ/θ/α/β/γ) — same five presets as `42-binaural`. Step 2: binaural
beats play at the target beat frequency (exact same synthesis as `42-binaural`). Step 3: "Generate
ambient track" button calls `lyria-3-clip-preview` with a state-matched prompt: δ→"deep ambient,
long slow drones, vast reverb, no melody, no rhythm, 0.5–2 BPM pulse, subharmonic bass"; θ→"meditative
flute and bowl, gentle 6 BPM breath"; α→"calm piano solo, gentle 10 BPM, warm room reverb";
β→"focused acoustic guitar, steady 16 BPM arpeggio"; γ→"bright gamelan, 40 BPM metallic shimmer".
The 30s ambient track plays alongside the binaural beats at a user-controlled blend level (0–100%
ambient). A session timer counts the current state duration. After 30s, the ambient track regenerates
automatically (next generation pre-fetched and queued via AudioContext for gapless looping).

"A meditation session where the music knows what your brain is trying to do." Combines the science of
brainwave entrainment (`42-binaural`, RESEARCH.md §74/75) with AI-generated ambient sound sculpted for
that brainwave state. Needs GEMINI_API_KEY. $0 on free tier (Lyria 3 Clip). One-cycle build.

### piano-to-ghost — your playing generates Ghost imagery + music simultaneously `[queued, needs GEMINI_API_KEY + FAL_KEY]`
Route: `/dream/45-piano-to-ghost`. Mic → autocorrelation pitch detection (same as `13-piano-canvas`)
+ 12-bin chroma chord detection (same as `28-chord-canvas`) → arousal/valence coordinates (same
mapping as `38-mood-xy`). After 2 seconds of silence AND ≥6 notes detected: (1) call `lyria-3-clip-preview`
with a Ghost-themed prompt shaped by the current arousal/valence quadrant ("cosmic ascending major
chords, energetic and bright, 80 BPM" / "stone chamber minor meditation, calm and dark, 50 BPM" /
etc.); simultaneously (2) call the Ghost LoRA on fal.ai with a scene prompt derived from the same
quadrant (energetic+bright→"cosmic ascension, Ghost figure in flight, golden light" / calm+dark→"stone
chamber, Ghost figure seated, single candle"). The canvas shows two panels: top = live piano roll
(from `24-piano-roll`), bottom = the Ghost image fading in over 3s. When the Lyria track arrives, it
plays through the live-bloom visualizer. Both update on the next phrase (2s silence → generate again).

"Your playing generates your world." First prototype that connects ALL the dream zone's systems: pitch
detection, chord analysis, emotion mapping, AI music generation, Ghost image generation. Admin-only.
Budget: ~$0.01–0.05/phrase (Lyria Clip + Ghost LoRA). Needs GEMINI_API_KEY + FAL_KEY. Complex (2
concurrent API calls). Two-cycle build likely. RESEARCH.md §73.

Key findings from Cycle 48 (2026-05-19):
- Lyria 3 (RESEARCH.md §69) — Gemini API music generation with image input. `lyria-3-clip-preview` = 30s MP3. Up to 10 images influence mood. Same key as lyria-jam. Inspires `lyria-ghost`.
- Stable Audio 2.5 (§70) — fal.ai audio continuation at $0.20/audio. Extend YOUR recording with AI. Inspires `stable-extend`.
- Suno Studio v5 Generative Stems (§71) — 12-stem export from AI music. API stems endpoint not yet public. Monitor for `suno-stems-spatial`.
- ONNX Runtime Web 1.26.0 (§72) — WebGPU EP now default. Faster than estimated; upgrades `neural-pitch` viability.
- Real-time MIDI-to-image (§73) — MIDI emotional analysis → generative images, validated with musicians. Inspires `piano-to-ghost`.
- Music as "controlled hallucination" (§74) — Frontiers 2026 framework: brain simulates a "virtual body" inside the music. Validates Resonance's "transcendent listening" thesis scientifically.
- MindMelody (§75) — EEG-driven closed-loop music therapy. Inspires `binaural-lyria`: binaural beats + Lyria ambient music matched to the target state.
- Three.js WebGPU/TSL maturity (§76) — full cross-browser production readiness. Reduces risk of `gpu-additive`. ASTRODITHER techniques worth applying to `21-three-mesh-av` polish.

---

## FROM RESEARCH (Cycle 51, 2026-05-20) — promoted to queue

### vocal-bgm — hum a melody, get a full band `[queued, needs FAL_KEY — already in use]`
Route: `/dream/44-vocal-bgm`. Record 5–15 seconds of humming, singing, or piano via mic (same `MediaRecorder` approach as `43-stable-extend`). Click "Arrange →". Server route sends audio to `fal-ai/ace-step/audio-to-audio` in remix mode with `lyrics: "[inst]"` (instrumental — no AI vocals) and a genre tag from a user-selectable dropdown ("jazz piano trio", "ambient electronic", "cinematic strings", "solo guitar"). ACE-Step 1.5 generates a 30s track where your hummed melody is the melodic seed for a full band arrangement. The result plays through the live-bloom radial visualizer.

Why this fills a gap: `43-stable-extend` continues your recording from the end. `vocal-bgm` puts your melody inside a new arrangement — your hum becomes the lead motif of a jazz trio or string quartet. The audio-to-audio paradigm is completely different from text-to-audio: your melodic contour is preserved in the output. FAL_KEY already in use. $0.006/30s. Zero new approvals needed. One-cycle build. RESEARCH.md §77.

### guided-session — brainwave path guide: from stressed to calm `[queued, zero deps]`
Route: `/dream/44-guided-session`. User selects a starting state ("Stressed", "Distracted", "Wired", "Tired") and a target state ("Calm", "Focused", "Drowsy", "Present"). The system calculates a brainwave-state path (e.g., Stressed=β-high → Focused=β-mid → Calm=α → Drowsy=θ) and plays isochronic tones (speakers-compatible, no headphones required) through each state in sequence. The session timer from `42-binaural` tracks time-in-state and triggers transitions with a gentle tone + text prompt ("You've been in α for 8 minutes. Ready to deepen to θ?"). Pink or brown noise layer adapts per state (pink=α, brown=δ/θ). A journal textarea (from `42-binaural`, localStorage per state) captures insights at each stage. At the end, shows a summary: "Session complete: 5 min β → 8 min α → 7 min θ."

Why this: The brainwave research cluster (RESEARCH.md §§74, 75, 80) validates guided state progression as clinically effective. The session timer and noise layer are already built in `42-binaural`. This prototype wires them into an intentional arc: a 20-minute guided session with a clear start, path, and end. First Resonance prototype that is also a genuine wellness tool. Zero deps, no API keys. One-cycle build.

### mood-journey — proactive mood traversal via the Russell circumplex `[queued, zero deps]`
Route: `/dream/45-mood-journey`. A canvas shows the Russell circumplex (valence × arousal, same as `38-mood-xy`). User places two labeled dots: "Now" (current mood) and "Goal" (target mood) by clicking. Press "Begin journey" → the synthesizer starts at the "Now" coordinate and slowly glides the dot toward "Goal" over a configurable duration (5, 10, 20 minutes). Every 30 seconds, the coordinate updates one step along the arc. The audio changes continuously: `38-mood-xy`'s full synthesis engine (BPM, chord quality, register, attack, arpeggio mode) tracks the coordinate in real time. A second layer: isochronic tones at the brainwave frequency matching the current arousal level (high arousal = β 16 Hz, mid = α 10 Hz, low = θ 6 Hz, very low = δ 2 Hz). The glowing trail shows the traversal history.

Why this is different: `38-mood-xy` responds to manual dragging. `mood-journey` automates the navigation along a goal-directed arc. Your music shifts from "distressed/agitated" to "calm/content" without you doing anything — you surrender control to the journey. Clinically, this follows the proactive music therapy framework (RESEARCH.md §84). Combining the `38-mood-xy` synthesizer (arousal/valence) with `42-binaural` isochronic tone (arousal as brainwave frequency) makes the audio doubly multi-modal. Zero deps, no API keys. One-cycle build.

### osc-composer — design a Lissajous figure, generate the audio that draws it `[queued, zero deps]`
Route: `/dream/45-osc-composer`. A canvas shows the Lissajous figure in real time, drawn from two OscillatorNodes routed to L (left) and R (right) channels. Controls: Ratio (L:R frequency ratio — presets: 1:1, 1:2, 2:3, 3:4, 3:5), Phase offset (0°–360° continuous slider), Amplitude balance (L/R). Preset shapes panel: Circle (1:1, 90°), Figure-8 (1:2, 0°), Trefoil (2:3, 0°), Rose (3:4, 0°), Starburst (3:5, 36°). User selects a preset → figure appears → fine-tunes sliders → figures morph smoothly. A "Puzzle" mode: target figure shown on canvas left, user's figure on right — tune to match. Download stereo WAV that encodes the current figure as a 5s stereo audio file (this is the literal oscilloscope music: when you play it on a real oscilloscope in XY mode, it draws the figure).

Why this: `20-scope` visualizes existing audio as Lissajous. `osc-composer` inverts it: design the shape, get the audio. Teaches music theory through geometry (a perfect fifth = specific ellipse; a minor third = three-loop figure). The downloadable WAV is the prototype's "artifact" — like `13-piano-canvas` saves a painting, `osc-composer` saves a figure as audio. First prototype where the artifact IS the sound (not a visualization of it). Zero deps, pure Web Audio + Canvas2D. One-cycle build. RESEARCH.md §82.

### ghost-xr — step inside a Ghost scene's spatial audio via WebXR `[queued, needs CDN dep (A-Frame ~1MB)]`
Route: `/dream/45-ghost-xr`. An A-Frame WebXR scene (A-Frame loaded from CDN, ~1MB) where the user is inside a 3D sphere. The Ghost scene spatial audio sources from `29-scene-spatial` are positioned around them — synthesized HRTF sound sources (stone chamber reverb, forest birds, cosmic drone) orbit at specific azimuths and elevations. On Chrome desktop: drag to rotate the view, audio follows head rotation (DeviceOrientation API). On Meta Quest/Vision Pro: physically look around the Ghost scene's audio landscape. Six Ghost scene presets (same as `29-scene-spatial`), selectable from a floating panel. No headset required for demo — the 360° rotation works on any desktop browser.

Why this: `29-scene-spatial` puts you in front of the spatial audio sphere. `ghost-xr` puts you inside it. With a headset, this is the most immersive Ghost experience in the sandbox — you're not looking at a Ghost scene, you're standing inside its sonic world. The HRTF audio code is identical to `29-scene-spatial` (reuse the same synthesis). WebXR is production-ready in 2026 (RESEARCH.md §81). Needs Karel OK on A-Frame CDN dep (~1MB). Without A-Frame: raw WebXR API is more code but zero-dep. One-cycle build.

Key findings from Cycle 51 (2026-05-20):
- ACE-Step 1.5 vocal-to-BGM (RESEARCH.md §77) — `fal-ai/ace-step/audio-to-audio`. Hum → full band. FAL_KEY in use. $0.006/30s. Inspires `vocal-bgm`.
- MusicRFM (§78, ICLR 2026) — note/chord steering via activation space during inference. Server-side. Future API: `note-steer` prototype.
- Composer Vector (§79, Apr 2026) — style-space blending for symbolic music. 70% Chopin + 30% Bach = audible hybrid. Inspires `style-map`.
- AI music therapy cluster (§80) — binaural + AI music therapy validated. Proactive path guidance. Inspires `guided-session` and `mood-journey`.
- WebXR spatial audio production-ready (§81) — WebXR 2026 standard. Ghost-XR prototype possible with A-Frame CDN dep. Inspires `ghost-xr`.
- Oscilloscope music browser tools (§82) — Lissajous figure composition as audio. Inverts `20-scope`. Inspires `osc-composer`.
- Rust/WASM AudioWorklet (§83) — browser-native production DSP. ~150KB CDN dep. Inspires `wasm-filter`, upgrades `34-spectral-morph`.
- Proactive AI music therapy (§84) — mood-path traversal via Russell circumplex. Combines `38-mood-xy` + `42-binaural`. Inspires `mood-journey`.
