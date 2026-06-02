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

---

## FROM RESEARCH (Cycle 56, 2026-05-20) — promoted to queue

### arc-compose — MiniMax Music 2.6 journey arc composer with structural section tags `[queued, needs FAL_KEY — already in use]`
Route: `/dream/48-arc-compose`. Left panel: a textarea with section-tag helper buttons ([Intro], [Verse], [Build Up], [Chorus], [Bridge], [Outro], [Inst]). Style prompt field: "cinematic orchestra, dark ambient" or "jazz piano trio, warm". Right panel: the generated waveform + bloom visualizer. User writes an arc like:

```
[Intro] single piano note in vast reverb, silence between phrases, 15 seconds
[Build Up] low cello drone enters, pad swells, tension builds, 20 seconds
[Chorus] full orchestral peak, bright major resolution, drums present, 20 seconds
[Outro] instruments fade one by one, piano alone, then silence, 10 seconds
```

Server route calls `fal-ai/minimax-music/v2.6` with the arc text as lyrics and the style string. The model generates a 60–90s structured piece that follows the arc. MP3 plays through the six-band bloom visualizer; waveform strip shows the full duration. Download button saves the MP3.

Why this now: `18-elevenlabs-compose` was designed for exactly this interaction but cost $1.13/generation — prohibitively expensive for experimentation. MiniMax 2.6 delivers equivalent section control at **$0.03**, 37× cheaper. This is the prototype that turns the abstract arc concept (`5-arcs` — five arc types described in prose) into a generated 60-second piece you can actually listen to and show at a venue. First prototype where Karel can hear what a Cinematic Three-Act or EDM Build-and-Drop arc *sounds like* with real AI-generated music. FAL_KEY already in use. Zero new approvals. One-cycle build. RESEARCH.md §86.

### tap-rhythm — tap your rhythm, get a step sequencer `[queued, zero deps]`
Route: `/dream/48-tap-rhythm`. Mic → onset detection (same amplitude threshold approach as `1-live` and `36-pluck-field`). User taps on any surface or claps for ~8 beats. The agent detects each onset, measures inter-onset intervals to estimate BPM, and quantizes each tap to the nearest 16th-note position in a 2-bar grid. After 8+ taps, the grid is displayed as a **circular step sequencer** (clock face with 32 positions). Each filled position loops, triggering a drum sound synthesized via Web Audio:
- Low-energy taps → kick: 55Hz sine burst, 80ms attack-decay, slight distortion
- Mid-energy taps → snare: filtered noise burst, 50ms duration, 2kHz peak
- High-energy taps (louder) → hi-hat: 6–12kHz white noise, 20ms sharp decay

The clock hand rotates at the detected BPM. User can toggle individual steps on/off (click the clock face). Tap new rhythm → re-captures and replaces. BPM slider (±20% from detected). "Clear" resets. Mic amplitude indicator while tapping.

Why this: None of the 47 prototypes accept rhythm as the primary input. A non-pianist can walk up and clap a rhythm — the prototype turns it into a live drum loop. First step toward the DARC tap-to-drum concept (RESEARCH.md §89). High live-performance fitness: at a venue, tap a groove, and the rhythm starts playing. Zero deps, zero API. One-cycle build.

### anemone-av — organic bioluminescent 3D form dancing to audio `[queued, zero new deps]`
Route: `/dream/48-anemone-av`. A Three.js R3F scene (all deps already installed: `three@0.182`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`) with a procedurally generated branching 3D anemone form:
- Main trunk: 1 `TubeGeometry` path (sinusoidal spine curve)
- 8 branches: each sprouting from the trunk at a different height/angle
- Sub-branches: 3–5 per branch, tapering, with randomized directions

**TSL vertex displacement** (compiled to WGSL/GLSL automatically by Three.js TSL):
- Sub-bass (20–100 Hz): slow pendulum sway of the main trunk axis (~0.3 Hz, ±15°)
- Low-mid (100–500 Hz): branch base rotation (±8°, 0.8 Hz)
- High-mid (2–4 kHz): tip-flicker — outer branch vertices oscillate rapidly (4 Hz, ±3°)
- Onsets: a brief global pulse — all geometry expands by 10% for 80ms then contracts

**Bloom post-processing** (`UnrealBloomPass` via `@react-three/postprocessing`): glowing core (white), branch body (deep cyan), tips (violet). Alpha fades with distance from center — the form glows against pure black.

Demo mode: LFO oscillators (sub-bass at 0.1 Hz, high-mid at 3 Hz) animate the form without mic permissions. Mic mode: live FFT drives all parameters. Dark background, no axes, just the form. One sentence description overlay fades after 3s.

Why this: `21-three-mesh-av` is the only 3D prototype and it uses rigid platonic geometry (icosahedron). An organic living form — tentacles flickering, trunk swaying — reads as alive rather than mathematical. Sub-bass swaying the trunk at concert-room dynamics would be genuinely striking on a projector. Zero new deps (all Three.js packages are installed). One-cycle build. RESEARCH.md §92.

### stem-spatial — AI track → stem split → HRTF band positioning `[queued, needs FAL_KEY + stem API — two cycles]`
Route: `/dream/48-stem-spatial`. Step 1: generate a 30s instrumental track via MiniMax Music 2.6 (`[Inst]` tag, no vocals) with a brief style prompt. Step 2: send the generated MP3 to a stem separation model (fal.ai has Demucs-based stem splitters — check current availability). Step 3: the separated stems (drums, bass, piano/melody, other) are each decoded into an `AudioBuffer` and routed to a separate `PannerNode` with distinct HRTF position: drums from above, bass from below, piano from front-left, melody from front-right. Drag any source dot to reposition in 3D space (same canvas sphere as `29-scene-spatial`). Wear headphones.

Why this: `7-spatial` spatializes mic input across frequency bands. `29-scene-spatial` spatializes synthesized sounds. `stem-spatial` is the first prototype that spatializes an AI-generated full track — the band you summoned is placed in 3D space around you. Combines `48-arc-compose` (generation) with `7-spatial` (HRTF positioning). Budget: ~$0.03 (MiniMax) + ~$0.01–0.05 (stem split). FAL_KEY already in use. Two-cycle build (generation + spatial routing). RESEARCH.md §85.

Key findings from Cycle 56 (2026-05-20):
- Google Flow Music + Lyria 3 Pro (RESEARCH.md §85) — stem splitter, 3-min structured songs, "Replace+Extend" section regeneration. Inspires `stem-spatial`. Same Gemini key as `lyria-ghost`.
- MiniMax Music 2.6 (§86) — 14+ structural section tags, $0.03/generation, FAL_KEY in use. Inspires `arc-compose` — the `18-elevenlabs-compose` prototype, finally affordable.
- AILive Mixer (§87, arxiv 2603.15995) — zero-latency DL auto-mixer for live performance. Inspires polish of `35-loop-station` with RMS-based auto-gain.
- Real-Time Human-AI Co-Performance (§88, arxiv 2604.07612) — look-ahead latent diffusion + MAX/MSP, 5.4× speedup. Inspires look-ahead slider polish of `39-anticipate`.
- DARC (§89, arxiv 2601.02357) — tap/beatbox → drum accompaniment. Inspires `tap-rhythm` — zero deps, highest accessibility.
- Streaming accompaniment (§90, arxiv 2510.22105) — latency/coherence tradeoff formalized. Explains Lyria RealTime 2s update delay. Reference for all future real-time AI music prototypes.
- SonoCraftAR (§91, arxiv 2508.17597) — multi-agent LLM generates sound-reactive AR interfaces from text. Inspires `claude-canvas` meta-prototype (needs Karel OK on ANTHROPIC_API_KEY in dream zone).
- Bioluminescent AV + Galaxy WebGPU (§92) — organic branching forms dancing to audio, Three.js TSL. Inspires `anemone-av` — zero new deps, One-cycle build.

---

## FROM RESEARCH (Cycle 61, 2026-05-20) — promoted to queue

### diatonic-harmony — play a melody, hear chord-correct harmony voices `[queued, zero deps]`
Route: `/dream/51-diatonic-harmony`. Mic → autocorrelation pitch detection (same algorithm as
`13-piano-canvas`). Key detection: accumulate a 12-bin chroma vector over the last 8 detected
notes → dot-product template match against 24 major/minor key templates (same technique as
`28-chord-canvas`) → pick highest-scoring key + mode. For each detected note, generate 2
additional harmony voices: the **diatonic third above** (major or minor third depending on scale
degree) and the **diatonic fifth above** (perfect fifth or diminished fifth at scale degree 7),
both within the detected key's scale. Harmony voices = sine `OscillatorNode`s with 150ms
attack + 400ms release envelope, gain 0.4, panned ±20° for spatial separation. Main melody
stays center (mic passthrough OFF — just the pitch-detection visualization; no raw mic audio).

Visual: three-track piano roll (same Canvas2D as `24-piano-roll`): your detected note in
**warm orange** (middle track), third-voice in **light blue** (above), fifth-voice in **deep blue**
(below). Bars scroll left at BPM rate. Key label top-right updates live ("Detected: C major").
Chord name (from `28-chord-canvas` template matching over the last 3 notes) updates when stable.
Demo mode: plays the Bach fragment from `22-code-score` and auto-generates its diatonic harmonies
at full fidelity. "You play a melody — its diatonic harmonies float alongside."

Different from `23-pitch-harmonize`: that prototype pitch-shifts the raw mic signal by a fixed
interval (always a fifth, always mechanical). This prototype detects the key and generates
*scale-correct* voices — different intervals on different scale degrees, as a real arranger would.
Zero deps. One-cycle build. Research basis: AI Harmonizer (RESEARCH.md §96).

### concept-steer — 6-axis music concept synthesizer `[queued, zero deps]`
Route: `/dream/52-concept-steer`. Inspired by sparse autoencoder research on interpretable music
model representations (RESEARCH.md §94): music AI models internally represent music along axes
labeled **Brightness**, **Density**, **Regularity**, **Complexity**, **Energy**, **Mode**. This
prototype makes those same axes the primary synthesis controls.

Canvas: a hexagonal radar chart (regular hexagon, one vertex per axis). Each vertex is
draggable; the radar polygon fills as the current "concept position." Axis labels around the
perimeter. Six synthesis mappings:
- **Brightness** → low-pass filter fc 400–6000 Hz
- **Density** → simultaneous voice count 1–5, BPM 40–140
- **Regularity** → note quantization: free (random 80–160% duration) → strict grid (exact durations)
- **Complexity** → chord voicings: unison → dyad → triad → 7th → polychord (add 9th, 11th)
- **Energy** → note attack 0.8s→0.04s + velocity scaling 0.3→1.0
- **Mode** → chord quality interpolation: major → minor → diminished

Synthesis engine: same oscillator stack as `38-mood-xy` (GainNode envelopes, BiquadFilterNode
low-pass, multiple OscillatorNodes per chord voice). A small chord-name label (from
`28-chord-canvas` template matching) updates live in the corner. Preset positions: "Classical
Fugue" (bright, regular, complex, major), "Dark Ambient" (dim, sparse, free, minor, low energy),
"Jazz Improv" (bright, dense, irregular, complex, major), "Drone" (dim, sparse, regular, unison).

"Navigate music as a space of named concepts — not moods, not knobs." First prototype where the
UI labels are the same vocabulary a musician or music theorist would use, derived from what
music AI models learn internally. Zero deps. One-cycle build. RESEARCH.md §94.

### claude-shader — LLM-generated audio-reactive GLSL shader `[queued, needs ANTHROPIC_API_KEY]`
Route: `/dream/51-claude-shader`. Admin-only. A textarea where you describe an audio-reactive
visualization in plain English: "a rotating vortex of particles that expands on every beat,
purple when bass-heavy, orange when treble-heavy." Click "Generate" → server route calls
`claude-haiku-4-5` with a constrained system prompt:

```
You generate GLSL fragment shaders for audio-reactive visuals. The shader receives these uniforms:
  uniform float uBass;    // 0.0–1.0 bass energy (20–250 Hz)
  uniform float uMid;     // 0.0–1.0 mid energy (250–4000 Hz)
  uniform float uTreble;  // 0.0–1.0 treble energy (4000–20000 Hz)
  uniform float uOnset;   // 0.0–1.0 onset strength (decays 100ms after beat)
  uniform float uTime;    // elapsed seconds
  uniform vec2  uRes;     // canvas resolution in pixels
Output: only the GLSL function body for `vec4 mainImage(vec2 fragCoord)`.
```

Generated shader body is compiled via WebGL on a fullscreen quad. Web Audio AnalyserNode
feeds the uniforms each frame. The user can edit the raw GLSL inline (CodeMirror from CDN,
~200KB, no package.json change). "Regenerate variation" calls again with the same prompt +
"Try a different approach." Error overlay shows GLSL compile errors.

Self-referential: Claude generates an audio-reactive GLSL shader that runs in the browser
session where Claude is the agent. Zero new npm deps. Needs ANTHROPIC_API_KEY in Vercel env —
ask Karel. Budget: ~$0.001/generation at Haiku pricing. Route: `/dream/51-claude-shader`.
RESEARCH.md §93.

### ghost-sfx — ElevenLabs sound effects for Ghost scenes `[queued, needs FAL_KEY — already in use]`
Route: `/dream/52-ghost-sfx`. Six Ghost preset scenes, each with 3–4 pre-authored sound effect
text prompts. Click "Generate [Stone Chamber]" → server route calls fal.ai ElevenLabs Sound
Effects model for each prompt → 3–5s clips returned as audio data → stored in `sessionStorage`
→ decoded via `AudioContext.decodeAudioData` → played through `PannerNode` (HRTF model) at
scene-specific 3D positions.

Scene sound prompts (examples):
- Stone Chamber: "footstep echo in large stone cave, reverb 3s decay", "single piano chord in stone chamber, long reverb", "water drip in distant cave"
- Forest Dawn: "birdsong canopy from above, morning light", "stream flowing past from left", "single piano note in a forest clearing"
- Cosmic Ascension: "vast resonant drone from all directions", "high harmonic shimmer rising", "deep subharmonic pulse from below"

Canvas: same top-down sphere view as `29-scene-spatial` (F/B/L/R compass, colored dots for
each source). Drag dots to reposition. Wear headphones — the HRTF spatialization of naturalistic
generated sounds is more immersive than synthesized oscillators.

"The scenes that were always visual — now they have a voice." The ElevenLabs SFX model gives
Ghost scenes the same quality level as their imagery. Admin-only. FAL_KEY in use. Budget:
~$0.05–0.15/scene. One-cycle build once fal.ai endpoint is confirmed. RESEARCH.md §95.

Key findings from Cycle 61 (2026-05-20):
- AI Co-Artist (RESEARCH.md §93, arxiv 2512.08951) — LLM generates and evolves GLSL shaders from text descriptions; proves `claude-shader` is buildable. Needs ANTHROPIC_API_KEY.
- Interpretable Concepts in Music Models (§94, arxiv 2505.18186, May 2026) — sparse autoencoders extract Brightness/Density/Regularity/Complexity/Energy/Mode from transformer music models. Inspires `concept-steer` — zero deps, one cycle.
- ElevenLabs Sound Effects on fal.ai (§95) — text → short high-fidelity ambient sounds. FAL_KEY in use. Inspires `ghost-sfx` — naturalistic Ghost scene audio.
- AI Harmonizer (§96, arxiv 2506.18143, Jun 2025) — AMT-based 4-part diatonic harmony; offline only. Inspires `diatonic-harmony` — key detection + rule-based voice generation, zero deps.
- Token-Based Audio Inpainting (§97, arxiv 2507.08333, Feb 2026) — discrete diffusion for coherent audio continuation/inpainting. Future upgrade path for `43-stable-extend`. No fal.ai endpoint yet.
- Three.js/WebGPU 2026 (§98) — 100× gains confirmed, 1M particles at 60fps, ML inference via WebGPU compute. Reinforces `gpu-additive` and Three.js polish cycles.
- Streaming Piano Transcription (§99, arxiv 2503.01362) — causal streaming model for full note events (onset+pitch+offset+pedal). Future WASM upgrade for pitch detection across all prototypes.
- iPlug3 2026 (§100) — Jan 2026 clean-slate audio plugin framework with WebGPU + MCP agent integration. Best path to Resonance native install mode.

---

## FROM RESEARCH (Cycle 66, 2026-05-20) — promoted to queue

### maestro-stems — Beatoven 2.5-min track → stems → HRTF 3D band positioning `[queued, needs FAL_KEY — already in use]`
Route: `/dream/54-maestro-stems`. A style prompt field ("cinematic cello quartet, 70 BPM, minor key") + "Generate Track" button. Server route calls `beatoven/music-generation` → returns a full 2-minute instrumental track **AND individual stems** (drums, bass, melody, other). All stems decoded via `AudioContext.decodeAudioData`. Each stem is routed through a separate `PannerNode` (HRTF model): drums from above (+60° elevation), bass from below (−30°), melody from front-right (+25° azimuth), other from front-left (−25°). Canvas: same top-down sphere as `29-scene-spatial` — 4 colored stem-source dots, draggable. Mix slider per stem (same as `7-spatial`). Wear headphones.

"The band plays around you." This is the `stem-spatial` idea from the queue, now buildable without Lyria Flow Music's stem splitter. Maestro outputs stems directly. The key difference from `7-spatial` (which splits by frequency band): this separates by **musical role** — the drums come from above, not "the high frequencies." Much more spatially meaningful. FAL_KEY in use. $0.10/track. One-cycle build. RESEARCH.md §101.

### webgpu-audio-fx — Three.js TSL compute audio: GPU pitch-shift + reverb + visual feedback `[queued, zero new deps]`
Route: `/dream/54-webgpu-audio-fx`. Extends the Three.js WebGPU compute audio example (RESEARCH.md §102) into an interactive prototype. An audio file upload (or mic via `getUserMedia`) feeds an `AudioBuffer` to a GPU storage buffer. A TSL compute shader (Three.js Shader Language, compiles to WGSL automatically) applies: (1) **pitch shift** — reads the waveform at speed-adjusted fractional indices (0.5× to 2.0×, continuous slider), (2) **6-layer feedback delay** — each delay slightly different length with decreasing gain coefficient (reverb depth slider 0–100%). The processed audio is enqueued to a `ScriptProcessorNode` for playback. Simultaneously, an `AnalyserNode` on the output feeds a Three.js texture uniform that drives a 3D frequency visualization (a radial bar chart or mesh-deformation same as `21-three-mesh-av`, now driven by the GPU-processed audio).

"GPU computes the music. GPU renders the music." First sandbox prototype where the audio processing DSP and the visual rendering both run on the same GPU device — no AudioWorklet, no CPU DSP. WebGPU required; clear fallback. Zero new npm deps (three@0.182 + R3F already installed). One-cycle build. RESEARCH.md §102.

### ghost-voice — Ghost scene narration via Inworld TTS + HRTF front-center `[queued, needs FAL_KEY — already in use]`
Route: extend `/dream/53-ghost-sfx` OR standalone `/dream/55-ghost-voice`. A scene selector (same 6 Ghost scenes). Each scene has a pre-written one-line narrative fragment from the Ghost journey text:
- Stone Chamber: *"The resonance here is ancient. Let yourself be absorbed by it."*
- Root Portal: *"Something stirs beneath the roots. A low note. Then silence."*
- Underground Pool: *"The water remembers every sound that has passed through this place."*
- Tiny Planet: *"A single breath. The horizon wraps around you."*
- Forest Dawn: *"The first light is also the first sound. They arrive together."*
- Cosmic Ascension: *"You are not rising. The world is receding."*

"Narrate" button → server route calls Inworld TTS-1.5 Max (or Chatterbox Turbo) on fal.ai with the line + a voice description ("calm, androgynous, slow pace, slight reverb, like speaking from inside a resonant chamber"). Returned audio decoded and played through HRTF PannerNode at azimuth 0°, elevation 0° (directly ahead at ear level). A subtitle bar fades in below the canvas. The spoken word completes the Ghost scene: ambient sound + 3D sources + narration.

"The Ghost speaks." Admin-only. FAL_KEY in use. ~$0.01–0.02/line. Zero new deps. One-cycle build as extension of `53-ghost-sfx` or standalone. RESEARCH.md §105.

Key findings from Cycle 66 (2026-05-20):
- Beatoven Maestro on fal.ai (§101) — `beatoven/music-generation`, $0.10/request, 2.5-min instrumentals + stems. FAL_KEY in use. Inspires `maestro-stems-spatial`.
- Three.js WebGPU Compute Audio (§102) — TSL compute shaders for GPU pitch-shift + delay DSP. Visual AnalyserNode feedback. Zero new deps (three@0.182 installed). Inspires `webgpu-audio-fx`.
- Art2Mus (§103, arxiv 2602.17599, Feb 2026) — direct artwork→music without text intermediary; validates `lyria-ghost` direction. No public API yet; monitor.
- TADA! Activation Steering (§104, arxiv 2602.11910, Feb 2026) — named concept control (instrument/genre/vocal) in audio diffusion at inference time. No API yet; monitor.
- Inworld TTS-1.5 Max (§105) — sub-150ms TTS, expressive, FAL_KEY in use. Inspires `ghost-voice` — Ghost scenes narrated in the Ghost character's voice.
- Conducting gesture recognition (§106, arxiv 2604.27957, Apr 2026) — skeleton tracking → live music tempo/dynamics control. Inspires `conductor` prototype (needs MediaPipe CDN dep, same as `31-gesture-music`).
- Web Audio API v2 Configurable Render Quantum (§107) — sub-3ms audio processing in Q4 2026. Will improve all pitch-detection prototypes automatically when Chrome ships.
- TVTSyn real-time voice timbre conversion (§108, arxiv 2602.09389, Feb 2026) — sub-80ms GPU timbre transfer. Not browser-ready; monitor for WASM port. Inspires future `timbre-morph`.

---

## FROM RESEARCH (Cycle 70, 2026-05-20) — promoted to queue

### sound-to-image — mic audio → acoustic analysis → Flux generated image `[queued, needs FAL_KEY — already in use]`
Route: `/dream/57-sound-to-image`. Mic input (or demo oscillators) runs for 10 seconds. During
capture: extract spectral centroid (brightness), dominant pitch (autocorrelation), energy level,
zero-crossing rate (noisiness), and basic chord quality if pitched (same chroma algorithm as
`28-chord-canvas`). Combine into a natural-language description: "dark, resonant, low-frequency
bass music with slow tempo and cave-like reverb quality" or "bright, energetic treble-dominant
music with a fast pace and C major character." Send to fal.ai `fal-ai/flux/schnell` with the
description augmented by "photorealistic scene, dramatic lighting, no text." The generated image
fades in over 2 seconds on the right panel alongside the audio waveform and feature readout.

"What does your music look like?" This is the conceptual inverse of `1-live` (audio → abstract
color fields) and `13-piano-canvas` (audio → brush strokes): it generates a *semantic image* of
the acoustic scene — what place, what environment, what story does this sound evoke? Inspired by
Sound2Vision (RESEARCH.md §112). FAL_KEY in use. ~$0.01–0.04/image (Flux Schnell). One-cycle
build. Zero new npm deps.

### music-to-ghost — live audio analysis → Ghost scene image generation `[queued, needs FAL_KEY — already in use]`
Route: `/dream/58-music-to-ghost`. Mic input → `28-chord-canvas`-style chroma analysis (12-bin
chroma vector, template-matched to major/minor chord quality) + `38-mood-xy`-style emotion
mapping (arousal from tempo/energy, valence from chord quality). After 8 seconds of audio:
classify into one of four quadrants (energetic+bright, energetic+dark, calm+bright, calm+dark).
Map the quadrant to a pre-written Ghost LoRA prompt: energetic+bright → "Ghost figure in cosmic
ascension, arms outstretched, golden light, flight"; calm+dark → "Ghost figure in stone chamber,
seated meditation, single candle, ancient stone walls"; energetic+dark → "Ghost figure in
underground pool, standing, turbulent water, deep blue light"; calm+bright → "Ghost figure in
forest dawn, walking, morning mist, warm green light." Call the Ghost LoRA image generation API
(`/api/ai-image/generate` with admin auth) with the matching prompt.

Canvas: two panels — top: live scrolling piano roll (from `24-piano-roll` logic), bottom: Ghost
image fades in. Status text shows current detected chord and emotion quadrant. "A 5-second listen
tells the story." Admin-only. FAL_KEY in use. ~$0.02–0.05/image. One-cycle build. Inspired by
multi-agent music-to-image research (RESEARCH.md §114). Simpler than `45-piano-to-ghost` (no
GEMINI_API_KEY needed — image only, no Lyria music generation).

### gemini-voice-lab — A/B Gemini TTS style director for Ghost Voice `[queued, needs FAL_KEY — already in use]`
Route: `/dream/57-gemini-voice-lab` (or extend `/dream/56-ghost-voice`). Two-panel UI. Left: scene
selector (same 6 Ghost scenes) + two style_instructions textareas (A and B). Right: two waveform
strips + play buttons. Click "Generate A" → calls `fal-ai/gemini-tts` with the scene line +
style_instructions A. Click "Generate B" → same line + style_instructions B. Both cached in
sessionStorage. Click A/B to listen and compare. Vote buttons: "A wins", "B wins", "Both fine",
"Try again." Votes stored to localStorage. Pre-loaded examples: A = "calm, slow, stone reverb" vs
B = "whispered, breathy, intimate, very close." Canvas shows two waveform strips; duration and
pitch contour (rough) side by side.

"Fine-tune the Ghost's voice through comparison." Useful for Karel to find the right voice
character. Complements `2-ghost-lab` (which does A/B image comparison). Zero new deps. FAL_KEY in
use. ~$0.01/generation pair. One-cycle build. Research basis: RESEARCH.md §110 (Gemini TTS style
prompting confirmed working — used to fix `56-ghost-voice` this cycle).

Key findings from Cycle 70 (2026-05-20):
- Inworld TTS correct endpoint (§109) — `fal-ai/inworld-tts`, 70+ named voices, no style description
  field. Used Gemini TTS instead for `56-ghost-voice` fix (style_instructions matches Ghost voice descs).
- Gemini TTS on fal.ai (§110) — `fal-ai/gemini-tts`, natural-language style_instructions, 30+ voices,
  FAL_KEY in use. Fixed `56-ghost-voice` endpoint this cycle. Inspires `gemini-voice-lab`.
- Live Music Models paper (§111, arxiv 2508.04651) — Magenta RealTime open-weights confirmed
  production-quality. Lyria RealTime API confirmed for `30-lyria-jam`. Both require GEMINI_API_KEY.
- Sound2Vision (§112, arxiv 2412.06209) — audio → semantic image via cross-modal alignment.
  No public API; browser-approachable via acoustic analysis → text → fal.ai Flux. Inspires `sound-to-image`.
- LARA-Gen (§113, arxiv 2510.05875) — continuous valence×arousal emotion control for music generation.
  No API yet. Validates `38-mood-xy` + `47-mood-journey` design. Monitor for endpoint.
- Multi-Agent Music-to-Image (§114, arxiv 2512.23320) — joint music semantics + affect → image.
  No API yet. Inspires `58-music-to-ghost` (FAL_KEY-only, Ghost LoRA images from audio emotion).
- Segment-Factorized Full-Song (§115, arxiv 2510.05881) — real-time streaming symbolic piano gen.
  Future upgrade path for `33-aria-companion`. No API yet; monitor.
- SynthVC streaming voice conversion (§116, arxiv 2510.09245) — 77ms end-to-end latency,
  zero-shot. Future `voice-morph` prototype. No browser/WASM port yet; monitor.

---

## FROM RESEARCH (Cycle 74, 2026-05-21) — promoted to queue

### music-palette — live emotion→color palette from audio `[queued, zero deps, zero API]`
Route: `/dream/60-music-palette`. Mic input (or demo LFOs) → 6-band FFT (`1-live` pipeline) →
arousal/valence estimation (same mapping as `38-mood-xy`): bass energy → arousal, chord quality
from chroma → valence. Compute a 5-color HSL palette from the current coordinates: valence maps
hue anchor (happy=45–80° warm yellows/oranges, neutral=150° green-teal, sad=240–270° blues/purples);
arousal maps lightness (energetic=L70%, calm=L30%); frequency richness maps saturation. Five swatches
are complementary offsets from the anchor hue (±30°, ±60°, ±90° in HSL space). Palette updates
every second via exponential moving average — it breathes slowly with the music.

Canvas: upper half = five large colored rectangles labeled with their hex codes + HSL values.
Lower half = the `1-live`-style six-band bloom ring showing the current audio energy. A "Download
SVG" button exports the current 5-color palette as an SVG file (labelled with the detected arousal/valence
values). Demo mode: same wandering LFO oscillators as other no-mic prototypes — watch the palette
drift from warm to cool as the LFOs cycle.

"Your music as a color story." Zero deps, zero API. First prototype that makes the emotion→color
connection visible and downloadable. Natural complement to `38-mood-xy` (emotion as music) and
`13-piano-canvas` (music as painting). One-cycle build. Research basis: Music2Palette (RESEARCH.md §120).

### lyrics-journey — Ghost journey as a sung AI composition `[queued, needs FAL_KEY — already in use]`
Route: `/dream/60-lyrics-journey`. Admin-only. ElevenLabs Music (`fal-ai/elevenlabs/music`) with
a full Ghost journey `composition_plan`. Six sections, one per Ghost narrative scene:

- **Stone Chamber** (30s, minor, sparse piano): "The resonance here is ancient. / Let yourself be absorbed by it."
- **Root Portal** (25s, ominous, bass drone): "Something stirs beneath the roots. / A low note. Then silence."
- **Underground Pool** (30s, ethereal, water textures): "The water remembers every sound. / That has passed through this place."
- **Tiny Planet** (20s, airy, high strings): "A single breath. / The horizon wraps around you."
- **Forest Dawn** (30s, hopeful, strings rising): "The first light is also the first sound. / They arrive together."
- **Cosmic Ascension** (35s, transcendent, full orchestral): "You are not rising. / The world is receding."

User can edit any section's lyrics or style before generating. Generate button → composition_plan sent
to ElevenLabs Music → 2.5–3 minute sung piece plays through the live-bloom visualizer. Waveform strip
shows the full duration; section markers show where each Ghost scene begins.

This is the first prototype where the Ghost character **sings**. Different from `48-arc-compose`
(structural arc, instrumental) and `6-compose` (text prompt, no lyrics): this one uses the actual
Ghost narrative as lyrics and the journey arc as the musical structure. The output is a literal Ghost
journey album track. Budget: ~$2.40/generation for a 3-min piece. FAL_KEY in use. One cycle.
Research basis: RESEARCH.md §118 (ElevenLabs Music composition_plan confirmed API).

### orpheus-voice — phrase-level emotion tags for Ghost TTS `[queued, needs FAL_KEY — already in use]`
Route: Extend `/dream/59-gemini-voice-lab` OR standalone `/dream/61-orpheus-voice`. Adds Orpheus TTS
(`fal-ai/orpheus-tts`, $0.05/1000 chars) as a third comparison track alongside the two Gemini variants.
Orpheus uses **phrase-level XML-style emotional tags** embedded in the text — a fundamentally different
control paradigm from Gemini's global `style_instructions`:

- Gemini: `style_instructions = "calm, androgynous, very slow, stone reverb"` → global voice character
- Orpheus: `"The <reverent>resonance</reverent> here is ancient. Let yourself be <whispers>absorbed</whispers> by it."` → per-word direction

Eight available tags: `<sad>`, `<reverent>`, `<fearful>`, `<excited>`, `<happy>`, `<whispers>`,
`<disgusted>`, `<surprised>`. UI: a "C — Orpheus Tags" textarea for each scene, pre-loaded with an
example using bracket syntax. Generate C button calls `fal-ai/orpheus-tts`. Three waveform strips A/B/C
with play buttons. Vote: A wins / B wins / C wins / etc.

The emotional bracket syntax opens a new dimension: you can make a single line change register, pause,
whisper. A <whispers> word in the middle of a sentence breaks differently from a whispered sentence.
FAL_KEY in use. Zero new deps. One cycle. Research basis: RESEARCH.md §117.

### collage-compose — image + hum + word → music `[queued, needs FAL_KEY — already in use]`
Route: `/dream/62-collage-compose`. Three input slots: (1) a Ghost scene **image** — either from a
preset thumbnail (Stone Chamber, Forest Dawn, Cosmic Ascension placeholder images) or drag-and-drop
your own; (2) a short **hum** recording (3–8s via mic, same `MediaRecorder` pattern as `43-stable-extend`);
(3) a **mood word** (textarea, e.g. "ancient", "ascending", "lost", "dawn"). Click **Compose →**.

Processing before the API call:
- Extract dominant color temperature from the image (compute average HSL of sampled pixels): warm colors
  → "warm, golden, glowing" descriptor; cool → "cold, vast, reverberant."
- Run autocorrelation pitch detection on the hum → identify the dominant pitch and tempo feel (BPM estimate
  from zero-crossing periodicity) → "melody centered on E3, slow 52 BPM" or "quick rising phrase, 90 BPM."
- Combine all three into a rich style prompt: "[warm, golden, ancient dawn light] + [slow melodic phrase centered on E3, 52 BPM] + [ascending, hopeful]" → sent to ACE-Step (`fal-ai/ace-step`) with `[inst]` lyrics tag.

The generated 30s track plays through the bloom visualizer. Waveform strip. Download MP3.

"What if your world designed your music?" The multimodal combination produces prompts no one would
type manually. A Ghost scene image combined with a hum establishes tonal center, mood, and visual
context simultaneously — the output should feel more precisely tuned than any text-only prompt. Zero
new npm deps. FAL_KEY in use, $0.006/track (ACE-Step). One cycle.
Research basis: RESEARCH.md §121 (Mozualization) and §125 (Sonauto V2).

Key findings from Cycle 74 (2026-05-21):
- Orpheus TTS on fal.ai (§117) — phrase-level `<emotion>` tags in text, $0.001/Ghost line, FAL_KEY in use. Inspires `orpheus-voice`: 3-way A/B/C Ghost voice comparison (Gemini global vs Gemini alt vs Orpheus phrase-level).
- ElevenLabs Music composition_plan confirmed (§118) — lyrics per section confirmed in API schema. Inspires `lyrics-journey`: full Ghost journey as a sung composition, 6 sections with Ghost narrative as lyrics. $2.40/generation.
- StyleStream (§119, arxiv 2602.20113, ICLR 2026) — 1s latency real-time zero-shot voice style conversion. GitHub available. No fal.ai endpoint yet; monitor for `voice-style` prototype.
- Music2Palette (§120, arxiv 2507.04758, ACM MM 2025) — emotion-aligned color palette from music. Inspires `music-palette`: browser-native zero-dep live palette from audio arousal/valence.
- Mozualization (§121, arxiv 2504.13891, CHI 2025) — multimodal music gen from images + audio clips + keywords. Inspires `collage-compose`.
- Sonic4D (§122, arxiv 2506.15759) — spatial audio from video, physics-based. Future direction; no API yet.
- Three.js r184 (§123) — memory fix + WebGPU Baseline in all browsers. All Three.js prototypes stable; zero-cost WebGPU renderer upgrade available.
- AI Music Psychotherapy for D/HH (§124, arxiv 2603.07963) — co-writing process is itself therapeutic. Inspires `co-write` direction.
- Sonauto V2 (§125, fal.ai) — full songs with vocals, BPM control, $0.075/song. Good backend for `collage-compose`.
- MuVi + SyncDIT (§126, arxiv 2410.12957) — video↔music semantic + rhythmic alignment. Future direction for Ghost animate + music pairing.

---

## FROM RESEARCH (Cycle 78, 2026-05-21) — promoted to queue

### synesthetic-sketch — multi-dimensional synesthetic canvas `[queued, zero deps]`
Route: `/dream/63-synesthetic-sketch`. Six independent audio features each control a separate visual
dimension on a single accumulated Canvas2D. NOT just color (already done in `1-live`, `60-music-palette`).
Each audio frame deposits a "musical object" on the canvas:
- spectral centroid → hue (same mapping as `1-live`)
- spectral bandwidth → shape complexity: circle=pure tone, hexagon=mid-spread, star=wide spread
- rhythm regularity (IOR variance over last 8 onsets) → object size jitter (regular=tight cluster, irregular=scattered)
- harmonic peak count (FFT peak-picking above noise floor) → number of inner rings
- amplitude → scale of the object
- onset → bright spark burst at a random position + alpha flash

Objects accumulate across the session (like `13-piano-canvas` brush strokes but as shapes, not paths).
Canvas does NOT scroll — it fills. Each new object is composited additively at 60% alpha over prior objects,
building up a luminous layered field. A slow decay pass (0.2% per frame) prevents permanent burn-in.
Download as PNG.

Demo mode: same 6 incommensurable LFO oscillators as `11-terrain` and `17-acoustic-trail` — slow breathing
that cycles through all shape types.

"Not just what color your music is — what shape it is." The 62 existing prototypes map audio to color, fluid,
particles, geometry. None map audio to morphological object *shape* in a multi-dimensional way. A pure sine
tone leaves a single circle. A chord with rich harmonics leaves a multi-ringed star. A rhythmically precise
performance builds a tight grid of shapes; an improvisational performance scatters them wildly. The canvas
IS the acoustic record of a session, readable by shape as much as by color.

Zero external deps. One-cycle build. Research basis: musicolors (RESEARCH.md §131).

### eleven-dialogue — Ghost scene as AI-generated two-character drama `[queued, needs FAL_KEY — already in use]`
Route: `/dream/63-eleven-dialogue`. Six Ghost scenes, each with a pre-scripted 3-line dramatic exchange
between two characters: **Ghost** (calm, ancient, knowing) and **Visitor** (awed, nervous, curious).
ElevenLabs Eleven V3 Text-to-Dialogue (`fal-ai/elevenlabs/tts/eleven-v3`) renders both voices in a single
API call, matching prosody and emotional range across the exchange.

Pre-loaded Stone Chamber exchange:
- Ghost `[slowly, reverently] The resonance here [pauses] is ancient.`
- Visitor `[nervous, awed] I didn't expect it to feel this alive.`
- Ghost `[whispers] Everything that ever sounded here — still does. [pauses] If you know how to listen.`

Both characters' lines shown in editable textareas (Ghost = left, Visitor = right). Generate → single API call
→ audio plays back. Canvas: two side-by-side waveform strips (Ghost = warm amber, Visitor = cool blue) with
animated character-by-character subtitle per line. Scene transitions via the top row. Six scenes × 3-line
dialogue = 30 lines total, each with Eleven V3 inline tags pre-loaded.

"The Ghost is no longer alone." This is the first prototype where the Ghost speaks *to* someone rather than
narrating to the user. Creates a dramatically different listening experience: you become the Visitor's presence.
Different from `56-ghost-voice` (monologue) and `61-orpheus-voice` (A/B style comparison). FAL_KEY in use,
~$0.02/scene ($0.10/1000 chars × ~200 chars/scene). Zero new deps. One cycle. Research basis: RESEARCH.md §§127, 134.

### dialogue-score — score-constrained AI piano dialogue `[demoable — /dream/65-dialogue-score, Cycle 81]`
Route: `/dream/65-dialogue-score` (64 was taken by eleven-dialogue). Extends `33-aria-companion`. After the user plays a phrase (2s silence
→ trigger), instead of a pure Markov chain response, the AI's reply is **contour-constrained**: detect
whether the user's phrase was overall ascending, descending, or arch-shaped (peak in middle) by averaging
inter-note pitch deltas. The AI response then follows the same shape — ascending user phrase → AI responds
with ascending motif, descending → AI continues descent, arch → AI mirrors the arch. Markov transition
probabilities still bias the note selection (preserving the "learns your style" property), but the pitch
range for each step is additionally constrained to enforce the target contour direction.

Visual: same split dual piano roll as `33-aria-companion` (YOU top / ARIA bottom). A small contour
indicator shows the detected shape of the user's phrase and the planned shape of the AI response (using
the `39-anticipate` ghost-note preview — ARIA's contour is visible before it plays). "The AI mirrors your
musical thought." Inspired by "Dialogue in Resonance" (arxiv 2505.16259) where the computer's responses
follow score-derived constraints rather than pure improvisation — the composition and the dialogue coexist.
Zero deps. One cycle. Research basis: RESEARCH.md §129.

### ghost-v3-voice — Ghost narration via ElevenLabs Eleven V3 audio tags `[queued, needs FAL_KEY — already in use]`
Route: extend `/dream/61-orpheus-voice` (add column D) OR standalone `/dream/64-ghost-v3-voice`. Six Ghost
scenes, each narrated using ElevenLabs Eleven V3's inline audio tag system. Pre-loaded tags chosen to match
the Ghost emotional arc:
- Stone Chamber: `[slowly, reverently] The resonance here [pauses] is ancient. Let yourself [whispers] be absorbed by it.`
- Root Portal: `[low, measured] Something stirs [pauses] beneath the roots. [nervous pause] A low note. Then silence.`
- Underground Pool: `[dreamily] The water remembers [pauses] every sound [whispers] that has passed through this place.`
- Tiny Planet: `A single breath. [pauses] The horizon [softly] wraps around you.`
- Forest Dawn: `The first light [pauses, warmly] is also the first sound. They arrive [gently] together.`
- Cosmic Ascension: `[flatly, vast] You are not rising. [long pause] The world [resigned tone] is receding.`

Eleven V3's inline tags work as mid-sentence emotional beats — not per-word direction (Orpheus) or global
style (Gemini) but per-phrase beats. A `[pauses]` mid-sentence creates a real silence; `[whispers]` on the
next phrase drops to intimate register; `[resigned tone]` changes vocal quality. All tags editable. Waveform
strip per scene. ▶ play.

If added to `61-orpheus-voice` as column D: four-way comparison A=Gemini global / B=Gemini alt /
C=Orpheus XML / D=Eleven V3 inline tags — the most complete Ghost TTS study in the sandbox.
FAL_KEY in use, ~$0.005/scene line (cheaper than Orpheus). Zero new deps. One cycle.
Research basis: RESEARCH.md §127.

Key findings from Cycle 78 (2026-05-21):
- ElevenLabs Eleven V3 (§127, Feb 2026) — inline audio tag system `[whispers]`, `[pauses]`, `[resigned tone]` for per-phrase emotional beats. Different from Orpheus XML (per-word) and Gemini (global). $0.10/1000 chars, FAL_KEY in use. Text-to-Dialogue mode for multi-speaker scenes. Inspires `ghost-v3-voice` and `eleven-dialogue`.
- ACE-Step 1.5 hybrid architecture (§128, Jan 2026) — decoupled reasoning + diffusion, sub-second first token. Validates `44-vocal-bgm` and `62-collage-compose` patterns. Polish opportunity: streaming progress bar showing first-token arrival.
- Dialogue in Resonance (§129, arxiv 2505.16259) — piano + real-time transcription + score-constrained dialogue between human and computer piano. Inspires `dialogue-score`: extend `33-aria-companion` with contour-constrained AI response.
- ShaderVine (§130, April 2026) — MIT browser WebGPU shader editor with MCP interface for AI agents. Inspires `wgsl-synth`: minimal WGSL editor with pre-wired audio uniforms. Also relevant to `claude-shader` (needs ANTHROPIC_API_KEY).
- musicolors (§131, arxiv 2503.14220) — web-based synesthetic music visualization; multi-dimensional (not just color). Inspires `synesthetic-sketch`: each audio feature → different visual shape property (hue + shape complexity + ring count + scatter).
- SAMUeL (§132, arxiv 2507.19991) — vocal-conditioned music gen, 220× smaller than SOTA, 52× faster. Future upgrade for `44-vocal-bgm` when fal.ai endpoint appears.
- BINAQUAL (§133, arxiv 2505.11915) — binaural localization quality metric. Validates HRTF work in `7-spatial`, `29-scene-spatial`, `53-ghost-sfx`. Research-only, not a prototype.
- Eleven V3 Text-to-Dialogue (§134) — multi-speaker dramatic scene in a single API call. Inspires `eleven-dialogue`: Ghost + Visitor 3-line scene per narrative location.
- WebGPU audio 2026 status (§135) — SharedArrayBuffer streaming path enables real-time GPU synthesis. COOP header needed; worth asking Karel if Vercel supports it. Upgrade path for `27-gpu-additive`.
- CHI 2026 creative AI taxonomy (§136) — four interaction modes: reactive / compositional / dialogic / generative. Sandbox covers first two well; dialogic (only `33-aria-companion`, `39-anticipate`) and generative (only `47-mood-journey`) are underrepresented. Priority: build `dialogue-score` (dialogic) and confirm Gemini key for `lyria-jam` (generative).

---

## FROM RESEARCH (Cycle 82, 2026-05-21) — promoted to queue

### chatterbox-ghost — voice-cloned Ghost narration via Chatterbox Turbo `[queued, needs FAL_KEY — already in use]`
Route: `/dream/66-chatterbox-ghost`. Six Ghost scenes. Each scene has a pre-written narration line (same as `56-ghost-voice`). A **voice clone** input: either a short URL to a pre-recorded 5–10s audio sample (bundled as a public asset), or a live browser mic recording. Chatterbox Turbo renders the Ghost narration in the cloned voice at `fal-ai/chatterbox/text-to-speech`, with paralinguistic tags embedded mid-sentence:

- Stone Chamber: `The resonance here is ancient. [sigh] Let yourself be absorbed by it.`
- Root Portal: `[slowly] Something stirs beneath the roots. [gasp] A low note. Then silence.`
- Underground Pool: `The water remembers every sound [sigh] that has passed through this place.`
- Tiny Planet: `A single breath. [laugh softly] The horizon wraps around you.`
- Forest Dawn: `The first light is also the first sound. [softly] They arrive together.`
- Cosmic Ascension: `[flatly] You are not rising. [long pause] The world is receding.`

UI: record or paste a URL to a 5–10s voice reference clip → "Generate Ghost voices" button fires six concurrent API calls → six waveform strips appear. ▶ plays each. "Exaggeration" slider (0.0–1.0) controls emotional intensity across all generated voices.

**Why this is different from all prior Ghost voice prototypes**: `56-ghost-voice` (Gemini — global style direction), `61-orpheus-voice` (Orpheus — per-word XML tags), `64-eleven-dialogue` (ElevenLabs V3 — per-phrase acting direction) all use pre-existing model voices. Chatterbox Turbo clones any voice from 5 seconds of audio. First prototype where Karel can hear the Ghost speak in a **specific human voice** — record himself reading one line, and hear all six scenes in his voice. Or record an actor, or a synthesized ghost-like reference voice. The paralinguistic tags add physical vocal actions (`[sigh]`, `[gasp]`) that complement the emotional tag paradigms from Orpheus and ElevenLabs V3. Four TTS paradigms now compared: Gemini (global) / Orpheus (per-word XML) / ElevenLabs V3 (per-phrase acting) / Chatterbox (voice-clone + physical action tags).

FAL_KEY in use. $0.025/1000 chars — cheaper than all prior options. Zero new npm deps. One cycle. RESEARCH.md §137.

### structure-viz — self-similarity matrix: your music as a map of itself `[demoable — /dream/67-structure-viz, Cycle 84]`
Route: `/dream/66-structure-viz`. Mic input (or demo oscillators) → accumulate bar-length FFT magnitude vectors (1 vector per ~1.5s of audio, up to 64 bars = ~96s). Compute an N×N **self-similarity matrix** (SSM): entry (i,j) = cosine similarity between bar i and bar j's FFT vector. Display the SSM as a Canvas2D colormap: dark = dissimilar, bright = similar. Apply a simple block-diagonal segmentation pass (find the rows/columns where average similarity drops, marking section boundaries) → draw colored vertical lines on a horizontal timeline strip below the SSM. Section blocks are labeled A / B / A' / C based on similarity clustering.

Live mode: SSM grows in real time as you play. Each new bar appends a new row+column, and the colormap updates. Repeating material (a chorus coming back) lights up as bright off-diagonal squares. A simple 1-minute demo melody with ABA structure creates a visible 3×3 block pattern. Canvas resizes as the SSM grows (max 64×64 → 320×320 pixels).

"Your music as a map of itself." This is the **first prototype that shows structure rather than content** — not what frequencies are present, but how the sections relate. A pianist who plays an ABA form sees the A-sections appear as matching diagonal blocks; the B section appears darker on the off-diagonal. The SSM is a standard MIR technique (no ML needed — FFT vectors are sufficient for detecting repetition structure). Zero external deps. One-cycle build. Research basis: RESEARCH.md §143.

### improv-expand — ImprovNet-style seed-to-improvisation `[queued, needs API endpoint]`
Route: `/dream/67-improv-expand`. User plays an 8-bar phrase (or uses demo MIDI) → select genre (jazz, classical, blues, bossa nova) and style degree slider (0.0 = close to original, 1.0 = free improvisation) → ImprovNet API generates a 32-bar structured improvisation that develops and transforms the seed material. Display: piano roll shows seed (amber, left panel) and AI improvisation (blue, right panel). Play both sequentially. Download generated MIDI.

"Your phrase, fully developed." Different from `33-aria-companion` (immediate Markov response) and `65-dialogue-score` (contour mirroring): ImprovNet generates a complete, structured piece that develops the seed across 32 bars rather than responding phrase-by-phrase. This is the first prototype where the AI generates a **complete compositional unit** from the user's seed. Needs an ImprovNet API endpoint — no fal.ai deployment found yet. Monitor HuggingFace for Spaces deployment. Also monitor for local server path. Zero new npm deps (server route calls API). RESEARCH.md §138.

### wgsl-synth — minimal WGSL shader editor with pre-wired audio uniforms `[queued, zero deps]`
Route: `/dream/68-wgsl-synth`. Inspired by ShaderVine (RESEARCH.md §130): a split-screen WebGPU WGSL shader editor. Left: CodeMirror textarea (loaded from CDN, ~200KB, no package.json change) with a pre-wired WGSL fragment shader template. Right: fullscreen WebGPU canvas running the shader. Six audio uniforms pre-wired and updated every frame from the Web Audio AnalyserNode: `uBass`, `uMid`, `uTreble`, `uOnset`, `uTime`, `uBPM`. Pre-loaded example shader: a pulsing radial grid where `uBass` expands the rings and `uOnset` flashes white. Edit any WGSL line → shader recompiles live (debounced 400ms). GLSL compile error messages shown inline.

Demo mode: LFO oscillators animate the shader without mic permissions. Mic mode: live audio drives the uniforms. "Write a WGSL shader that responds to your piano." Different from `55-webgpu-audio-fx` (which runs GPU DSP on audio *data*): this runs GPU *visualization* shaders with audio *uniforms*. The user's code is the visualization; the audio is the parameter. Different from `claude-shader` (which calls Claude to generate the WGSL): this is a manual editor for users who want to write their own. These two prototypes are the lowest and highest of an "AI assistance" spectrum. Zero new npm deps (CodeMirror from CDN). One-cycle build. RESEARCH.md §130 (ShaderVine) + §135 (WebGPU audio).

Key findings from Cycle 82 (2026-05-21):
- Chatterbox Turbo on fal.ai (§137) — open-source TTS with 5s voice cloning + paralinguistic tags `[sigh]`, `[gasp]`. $0.025/1000 chars, FAL_KEY in use. Most affordable TTS in the sandbox. First model that can clone Karel's own voice. Inspires `chatterbox-ghost`.
- ImprovNet (§138, arxiv 2502.04522, Feb 2026) — seed → structured 32-bar improvisation with controllable style transfer. Cross-genre (Bach→jazz). No API yet; monitor. Inspires `improv-expand`.
- Pianist Transformer (§139, arxiv 2512.02652, Dec 2025) — 135M params, human-level expressive piano rendering, Apache 2.0, HuggingFace demo. No API; proxy via HuggingFace Spaces. Inspires `expressive-render`.
- D3PIA (§140, arxiv 2602.03523, Feb 2026) — discrete diffusion piano accompaniment from melody + chord symbols. No API yet. Inspires `lead-sheet` prototype.
- PianoFlow (§141, arxiv 2604.12856, Apr 2026) — real-time bimanual piano hand motion from audio, 9× faster inference. Inspires `piano-hands` 3D visualization prototype.
- NCLMCTT (§142, ICLR 2026) — zero-shot instrument timbre cloning from 1–5s reference. No fal.ai endpoint. Inspires `timbre-clone`.
- Self-similarity matrix structure analysis (§143, arxiv 2603.27218, Mar 2026) — unsupervised section detection via SSM + CBM. Zero deps, browser-native. Inspires `structure-viz`.
- Anchored Cyclic Generation (§144, arxiv 2604.05343, Apr 2026) — prevents semantic drift in long-form music generation via hierarchical anchoring. Validates `48-arc-compose` design; no new prototype.
- Etude piano cover generation (§145, arxiv 2509.16522, Sep 2025) — polyphonic music → pianistic piano cover. Three-stage pipeline. No API yet. Inspires `piano-cover`.
- StreamMark audio watermarking (§146, arxiv 2604.11917, Apr 2026) — AI audio provenance tracking. Research awareness; no prototype recommended.

---

## FROM RESEARCH (Cycle 86, 2026-05-21) — promoted to queue

### oracle-music — Musical I-Ching oracle `[queued, zero deps, zero API]`
Route: `/dream/69-oracle-music`. Three coin tosses × 6 lines → one of 64 hexagrams. Each of the 64 hexagrams maps to a set of musical parameters drawn from classical I-Ching commentary (element, season, archetypal quality → musical equivalent):
- Hexagram 1 (Creative/Heaven/Metal): pentatonic C major, bright register (C4–C6), 80 BPM, strong sustained chords, high saturation
- Hexagram 2 (Receptive/Earth/Yin): slow minor arpeggios, deep register (C2–C3), 35 BPM, sparse, open fifths
- Hexagram 29 (Abysmal/Water): descending chromatic lines, 50 BPM, thick resonant bass, unresolved tension
- Hexagram 30 (Clinging/Fire): ascending bright diminished scales, 120 BPM, thin upper register
- Hexagram 51 (Thunder/Arousing): sharp onset pulses, 140 BPM, percussive attack, sudden loud/soft contrasts
- ... (all 64 mapped in a lookup table, ~60 lines of data)

**Visual sequence**: three animated coin tosses (each coin face shows yin/yin or yang/yang/yin — 3 coins × sum = line type), building a hexagram line-by-line from the bottom. Hexagram symbol drawn in animated strokes. English title ("The Creative") fades in. Traditional commentary line (one sentence, pre-written from Wilhelm translation public domain). Then music begins — synthesized with the same oscillator + filter engine as `38-mood-xy` and `52-concept-steer`. A subtle "changing lines" visual effect where any line marked as "moving" glows and shifts.

"The oracle answers in sound." First prototype connecting music to a divination tradition. High surprise factor — something no audio software has done before. Zero deps, zero API. One-cycle build. Research basis: RESEARCH.md §151 (Music of Changing Lines, arxiv 2605.20386). Optional future layer: if GEMINI_API_KEY available, add a Lyria call to generate a 30s piece from the hexagram's musical description, playing alongside the synthesized music.

### pitch-algo-compare — three pitch detection algorithms running simultaneously `[queued, zero deps]`
Route: `/dream/69-pitch-algo-compare`. Mic input → simultaneously run three pitch detection algorithms on every 2048-sample FFT buffer:
1. **Autocorrelation** (our current approach across 8+ prototypes) — normalized peak correlation, octave-fold at 55–880 Hz range
2. **YIN** — autocorrelation variant with aperiodicity threshold check (~40 lines of JS); reduces octave errors by ~15%
3. **HPS (Harmonic Product Spectrum)** — multiplies harmonically downsampled FFT spectra (4 harmonics), better for piano/violin; poorly defined for pure sine tones

Canvas: a vertical piano roll grid (C2–C7, same as `24-piano-roll`). Three horizontal cursors per frame: orange (autocorrelation), blue (YIN), green (HPS). When all three agree within ±1 semitone, a bold gold cursor overlays them ("consensus"). When they disagree, the spread is visible. Each algorithm also shows a "confidence bar" (autocorrelation peak correlation coefficient; YIN aperiodicity; HPS peak-to-floor ratio). A faint piano tone plays for the consensus pitch (0.15s triangle-wave envelope).

Demo mode: same demo oscillators as other prototypes — three clean sine tones at known frequencies where all algorithms should agree. Mic mode: play piano. On C4: all three agree. On C2: algorithms diverge (sub-bass confusion). On a chord: HPS tracks the fundamental best; autocorrelation jumps to harmonics.

"Which algorithm is right? Sometimes all of them. Sometimes none." Educational: makes pitch detection internals visible. Utility: directly informs the `neural-pitch` upgrade decision (§61, §148). Zero new deps (YIN and HPS are pure JS, ~30 lines each). One-cycle build.

### shader-evolve — genetic evolution of audio-reactive WGSL shaders `[queued, zero deps]`
Route: `/dream/70-shader-evolve`. Inspired by ShaderVine's genetic evolution system (RESEARCH.md §147). Start from the `68-wgsl-synth` default shader (pulsing radial rings + grid shimmer + onset flash). Display **four mutated variants** in a 2×2 WebGPU canvas grid. Each variant randomly perturbs 2–4 numeric constants in the shader (ring frequency, color rotation speed, HSV saturation coefficient, onset flash decay time, grid line spacing) while keeping the structure valid WGSL. All four run simultaneously at ~15fps each (smaller canvas, lower frame rate to stay within GPU budget).

Click any canvas to "select" it (it grows to fill the right panel at full 60fps). Click "Evolve from selection" → breed the selected shader with 3 fresh mutations. Click "Add to gallery" → save this shader to localStorage. Click "Edit" → opens the shader in a `68-wgsl-synth`-style textarea for manual refinement. Gallery row at the bottom shows the last 6 saved shaders as animated thumbnails.

"Natural selection of shaders." The first prototype where the creative process is *selection* rather than *composition* — you don't write the shader; you judge it. The audio uniforms keep running throughout, so the evolving shaders respond to demo LFOs (or mic input). No external deps — same WebGPU pipeline as `68-wgsl-synth`. Zero new npm deps. One-cycle build.

### ghost-lip — Inworld TTS viseme timing → animated Ghost face `[queued, needs FAL_KEY — already in use]`
Route: `/dream/70-ghost-lip`. Extends `56-ghost-voice` (Ghost narration via Gemini TTS). Switches the TTS backend to **Inworld TTS-1.5 Max** (`fal-ai/inworld-tts`) which, unlike Gemini TTS, returns **viseme-level timestamp data** alongside the audio — a sequence of (time_ms, viseme_id) events specifying exactly which mouth shape is active at each moment during speech.

Canvas: a stylized Ghost face — abstract, minimal, not realistic. A dark oval (head), two narrow white ellipses (eyes, blinking every 4–7s), and a central path that morphs between 6 mouth shapes keyed to viseme groups:
- Closed (silence, M/B/P)
- Small open (E/eh)
- Wide open (A/ah)
- Rounded (O/oo)
- Teeth together (S/Z/T)
- Wide with teeth (EE)

As the narration plays, viseme timestamps drive the mouth morph via `requestAnimationFrame`. The mouth opens for loud vowels, closes for consonants, stays shut in pauses. The eyes blink independently on a slow random interval. Color: ghost-white face on deep black; warm amber glow on the eye/mouth shapes matching the `1-live` mid-frequency hue.

Six scenes selectable. Same narration lines as `56-ghost-voice`. "The Ghost has a face." First prototype giving the Ghost character a visual speaking presence — not an image (static) or an orb (abstract), but a face that moves when it speaks. FAL_KEY in use. ~$0.005/narration. Zero new npm deps. One-cycle build. Research basis: RESEARCH.md §155.

### browser-stems — upload any audio, split to 4 stems in-browser, hear them in 3D `[queued, needs Karel OK on CDN ONNX dep ~200MB cached]`
Route: `/dream/71-browser-stems`. Drag-and-drop any audio file → in-browser Demucs v4 (htdemucs via ONNX Runtime Web + WebGPU acceleration) separates it into 4 stems: **drums, bass, other, vocals/melody**. Processing time: ~3–5 min for a 4-min song on a WebGPU laptop; ~15–20 min CPU fallback (shown in the UI upfront). All processing is local — audio never leaves the device. Progress bar with estimated time remaining.

After separation: each stem routes to a dedicated `PannerNode` with HRTF model: drums from above (+60° elevation), bass from below (−30°), other from front-left (−25° azimuth), vocals from front-right (+25°). Canvas: same top-down sphere as `29-scene-spatial` and `53-ghost-sfx` — four colored dots, draggable. Per-stem gain slider. Wear headphones.

"Your music. Any music. Yours." This is `54-maestro-stems` but for audio you already have — a recording you made, a Resonance session, your favorite piece. Zero API cost. Zero data upload. Completely private. The HRTF positioning of real, separated stems (not frequency-band splits like `7-spatial`) means the drums are overhead *because they're the drums*, not because they're in the treble range. Demucs CDN dep: ~200MB ONNX model + ONNX Runtime Web JS (~2MB) — cached after first load, no subsequent network use. Two-cycle build. Needs Karel OK on CDN dep size. Research basis: RESEARCH.md §§149, 154.

Key findings from Cycle 86 (2026-05-21):
- ShaderVine (§147, April 2026) — MIT WebGPU shader editor with genetic evolution + MCP server. 16 compute sims. Natural partner to `68-wgsl-synth`. Inspires `shader-evolve`: select from mutations, breed favorites.
- Voice Composer (§148, HN Jan 2026) — 4-algorithm simultaneous pitch detection (CREPE/YIN/FFT/AMDF). Key insight: YIN and HPS are ~30 lines of pure JS and can run alongside our existing autocorrelation. Inspires `pitch-algo-compare`.
- Demucs-web (§§149, 154, April 2026) — htdemucs running in-browser via ONNX + WebGPU; 3–5 min for 4-min song, fully private. Inspires `browser-stems`. Needs Karel OK on ~200MB model.
- Art2Mus (§150, arxiv 2602.17599, Feb 2026) — direct artwork→music via visual latent diffusion. No API yet. Future `art-to-music`. Zero-dep HSL approximation possible now.
- I-Ching musical oracle (§151, arxiv 2605.20386, May 2026) — coin casting → hexagram → LLM → Lyria music. Zero-dep version: 64 hexagrams → musical parameters. High surprise. Inspires `oracle-music`.
- AuDirector (§152, arxiv 2605.11866, May 2026) — multi-agent long-form audio narrative with character profiles + self-correction. Architecture model for future Ghost narrative arc. No standalone prototype.
- ICME 2026 text-to-music winners (§153, May 2026) — generation quality jump over ACE-Step. Monitor fal.ai for new endpoints; upgrade `6-compose` when available.
- Inworld TTS viseme timing (§155) — new detail: Inworld TTS returns mouth shape timestamps (viseme alignment). FAL_KEY in use. Inspires `ghost-lip`: animated Ghost face with synced mouth movement.
- Pitch algorithm comparison (§156) — YIN reduces octave errors ~15% vs. autocorrelation; HPS ~30 lines JS. Direct informant for `neural-pitch` upgrade decision. Inspires `pitch-algo-compare`.

---

## 2026-05-21 — NEW DIRECTION FROM KAREL (read AGENT.md "Current direction")

Karel sent new directives. Read them in `AGENT.md` under "Current direction". Tl;dr: **no more AI voice gen**; **image-gen INSIDE AV experiments yes**; **spread across journeys, not just Ghost**; **use his real piano music from the Paths as input**; **research TouchDesigner / Houdini patterns deeply**. The agent should fold these into idea selection on the next cycle.

### Seeded ideas matching the new direction

`queued` — fresh slugs ready to build. Pick from these (or do a research cycle first) on the next fire.

- **`72-paths-visualizer`** — Read the user's `journey_paths` table (or hit `/api/recordings/...`) to pull the actual audio URLs of his Welcome Home album, then play each track in sequence while a strange-attractor + bloom visualization responds in realtime. The user's OWN music as the audio source, not synthesized. Read `src/lib/journeys/journeys.ts` and `src/app/api/audio/[id]/route.ts` to figure out how to fetch the audio.
- **`73-journey-arc-spread`** — Like `5-arcs` (already shipped) but a single page that lets the visitor cycle through 5 of Karel's *different* journey themes (NOT just Ghost): Cosmic Homecoming, Earth Grounding, Inner Sanctuary, Ocean Breath, Snowflake. Each theme drives a distinct shader-arc. Use the journey definitions from `src/lib/journeys/journeys.ts` directly so this stays in sync with what he's published.
- **`74-touchdesigner-feedback`** — Port a classic TouchDesigner TOP feedback loop (a TOP gets composited with a delayed copy of itself + slight transform = endless evolving recursion) to a WebGPU texture-feedback prototype. Audio drives the transform parameters (rotation, zoom, hue shift). Reference TD's tutorials by Bileam Tschepe / Elekktronaut.
- **`75-houdini-particle-flock`** — VEX-style particle-flocking sim (Boids 3D + curl-noise force fields), but rendered with `fal-ai/flux/schnell` background images chosen from the user's published journey palettes so each flock session looks themed (Snowflake → cold-blue iceberg, Earth Grounding → warm-loam soil, etc.). 8-12k particles via WebGPU compute. The image gen is INSIDE the AV experiment, not the experiment itself.
- **`76-cymatics-on-piano-path`** — Take a Welcome Home album track, run real-time FFT, and use band energies to drive Chladni-plate / cymatic sand patterns (extend `19-cymatics` but with HIS music as the source). Visual stays low-key / contemplative — Karel's piano isn't club music.
- **`77-projection-mapping-sandbox`** — Sandbox for the installation-mode story. WebGPU + tap-to-define-quad warp so a projector aligned to a real-world surface (a stage backdrop, a wall) can map a journey-shader onto it. Calibration UX + keystone correction + edge blending. No FAL needed; pure GPU.

### Research priorities for the next research cycle

Karel asked for DEEP research into the interactive audio-visual domain. The next research cycle (cycle ~30 or whenever the queue thins) should add 3-5 NEW prototype seeds inspired by these specific sources, with explicit notes on which TD/Houdini pattern each is porting:

- TouchDesigner tutorials by **Bileam Tschepe (Elekktronaut)**, **Matthew Ragan**, **Markus Heckmann** (Derivative's own tutorial channel)
- Houdini techniques in **Junichiro Horikawa's** "Procedural Library" series + **Entagma**'s VEX particle tutorials
- AV artist code/talks: **Memo Akten** (learning-to-see), **Robert Henke** (Lumiere), **Ryoji Ikeda** (data.matrix), **Daniel Rozin** (mechanical mirrors), **Refik Anadol** (latent walks), **Marpi**, **Manolo Gamboa Naon**
- Browser equivalents: **WebGPU compute** for particles/fluid, **MediaPipe** for body/face/hand tracking, **TensorFlow.js** for lightweight realtime ML, **three.js postprocessing pipeline**

Each research cycle should pick ONE of those threads and go deep — not a survey, a deep dive. Then propose 3-5 concrete prototype slugs in this file with enough spec for a future build cycle.

---

## FROM RESEARCH (Cycle 90, 2026-05-21) — promoted to queue

Note: Karel's new direction (above) deprioritizes AI voice gen. `78-xai-ghost` below is deferred unless Karel re-enables voice prototypes. The other four are AV/synthesis-focused and align with the new direction.

### node-synth — visual Web Audio routing graph synthesizer `[queued, zero deps, zero API]`
Route: `/dream/78-node-synth`. The Web Audio API is architecturally a directed routing graph — every AudioNode is a vertex, every `.connect()` call is an edge. This prototype makes that graph literal and interactive. A Canvas2D canvas shows colored node blocks: **OscillatorNode** (blue), **GainNode** (green), **BiquadFilterNode** (cyan), **ConvolverNode** (purple, with IR from `room-acoustic` library), **DelayNode** (amber), **PannerNode** (teal), **DestinationNode** (white). Toolbar at top: click a node type to add it to the canvas. Drag to position. Click a node's output port (right side dot) and drag to another node's input port (left side dot) to connect. Shift-click an edge to disconnect. Each node shows a minimal inline parameter panel (OscillatorNode: frequency + waveform type; GainNode: gain slider; BiquadFilter: frequency + Q + type; Delay: time slider). Click **▶ Run** → compile the visual graph into a real Web Audio graph and play it. Click **■ Stop** → tear down all nodes cleanly.

Pre-loaded "Hello Synth" patch on load: Oscillator (440Hz, sine) → Filter (lowpass, 1000Hz) → Gain (0.5) → Destination. The user can disconnect and reconnect nodes immediately. Add a second oscillator at 441Hz → hear the 1Hz beating. Connect an oscillator to a filter's frequency input → get FM-style timbre. The Web Audio routing graph IS modular synthesis — we're just drawing it.

Why this now: 71 prototypes, none visualize the audio routing graph. The Web Audio API was designed to be patched — this is the most native possible interface for it. Live performance relevance: a venue operator patches a custom signal chain visually in 30 seconds. Educational: shows how every Web Audio prototype in the sandbox is structured internally. High surprise factor: Karel will likely not have seen the Web Audio graph rendered as a live patchbay. Inspired by Strudel Flow (RESEARCH.md §159) and the node-based synthesis paradigm. Zero deps, zero API. One-cycle build.

### fm-explorer — 2-operator FM synthesis with audio-reactive parameters `[queued, zero deps, zero API]`
Route: `/dream/79-fm-explorer`. Frequency Modulation synthesis: one OscillatorNode (the **modulator**) connects to the `frequency` AudioParam of a second OscillatorNode (the **carrier**). C:M ratio and modulation index together determine the timbre across the classic DX7 palette. Controls:
- **C:M Ratio** slider: 0.50–7.00 with labeled preset stops (1:1 electric piano, 1:3.5 tubular bell, 3:2 reed, 1:2 bass, 7:1 metallic)
- **Modulation Index** (0–20 with nonlinear feel) — at low index: near-pure carrier; at high index: rich harmonic spectra → noisy chaos
- **Carrier Frequency** (MIDI note slider C2–C6, or any MIDI note)
- **ADSR envelope** controls on the carrier gain
- **Preset banks**: DX Piano, Vibraphone Bell, FM Bass, Reed, Metallic Chrome, Glass Harmonica

Secondary canvas: real-time **sideband spectrum** — a bar chart showing the predicted magnitude at each harmonic (Bessel function coefficients Jn(index) × carrier ± n × modulator). The chart updates live as you move sliders: you see the DX7 math as animated bars. "You can see why the electric piano sounds the way it does: J0(2.5) × C, J1(2.5) × (C±M), J2(2.5) × (C±2M)..."

Audio-reactive (demo mode OR mic): bass energy → modulation index (louder playing → grittier timbre), onset → retrigger ADSR (each new note reshapes the spectral envelope), treble energy → C:M ratio bias toward inharmonic ratios (bright playing → metallic shimmer).

Why this now: 71 prototypes, none implement FM synthesis — the technique that defined 1980s digital sound design (Yamaha DX7, Roland D-50). The Web Audio API implements FM in 3 nodes. A subtle index change transforms a soft piano tone into a harsh metallic clang — the entire timbral range lives in 2 continuous parameters, perfect for live performance. First prototype where **synthesis algorithm parameters** (not just audio features) are the primary UI. Zero deps, zero API. One-cycle build. Research basis: DDX7 (RESEARCH.md §161).

### room-acoustic — draw a room, hear its reverb `[queued, zero deps, zero API]`
Route: `/dream/80-room-acoustic`. A 2D top-down canvas showing a rectangular room (default 10m × 8m). Drag four corner handles to resize; the walls show color-coded absorption coefficients (from material preset buttons: Concrete 0.04, Wood Panel 0.15, Carpet 0.35, Glass 0.05, Stone 0.03). An **image-source method** simulation (up to 3rd-order reflections, ~40 lines of JS for a rectangular room) computes early reflection delay times and attenuation from the room geometry and materials. The reflection sequence is loaded into a Web Audio `ConvolverNode` as a synthetic impulse response (IR samples at 44.1kHz). A demo piano chord (from `36-pluck-field`) plays through the ConvolverNode. A BPM-timed loop lets you hear the same chord repeating in the designed space.

Room shape presets: **Closet** (2m × 2m, carpet), **Bedroom** (4m × 3m, mixed), **Recording Studio** (8m × 6m, treated), **Concert Hall** (30m × 20m, wood), **Cathedral** (40m × 80m, stone), **Cave** (irregular — simulated as a random-reflection low-absorption space). RT60 readout updates in real time. Canvas shows animated reflection rays during impulse response computation.

"Build a room. Hear what it sounds like." First prototype about **acoustic space simulation** — 71 previous prototypes visualize audio signal or synthesis parameters; this one simulates the physics of sound in a space. Directly relevant to Ghost scene design: the Stone Chamber should have RT60 ~2.5s (stone walls, 0.03 absorption); Forest Dawn should have ~0.4s (outdoor open clearing). Karel can now tune those acoustic environments with a slider rather than guessing. Zero deps, zero API. The image-source method is the standard algorithm from Concert Hall Acoustics (Barron, 2010). One-cycle build. Research basis: AcoustiVision Pro (RESEARCH.md §162).

### xai-ghost — fifth Ghost TTS paradigm: inline actions + semantic wrapping `[DEFERRED — Karel's new direction pulls back on voice gen]`
Route: extend `/dream/61-orpheus-voice` (add column E) OR standalone `/dream/78-xai-ghost`. xAI TTS (`xai/tts/v1` on fal.ai) adds the fifth TTS paradigm to the Ghost voice study. Unique dual-tag system:
- **Inline action tags** at any position in the text: `[laugh]`, `[pause]`, `[sigh]`, `[clears_throat]`
- **Semantic wrapping tags** applied to spans: `<whisper>text</whisper>`, `<slow>text</slow>`

No other TTS system in the sandbox supports both paradigms simultaneously. Pre-loaded Ghost lines:
- Stone Chamber: `[pause] The resonance here [pause] is ancient. <whisper>Let yourself be absorbed by it.</whisper>`
- Root Portal: `[sigh] Something stirs beneath the roots. [pause] A low note. <slow>Then silence.</slow>`
- Underground Pool: `The water <slow>remembers</slow> every sound [pause] that has passed through this place.`
- Tiny Planet: `A single breath. [pause] <whisper>The horizon wraps around you.</whisper>`
- Forest Dawn: `The first light is also [pause] the first sound. <slow>They arrive together.</slow>`
- Cosmic Ascension: `[sigh] You are not rising. [pause] <slow>The world is receding.</slow>`

5 voices: eve (energetic), ara (warm), rex (confident), sal (smooth), leo (authoritative). Vote buttons carry forward from `61-orpheus-voice` (A/B/C/D/E). The full 5-way comparison — Gemini global / Orpheus per-word / ElevenLabs V3 per-phrase / Chatterbox voice-clone / xAI inline+wrapping — is the most complete TTS paradigm study in any browser prototype. FAL_KEY in use. Zero new deps. One-cycle build. Research basis: RESEARCH.md §158.

### cassette-speed — CassetteAI vs ACE-Step side-by-side speed comparison `[queued, needs FAL_KEY — already in use]`
Route: `/dream/81-cassette-speed`. Two panels side by side. Left: CassetteAI (`cassetteai/music-generator`). Right: ACE-Step (`fal-ai/ace-step`). Same prompt field at top — type once, both generate simultaneously. Both show a generation timer in milliseconds counting up from "▶ Generate" click to first audio byte received. CassetteAI should show first audio in ~2s; ACE-Step in ~20–40s. Both play through the same six-band bloom visualizer (one after the other, or simultaneously with a mix slider). Download buttons for both. "Which one is faster? Which sounds better? Pick one." The point is to empirically demonstrate the CassetteAI speed advantage and let Karel evaluate whether the quality tradeoff is acceptable for `6-compose` → backend swap. FAL_KEY in use. $0.004 + $0.006/generation. Zero new deps. One-cycle build. Research basis: RESEARCH.md §157.

Key findings from Cycle 90 (2026-05-21):
- CassetteAI (§157) — `cassetteai/music-generator`, $0.02/min, 30s sample in 2s, 3min in 10s. 10× faster than ACE-Step. FAL_KEY in use. Inspires `cassette-speed` comparison; candidate for `6-compose` backend upgrade.
- xAI TTS (§158) — `xai/tts/v1`, inline `[laugh]`/`[pause]`/`[sigh]` + semantic `<whisper>`, `<slow>` wrapping. 5th TTS paradigm for Ghost study. FAL_KEY in use. Inspires `xai-ghost` (deferred per new direction).
- Strudel Flow (§159) — visual node-based Strudel editor (2026). Web Audio API IS a routing graph. Inspires `node-synth` — make the Web Audio routing graph literal and interactive.
- AI vs Human music perception (§160) — listeners prefer AI music but rate human music as more emotionally effective. No measurable difference in actual emotional response. Framing and perceived authorship matter.
- FM synthesis gap (§161) — 71 prototypes, none implement FM synthesis. Web Audio: 2–3 nodes. Classic DX7 timbres (electric piano, bells, metallic). Inspires `fm-explorer`.
- AcoustiVision Pro / room IR (§162) — open-source web RIR analysis platform. Inspires `room-acoustic` — image-source method, Web Audio ConvolverNode. Ghost scene acoustic space design tool.
- Sound-to-video (§163) — music → latent features → LLM → video gen pipeline. Inspires extension of `57-sound-to-image` using fal.ai video endpoints. FAL_KEY + budget needed.
- LLM+Strudel pattern code (§164) — English description → LLM → play in browser. Inspires `llm-pattern`. Needs ANTHROPIC_API_KEY (same as `claude-shader`).
- Selective auditory attention (§165) — EEG + consumer headset can decode which musical element you're attending to. Inspires `listen-guide` — guided listening prototype directing attention to musical elements, highlighting corresponding FFT bands. Zero deps.
- WebGPU MLS-MPM fluid (§166) — 100k particles, audio-reactive ocean surface. Inspires `84-wave-fluid`.
- Seedance 2.0 + LTX-2.3 (§167) — audio-native video generation, $0.04/s. Inspires `86-sound-to-video` (extend `57-sound-to-image`).
- FLUX.2 + Nano Banana 2 (§168) — FLUX.2 Dev at $0.012/MP, Flash at $0.005/MP, Nano Banana 2 reasoning-guided. Upgrade path for image gen in AV experiments.
- Marpi "New Nature" (§169) — audio-reactive organic entity ecosystem. Inspires `88-marpi-void`.
- Matchmaker score following (§170) — chromagram DTW, ISMIR 2025. Inspires `87-piano-transcript` (YIN pitch → flowing score, zero deps, uses Karel's live playing as input).

---

## FROM RESEARCH (Cycle 95, 2026-05-21) — new seeds

### wave-fluid — MLS-MPM audio-reactive WebGPU ocean surface `[queued, zero API, WebGPU required]`
Route: `/dream/84-wave-fluid`. WebGPU MLS-MPM (Moving Least Squares Material Point Method) fluid simulation — the same hybrid particle-grid algorithm used in Houdini's fluid solvers and Disney's "Frozen" snow. 80,000–100,000 particles at 60fps on an integrated GPU. Audio drives three parameters: **bass energy** → continuous wave injection (more particle momentum = taller waves), **treble energy** → surface turbulence scalar (high register → choppy chop), **onset** → a localized splash event at a random surface position. Screen-Space Fluid Rendering: depth pass → bilateral filter → surface normals → water-like surface with reflections. Color palette: deep ocean blue at rest → violet-tinted foam on onset → rose bloom at peak bass. Dark background. Inspired by `matsuoka-601/webgpu-ocean` (open source, MIT). This is a direct port of the Houdini fluid solver paradigm (RESEARCH.md §166) to WebGPU. Fallback: if WebGPU unavailable, show a graceful "WebGPU required" message and link to existing `3-fluid` (Navier-Stokes canvas). Zero API, zero deps. Two-cycle build. Likely MOST visually spectacular prototype in the sandbox if executed well.

### sound-to-video — piano audio → FLUX.2 image → LTX-2.3 video clip `[queued, FAL_KEY in use]`
Route: `/dream/86-sound-to-video`. Extend `57-sound-to-image` with a second generation step. UI: record 10s of piano → emotional analysis (valence, arousal, tempo, dominant frequency) → FLUX.2 Dev image (`fal-ai/flux-2`, $0.012/MP, higher quality than Schnell) → LTX-2.3 fast video clip (`fal-ai/ltx-2.3/text-to-video`, $0.04/s, 6 seconds = $0.24). The FLUX.2 image becomes the first frame of the LTX-2.3 video; the emotional analysis drives the motion prompt ("slow ethereal ripple, introspective, the landscape breathes with each breath"). Total cost per generation: ~$0.25–0.35. Optional second mode: "Cinematic" uses Veo 3.1 (`fal-ai/veo3.1`, $0.40/s, 6s = $2.40) for premium quality. The key UX: 10s of playing → 6s of video. The audio was the brush; the video is the canvas. This is "AI image gen INSIDE AV" exactly as Karel directed — the audio IS the generative input, not an afterthought. Must call `guard(req)` in the API route. FAL_KEY in use. One-cycle build.

### piano-transcript — real-time piano playing → animated piano-roll score `[queued, zero API, zero deps]`
Route: `/dream/87-piano-transcript`. User plays piano via mic → YIN pitch detection (§156, ~30 lines JS, ~15% fewer octave errors than autocorrelation) + onset detector → note list accumulates in real time → Canvas2D renders a growing piano-roll score scrolling rightward. Each note: filled rectangle (height = MIDI pitch, width = onset-to-release duration). Color gradient: C2–C3 = warm amber, C3–C5 = violet (Resonance accent), C5–C8 = cool cyan. When a phrase ends (≥2-beat rest at current tempo), the phrase gets a subtle outlined box marking it as "complete." Score scrolls leftward as it fills, keeping the last 16 bars visible. Session duration counter. "Save score" button: draws the full session to a 1080p canvas and triggers a PNG download. "This prototype writes while you play — a permanent record of your session." Zero API, zero deps, pure Web Audio + Canvas2D. Aligns directly with Karel's direction: **use his actual playing as the input**, not synthesized sounds. One-cycle build.

### marpi-void — audio-reactive organic void organism `[demoable, cycle 99]`
Route: `/dream/89-marpi-void`. A single procedurally generated organism lives in a black void. The organism: a radial structure with 8–16 "arms" extending from a glowing nucleus, each arm a Bezier curve with Perlin-noise-jittered control points. **Nucleus** pulsates to amplitude envelope. **Arm extension** responds to bass energy (sustain → long arms). **Arm curvature jitter** responds to treble energy. **Onset** = a reproductive "bud" spawns at the tip of a random arm, grows into a secondary organism over 3 seconds. Each organism drifts under slow Brownian motion. After 2–3 minutes of playing, the canvas holds a colony of organisms. Color: bass organisms → violet nucleus, mid organisms → cyan arms, treble organisms → rose tips. When an organism hasn't been "fed" (its driver frequency silent) for 15s, it slowly fades and dissolves. Demo mode: an LFO drives audio parameters so the organism breathes without mic. Canvas2D stroke rendering (no WebGPU required). Inspired by Marpi Studio "New Nature" (ARTECHOUSE 2026, RESEARCH.md §169). Zero API, zero deps. One-cycle build.

### spectrogram-paint — AudioWorklet spectrogram as WebGPU feedback texture `[queued, zero API, WebGPU required]`
Route: `/dream/85-spectrogram-paint`. Port the TouchDesigner "Record CHOP → TOP" pattern to WebGPU. In TD, you can record a CHOP's (audio channel operator's) output into a TOP (texture operator), making time the X axis and channel values the Y axis — essentially writing a spectrogram into a GPU texture in real time. Port: an AudioWorklet captures FFT bins every frame, writes them into column X of a `rgba8unorm` texture (Y = frequency bin, value = amplitude). The texture is now a live spectrogram (X = time history, Y = frequency). This texture feeds a second pass: a WebGPU feedback shader (ping-pong, same as `74-touchdesigner-feedback`) that blurs, rotates, and color-maps the spectrogram into an evolving visual painting. The spectrogram's own history IS the visual — you play a melody and watch it crystallize into layered color trails, then feed back into recursive patterns. Related to Ryoji Ikeda's data.matrix aesthetic: the raw data rendered as visual matrix. Three WGSL passes: write-column (AudioWorklet → texture), feedback (ping-pong transform), present (tonemapping). WebGPU required. Zero API, zero deps. Two-cycle build (spectrogram write pass is one cycle; feedback integration is second).

## FROM RESEARCH (Cycle 117, 2026-05-22) — new seeds

### camera-song — camera azimuth as music: 6 journey-theme orbs in 3D space `[queued, zero API, zero deps]`
Route: `/dream/100-camera-song`. React Three Fiber scene: 6 glowing orbs arranged in a sphere constellation, each representing one of Karel's 6 journey themes (Cosmic Homecoming = above-center, Earth Grounding = below-center, Inner Sanctuary = left-rear, Ocean Breath = right-front, Snowflake = far-right, Ghost = far-left). Each orb emits a distinct synthesizer voice: Cosmic = wide reverb pad, Earth = deep bass drone, Sanctuary = warm FM flute, Ocean = slow lush chord, Snowflake = high crystalline sine, Ghost = minor-key slow melody. Camera orientation determines gain: the orb closest to the camera's forward axis (dot product with camera direction vector) gets full gain. All other orbs receive gain proportional to their angular distance (cosine falloff via Web Audio `PannerNode` in HRTF mode). User orbits with mouse / trackpad / touch — the musical mix shifts continuously as they turn. Mic mode: amplitude pushes the camera forward into the nearest orb. No UI chrome — just orbs, darkness, and the music of looking. "You're not listening to music. You're walking through it." Directly inspired by Artisans d'Idées §174. Zero new deps (R3F + drei + postprocessing already installed). One-cycle build.

### ocean-presence — mouse presence disturbs a fluid that thinks in sound `[queued, zero API, WebGPU required]`
Route: `/dream/101-ocean-presence`. WebGPU MLS-MPM fluid simulation (adapt WGSL compute approach from `84-wave-fluid`, Cycle 107) driven by mouse/touch position rather than audio. The mouse cursor creates a "presence field" — a Gaussian disturbance applied to the fluid velocity grid at the cursor position each frame. Fluid flows around and toward the cursor, forming vortices and pressure gradients. Fluid velocity field drives audio synthesis (no audio input — audio is OUTPUT): high-velocity vortex regions → sine tone at pitch proportional to angular velocity magnitude; pressure gradient magnitude → FM modulation depth (higher pressure = more complex timbre); still/quiet fluid regions → a gentle ambient pad drone. Three synthesis voices: vortex tones (OscillatorNode), pressure FM (carrier + modulator pair), ambient pad (BufferSourceNode loop). No mic, no API. "Move your hand through this ocean. It sings back." Dark background, deep blue-to-violet fluid rendering (Screen-Space Fluid Rendering from wave-fluid). Directly inspired by Memo Akten "The Thinking Ocean" §175. WebGPU required. Two-cycle build.

### veo3-ghost — Ghost LoRA image → Veo 3 cinematic video with native audio `[queued, FAL_KEY in use, needs budget approval]`
Route: `/dream/102-veo3-ghost`. Admin-only gate (`guard(req)` in API route). Generate a Ghost LoRA image from a preset ethereal scene (forest dawn / stone chamber / cosmic void / underground pool). Pass image + cinematic motion text prompt to `fal-ai/veo3` Fast endpoint ($0.40/s with native audio). Output: 5–8 second 1080p cinematic clip with synchronized atmospheric audio (wind, ambient hum, subtle piano, ghost-like reverb). Full-screen video element. Video audio feeds a real-time bloom visualizer (`runBloom` pattern) overlaid at 30% opacity. Download button. Two presets: "Fast" (5s, $2.00) and "Cinematic" (8s, $3.20). Optional "Compare" mode: Seedance 2.0 Fast (`bytedance/seedance-2.0/image-to-video`, $0.55–0.70 for 5s) runs same prompt for direct quality comparison. Budget: $2–3.20 (Veo 3) or $0.55–0.70 (Seedance Fast) per clip. FAL_KEY already in use. One-cycle build once Karel approves budget. Research basis: RESEARCH.md §171–§172.

### listen-guide — guided listening of Karel's Paths recordings with attention lens `[queued, zero API, zero deps]`
Route: `/dream/103-listen-guide`. Guided listening experience for Karel's actual piano recordings from the Paths. Fetches a track via `/api/audio/[id]` (same pattern as `72-paths-visualizer`). Routes audio through: `<audio>` element → `MediaElementAudioSourceNode` → `AnalyserNode` (2048-bin FFT) → destination. A 6-zone frequency attention lens overlays the existing 6-band bloom ring from `1-live`: at each 20-second segment, one frequency zone is highlighted (sector glows 4× brighter, others dim to 30% opacity). Text caption guides the listener: Segment 1 → "Focus on the bass register (0–200 Hz) — feel the warmth of the low strings." Segment 2 → "Shift to the low-mids (200–500 Hz) — where the piano body resonates." Segment 3 → "Mid register (500–2kHz) — the heart of the melody." Segment 4 → "Upper-mids (2–6kHz) — listen for the brightness of attack." Segment 5 → "Presence (6–10kHz) — the air around each note." Segment 6 → "Full spectrum — hold all six zones at once." Toggle: "Guided" vs. "Open" (all bands equal). Progress bar shows segment position. Implements `listen-guide` idea from RESEARCH.md §165, now fully specced. Directly uses Karel's real Paths recordings per his direction. Zero deps, zero API beyond existing audio endpoint. One-cycle build.

### beat-cut — particle flock + onset-snapped camera presets (TD camSequencer in R3F) `[queued, zero API, zero deps]`
Route: `/dream/104-beat-cut`. React Three Fiber particle flock (6,000 Boids particles, same flocking rules as `75-houdini-particle-flock` rebuilt standalone). 6 preset camera positions defined as `{azimuth, elevation, distance}` pairs, one per journey theme (Cosmic = above/wide, Earth = ground-level, Sanctuary = close-right, Ocean = wide-left, Snowflake = high-angle, Ghost = behind/low). An onset detector (spectral flux algorithm, ~20 lines JS) fires when RMS energy difference exceeds threshold. On each onset: `OrbitControls.object.position` snaps immediately to the next preset (no lerp, no tween — hard cut, same as TD camSequencer). Inter-onset timing enforces a minimum cooldown (= estimated beat period at current tempo) so rapid noise doesn't over-fire. The hard-cut quality IS the feature — particles flock continuously, viewer perspective snaps cinematically on every beat, creating a montage effect. Demo mode: 6 LFO oscillators at musical intervals (0.5–4 Hz) produce varied onset timing. Mic mode: live piano / drumming drives cuts. Cooldown slider (50–500 ms). Directly inspired by Elekktronaut TD Tutorial #65 §177 camSequencer concept. Zero new deps (R3F + drei already installed). One-cycle build.

---

## FROM RESEARCH (Cycle 129, 2026-05-23) — promoted to queue

### webcam-compose — camera as synthesizer: what you see becomes music `[queued, zero API, zero deps, webcam permission]`
Route: `/dream/109-webcam-compose`. Webcam → `getImageData()` frame analysis each 250ms → extract 4 zone average HSL (top-left, top-right, bottom-left, bottom-right) + overall brightness variance + dominant hue + inter-frame delta. Map directly to synthesizer parameters (no VLM, no server, no ML): dominant hue angle → chord quality (0°–60° warm = major, 150°–240° cool = minor, 270°–360° = diminished); brightness → register (dark = bass chord C2–E2–G2, bright = treble chord C4–E4–G4); saturation → harmonic richness (1–5 simultaneous OscillatorNodes per chord tone); frame-to-frame brightness delta → note trigger speed (static scene = sustained pad, changing scene = arpeggiated at 120 BPM). All synthesis via OscillatorNode + GainNode envelopes. Canvas split: left = live webcam feed with 4 colored zone overlays (each showing its HSL values), right = 6-band bloom ring (`1-live` style) animated by the current synth output. One-sentence overlay: "Point at anything — it becomes music." Webcam permission required; graceful fallback shows demo LFO mode. Zero API, zero external deps. One-cycle build. Directly inspired by LUMIA (RESEARCH.md §185) but achieved without any server inference — the image-to-sound mapping is deterministic and immediate.

### bio-echo — your music grows a forest `[queued, zero deps, zero API]`
Route: `/dream/110-bio-echo`. Mic input (or demo LFO oscillators) → 6-band FFT → generates an "ecological" generative canvas animated from audio energy. Five visual layers mirroring five ecological strata: (1) sub-bass (20–80 Hz) → soil/root tendrils growing upward from canvas bottom: dark violet particle paths, growth rate ∝ sub-bass energy, bends gently; (2) low-mid (80–500 Hz) → tree trunk column: amber vertical brushstroke that grows tallest when bass is loudest, up to 60% canvas height; (3) mid (500 Hz–2 kHz) → forest canopy particle system: emerald leaf-like particles (20–80 active) swirling at 50–70% canvas height, density ∝ mid energy; (4) high-mid (2–4 kHz) → bird arc trajectories: each onset fires one white curved short trail from a random point at 75–90% canvas height; (5) treble (4–20 kHz) → sky shimmer: small star-like white dots at top 15% of canvas, density ∝ treble energy. Canvas accumulates over the session — by the end of a full piano piece, a complete forest ecosystem has grown on screen. Download canvas as PNG. Colors: soil=deep violet, trunk=amber, canopy=emerald-600, birds=white/90, sky=white dots on indigo-950. One sentence at start: "Play — watch your music grow a forest." Zero deps, zero API. One-cycle build. Inspired by Refik Anadol's DATALAND / Large Nature Model (RESEARCH.md §188) — ecological data as visual pigment.

### landscape-resonance — audio-reactive 3D terrain that breathes with your music `[queued, zero deps]`
Route: `/dream/111-landscape-resonance`. Full-canvas WebGL GLSL fragment shader: a simplex-noise 3D terrain rendered with a forward-moving camera (no Three.js — raw WebGL quad + GLSL). The terrain is a heightmap computed from 2D simplex noise in GLSL; camera position advances along Z each frame (fly-through effect). Audio energy deforms the terrain in real-time via uniforms: `uBass` (0–1) → terrain height scale (loud bass = towering peaks, range 0.1–1.5); `uTreble` (0–1) → terrain surface detail (high-frequency octave added to simplex noise, adds roughness); `uOnset` (decays 120ms) → brief terrain inversion flash (values sign-flipped for 80ms); `uAmp` (overall amplitude) → fog density (quiet = far horizon clear, loud = misty). Terrain color: ground-level = violet-900, peaks = emerald-400 blending to white. Distant horizon: indigo-950 sky. Additive bloom: peaks glow faintly. Demo mode: three LFO oscillators (0.1/0.3/0.7 Hz) create slow terrain breathing without permissions. Mic mode: live audio drives all four uniforms. First prototype with a recognizable natural 3D landscape (not abstract geometry). Live-performance quality: fly-through on a projector screen with bass driving mountain peaks is genuinely striking. Zero deps (raw WebGL + GLSL). One-cycle build. Inspired by Superradiance (RESEARCH.md §187) — landscape as body, environment as music.

### live-harmonize — play a melody: the system predicts the harmony `[queued, zero deps]`
Route: `/dream/112-live-harmonize`. Mic → autocorrelation pitch detection (same algorithm as `13-piano-canvas`) → accumulate last 4–6 detected pitches → template-match against 24 chord progressions (I-IV-V-vi, ii-V-I jazz, I-V-vi-IV, I-vi-IV-V, III-IV-I-V, i-VII-VI-VII, i-iv-V-i, i-VI-III-VII) in all 12 keys → score each progression by counting how many of the last detected pitches appear in its chord tones → pick highest-scoring chord → synthesize it via 4-voice OscillatorNode chord stack (soft triangle wave, gain 0.08, sustained) panned slightly left (−15°) while the detected melody note plays center. Three display panels: (1) top — detected melody as mini scrolling piano roll (warm orange bars, same as `24-piano-roll`); (2) bottom-left — predicted chord in large monospace type ("Am7", "F", "G/B") with Roman numeral label; (3) bottom-right — 12-bar chromagram (same technique as `28-chord-canvas`). Key label top-right updates live ("Detected key: C major"). "You play a melody — the system supplies the harmony, live." Distinct from `28-chord-canvas` (detects chords from what IS playing) — this predicts what chord would harmonize the notes you've played so far (even mid-phrase, even sparse). Demo mode: plays the Bach fragment from `22-code-score` and auto-supplies its harmonies. Zero deps. One-cycle build. Inspired by Pay-Cross-Attention-to-Melody (RESEARCH.md §189).

Key findings from Cycle 129 (2026-05-23) — adult research sweep:
- Break-the-Beat! (§184, arxiv 2605.14555, May 2026) — MIDI + reference audio timbre → drum synthesis. Inspires `midi-drum-forge` (step sequencer + timbral imprinting via AudioBuffer).
- LUMIA (§185, arxiv 2512.17228, Dec 2025) — camera→music via looking. Inspires `webcam-compose` — zero API camera image analysis → synthesizer control.
- WebGPU SPH Ocean (§186, GitHub, 2025–2026) — physically accurate SPH fluid at 60 FPS. Neither project audio-reactive. Inspires `sph-ocean-av` (two-cycle build).
- Superradiance / Memo Akten (§187, Feb 2026) — embodied simulation, landscape breathes with body. Inspires `landscape-resonance` — audio-reactive 3D terrain fly-through, zero deps, one cycle.
- DATALAND / Refik Anadol (§188, opens June 20 2026) — Large Nature Model, data as pigment. Inspires `bio-echo` — mic → ecological canvas, zero deps, one cycle.
- Pay Cross-Attention to Melody (§189, arxiv 2601.16150, Jan 2026) — mid-phrase chord prediction from melody. Inspires `live-harmonize` — predict harmony from partial phrase. Zero deps, one cycle.

---

## FROM RESEARCH (Cycle 137, 2026-05-23) — promoted to queue

### data-cosm — particle physics data stream as audio-visual material `[demoable — /dream/117-data-cosm, Cycle 139]`
Route: `/dream/117-data-cosm`. (Note: IDEAS.md originally said 116, but that slot was used by kids-bloom-garden; built as 117.) Ryoji Ikeda data-cosm aesthetic: synthetic particle physics event stream as audio-visual medium. The visual: a full-canvas grid of monospace white text on pure black, rows scrolling upward, each row = one synthetic collision event (particle type label in brackets, 6 numeric fields for energy/momentum/angles — all synthetic, formatted as CERN CMS output: `[μ+] pt=48.3 eta=-1.27 phi=2.95 m=0.106 q=+1`). Events fire at a rate controlled by the current "scale." On each event: a 300ms scatter animation (each character in the row jumps to a random offset then snaps back via CSS transform), a 4kHz sine pulse (30ms attack, 80ms decay, gain 0.28), and a 3-pixel particle trail from the event row's position. Continuous sub-bass at 38Hz (OscillatorNode gain 0.06) underlies — felt not heard.

Three temporal scales auto-advance every 40s with a timeline indicator at the bottom:
1. **Quantum** — 8 events/second, 4kHz tones, dense flickering matrix, intense scatter
2. **Biological** — 1 event/second, 440Hz tones, slower matrix, graceful scatter
3. **Cosmic** — 1 event/10s, 110Hz tone (near sub-bass), near-empty canvas, one event at a time centered in the frame

Scale transitions: full-canvas white flash (200ms) → all characters scatter to random positions (800ms) → snap back with new scale parameters.

Typography: `font-mono text-xs` for the matrix rows (≈ 9px — intentionally small for density), `text-3xl font-mono` for the current scale name ("QUANTUM", "BIOLOGICAL", "COSMIC") displayed bottom-right at 60% opacity. One sentence at bottom-left: "All of nature's data is the same material." Zero deps, zero API. One-cycle build. Inspired by Ryoji Ikeda data-cosm [n°1] (RESEARCH.md §192). Highest surprise factor of this research batch.

### poem-fluid — WebGL fluid simulation with generative text overlay `[queued, zero deps, zero API]`
Route: `/dream/117-poem-fluid`. Memo Akten's "The Thinking Ocean" paradigm. A WebGL ping-pong Navier-Stokes fluid simulation (same approach as `3-fluid` and `15-webgpu-fluid`) driven by mouse/touch presence. The fluid's vorticity magnitude (curl of velocity field, computed per frame) controls which poem fragment appears:

- `vorticity < 0.08` (still water) → long full sentence fades in, holds for 4s: *"The resonance here is ancient. Let yourself be absorbed."*
- `vorticity 0.08–0.3` (gentle motion) → 3-5 word phrase: *"Let yourself drift."* / *"Something stirs beneath."* / *"The water remembers."*
- `vorticity > 0.3` (turbulent) → single word: *"ANCIENT"* / *"LISTEN"* / *"DISSOLVE"* / *"VAST"*

40 pre-written fragments drawn from the 6 Ghost scenes. Each fragment fades in over 800ms, holds, then fades out over 1.2s. At most one fragment visible at a time. CSS: `mix-blend-mode: screen` makes the white text glow through the dark fluid. Typography: `font-mono text-2xl text-white/80`, centered, `letter-spacing: 0.1em`. The vorticity threshold state is a 3-level EMA (α=0.05) so rapid turbulence doesn't flicker the text.

Start: a still fluid canvas with no text. The first mouse movement generates vortex → short phrase appears. Heavy stirring → single-word intensity. Return to stillness → long sentence resurfaces. "The fluid speaks in fragments — the calmer the water, the fuller the thought." Zero deps, zero API. One-cycle build. Inspired by Memo Akten "The Thinking Ocean" (RESEARCH.md §193).

### audio-cloud — 6-species audio-reactive WebGPU particle cloud (TD particlesGPU port) `[queued, zero deps, WebGPU required]`
Route: `/dream/118-audio-cloud`. Port of Elekktronaut's TouchDesigner particlesGPU + CHOP audio technique to WebGPU compute shaders. Six frequency bands → six particle species clouds. Per-species physics defined as constants in the compute shader:
- Species 0 (sub-bass 20–80 Hz): large radius (8px), strong downward gravity (0.004), slow birth rate, violet color
- Species 1 (bass 80–250 Hz): medium radius (5px), weak gravity (0.002), medium birth rate, cyan
- Species 2 (low-mid 250–500 Hz): small radius (3px), no gravity, emerald
- Species 3 (mid 500–2kHz): small radius (3px), slight upward float, yellow
- Species 4 (high-mid 2–4kHz): tiny radius (2px), repulsive neighbor force (species 4 particles push each other away), orange
- Species 5 (high 4–20kHz): tiny radius (1.5px), fast chaotic velocity, strong repulsion, magenta

Compute shader: `struct Particle { pos: vec2f; vel: vec2f; age: f32; species: u32; }`. Per-frame: JS reads `AnalyserNode.getByteFrequencyData()`, computes per-band energy, uploads as `band_energy: array<f32, 6>` uniform buffer. Compute dispatch: physics update per particle. New particles spawn at random positions when `band_energy[species] > threshold`. Particles age → alpha fade → recycle at 2.5s.

Render pass: instanced quads (6 vertices/particle), per-particle `species` attribute → color lookup, alpha from age. Camera slowly rotates via `azimuth += 0.003` per frame (no three.js — raw WebGPU). Background: transparent over solid dark background.

Demo mode: 6 LFO oscillators (one per band frequency range). Mic mode: live AnalyserNode. "Six clouds of sound, each behaving differently." Two-cycle build (compute shader setup is non-trivial). WebGPU required; fallback message links to `3-fluid`. Zero API, zero npm deps. Research basis: §194.

### body-conductor — full-body pose tracking → music synthesis `[queued, CDN dep ~8MB, needs Karel OK]`
Route: `/dream/119-body-conductor`. MediaPipe PoseLandmarker loaded from CDN (same CDN pattern as `31-gesture-music` HandLandmarker). Webcam → 33 body landmarks at 30fps → synthesizer. Mapping:
- **Right wrist Y** (0=top, 1=bottom) → melody pitch: inverted (wrist high = high note). C2–C7, pentatonic snap. Short triangle-wave note envelope on each semitone change.
- **Left wrist Y** → bass drone frequency: C1–C3 continuous glide (no snap). Drone gain 0.12, always playing.
- **Wrist-to-wrist horizontal distance** (normalized 0→1 of screen width) → stereo spread: `panR = +spread`, `panL = -spread`. Arms wide = full stereo; arms together = mono center.
- **Right elbow angle** (forearm-to-upper-arm vector dot product → 0°=fully bent, 180°=fully extended) → harmonic count: 1 harmonic (pure tone) at 0° → 6 harmonics (rich timbre) at 180°.
- **Hip center Y position** → register bias: low Y (standing tall) = ×2 pitch multiplier; high Y (crouching) = ÷2.
- **Overall motion speed** (sum of `|pos[t] - pos[t-1]|` across all 33 landmarks) → amplitude envelope gain + arpeggiation speed (still = sustained pad at 40 BPM; fast movement = 160 BPM arpeggiation).

Canvas: webcam feed (scaled-down, 50% opacity) behind a full-canvas skeleton overlay: 33 joints as 8px violet circles, connections as 2px glowing lines. Companion audio-reactive bloom strip at the bottom (6-band energy, same as `1-live` style). "Dance and the music follows." CDN dep ~8MB, cached after first load. One-cycle build. Needs Karel OK on CDN dep. Research basis: §195.

### image-chord — drag an image, hear its music `[demoable — /dream/124-image-chord, Cycle 147]`
Route: `/dream/120-image-chord`. Drag a photo, screenshot, or artwork onto the canvas. JS extracts HSL from `getImageData()`: dominant hue H (largest cluster in hue histogram, ~10-bin), mean saturation S, mean brightness L. Maps to synthesizer:
- **Hue H** → chord quality: 0°–60° (red/orange/warm) = bright major chord (C E G); 60°–120° (yellow/lime) = dominant 7th (C E G B♭); 120°–180° (green) = minor (C E♭ G); 180°–240° (cyan/blue) = minor 7th (C E♭ G B♭); 240°–300° (blue/violet) = minor with major 7th (Cmaj7 = C E G B); 300°–360° (magenta/violet) = diminished (C E♭ G♭)
- **Saturation S** → harmonic richness: desaturated (S < 0.2) = 1 pure sine voice; vivid (S > 0.7) = 5 harmonics + subtle detuning
- **Brightness L** → register + tempo: dark (L < 0.3) = bass register C2–C3, slow arpeggios at 35 BPM; bright (L > 0.7) = treble register C4–C6, fast arpeggios at 120 BPM; mid = C3–C4, 75 BPM

8 preset palette swatches in a horizontal strip: one per journey theme (Cosmic Homecoming=deep violet, Earth Grounding=warm ochre, Inner Sanctuary=sage green, Ocean Breath=cyan, Snowflake=icy white, Ghost=cool grey, Inner Fire=amber, Mycelium=forest green). Click any swatch = instant chord/texture. Drag image = extracted chord. Current chord name shown in large monospace type ("Cmaj7", "E♭m"). A 6-band bloom ring animates to the synth output. "Your visual sense becomes music." One-cycle build. Inspired by Mozualization (RESEARCH.md §196) — zero-dep conceptual port.

### arc-steer — 6-phase journey arc realized as an AI music chain `[queued, FAL_KEY in use]`
Route: `/dream/121-arc-steer`. MusicRFM concept adapted for Resonance: instead of steering MusicGen activations (no browser API), steer ACE-Step via a sequential prompt chain. Six textarea fields, one per journey phase, pre-loaded with mood descriptors:
1. *"sparse piano, introspective, major, very slow, 30 BPM"*
2. *"minor arpeggios, building tension, rhythmic, cello drone, 60 BPM"*
3. *"dense chromatic, dissonant, complex harmonics, climax approaching, 90 BPM"*
4. *"bright triumphant, full orchestral, peak, ecstatic, 110 BPM"*
5. *"bittersweet descending, resolving, minor to major shift, 70 BPM"*
6. *"open fifth drone, fading, spacious, near-silence, 25 BPM"*

Each field is editable. **▶ Start Journey** → sequentially fires 6 ACE-Step API calls (`fal-ai/ace-step`), 30s each (~$0.006/call × 6 = ~$0.036 total). Each 30s clip plays through the 6-band bloom visualizer immediately on receipt. A phase timeline at the bottom advances as each phase completes. Phases transition without gap: next generation starts 5s before current phase ends. "Write the arc. Hear it realized." FAL_KEY in use. Zero new npm deps. One-cycle build. Inspired by MusicRFM's time-based steering schedule concept (RESEARCH.md §191).

Key findings from Cycle 137 (2026-05-23) — adult research sweep:
- MusicRFM (§191, ICLR 2026) — frozen MusicGen steering via RFM probes. Time-based schedules. No browser API. Inspires `arc-steer` (ACE-Step prompt chain approximation, FAL_KEY in use).
- Ryoji Ikeda data-cosm (§192, Oct 2025–Feb 2026) — particle physics to cosmic AV material. Inspires `data-cosm`. Zero deps, highest surprise, one cycle.
- Memo Akten "The Thinking Ocean" (§193, Whitney 2026) — WebGPU fluid + generative real-time poem. Inspires `poem-fluid`. Zero deps, one cycle.
- Elekktronaut particlesGPU + CHOP (§194, 2026) — TD audio-reactive per-species particle physics. Port to WebGPU inspires `audio-cloud`. Two cycles, WebGPU required.
- MediaPipe PoseLandmarker (§195, confirmed 2026) — 33 body landmarks at 30fps. Inspires `body-conductor`. One cycle, CDN dep, needs Karel OK.
- Mozualization (§196, Apr 2026) — multimodal input → music. Zero-dep port inspires `image-chord`. One cycle, zero deps.
- Audio-Visual Foundation Models Survey (§190, arxiv 2605.04045, May 2026) — embodied AV agents as open frontier. Directional; no immediate prototype.

---

## FROM RESEARCH (Cycle 151, 2026-05-24) — promoted to queue

### lyria3-journey — six Ghost scenes → Lyria 3 Pro ambient music via FAL_KEY (no GEMINI_API_KEY needed) `[queued, FAL_KEY — already in use]`
Route: `/dream/128-lyria3-journey`. **Priority: build next adult cycle.** Six Ghost preset scenes (Stone Chamber, Root Portal, Underground Pool, Tiny Planet, Forest Dawn, Cosmic Ascension). Each scene has a pre-written music prompt describing its acoustic character (e.g., Stone Chamber → "ambient score, slow tempo, single reverbed piano chord, stone cave resonance, 35 BPM, long decay tails, no percussion, eerie"). Click any scene → API call to `fal-ai/lyria3/pro` ($0.08/generation, FAL_KEY already in use) → receive 30s MP3 + BPM metadata → decode via `AudioContext.decodeAudioData` → play through six-band bloom visualizer (same as `1-live`). BPM from the metadata drives a subtle bloom-pulse animation at the detected tempo. Waveform strip shows duration. "Generate variation" re-calls with the same prompt + `seed: Math.random()`. All six prompts are editable before generating.

**Why this is the highest-priority adult build**: MORNING.md's open question "GEMINI_API_KEY: unlocks 30-lyria-jam, 43-lyria-ghost, 44-binaural-lyria — still waiting" is now RESOLVED. `fal-ai/lyria3/pro` is Google's latest Lyria model, now available on fal.ai at $0.08/generation via FAL_KEY — no Gemini API key required. This prototype builds the simplest, most direct version: Ghost scene → Lyria music → bloom. After this ships, the more complex `43-lyria-ghost` (image + music together) and `44-binaural-lyria` (binaural beats + Lyria) can be updated to use `fal-ai/lyria3/pro` instead of waiting for GEMINI_API_KEY. Zero new npm deps. One-cycle build. Research basis: RESEARCH.md §197.

### ghost-3d-orbit — Ghost LoRA image → Pixal3D 3D model → audio-reactive R3F scene `[queued, FAL_KEY — already in use, two-cycle build]`
Route: `/dream/129-ghost-3d-orbit`. Admin-only. Step 1: generate Ghost LoRA image from a preset scene description (using existing `/api/ai-image/generate` + the Ghost LoRA). Step 2: pass the returned image URL to `fal-ai/pixal3d` (1024p, $0.30) → receive `.glb` 3D model. Step 3: load the GLB in a React Three Fiber scene using `@react-three/drei`'s `useGLTF` hook. Step 4: audio-reactive: attach a custom `MeshStandardNodeMaterial` with TSL `positionNode` displacement — bass energy → subtle global scale pulse (0.98→1.03×), treble energy → per-vertex normal displacement for surface shimmer. Step 5: `OrbitControls` for free camera orbit. Step 6: `@react-three/postprocessing` bloom (`UnrealBloomPass`). Dark background. Demo OscillatorNode audio drives the reactivity without mic.

"The Ghost character becomes a 3D sculpture you can orbit — and it breathes with sound." This is the first prototype that gives the Ghost image spatial depth and interactive presence. The Ghost figure stops being a flat image and becomes a three-dimensional object. Pixal3D is accepted to **SIGGRAPH 2026** (TencentARC) and just released on fal.ai in May 2026 — state of the art image-to-3D. Zero new npm deps (drei, three@0.182, R3F, postprocessing already installed). Budget: ~$0.30 (Pixal3D) + Ghost LoRA image cost. FAL_KEY in use. Two-cycle build: Cycle A = Ghost image generation + Pixal3D integration + GLB loading; Cycle B = audio-reactive vertex displacement + polish. Research basis: RESEARCH.md §199.

### tsl-particle-compute — Three.js TSL compute shader: 50k-particle Lorenz strange attractor `[queued, zero deps, WebGPU required]`
Route: `/dream/130-tsl-particle-compute`. A 50,000-particle Lorenz strange attractor using Three.js TSL compute shaders — the correct 2026 approach vs. the FBO-based GPGPU hack used in `16-particle-life-gpu`. Implementation:

```js
const updateParticles = Fn(() => {
  const i = instanceIndex;
  const pos = storageObject('positions', 'vec3', N).element(i);
  const vel = storageObject('velocities', 'vec3', N).element(i);
  const sigma = uniform(10.0); // driven by bass energy
  const rho = uniform(28.0);   // driven by treble energy
  const dx = sigma.mul(vel.y.sub(pos.x));
  const dy = pos.x.mul(rho.sub(pos.z)).sub(pos.y);
  const dz = pos.x.mul(pos.y).sub(2.667.mul(pos.z));
  // ... update pos, vel
});
```

Audio mapping: bass energy → `sigma` (Lorenz σ, 8–14); treble energy → `rho` (ρ, 24–32); onset → brief velocity turbulence burst. Render: instanced points with color from particle speed magnitude (slow=violet, fast=cyan, intermediate=emerald). OrbitControls. Demo mode: LFO oscillators animate σ/ρ. Mic mode: live FFT. The strange attractor's wing shape changes as audio parameters shift — a different "signature" for bass-heavy vs. treble-heavy music. "The music attracts." WebGPU required; graceful fallback text links to `10-strange`.

Why this now: `16-particle-life-gpu` (6-species flocking via FBO hack) and `75-houdini-particle-flock` (Boids) are the only GPU particle prototypes. TSL compute shaders as of Three.js r171 (WebGPU Baseline Jan 2026) are production-ready and clean — no more string-concatenated WGSL, no more ping-pong texture hacks. This is the idiomatic 2026 approach to GPU particle physics. Also: this simplified approach makes the `audio-cloud` two-cycle plan achievable in one cycle. Zero new npm deps (three@0.182 + R3F already installed). One-cycle build. Research basis: RESEARCH.md §200 (Maxime Heckel TSL field guide, Jan 2026).

### kali-sustain — long-tone harmonic meditation: slow ratio glide (Kali Malone / drone music inspired) `[queued, zero deps, zero API]`
Route: `/dream/131-kali-sustain`. Inspired by Kali Malone's slowly evolving harmonic music (pipe organs, just intonation, intervals held for minutes) performing at MUTEK Montréal 2026. Two `OscillatorNode`s: (1) **root drone** — a sustained C2 sine (gain 0.10) with a very slow LFO (0.05 Hz) for gentle beating; (2) **harmony voice** — a second `OscillatorNode` that slowly glides between pure-ratio target frequencies: 3:2 (perfect fifth), 4:3 (fourth), 5:4 (major third), 6:5 (minor third), 7:4 (harmonic seventh), 9:8 (whole tone). Each ratio holds for 12 seconds, then glides via `linearRampToValueAtTime` over another 12 seconds to the next ratio — a complete cycle through all 6 intervals takes ~144 seconds (2.4 minutes), then repeats.

Canvas: a slow circular "ratio clock" — a circle with 6 labeled positions for each ratio, a glowing indicator that sweeps between them. Center: the current interval name in `font-serif text-2xl` ("3:2 — Perfect Fifth") and the ratio as a fraction. Background: very slow HSL color cycle synchronized to the current ratio (3:2=violet, 4:3=teal, 5:4=amber, 6:5=rose, 7:4=indigo, 9:8=emerald). Mic mode: autocorrelation pitch detection → detect user's sustained long tone → set root drone to detected pitch → begin glide sequence from that fundamental. "Hold a note. The world shifts beneath it."

This fills a real gap: 130 prototypes have been built, and none explore the aesthetics of **drone music / sustained harmonic meditation** — Éliane Radigue, La Monte Young, Tony Conrad, Kali Malone. Resonance's "transcendent listening" vision maps exactly onto this tradition. The patient aesthetic is a counterpoint to the busy, reactive majority of the sandbox. Zero deps, zero API. One-cycle build. Research basis: RESEARCH.md §201 (MUTEK 2026, Kali Malone, Aug 25–30).

### lmdm-echo — generative delay: your piano phrase, echoed back transformed `[queued, FAL_KEY — already in use]`
Route: `/dream/132-lmdm-echo`. Inspired by the "generative delay" concept from Live Music Diffusion Models (arXiv:2605.22717, May 21, 2026). Mic → record a piano phrase (same `MediaRecorder` approach as `43-stable-extend`, 5–15s). When recording stops: (1) run chroma analysis (12-bin, same as `28-chord-canvas`) to detect dominant chord quality; (2) estimate tempo from onset intervals (same as `48-tap-rhythm`); (3) detect register from spectral centroid; (4) construct ACE-Step style prompt: `"piano improvisation echo, [quality] character, [tempo] BPM, [register] register, slight timbral variation, reverb, contemplative"`. Call `fal-ai/ace-step` ($0.006/30s). When response arrives: play both simultaneously — original recording left-panned (gain 0.65), AI echo right-panned (gain 0.45). Waveform strip: two-channel horizontal bar (original=amber, echo=blue). "Echo again" button re-generates with same analysis but different seed.

Different from `44-vocal-bgm` (which uses `audio-to-audio` remix of raw signal): this is `text-to-audio` where the prompt is derived from harmonic analysis — the echo is in the same key and tempo but is a fresh composition, not a direct transformation. The echo responds to the musical *meaning* of the phrase (what chord quality, what register, what tempo) rather than its literal sonic content. "The piano echoes back — transformed." Different from `33-aria-companion` (Markov response, immediate, short) — this is a longer, richer, AI-generated echo of a full recorded phrase. FAL_KEY in use, $0.006/echo. Zero new npm deps. One-cycle build. Research basis: RESEARCH.md §198 (arXiv:2605.22717, May 21, 2026).

Key findings from Cycle 151 (2026-05-24):
- Lyria 3 Pro on fal.ai (§197) — $0.08/generation via FAL_KEY. Resolves MORNING.md open question re: GEMINI_API_KEY. Inspires `128-lyria3-journey` — highest-priority adult build (one cycle, zero new deps, directly unblocks 3+ prototypes).
- Live Music Diffusion Models (§198, arXiv:2605.22717, May 21, 2026 — freshest paper) — "generative delay" concept. Inspires `132-lmdm-echo` — ACE-Step harmonic echo of pianist's phrase.
- Pixal3D SIGGRAPH 2026 (§199, TencentARC, May 2026 fal.ai release) — $0.30 image→3D GLB, zero new deps. Inspires `129-ghost-3d-orbit` — two-cycle build, highest surprise of batch.
- Three.js TSL Compute Shaders (§200, Jan 2026 confirmed baseline) — clean particle physics without WGSL strings. Inspires `130-tsl-particle-compute` — one-cycle build, simplifies `audio-cloud` two-cycle plan.
- MUTEK 2026 / Kali Malone (§201, Aug 25–30 announcement) — slowly evolving harmonic meditation. Inspires `131-kali-sustain` — zero deps, zero API, fills the drone/sustain gap.
- ACE-Step 1.5 in diffusers (§202) — likely already live on fal.ai endpoint; LongCat-AudioDiT needs fal.ai endpoint.
- AUDIOLAB unified React tree pattern (§203) — apply as architecture for future Three.js prototypes.

---

## FROM RESEARCH (Cycle 169, 2026-05-25) — promoted to queue

### kids-seed-song — plant a seed, grow an L-system tree, hear it sing `[queued, zero deps, zero API, kids build]`
Route: `/dream/143-kids-seed-song`. Tap anywhere on the canvas to plant a seed. A procedural L-system tree grows from the seed over ~20 seconds: trunk sprouts, branches fork at 25°/35° alternating angles, each fork spawns 2 sub-branches, recursion depth 5. Each branch segment has a pitch: root trunk = C3, first fork = E3, second fork = G3, third = A3, fourth = C4 (C major pentatonic, low to high as depth increases). As each new branch segment grows into existence, its pitch plays as a short Karplus-Strong pluck: `DelayNode` (delay = 1/freq), `BiquadFilterNode(lowpass, 2000 Hz)`, `GainNode(0.995)` decay, 5ms noise burst to seed. Multiple trees grow simultaneously if multiple seeds planted; their voices overlap in gentle harmony.

Atmospheric layer: soft brown-noise wind at gain 0.04, always present. Color: branches warm from root (deep violet) to tip (amber/golden). Background: very dark forest green. Tap-to-plant target area: the whole canvas (no reading required). Leaves — small oval polygons drawn at the terminal branches — flutter slowly via a sin-time offset.

**Why this is a kids build**: zero inputs beyond one tap, immediate visual + audio reward, grows patiently across 20s (rewards attention), multiple trees create organic ensemble harmony. The Karplus-Strong resonance gives it a warm, gentle character that won't startle. 4-year-old friendly. No mic, no permissions. Inspired by Anadol's Machine Dreams: Rainforest (RESEARCH.md §206). Fills a gap: 37+ kids prototypes react to taps immediately; none show patient growth over time.

**One-cycle build**. Zero deps. Zero API. Pure Web Audio + Canvas2D.

---

### sa3-journey — Stable Audio 3: 6-minute journey generation + piano continuation `[queued, FAL_KEY in use]`
Route: `/dream/144-sa3-journey`. Two modes on a single page:

**Mode A — Write Your Journey**: Textarea pre-filled with a journey theme prompt ("Inner Sanctuary — slow reverbed piano, soft cello drone, ancient forest, meditative, 3 minutes"). Dropdown for target duration: 2 min / 4 min / 6 min. Click "Generate Journey" → server route calls Stable Audio 3 Large on fal.ai (endpoint: `fal-ai/stable-audio-3` or via Stability AI API — check at build time; FAL_KEY in use) → receive WAV/MP3 → decode via `AudioContext.decodeAudioData` → play through six-band bloom radial visualizer (same as `1-live`). Waveform strip shows full duration with a playhead. Download MP3 button.

**Mode B — Extend Your Playing**: Mic capture (same `MediaRecorder` approach as `43-stable-extend`): tap ● REC → play piano for 30s → tap ■ STOP. Server route sends captured audio to SA3 Large in "causal continuation" mode — SA3 treats the recording as the prefix and generates continuation audio for the selected duration (2/4/6 min). The result plays back: original recording (first 30s, amber waveform strip) then SA3 continuation (blue strip). Crossfade at the boundary. "Your playing, continued."

Preset prompts panel: one button per Resonance journey theme (Cosmic Homecoming, Earth Grounding, Inner Sanctuary, Ocean Breath, Snowflake, Ghost, Inner Fire, Mycelium). Click any → pre-fills the prompt textarea with a theme-appropriate music description. Goal: Karel can hear a 4-minute generative ambient score for each journey theme in 10 seconds.

**Why this fills a real gap**: all existing generation prototypes top out at 30–90 seconds (ACE-Step, MiniMax, Lyria). SA3 changes that — 6 minutes is enough for a full Resonance journey phase. Mode B directly addresses Karel's directive: "let his existing music be the input." Budget: ~$0.20–0.50/generation (SA3 Large pricing not yet confirmed; monitor fal.ai). Fallback: SA3 Medium is open-weight on HuggingFace — if fal.ai endpoint isn't available, build Mode A only using `stabilityai/stable-audio-3-medium` via HuggingFace Inference API. FAL_KEY in use. One-cycle build. Research basis: RESEARCH.md §204.

---

### eco-bloom — procedural rainforest: L-system growth + layered atmospheric synthesis `[queued, zero deps, zero API]`
Route: `/dream/145-eco-bloom`. Inspired by Refik Anadol's Machine Dreams: Rainforest (RESEARCH.md §206, DATALAND opens June 20, 2026). A full procedural ecosystem on canvas:

**Visual**: Three simultaneous L-system trees with different species parameters (branching angle 20°/30°/40°, segment length 8–20px, max depth 6/5/4). All three begin as seeds at canvas bottom and grow simultaneously over 45 seconds. Terminal branches accumulate oval leaves (additive blending, low opacity). Background slowly fades from near-black to very deep forest green as canopy density increases.

**Synthesis** — layered, never abruptly on/off:
- **Root resonance**: a C1 sine at gain 0.06, subtle 0.08 Hz LFO — felt rather than heard, always present.
- **Branch plucks**: Karplus-Strong at each new branch segment spawn (5 pentatonic pitches, depth → octave). Simultaneous trees = 3-voice polyphony, always harmonious.
- **Wind layer**: band-passed brown noise, gain rising from 0 to 0.03 as canopy grows. Subtle leaf rustle.
- **Rain layer** (toggle): white noise low-pass at 1200 Hz, very low gain. On/off toggle in bottom corner. When rain plays, growth slightly accelerates.
- **Dawn birds** (toggle): every 8 seconds, a rapid pentatonic arpeggio (5 Karplus-Strong notes in 400ms) from a random tree tip — a bird call. Appears only after canopy density > 30%.

**Interactions**: Tap canvas to plant an additional seed (up to 6 simultaneous trees). Drag an existing tree root to move it. "Clear" removes all trees and returns to silence. "Rain" toggle.

Mic mode: bass energy → growth rate multiplier (play a low note and the forest grows faster); onset → triggers an immediate bird call.

**Why this now**: 142 prototypes exist; none explore **patient growth over time** as the primary metaphor. Most are instantaneous-response. Eco-bloom rewards watching — you plant it and step back. Closest aesthetic to the Inner Sanctuary and Earth Grounding journeys. "What does a Resonance journey sound like before the human starts playing?" Zero deps, zero API. One-cycle build. Research basis: RESEARCH.md §206.

---

### spatial-palette — drag synthesis voices to sculpt your soundscape `[queued, zero deps, zero API]`
Route: `/dream/146-spatial-palette`. Inspired by CHI 2026 6DoF gesture paper (RESEARCH.md §207). A full-screen dark canvas with 6–8 colored synthesis voice dots, each draggable:

- **X position** → stereo pan (–1=far left, +1=far right)
- **Y position** → pitch (top=C6, bottom=C2, log-scaled) — drags are musical, not abstract
- **Mouse wheel over a dot** → filter cutoff + reverb send: scroll up = brighter+drier, scroll down = darker+wetter
- **Tap/click canvas (empty area)** → add a new voice dot (up to 8 total)
- **Double-click dot** → cycle through timbres: sine → triangle → sawtooth → Karplus-pluck
- **Long-press dot** → remove it

Each voice produces a continuous, sustained tone at its current pitch and timbre with a slow Hann-windowed envelope (150ms attack, 400ms release on position change). Chord quality emerges from the spatial arrangement: voices on the upper-left cluster → minor chord (dark); voices spread wide and high → bright major spread.

Canvas decoration: a very faint 2D grid with semitone lines (horizontal) and stereo-field lines (vertical). A small stereo waveform display at the bottom (same as `20-scope` in Lissajous mode) shows the combined stereo output. Current chord label (from `28-chord-canvas` chroma template matching on the synthesized output) in the top-right corner.

Demo: pre-placed C major triad (C4 center, E4 right, G4 left) with slight reverb. The voices hum quietly. Drag the E4 down a step → chord becomes C minor; drag it up → back to major. "Sculpt your soundscape." Zero deps, zero API. One-cycle build. Research basis: RESEARCH.md §207.

---

### face-synth — MediaPipe FaceLandmarker → expressive face synthesizer `[queued, needs CDN dep ~5MB MediaPipe, needs Karel OK]`
Route: `/dream/147-face-synth`. MediaPipe FaceLandmarker loaded from jsDelivr CDN (WASM, ~5MB one-time download). Webcam feed at 40% opacity. 5 synthesis parameters driven by face expression:

- **Jaw opening** (normalized inner-lip distance / face height, 0–1) → filter cutoff 400–8000 Hz. Open mouth wide = full treble; jaw relaxed = dark filtered tone.
- **Inner eyebrow height** (brow-to-eye distance above neutral) → harmonic count 1→8 (pure sine at closed, rich timbre at raised). Raise your eyebrows = richer sound.
- **Head tilt angle** (left/right from vertical) → stereo pan –1→+1. Tilt head left = sound moves left.
- **Mouth corner spread** (smile width normalized) → chord quality interpolation: no smile = minor; full smile = major. Smile and the chord brightens.
- **Nose tip forward lean** (Z-depth, camera-relative) → reverb send 0–0.8. Lean toward camera = more reverb.

Visual: 468-point face mesh drawn as glowing violet dots at 30fps. A secondary Lissajous canvas (same as `20-scope`) shows the stereo shape of the current synthesis output — your face expression is visible in both the webcam overlay and the Lissajous shape simultaneously. 5 parameter gauges on the right side (vertical bars, color-coded). Chord name label updates live ("Cm" / "C"). 

Demo: without face tracking active, a slow LFO auto-drives each parameter in a breathing cycle so the synthesis plays on its own and the visitor can see what's possible before activating the webcam.

"Your face is the instrument." CDN dep ~5MB. Needs Karel OK. One-cycle build once approved. Research basis: RESEARCH.md §208.

---

Key findings from Cycle 169 (2026-05-25):
- Stable Audio 3 (§204, May 20, 2026 — 5 days ago) — family of open + partner-access models, up to 6+ min, inpainting + causal continuation. SA3 Large on fal.ai (FAL_KEY in use). **Highest priority adult build next cycle** → `144-sa3-journey`. Resolves the "30-second generation ceiling" problem.
- WavFlow (§205, May 18, 2026) — waveform-space audio gen, video-to-audio + text-to-audio. Server-only; monitor for fal.ai endpoint.
- Refik Anadol DATALAND + Machine Dreams: Rainforest (§206, opens June 20, 2026) — ecological data → digital sculpture. L-system + Karplus-Strong + atmospheric noise technique. Inspires `143-kids-seed-song` (kids) and `145-eco-bloom` (adult).
- CHI 2026 6DoF gesture mixing (§207, Feb 2026) — spatial sculpting > sliders for musical expressivity. Inspires `146-spatial-palette` — draggable synthesis voices on canvas.
- MediaPipe 2026 simultaneous multi-modal tracking (§208, March 2026) — 468 face landmarks at 60fps in browser. Inspires `147-face-synth` — face expression → synthesizer. Needs Karel OK on CDN dep.

---

## FROM RESEARCH (Cycle 177, 2026-05-25) — promoted to queue

### ritual-compose — I-Ching divination as musical intent-setting via Lyria `[queued, FAL_KEY in use, ~$0.08/gen]`
Route: `/dream/150-ritual-compose`. The most transcendent concept in the queue: users perform an animated I-Ching coin-tossing ritual that resolves to a hexagram, which becomes the musical intent for a Lyria 3 Pro generation.

**Interaction**:
- Start screen: a dark canvas with three ancient coins centered; a brief text ("Cast the oracle"). Tap/click → one animated coin toss (three coins flip simultaneously with a CSS rotation animation, each landing heads or tails via `Math.random()`).
- Six tosses = one hexagram line each = complete hexagram (1–64). After each toss, the line is drawn in the hexagram display: solid line (yang, two or more heads) or broken line (yin, two or more tails).
- Hexagram display: 6 horizontal lines in a vertical stack (top = line 6, bottom = line 1), glowing amber/violet for solid/broken. Hexagram number and name appear below (static lookup table of all 64, e.g. "Hexagram 11 — T'ai / Peace" or "Hexagram 29 — K'an / The Abysmal Water").
- A 2–3 sentence poetic interpretation (all 64 in a static `const` lookup, derived from public-domain I-Ching text) appears in italic `text-white/80 text-base`.
- "Generate Journey Music" button → POST to `/dream/150-ritual-compose/api/route.ts` with hexagram name + interpretation as the Lyria prompt (e.g. "peaceful, calm, prosperous union of sky and earth, ancient ceremony, ascending piano tones, open harmony, reverbed strings — Inner Sanctuary journey"). Calls `fal-ai/lyria3/pro` ($0.08/generation, FAL_KEY in use).
- Response: 30s of ambient music plays through the six-band bloom radial visualizer (same as `1-live`). Hexagram + interpretation displayed during playback. "Re-cast" button to toss a new hexagram and generate fresh music.

**Technical**:
- API route uses `guard(req)` as first line (origin + rate-limit + quota).
- All 64 hexagram name/interpretation pairs fit in ~3KB of static data — no external API for the text.
- Lyria 3 Pro endpoint: `fal-ai/lyria3/pro` (same as `129-lyria3-journey`).
- Zero new npm deps. Pure CSS coin animation + Canvas2D bloom.

**Why this now**: "Surprise" is Karel's #2 priority. Nothing in the sandbox treats a session as a *ritual act* — all 149 existing prototypes are instrumental (tap, play, record, generate). This is the first where the user performs a ceremony first, then receives music as a response to that ceremony. The I Ching connection also ties to East Asian musical traditions (an underrepresented axis in the sandbox so far). Research basis: §212 (arXiv:2605.20386, May 2026).

---

### paint-compose — paint colored strokes on a canvas → loop plays them back as music `[queued, zero deps, zero API]`
Route: `/dream/151-paint-compose`. Inspired by ViTex (RESEARCH.md §209, March 2026). A dark canvas with four color brushes (tabs at top):

- **Violet** = sine/piano timbre (OscillatorNode type "sine" + harmonics 2+3 at 0.3 gain)
- **Amber** = triangle/brass timbre (OscillatorNode "triangle" + 3rd harmonic)
- **Teal** = sawtooth/strings timbre (OscillatorNode "sawtooth" with mild low-pass 2kHz)
- **Rose** = pulse/woodwind timbre (OscillatorNode "square" with 600Hz low-pass + reverb)

Draw anywhere on the canvas with mouse/touch. Each stroke records its color and Y-position (normalized 0–1, top=C6, bottom=C3, mapped through `Math.pow(freq, y)` log-scale). Strokes are stored as `{color, x, y, width, height}` rectangles — the visual position IS the note position in time and pitch.

**Playback**: A `▶ Loop` button starts a cursor bar sweeping left-to-right across the canvas over 4 seconds (a single bar at ~60 BPM). When the cursor intersects a stroke at X position, it fires the note: pitch from Y, duration from stroke width, timbre from color. Multiple strokes at the same X column play simultaneously (chords). The cursor loops indefinitely.

**Canvas interactions**:
- Select brush color from the 4 tabs
- Draw by dragging — freehand strokes are rasterized as filled rectangles aligned to the canvas grid
- `⌫ Clear` erases all strokes
- Eraser brush: 5th tool option

**Visual**: strokes glow with a subtle additive shadow (`shadowBlur=12`) in their color, on a pure-black background. The cursor is a thin white vertical line. No other chrome during playback — the canvas IS the score.

**Why this now**: 151 prototypes visualize audio; none let you compose by painting. ViTex proved the metaphor is learnable and musically productive. The zero-API version (timbre per color) is feasible in one cycle and produces genuinely musical results — all pentatonic if Y maps to C-major pentatonic semitones (C3 D3 E3 G3 A3 C4 D4...). "Your painting loops as a melody." Different from `22-code-score` (text notation) and `13-piano-canvas` (painting from playing) — this is painting BEFORE playing. Zero deps, zero API. One-cycle build. Research basis: §209.

---

### piano-hands — PianoFlow-inspired: animated ghost fingers press detected keys on a canvas keyboard `[queued, zero deps, zero API]`
Route: `/dream/152-piano-hands`. Inspired by PianoFlow (RESEARCH.md §211, April 2026). A canvas piano keyboard in the center of the screen, with autocorrelation pitch detection driving animated "ghost finger" presses in real time.

**Canvas layout**:
- Top half: a dark visual area showing a glowing note trail (same additive-dot technique as `13-piano-canvas`) — each detected note leaves a color dot that fades over 3s.
- Bottom half: a 2-octave keyboard (C3–B4, 24 keys): white keys labeled C3–B4, black keys unlabeled. Drawn in Canvas2D: white keys as slightly warm-white rectangles with a 1px violet border, black keys as deep-indigo raised rectangles.

**Ghost finger animation**:
- On pitch detection: a semi-transparent finger silhouette (a soft rounded ellipse, ~12px wide, ~28px tall) descends from above onto the detected key over 60ms, stays depressed for the note duration (onset-to-silence), lifts in 80ms.
- Left-hand register (C3–B3) = violet ghost finger.
- Right-hand register (C4–B4) = rose ghost finger.
- The key itself brightens to 80% opacity when pressed; returns to 30% when released.
- Note name label appears briefly above the finger in `text-xs text-white/90`.

**Mic mode**: `getUserMedia({ audio: true })` → `AnalyserNode` → autocorrelation pitch detection (same `detectPitch()` function as `13-piano-canvas`, `24-piano-roll`). Real-time: 30Hz detection cycle.

**Demo mode** (no mic): plays a Bach BWV 772 Invention fragment (same score as `22-code-score`) via OscillatorNodes at scheduled `AudioContext.currentTime`, which the pitch detector reads back from the AnalyserNode — the demo self-drives its own keyboard display. The fingers animate to a piece Karel knows.

"See exactly where your hands are on the keyboard — in real time." First prototype in the sandbox that renders a literal piano keyboard as a responsive instrument. Different from `22-code-score` (static score display) and `24-piano-roll` (scrolling pitch history) — this shows WHERE on the keyboard, not WHAT or WHEN. Natural complement to the piano-roll triptych (`13-piano-canvas`, `22-code-score`, `24-piano-roll`). Zero deps, zero API. One-cycle build. Research basis: §211.

---

Key findings from Cycle 177 (2026-05-25) — adult research sweep:
- ViTex (§209, March 2026) — paint color strokes = instrument + pitch + time. Inspires `151-paint-compose`, zero API, one cycle.
- "Abstraction Beats Realism" (§210, March 2026) — science validates Resonance's abstract AV thesis.
- PianoFlow (§211, April 2026) — streaming bimanual piano motion. Inspires `152-piano-hands`, animated keyboard, zero API.
- I-Ching Music System (§212, May 2026 — freshest) — coin ritual → Lyria music. Inspires `150-ritual-compose`, highest-surprise build in the queue.
- MiniMax Music 2.6 confirmed (§213, May 2026) — activates `arc-compose` plan.
- ACE-Step 1.5 trending (§214, May 2026) — monitor fal.ai endpoint for silent upgrade.

---

## FROM RESEARCH (Cycle 203, 2026-05-26) — promoted to queue

### vocal-choir — sing into mic → 3 auto-harmony voices appear in 3D space `[queued, zero deps, zero API]`
Route: `/dream/174-vocal-choir`. Mic → autocorrelation pitch detection (same `detectPitch()` as
`13-piano-canvas`) at 30Hz. On a stable detected pitch: spawn three `OscillatorNode`s tuned
to +4 semitones (major third, violet), +7 semitones (perfect fifth, teal), and −12 semitones
(bass octave, rose). Each voice run through a `GainNode(0.25)` + `StereoPannerNode` for basic L/R
placement, then through a `PannerNode` (HRTF model) for 3D spatialization: M3 voice at azimuth
−45° elevation +20°, P5 voice at +45° elevation +20°, bass at azimuth 0° elevation −25°. User voice
= center. The four voices together form a choral SATB formation around the listener's head.

Visual: dark canvas, 4 glowing orbs in a semicircle (user = bottom center, white; M3 = upper left,
violet; P5 = upper right, teal; bass = lower center, rose). Orb radius scales with voice amplitude.
A thin arc connects the 4 orbs. When the detected pitch shifts, all three harmony oscillators glide
to their new target via `linearRampToValueAtTime(newFreq, now + 0.05)` — smooth 50ms portamento.
Wear headphones: the choir wraps around you. On speakers: clear chord bloom.

Demo mode: slow ascending pentatonic LFO oscillator self-plays so the choir is always active,
showing 4 orbs orbiting around each other at the current pitch without requiring mic permission.

"You sing one voice. Three more appear." First choir prototype in the sandbox. Different from
`23-pitch-harmonize` (phase vocoder pitch-shift, same timbre, 1D shift) — this is additive
synthesis at independent frequencies, giving genuinely distinct voices. Different from
`7-spatial` (existing audio file source) — this uses your own voice as the root. Zero deps,
zero API. One cycle. Inspired by §219 (AI Harmonizer, NIME 2025). Aligns with Karel's love of
`148-spatial-palette` ❤️ (spatial synthesis) and `105-pluck-field` ❤️ (resonant harmonic synthesis).

### sdf-cave — audio-reactive SDF ray-marching shader: an architectural space that breathes with sound `[queued, zero deps, zero API]`
Route: `/dream/175-sdf-cave`. A WebGL fragment shader renders a cave-like interior space via SDF
(signed-distance function) ray marching. No Three.js, no external deps — just a `<canvas>` with
a `WebGLRenderingContext` and an inline GLSL shader string.

SDF scene: three primitives combined with smooth-min blending:
- A rounded box (cave room walls)
- A torus (ceiling arch)
- A series of stalactite columns (domain-repeated vertical capsules)
Smooth-min `smin(a, b, k)` merges them organically; `k` is the key audio-reactive parameter.

Audio mapping:
- **Bass energy** → `k` (smin blend factor 0.1→0.8): walls melt together and separate rhythmically
- **Treble energy** → Perlin-style noise displacement on the SDF: surface becomes rough, jagged
- **Spectral centroid** → color temperature of the cave light (violet = deep bass, ice-blue = treble)
- **Onset** → brief camera shake (translate ray origin ±0.03 for 2 frames)

Lighting: single directional ambient point inside the cave (warm amber, dim, distance-attenuated).
Dark palette: near-black stone + deep violet shadows + the centroid-driven color accent.

Camera: slow orbital drift (0.005 rad/s) — the cave rotates lazily. Mic button stops the drift
and lets the music drive the feel entirely. Demo oscillators (same as `10-strange`) fill in when
no mic.

"You are inside a space that breathes with your music." First prototype in the sandbox where the
viewer is *inside* the visual space — 173 prior prototypes produce visuals *on* the canvas. SDF
ray-marching is a completely new visual paradigm for the sandbox. Zero deps, zero API. One cycle.
Inspired by §224 (MUTEK Sphaîra, architectural acoustics) + §225 (Revision 2026 Shader Showdown,
SDF smin technique). Highest surprise factor of this research batch.

### score-structure — the architecture of your improvisation, visualized `[queued, zero deps, zero API]`
Route: `/dream/176-score-structure`. Mic → two simultaneous analysis streams:
1. **Chord detection** (same 12-bin chroma + template match as `28-chord-canvas`): detect root + quality every 2 beats (≈2s at 60 BPM).
2. **Density analysis**: count onsets per 2-second window via autocorrelation confidence peaks.

Build a scrolling 2D grid (X = time, right-to-left, one column per 2-second window; Y = 12 pitch
classes). Each detected chord fills a colored column cell: hue from root class (same pitch-class
wheel as `1-live`), saturation from density (sparse = desaturated, dense = vivid), brightness from
quality (major = warm, minor = cool). After 8 columns (16 seconds ≈ 4 bars), auto-label the section
with a short tag: "Intro" (sparse + wide intervals), "Build" (density rising), "Climax" (dense +
rapid chord changes), "Resolution" (consonant + slowing density), "Coda" (very sparse).

Secondary display: a small "style bar" at the top shows the current section's character as 3
horizontal gauges: Density (0-10 onsets/2s), Complexity (chord changes/min), Register (FFT spectral
centroid low/high). The labels change in real time.

"The architecture of your improvisation." First prototype to analyze musical *structure* rather
than signal — all 175 prior prototypes visualize FFT, pitch, or timbre. This surfaces the
compositional shape of what Karel is playing. Natural complement to `28-chord-canvas` (single chord),
`24-piano-roll` (pitch history), and `22-code-score` (written score) — these four form a complete
"four perspectives on your playing" suite. Zero deps, zero API. One cycle. Inspired by §221 (Style
Plan visualization, arxiv 2602.15074).

### splat-bloom — Gaussian-language audio-reactive visual field `[queued, zero deps, zero API]`
Route: `/dream/177-splat-bloom`. 500 oriented Canvas2D ellipses, each defined by position (x, y),
rotation (angle), scale (rx, ry with rx:ry ≈ 1:3–1:8 for elongated splat shape), opacity (0.3–0.7),
and hue. Initial layout: Gaussian scatter around canvas center (σ = 0.2 × canvas width/height).
Render: `ctx.save() → ctx.translate(x,y) → ctx.rotate(angle) → ctx.scale(rx,ry) → ctx.beginPath()
→ ctx.arc(0,0,1,0,2π) → ctx.fillStyle = hsla(hue, 80%, 70%, opacity) → ctx.fill() → ctx.restore()`.
`globalCompositeOperation = "screen"` (additive) so overlapping splats bloom rather than occlude.

Audio mapping:
- **Bass energy** → "bloom push": the 100 splats nearest to the canvas centroid scale outward (rx,ry
  × 1 + bass × 0.6) and fade slightly (opacity − 0.15 × bass). Creates an outward bloom on bass hits.
- **Treble energy** → slow rotation drift: all splats rotate += treble × 0.008 rad/frame. High treble
  makes the field slowly swirl.
- **Spectral centroid** → hue shift: all splat hues lerp toward warm (centroid > 2kHz = amber/rose)
  or cool (centroid < 500Hz = violet/teal). Hue moves 1°/frame.
- **Onset** → scatter burst: 50 random splats get velocity impulse (random direction, magnitude =
  onset strength × 60px), then spring back to rest position over 90 frames (k=0.015 spring constant).

Background: pure black (#000). The splats accumulate light additively to create a luminous,
cloud-like field — like looking at a galaxy through a soft lens. Completely different visual quality
from all existing prototypes (which are either hard points, fluid fields, or crisp geometry).

Demo mode: 3-LFO oscillator demo signal auto-drives the mapping (no mic needed). Mic mode:
`getUserMedia` → `AnalyserNode` → extract bass/treble/centroid/onset.

"A painting that breathes." Different from `16-particle-life-gpu` (discrete particles with physics)
and `3-fluid` (density field) — this is a *texture field*, a middle ground between particles and
continuous media. Zero deps, zero API. One cycle. Inspired by §222 (WebSplatter, Feb 2026). Aligns
with Karel's loves of `130-tsl-particle-compute` ❤️ and `153-paint-compose` ❤️.

Key findings from Cycle 203 (2026-05-26) — adult research sweep:
- AI Harmonizer (§219, NIME Jun 2025) — 3-voice vocal harmony from mic. Seeds `vocal-choir`.
- NeoLightning (§220, ICMC May 2025) — 3D gesture synthesis, depth-as-reverb. Updates `gesture-music`.
- Structure-Aware Piano Accompaniment (§221, Feb 2026) — style plan timeline. Seeds `score-structure`.
- WebSplatter (§222, Feb 2026) — Gaussian splat Canvas2D technique. Seeds `splat-bloom`.
- Voxtral + Web Speech API (§223, Feb 2026) — spoken-word AV control. Seeds `voice-scene`.
- MUTEK 2026 Sphaîra (§224, May 2026) — architectural sound. Seeds `sdf-cave`.
- Revision 2026 Shader Showdown (§225, Apr 2026) — SDF smin technique. Also seeds `sdf-cave`.
- Gesture Control Framework (§226, Apr 2026) — relative joint distances. Updates `body-conductor`.

---

## FROM RESEARCH (Cycle 213, 2026-05-27) — promoted to queue

### ritual-generate — I-Ching coin casting → Lyria 3 Pro meditation music `[queued, needs GEMINI_API_KEY — already planned]`
Route: `/dream/182-ritual-generate`. Six rounds of virtual coin throwing: each round, tap
the screen 3 times (or click a large "Throw" button). Each throw shows 3 coins landing heads/tails
(animated flip). Three coin results determine one hexagram line: 3 tails → broken line with moving
dot (·⁻⁻); mixed → solid line (——) or broken line (⁻⁻); 3 heads → solid line with dot. After 6
rounds: the hexagram (1–64) is complete, drawn line by line from bottom to top on the canvas as an
ink-brush animation.

The hexagram number maps to one of Resonance's journey themes + a meditative music prompt:
- Hexagrams 1–8 → Cosmic / Space themes → "vast orchestral drone, long reverb, celestial pad, no melody, 50 BPM"
- Hexagrams 9–16 → Earth / Grounding → "low cello drone, stone resonance, slow pulse, 40 BPM"
- Hexagrams 17–24 → Inner Sanctuary → "solo piano meditation, sparse, 55 BPM, warm reverb"
- Hexagrams 25–32 → Ghost journey → "piano echoes in vast hall, haunting, 45 BPM"
- Hexagrams 33–40 → Forest / Organic → "forest ambience, birdsong, gentle piano, 60 BPM"
- Hexagrams 41–48 → Water / Flow → "water trickle, resonant room, 50 BPM, minimal piano"
- Hexagrams 49–56 → Snowflake / Crystal → "bright piano harmonics, crystalline texture, 65 BPM"
- Hexagrams 57–64 → Homecoming / Resolution → "warm major chords, home key, gentle 55 BPM"

Server route calls `fal-ai/lyria3/pro` with the prompt. 30s ambient piece plays through
live-bloom radial visualizer. Below the hexagram: traditional Chinese name + one-line interpretation.
"Cast the coins. Receive music." Admin-only (GEMINI_API_KEY). Zero new npm deps. One-cycle build.

**Why this stands out**: all 181 prior prototypes trigger music via mic, click, slider, or text.
This is the first where the trigger is a **ritual act** — a series of chance operations that carry
symbolic weight. The I-Ching connection to Resonance's journey themes is natural: both navigate
states of being through structured phases. Inspired by §228 (ICMC 2026, Music of Changing Lines).
Surprise factor: very high. Aligns with Karel's #3 priority: live performance / ceremony.

### camera-compose — webcam snapshot → Gemini vision → Lyria 3 Pro ambient track `[queued, needs GEMINI_API_KEY — already planned]`
Route: `/dream/183-camera-compose`. Single-page UI: large camera preview area (webcam via
`getUserMedia({ video: true })`). A large "📷 Take snapshot" button freezes one frame and sends
it as a base64 JPEG to a server route. Server calls Gemini Flash vision API: system prompt =
"Describe this scene in ≤30 words, focusing on light quality, mood, textures, and any motion.
Avoid naming people." The description is displayed as secondary text ("I see: [description]...").
Then a second server call: `fal-ai/lyria3/pro` with prompt
`"ambient music for: [description]. Minimal, contemplative, 60 BPM, no lyrics."` →
returns 30s MP3 → decode → play through live-bloom radial visualizer.

After playback: "Take another snapshot" re-triggers the cycle. Three snapshot history (small
thumbnails at bottom) with their generated descriptions. No audio saved; just plays once.
Fallback (no webcam): a 6-scene picker (Stone Chamber / Forest Dawn / Cosmic / Winter / Waves /
Desert Night) with hand-authored descriptions that go directly to Lyria.

Admin-only (GEMINI_API_KEY). Zero new npm deps. One-cycle build.

**Why this stands out**: first prototype that reads the visual world as a music trigger. All 181
prior prototypes use audio (mic), keyboard/mouse, or API text. This inverts the direction: you
look at your environment, the system listens through your eyes and plays back what it hears.
Deeply aligned with LUMIA (§231, NeurIPS 2025) and the "camera as instrument" paradigm. Natural
for a morning ritual or workspace setup: "play me music for where I am right now."

### piano-motion — watch Karel's piano tracks being played, animated `[queued, zero deps, zero API — uses /api/audio/[id]]`
Route: `/dream/184-piano-motion`. Load one of Karel's piano tracks from the Resonance audio API
(`/api/audio/[id]`). A track picker shows 3–4 of his Welcome Home album pieces. On selection: fetch
and decode the audio → run offline autocorrelation pitch detection (same algorithm as `13-piano-canvas`)
→ extract note events (onset time, pitch, duration, amplitude).

Visualization: full-width top-down piano keyboard (88 keys, C0–B7). Two cartoon hands positioned
above the keys: left hand (bass clef register, below C4) and right hand (treble clef, C4 and up).
For each note event:
- The appropriate hand's finger (index or middle finger, alternating) glides smoothly to the
  correct key position via spring interpolation (k=0.12, damping=0.6).
- At onset: key brightens (overlay glow) + finger scales down slightly ("press"), then springs back.
- Multiple simultaneous notes: fingers spread across the keys; chords show all active fingers lit.
- Hand color: left = deep violet/indigo, right = warm rose/amber (matching `1-live` palette).

Background: pure dark canvas; keys are slim white/black rectangles with subtle edge glow. No
tablature, no score overlay — just the hands and keys. A small "Now playing:" title and a playhead
below the keyboard.

Demo/fallback: if `/api/audio/[id]` is unavailable, falls back to the Bach fragment from
`22-code-score` (pre-hardcoded note array). But the primary use is Karel's real recordings.

**Why this stands out**: first prototype that animates the ACT of playing rather than the SOUND.
All 181 prior prototypes visualize audio output. This visualizes musical gesture — the hands,
the reach, the simultaneous notes. Watching your own music being played back as animation is an
entirely different emotional experience. Zero deps (Canvas2D + Web Audio). Implements AGENT.md
directive: "build prototypes that USE his real piano tracks as the audio source."
Inspired by §229 (PianoFlow, arxiv 2604.12856).

Key findings from Cycle 213 (2026-05-27) — adult research sweep:
- Stable Audio 3 (§227, May 2026) — sub-2s generation, inpainting/continuation, public weights. Upgrade path for `43-stable-extend`.
- I-Ching + Lyria (§228, ICMC May 2026) — ceremonial coin casting → AI music. Seeds `ritual-generate`.
- PianoFlow (§229, Apr 2026) — streaming bimanual piano motion synthesis, 9× faster. Seeds `piano-motion`.
- SAMUeL (§230, Jul 2025) — 15M real-time vocal accompaniment, 52× faster. Monitor for fal.ai listing.
- LUMIA vision-to-music (§231, Dec 2025) — webcam → Gemini vision → ambient track. Seeds `camera-compose`.
- Lyria 3 Pro on fal.ai (§232, May 2026) — `fal-ai/lyria3/pro` now live. Upgrades all Lyria-based queued specs.
- Mirelo SFX 1.6 full suite (§233, May 2026) — extend-audio + inpaint-audio added. Upgrades `ghost-loop` + `stable-extend`.

---

### param-layer — hierarchical parameter-ring synthesizer `[queued, zero deps, zero API]`
Route: `/dream/201-param-layer`.
Inspired by §234 (DEMON, arXiv:2605.28657, May 2026): 4 concentric drag-ring controls,
each broadcasting through all layers below it — outer ring = fundamental/mass, next = odd/even
harmonic balance, next = inharmonicity stretch, inner = amplitude envelope shape. Each drag
gesture simultaneously reshapes all timbral dimensions below it, giving the "one control,
global timbre reshape" feeling of DEMON without any diffusion model.

Implementation: build on the harmonic-series oscillator graph from `200-harmonic-series`
(16 OscillatorNode → GainNode chain, same BELL_RATIOS trick for inharmonicity). Replace the
preset buttons with 4 SVG concentric rings — drag angle maps to 0–1 parameter. JavaScript
propagation: outer ring scales fundamental (60–500 Hz); ring 2 adds/removes even harmonics;
ring 3 stretches partial ratios from integer toward bell inharmonicity; ring 4 shapes ADSR
of the master gain. One AnimationFrame loop updates all OscillatorNode frequencies + GainNode
values using setTargetAtTime. Canvas: ring UI + live Lissajous-style overlay showing summed
waveform shape. Zero deps · Zero API · one cycle scope.

---

### membrane-drum — 2D finite-difference drumhead simulation `[demoable, built Cycle 235 — /dream/202-membrane-drum]`
Route: `/dream/202-membrane-drum`.
Inspired by §234 (DEMON, May 2026) and `200-harmonic-series` Bell preset: a circular drumhead
solved with 2D finite-difference wave equation on an N×N grid (~128×128). Tension (c²) and
damping (d) are user-controlled via sliders; clicking/tapping anywhere on the canvas strikes
the membrane at that point. Wave propagates outward; boundary condition: fixed (zero at rim).

Audio: sample the center point of the grid each frame as a 1D time-domain signal → feed into
an AudioContext ScriptProcessorNode or AudioWorklet for audible output. The inharmonic overtone
ratios of a real circular membrane (2.295×, 3.598×, 4.904×, … the Bessel zeros) emerge
naturally from the physics without any manual partial tuning.

Canvas: visualize the Z-displacement as a color map (blue=negative, white=zero, amber=positive)
drawn to a 2D canvas element with ImageData. A ring of colored waveform traces below shows the
last 1s of center-point audio. Zero deps · Zero API · one cycle scope.

Key findings from Cycle 233 (2026-05-29) — research note (brief, build cycle):
- DEMON (§234, May 2026) — real-time diffusion music instrument, hierarchical parameter propagation. Seeds `param-layer` and `membrane-drum`.

---

## FROM RESEARCH (Cycle 247, 2026-05-30) — promoted to queue

### dance-avatar — spring-physics stick figure that dances to audio `[queued, zero deps, zero API]`
Route: `/dream/214-dance-avatar`. A 12-joint skeleton (head, shoulders×2, elbows×2, hands×2, hip,
knees×2, feet×2) animated by spring physics driven in real time by FFT bands. No ML, no CDN dep.

**Joint physics**: per-joint `{pos, vel, restPos}` object. Each frame:
`vel += (restPos - pos) * k - vel * damping; pos += vel` (spring constant k=0.18, damping=0.82).

**Audio mappings to rest positions** (all relative to canvas center):
- **Sub-bass** → hip sway: `restPos[hip].x = center.x + sin(t×1.2) × bass × 40px`
- **Bass** → knee lift: `restPos[kneeL/R].y = center.y - bass × 35px` (knees rise)
- **Mid** → arm raise: `restPos[handL/R].y -= mid × 80px`
- **Treble** → arm splay: `restPos[handL].x = center.x - 60 - treble × 30px`; handR mirrors
- **Onset** → jump impulse: `vel[all].y -= onset × 120` (upward velocity on every joint)
- **Spectral centroid** → lean: `restPos[head].x = center.x + (centroid - 0.5) × 20px`

**Render**: each limb segment as a glowing Canvas2D line (`lineWidth=3`, `shadowBlur=14`). Hue per band
segment: hip/torso=violet (sub-bass), upper arms=teal (bass), forearms=amber (mid), hands=rose (treble).
Head: circle, radius 18px, white glow. Black background, pure additive blending. Subtle motion trail:
ghost skeleton 5 frames behind at 25% opacity.

Demo mode: same LFO oscillators as other prototypes, figure dances to the LFOs. Mic mode: live FFT.
Start screen: "▶ Watch it dance" (demo) / "🎤 Let it hear you" (mic), matching `1-live` UX pattern.

**Why this fills a paradigm gap**: 213 existing prototypes — none animate a human figure. Fluid, particles,
terrain, geometry, piano rolls — all non-human visual languages. A dancing figure is qualitatively
different: it reads as *responsive* rather than *reactive*. Live performance fit: project onto a wall
next to the pianist; the figure dances to their music. High surprise factor. Inspired by DiscoForcing
(ICML 2026, arXiv:2605.28491): "music has kinetic energy; a body is its natural receiver."
Zero deps, zero API. One-cycle build. Research basis: RESEARCH.md §§235, 243.

---

### fm-explorer — FM synthesis timbral landscape `[queued, zero deps, zero API]`
Route: `/dream/215-fm-explorer`. FM (frequency modulation) synthesis underlies the DX7 (1983, best-selling
synthesizer ever), 808 bass, electric piano, metallic percussion. Two `OscillatorNode`s: carrier (C) and
modulator (M). FM equation: C_freq_input = C_freq + sin(M_phase) × FM_index × M_freq.

```js
const carrier = actx.createOscillator();          // heard output
const modulator = actx.createOscillator();         // modulates carrier freq
const modGain = actx.createGain();                 // FM index controls depth
modulator.connect(modGain);
modGain.connect(carrier.frequency);               // AudioParam.connect — the key line
carrier.connect(masterGain);
```

**Interaction**: A 2D canvas. X axis = carrier pitch (C2–C7, log-spaced). Y axis = modulator-to-carrier
ratio (0.5–8.0). Mouse position determines both. FM index = distance from canvas center (0 at center,
max at corner), OR a vertical range slider at right. Moving across the canvas sweeps through hundreds
of timbres without any label-reading. A light background color field encodes timbral complexity (green=simple
sine, amber=bell, rose=metallic, violet=complex/noisy).

Presets: **Bell** (E4, ratio √2, index 8), **Rhodes** (C3, ratio 2:1, index 3.5), **Clangy** (G3, ratio 3.5:1,
index 12), **Sub** (A1, ratio 1:1, index 2), **Metallic** (D3, ratio 5:3, index 15). Each preset fires a
short note on click. Display below canvas: carrier Hz + note name, ratio, index value as a small monospace
HUD row. Live Lissajous waveform strip (same as `20-scope`) shows the FM output shape.

Mic mode: RMS amplitude → FM index (quiet=gentle sine, loud=complex metallic). "Play loud and the timbre
becomes more complex." Live performance: vary ratio while playing = timbral glide through FM space.

**Why this fills a gap**: 213 prototypes, none use FM synthesis. OscillatorNode has been used as audio
source in every prototype but never as a modulator. The DX7's 6-operator FM creates a vast palette from
3 lines of Web Audio code. "Navigate the space of synthesized timbre." Zero deps, zero API. One-cycle build.
Research basis: RESEARCH.md §241.

---

### waveshape-draw — draw a waveform on canvas, hear your timbre change in real time `[queued, zero deps, zero API]`
Route: `/dream/216-waveshape-draw`. A canvas shows a 1-period waveform as a white curve on black. User
draws directly on the wave by dragging (mouse or touch), deforming it to any shape. The drawn curve is
immediately converted to a `PeriodicWave` and applied to an `OscillatorNode` — the timbre changes in
real time as you draw.

**Conversion pipeline** (runs on each `pointermove`, ~0.3ms):
1. Sample drawn curve at 512 evenly-spaced x positions → `Float32Array` (amplitude values −1..1)
2. Forward DFT (Cooley-Tukey, inline ~20 lines of JS): extract bins 0–63 (the perceptually significant partials)
3. `cosTerms[k] = real[k] / 512; sinTerms[k] = imag[k] / 512`
4. `const wave = actx.createPeriodicWave(cosTerms, sinTerms, {disableNormalization: false})`
5. `oscillator.setPeriodicWave(wave)`

**UI**: The waveform canvas is the primary element (full width, ~200px height). Below it: a harmonic
spectrum strip (horizontal bar chart of magnitudes for partials 1–32, color-coded by partial index,
same hue mapping as `1-live`). A pitch slider below (C2–C7). Draw interactions: left-drag reshapes the
curve; right-click (or two-finger on mobile) resets to flat sine.

**Presets** (7 buttons): Sine, Square, Sawtooth, Triangle, "DX7 Piano" (pre-loaded 32-coefficient
shape that approximates a DX7 FM piano patch), "Glass Harmonica" (strong 2nd+3rd harmonics, weak
fundamentals), "Bowed String" (odd harmonics with amplitude decay, like violin). Each preset loads a
pre-computed Float32Array into the canvas and immediately applies `createPeriodicWave`.

Mic mode: RMS amplitude → distorts the current drawn shape (multiplies values by `1 + rms × 2`, then
clips at ±1) — louder playing = more harmonic distortion.

**Why this inverts the paradigm**: all 213 prior prototypes react to or visualize sound. `waveshape-draw`
sculpts the source. The visitor draws a shape and hears exactly what that mathematical shape sounds like
— an inverted oscilloscope. Natural triptych with `20-scope` (visualize waveform of audio) and
`13-piano-canvas` (playing draws art): now completing the set with "draw the art, it becomes audio."
Zero deps, zero API. One-cycle build. Research basis: RESEARCH.md §242.

---

### optical-flow-music — webcam frame differencing → expressive synthesis, no CDN `[queued, zero deps, zero API]`
Route: `/dream/217-optical-flow-music`. Webcam → Canvas2D frame differencing optical flow → Web Audio synthesis.
No MediaPipe, no CDN dep — pure pixel math.

**Flow extraction**:
1. `getUserMedia({ video: true })` → `<video>` element (360p sufficient)
2. Each rAF: draw frame to offscreen canvas, `getImageData()` → per-pixel grayscale
3. Per-pixel: `delta[i] = |curr_gray[i] - prev_gray[i]|` (stores luminance change)
4. Downsample to 20×15 grid (300 cells). Per cell: `mag = avg(|deltas| in 8 pixels)`,
   `dx = avg(right-half - left-half)`, `dy = avg(bottom-half - top-half)`
5. Global: `totalMag = Σmag/300`, `hBias = Σdx/300` (rightward flow), `vBias = Σdy/300`

**Synthesis** (2 OscillatorNodes + BiquadFilter + ConvolverNode reverb):
- **totalMag** → filter cutoff: `400 + totalMag × 5600 Hz` (still=dark, moving=bright)
- **hBias** → pitch: `C3 × 2^(hBias × 2.5)` ≈ ±2.5 octaves around C3 (flow right=up, left=down)
- **vBias** → reverb send gain: `Math.max(0, vBias × 2)` (downward motion=wet)
- **totalMag** → note rate: arpeggiation interval = `max(50ms, 800 - totalMag × 700)ms` (fast motion=rapid notes)

**Display**: webcam feed at 40% opacity. Per grid cell: a glowing gradient line from cell center in direction
`(dx, dy)` (arrow visualization). Line length = `mag × 30px`. Color: hue from motion direction
(rightward=amber, leftward=violet, upward=teal, downward=rose). 6-band spectrum bar at bottom (same as `1-live`).

"Dance in front of the camera — the motion IS the music." First prototype using optical flow (no landmarks,
no CDN, zero deps). Different from `31-gesture-music` (MediaPipe hand tracking), `101-camera-song`,
`147-face-synth`. Inspired by V2M-Zero (arXiv:2603.11042). Zero deps, zero API. One-cycle build.
Research basis: RESEARCH.md §§237, 244.

---

### paths-granular — Karel's piano tracks granularized `[queued, zero deps, zero API — uses /api/audio/[id]]`
Route: `/dream/218-paths-granular`. Load one of Karel's Welcome Home album tracks from the Resonance
audio API (`/api/audio/[id]`). Track picker shows 3–4 available pieces. On selection: fetch → decode
via `AudioContext.decodeAudioData()` → store as `AudioBuffer`. Granular synthesis engine plays tiny
windowed segments (grains) from the buffer at user-controlled parameters.

**Controls** (large sliders, mobile-friendly):
- **Scrub position** (full-width horizontal) — extraction point in the track (0–100%)
- **Grain size** (20–500ms slider) — window size per grain (Hann-windowed)
- **Density** (2–30 grains/second)
- **Pitch shift** (−12 to +12 semitones, via playback rate)
- **Scatter** (0–400ms random offset from scrub position per grain)

**Per-grain render**: extract buffer slice at `scrubPos + rand(-scatter, scatter)`, apply Hann window
(`w[i] = 0.5 × (1 − cos(2π×i/N))`), create `AudioBufferSourceNode`, set `.playbackRate` for pitch shift,
pan to random position within ±0.3, start at `actx.currentTime + jitter`. All in JS, no external deps.

**Display**: full waveform of the decoded track as a glowing amber horizontal strip (use `OffscreenCanvas`
or `ImageData` to render the waveform at page load). A bright cursor at the current scrub position.
Sparkle particles fly off the scrub point (one per grain, direction = random, decay 0.6s) — visible indicator
of grain density. Current track name and duration shown.

**Why Karel's own music**: granular synthesis of his piano recordings produces something entirely new —
a crystallized, non-linear texture of his own playing. Scrubbing slowly at high density over a chord =
ethereal shimmer. Large grain + low density = scattered piano chords in silence. The visitor becomes a
DJ of Karel's own work. First prototype to address AGENT.md directive "build prototypes that USE his
real piano tracks as the audio source" in a purely transformative (not playback) way.

Demo/fallback: if `/api/audio/[id]` returns 401 or 404, load a 10s demo buffer of a C major chord
generated from OscillatorNodes at page open — granular synthesis still works, just on synthetic audio.
Zero new npm deps. One-cycle build. Research basis: Dennis Gabor (1946), Curtis Roads (1978, granular
synthesis foundations); RESEARCH.md §163 (Karel's Paths tracks), AGENT.md Karel-music directive.

---

Key findings from Cycle 247 (2026-05-30) — full research sweep:
- DiscoForcing (§235, ICML 2026, May 2026) — streaming audio→full-body animation, zero ML in browser. Seeds `dance-avatar` (spring physics, zero deps, human-figure gap, live performance fitness).
- EchoAvatar (§236, May 2026) — 3D character from audio + LLM. Server-side; validates audio→motion linkage.
- V2M-Zero (§237, Mar/May 2026) — video-to-music without paired data. Seeds `optical-flow-music` (frame diff, no CDN, zero deps).
- BEAT tokenization (§238, April 2026) — beat-quantized tokens improve music generation coherence. Seeds future `beat-looper` concept.
- ACE-Step UI trending (§239, May 2026) — 1,940 stars/month confirms ACE-Step 1.5 community momentum.
- Seedance 2.0 multimodal (§240, May 2026) — top video model with audio-reference input. Updates `ghost-animate`.
- FM synthesis gap (§241, synthesis note) — none of 213 prototypes use FM. Seeds `fm-explorer`.
- createPeriodicWave gap (§242, API note) — most underused Web Audio primitive. Seeds `waveshape-draw`.
- Dance avatar design (§243) + optical flow design (§244) — detailed build specs for zero-dep one-cycle implementations.

---

### kids-sing-creature — voice-grown 3D creature (call-and-response) `[seed from cycle 268 DEEP non-winner, build-verified]`
Route would be `/dream/<n>-kids-sing-creature`. **This was fully built and clean-building in cycle 268 as the sibling approach to the shipped `234-kids-hand-creature`; banked here, not committed.** Mic → one AnalyserNode (fftSize 2048); per frame compute RMS (loudness) + autocorrelation pitch (range-gated 80–1000 Hz, parabolic-interpolated, smoothed). Loudness → `uGrow` inflation + `uBright`; sustained loudness → `uSpike` (a held "AAAH" erupts the surface into spikes, quiet humming stays round); pitch → `uHue` (low=violet, high=amber/rose, shortest-path eased). Pitch is **snapped to nearest C-major-pentatonic note and sung back** as a soft sine+octave-triangle chime (60ms attack / 1.4s release, feedback delay) — call-and-response: the child sings, the creature sings the in-tune version back. Same Perlin-displaced icosahedron blob (three.js + Bloom) as 234; always-on ambient pad. Graceful degradation: sleeping-breathing idle → mic-denied auto-demo phrase + tap-to-bounce. Tags: mic · three.js · pitch-detection(autocorrelation) · kids. Clears ambition floor (first-3D-kids + autocorrelation-pitch + ≥3 subsystems). **Why it's promising**: it's the *voice* half of the no-touch-creature concept — pairs with 234 (hands) as a two-input set; the "creature sings your note back in tune" loop is a genuine ear-training toy. **To resurrect**: copy the cycle-268 page.tsx pattern (it built green); next-cycle deepening = two harmonizing creatures, a memory-phrase playback ("it remembers your song"), and a downsampled/FFT-assisted pitch estimator for cheap tablets.

---

### spectral-terrain — fly through a recording's spectrogram as 3D terrain `[seed from cycle 269 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-spectral-terrain`. **Fully built and clean in cycle 269 as a WIDE sibling to the shipped `236-particle-life-song`; banked here, not committed.** A `THREE.PlaneGeometry` 128 freq-cols × 96 time-rows height-field: X=frequency (log-ish, bass spread wider), Z=time (scrolls backward), Y+vertex-color=spectral energy. Each frame an `AnalyserNode` (fftSize 2048) `getByteFrequencyData` is downsampled into a fresh leading-edge row pushed into a ring-buffered height-field (moving `head` pointer, no full memmove), normals recomputed for lighting. Violet→cyan→amber/rose heat ramp, exponential fog, Bloom on crests, a gliding/bobbing fly-camera + OrbitControls. **Audio source = file upload** (invites Karel's Paths tracks, decodeAudioData→loop) with a built-in generative pentatonic arpeggio fallback so the terrain is alive before any upload; rose error on decode-fail, readable WebGL-fail notice. Reference: TouchDesigner "spectrogram waterfall as flying terrain." Tags: audio-file(upload) · three.js 3D · scrolling-spectrogram-terrain · organic/immersive. **Why promising**: pairs Karel's loved `227-paths-granular` (his real music as source) with a genuinely immersive 3D form — first 3D spectral-terrain in the lab. **To resurrect**: cycle-269 page.tsx built green; next-cycle deepening = stereo (two terrains L/R), beat-synced camera lurches, and a "freeze + walk the canyon" mode.

### tonnetz-lattice — harmony as a place you walk (neo-Riemannian) `[seed from cycle 269 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-tonnetz-lattice`. **Fully built and clean in cycle 269 as a WIDE sibling to the shipped `236-particle-life-song`; banked here, not committed.** A 3D Tonnetz (Euler's tone-network): axial lattice where q steps by a perfect fifth (+7 st) and r by a major third (+4 st), gently bowed into a curved sheet (r3f + drei `Text` labels + Bloom, OrbitControls). Every small triangle is a maj/min triad; nodes colored on the chromatic hue wheel (C=red…) matching `1-live`/`229-chord-canvas`. **Play it two ways**: (1) click a triangle → full triad (3 osc + lowpass + feedback-delay), click a node → its pitch + highlight the triads it belongs to; P/L/R buttons glide to the neighbor triad and voice-lead only the moving note (animated pan/rotate so the new triad centers) — neo-Riemannian transforms made visible+audible. (2) mic mode → 4096-FFT → 12-bin chroma → dot-product vs 24 maj/min templates → light up the live triad; mic-denied falls back to click mode with a rose notice. Reference: Euler's Tonnetz; Hugo Riemann; the modern PLR transformation group. Tags: touch/click(+mic) · three.js 3D lattice · Tonnetz/neo-Riemannian PLR · geometric/Ikeda-clean. **Why promising**: first lattice-of-harmony piece; the only one in the lab that makes chord *relationships* spatial — a real ear/eye training instrument and a crisp geometric counterpoint to the lab's warm pieces. **To resurrect**: cycle-269 page.tsx built green (verify drei `Text` SSR); next-cycle deepening = trace a played progression as a glowing path across the lattice, and a "chord-route finder" that animates the shortest PLR path between two chords.

---

### kids-sing-garden — sing a GLSL fluid sky, hear your melody back `[seed from cycle 270 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-kids-sing-garden`. **Fully built and clean-building in cycle 270 as a WIDE sibling to the shipped `238-kids-tilt-world`; banked here, not committed (108 kB, no three.js).** A fullscreen **raw WebGL fragment shader** (fullscreen triangle, hand-written GLSL: value-noise fbm + domain warping animated by `uTime`) renders a slowly-flowing fluid color field that breathes in calm violet/blue at rest. Mic → **autocorrelation** pitch (80–900 Hz, clarity-gated) + RMS: pitch → `uHue` (violet→rose→gold) + `uY` (high notes bloom at top), loudness → `uBloom` intensity + `uFlow` warp speed — the child paints the sky with their voice. Sung pitches sampled every ~120 ms (cap 48); **"Hear it!"** plays them back **quantized to C-major pentatonic** as soft sine+triangle tones, pulsing the shader in sync. Never-silent ambient pad. Mic used live-only (analyser-only connection, no feedback, nothing stored); graceful degrade to a touch-the-sky drag mode (Y=pitch) with a rose notice, shader stays alive. Reference: Refik Anadol latent color fields; Vincent Morisset's *Bla Bla*; the loved `158-kids-hum-paint` + `100-kids-paint-song`. Tags: **mic/voice-pitch · raw-WebGL-fragment-shader · autocorrelation+melody-loopback · contemplative/bedtime**. **Why promising**: the lab's **first kids GLSL fragment-shader piece** (all ~110 others are 2D canvas), it fills the empty calm/pre-sleep niche, and the voice→shader-bloom mapping is genuinely new. **To resurrect**: cycle-270 page.tsx built green (TS+ESLint clean); next-cycle deepening = star/particle accents that seed where you sang, a two-voice harmony mode, and a "the sky remembers last night's song" persistent melody.

### kids-wave-band — conduct a band by waving at the camera (zero-dep motion) `[seed from cycle 270 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-kids-wave-band`. **Fully built and clean-building in cycle 270 as a WIDE sibling to the shipped `238-kids-tilt-world`; banked here, not committed.** **Zero-dependency frame-differencing**: each frame the live video is drawn tiny (64×48) to a hidden offscreen canvas, grayscaled, and compared to the previous frame — the sum of `|pixel − prevPixel|` per region *is* motion energy (no MediaPipe, no ML). Screen split into 5 vertical zones (BANDIMAL: left=low/biggest → right=high); zone motion past threshold opens that zone's pentatonic voice (C3 E3 G3 C4 E4, triangle + shimmer sine, `setTargetAtTime` envelopes), louder with more motion. **Output = WebGL particles (THREE.Points)**: motion centroids spawn glowing additive sprites colored per zone over pulsing glow quads, camera mirrored horizontally (a "ghostly silhouette of light," video itself hidden). Never-silent ambient pad; after ~3 s of stillness it auto-pulses a zone to show what movement does. Camera live-only (frames discarded each tick, tracks stopped on exit); graceful degrade to pointer mode (drag across zones) with a rose notice. Reference: the loved `101-camera-song` + `221-optical-flow-music`; Daniel Rozin's mirror works; Toca Band (motion replaces tap). Tags: **camera-motion (frame-diff, zero-dep) · WebGL-particles · optical-energy → voices · kids/playful**. **Why promising**: turns *gross-motor whole-body movement* into music with no model to fail — lighter and more forgiving than the MediaPipe-based `234`. **Held back this cycle only because** a camera kids piece (234) shipped last cycle; revive once camera isn't in recent history. **To resurrect**: cycle-270 page.tsx built clean (tsc+eslint); next-cycle deepening = adaptive lighting threshold (auto-calibrate to the room), a horizontal "pitch-bend" from motion height within a zone, and a two-kid duet split (left half / right half).

---

### spectral-canyon — fly through your music as a scrolling spectrogram terrain `[seed from cycle 271 DEEP non-winner, build-verified]`
Route would be `/dream/<n>-spectral-canyon`. **Fully built and clean (authoritative `npm run build` green with it present in cycle 271) as a DEEP sibling to the shipped `243-spectral-cloud`; banked here, not committed.** A `THREE.PlaneGeometry` 128 freq-cols × 96 time-rows height-field: frequency runs across X (power-warped so bass spreads wide), the newest `getByteFrequencyData` row is written at a moving `head` index, magnitude → elevation, and the whole mesh glides forward (fly-camera with bob/drift + OrbitControls). Heat ramp violet→cyan→amber/rose, `FogExp2`, onset-flux flash + camera lurch + median-interval **BPM**, spectral-centroid biasing global color temperature + fog density. **Audio = file upload + generative pentatonic pad fallback** (alive on Start), rose decode-error, graceful WebGL-fail notice. Reference: TouchDesigner "spectrogram waterfall as flying terrain" + Refik Anadol data-landscapes. Tags: **audio-file-input · three.js-3D · spectrogram-terrain · immersive/Anadol**. **Why promising**: the most legible of the three "your music as a 3D world" readings; pairs Karel's loved real-music thread (`227-paths-granular` ❤️, `163-paths-visualizer` ❤️) with an immersive flythrough. **To resurrect**: cycle-271 page.tsx built green. **Known weakness to fix first**: the ring buffer writes the new row at a *cycling* head index but the row Z positions are fixed and the mesh only wraps within one cell — so the time axis scrambles and it reads as an undulating field rather than a clean waterfall flowing toward you. Fix = remap each row's world-Z by `(r − head)` so the head row always sits at the far edge and the whole history marches forward coherently. Then deepen: stereo L/R terrains, beat-synced camera lurches, "freeze + walk the canyon" first-person mode.

### spectral-tunnel — fly down a wormhole carved by your music `[seed from cycle 271 DEEP non-winner, build-verified]`
Route would be `/dream/<n>-spectral-tunnel`. **Fully built and clean-building in cycle 271 as a DEEP sibling to the shipped `243-spectral-cloud`; banked here, not committed.** A radial flythrough: a 64-ring buffer of `LineSegments`+glow-`Points` cross-sections marches toward the camera and recycles by wrapping Z (geometry never reallocated, only typed-array attributes rewritten). Each ring's circumference is displaced by the live spectrum (frequency bin → angle, mirrored for bilateral symmetry), so loud frequencies bulge the wall outward; additive indigo→cyan→rose heat ramp + `FogExp2`. **Motion model is the most correct of the three** (rings genuinely translate in Z and recycle). Subsystems: energy-flux **onset** → forward speed-boost + a flash ripple that travels down the tunnel + FOV punch (with corner BPM/onset readout); spectral **centroid** → hue + twist/spiral rate (brighter music spins faster, warmer); optional OrbitControls "look around" vs default auto-fly. **Audio = file upload + generative pentatonic motif fallback** (drone + plucks so onsets fire), rose decode-error, WebGL-fail notice. Reference: Jeff Minter / demoscene tube-tunnel lineage + Refik Anadol immersive data-tunnels. Tags: **audio-file-input · three.js-3D · spectral-tunnel · immersive/kinetic**. **Why promising**: the most kinetic, immediately-wow of the three; the wormhole is a fresh form for the lab and the per-frame motion is the most physically convincing. **Held this cycle only because** `243`'s volumetric cloud was the tighter match to this cycle's WebGPU-point-cloud research dive and to the loved `130-tsl-particle-compute` ❤️. **To resurrect**: cycle-271 page.tsx built green (uses a `startGenerativeRef` indirection to satisfy exhaustive-deps). Deepen: a real time-history version (each ring = a past spectrum frame, not the current one) so the tunnel wall is the song's recent shape; UnrealBloomPass; beat-locked color strobes.

---

## Banked from Cycle 272 kids WIDE fire (build-verified explorations, not committed)

### `kids-clap-dancers` — clap/onset rhythm → 3D dancing band `[queued, strong]`
**Question**: what if a 4-year-old played RHYTHM with their body — clapping/stomping/shouting — to make a band of 3D creatures dance?
**Spec**: Row of ~5 capsule-bodied three.js creatures with little faces on a warm stage. Mic `AnalyserNode` → half-wave-rectified **spectral-flux + RMS onset detector** (adaptive baseline + refractory window). Each onset → round-robin a creature does gravity-bounce + **squash-and-stretch** (anticipation squash → stretch on rise → squash on land), flash, confetti; louder clap = bigger bounce + brighter + nudges a neighbor. Rolling inter-onset-interval **tempo estimate** drives a self-running backing groove that builds with the child's beat and never goes silent (always-on ambient pad + idle breathing). Each creature owns a voice (kick/tom/shaker/clap/bell) + a C-pentatonic note. Mic-denied → ≥64px CLAP! button + tap-anywhere fallback. three.js output, mic-onset input — clears JURY's kids door cleanly.
**Why it was held, not killed**: very close 2nd to `244` this cycle; lost only on love-alignment (one drum love vs the winner's two voice loves). First clap/onset-driven 3D kids piece in the lab — a genuinely fresh musical dimension (rhythm via amplitude, not melody or location). **Resurrect on cycle 274.** Built clean (tsc+eslint) this fire; ~786 lines.

### `kids-body-band` — whole-body camera motion → music + light `[queued]`
**Question**: what if a 4-year-old played by DANCING their whole body in front of the camera, no touching the screen?
**Spec**: Mirrored webcam behind a dark glowing overlay, divided into 5 vertical zones (5 playground colors, C-pentatonic). Per-frame the video is drawn into a tiny 64×48 offscreen canvas → grayscale → summed |pixel delta| vs prev frame **per zone** (dependency-free frame-differencing, zero ML). Zone motion crossing threshold (with refractory) → rings that zone's voice + a glowing particle burst at the brightest-delta pixel. Always-on ambient pad + idle drift particles (never dead). Camera-denied → tap/drag the stripes. Inspired by Google **"Jump to play" (2026)** whole-body-pose-as-controller + Daniel Rozin motion mirrors.
**Why it was held**: novel camera-body-motion input, but it shipped a **canvas2d output** — the exact over-represented diversity tag JURY banned this week. **Resurrect with a three.js/WebGL particle-field output** (or fuse with MediaPipe pose for a real `body-aurora`) so it clears the diversity bar. Built clean (tsc+eslint) this fire; ~519 lines.

---

## Banked from Cycle 273 adult DEEP fire (the "fly through your music" trio; build-verified, not committed)

Cycle 273 ran DEEP on **"fly THROUGH your own music as a living volume"** — three render approaches built in parallel. **Winner shipped: `246-spectral-splat`** (Gaussian-splat volumetric flythrough, from the AudioGS dive). The other two were rebuilt clean this fire (both passed tsc + eslint in-folder) and are banked again, sharper:

### `spectral-tunnel` — fly down a wormhole carved by your music `[queued, strong — close 2nd, build-verified TWICE (271 + 273)]`
Route would be `/dream/<n>-spectral-tunnel`. The most **kinetic** of the trio. A 64-ring `Float32Array ringZ[]` buffer of `LineSegments` + additive glow `Points` cross-sections that genuinely translate in +Z toward the camera and recycle by wrapping `-TUNNEL_LENGTH`; **each ring freezes the spectrum at spawn**, so the wall streams past like terrain instead of pulsing in place (the correct-motion detail that sells forward travel). Bin→angle (bilateral-mirrored), magnitude→radial bulge; spectral-flux onset → speed boost + FOV punch + a flash ripple travelling *toward* you; centroid → hue + twist rate; median-IOI BPM HUD; auto-fly vs drag-to-look. Audio = generative motif + file/drop + offline demo + optional mic, all graceful. Reference: Jeff Minter / demoscene tube-tunnel + Refik Anadol data-tunnels. Tags: **audio-file-input · three.js-3D · radial-tunnel · immersive/kinetic**. **Held in 273 only because** the splat reading had the tighter research→build chain (today's AudioGS dive) and the genuinely never-used technique; tunnel is a known demoscene form. **Resurrect**: the cycle-273 page.tsx (~937 lines) built green. Deepen: UnrealBloomPass; per-bin decaying max so transients streak the wall; stereo split (L carves left half, R the right, breaking the mirror); branching wormholes on strong onsets.

### `spectral-canyon` — fly over your music as a spectrogram-waterfall terrain `[queued — build-verified TWICE, Z-fix now implemented]`
Route would be `/dream/<n>-spectral-canyon`. The most **legible** of the trio. A `THREE.PlaneGeometry` height-field (128 freq cols × 96 time rows); frequency→X power-warped (`t^0.45`) so bass spreads wide; magnitude→Y elevation; violet→cyan→rose→amber ramp + `FogExp2`. **The known time-axis-scramble bug is now fixed**: each row's world-Z is remapped by its age `((head - r + ROWS) % ROWS)` so the newest row always sits at the horizon and the whole history marches coherently toward the camera (a true waterfall). Onset → camera lurch + flash; centroid → color temp + fog density; BPM/onset HUD; fly-cam + drag-orbit. Audio sources as above. Reference: TouchDesigner "spectrogram waterfall as flying terrain" + Anadol data-landscapes. Tags: **audio-file-input · three.js-3D · spectrogram-terrain · immersive/Anadol**. **Known weakness to fix before shipping**: CPU recomputes ~12k vertex positions/colors + `computeVertexNormals()` every frame — fine on desktop, but move displacement to a GPU vertex shader (and lit `MeshStandardMaterial` + moving light for real ridge shadows) before raising ROWS past ~128. **Resurrect**: cycle-273 page.tsx (~811 lines) built green.

---

## Banked from Cycle 274 kids WIDE fire (build-verified explorations, not committed)

Cycle 274 ran WIDE on the kids cadence (JURY: never ship a solo kids build) — three unrelated **non-touch input × raw-WebGL-shader output** directions, deliberately dodging the banned three.js/canvas2d outputs. **Winner shipped: `248-kids-stir-garden`** (camera-motion → Gray-Scott reaction-diffusion). The other two built clean in the authoritative all-three `npm run build` (exit 0) and are banked, sharper:

### `kids-sing-garden` — paint a glowing bedtime sky with your voice, hear your song back `[seed from cycle 274 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-kids-sing-garden`. **Fully built + clean in the cycle-274 authoritative build (all three present, exit 0); banked, not committed (~679 lines).** A fullscreen **raw WebGL fragment shader** (hand-written GLSL: value-noise `fbm` through two stages of **domain warping**, bedtime violet→rose→gold palette, vertical glow-pool + vignette, animated by `uTime`). Mic → **autocorrelation** pitch (80–900 Hz, RMS+clarity gated, analyser-only/never stored) + RMS: pitch → `uHue` (low violet → high gold) + `uY` (high notes bloom up), loudness → `uBloom` + `uFlow` (swirl speed) — the child paints the sky with their voice. Sung pitches sampled every ~120ms (cap 48); a big glowing **"Hear it!"** (96px) replays them **quantized to C-major pentatonic** as soft sine+octave-triangle tones, pulsing the shader (`uPulse`) in sync. Never-silent low-pass drone; mic-denied → vertical-drag "paint the sky" fallback (Y=pitch) with a `text-rose-300` notice; WebGL-absent → readable notice. Reference: Refik Anadol latent color fields; Vincent Morisset's *Bla Bla*; the loved `158-kids-hum-paint` ❤️ + `100-kids-paint-song` ❤️. Tags: **mic/voice-pitch input · raw-WebGL-fragment-shader output · autocorrelation + pentatonic loopback · contemplative/bedtime**. **Why promising**: fills the lab's empty **calm/pre-sleep** kids niche, descends directly from two loved voice/paint pieces, and is the safe high-quality runner-up that lost only on surprise (closest in concept to the existing loved pieces). **Resurrect**: cycle-274 page.tsx built green. Deepen: per-note "petals/seeds" that bloom where you sang (lean into the garden name); McLeod/MPM pitch tracker to kill octave-jumps; optional under-harmony (third/fifth) on playback; one-tap palette/season swap.

### `kids-tilt-pour` — tilt to pour a glowing lava-lamp of blobs that sing when they merge `[seed from cycle 274 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-kids-tilt-pour`. **Fully built + clean in the cycle-274 authoritative build (all three present, exit 0); banked, not committed (~631 lines).** A fullscreen **raw-WebGL metaball** shader: ~8 candy-colored jelly blobs whose inverse-square fields are summed and pulled out with `smoothstep` (smin-style fusion), glowing rims + additive halo + Reinhard tonemap = lava-lamp aura. **Tilt** (`deviceorientation` gamma/beta) → smoothed **gravity unit vector** driving a tiny CPU physics step (gravity, damping, edge restitution ~0.55, soft blob–blob repulsion+impulse). When two blobs merge past threshold (per-pair ~260ms refractory) the blob rings its **C-pentatonic** note (each color owns a pitch); gentle sine+triangle → feedback-delay shimmer → DynamicsCompressor limiter, velocity capped ≤0.5 so it's never harsh. Never-silent triad pad swells with sloshing. iOS `DeviceOrientationEvent.requestPermission()` from the 88px "Pour!" gesture (also unlocks audio); no-tilt/desktop → drag steers gravity toward the pointer with a `text-rose-300` notice; no-WebGL → readable notice. Reference: Inigo Quilez smooth-min/SDF; lava-lamp aesthetics; loved `83-kids-tilt-rain` ❤️ + `169-kids-marble-run` ❤️ + `84-wave-fluid` ❤️. Tags: **tilt input · raw-WebGL-metaball-shader output · physics + SDF fusion · candy/playful**. **Why promising**: pure-tactile no-reading toy with strong loved-tilt lineage; lost only on surprise (metaball is a known form and tilt shipped recently in `238-kids-tilt-world`). **Resurrect**: cycle-274 page.tsx built green. Deepen: per-orientation gravity remap via `screen.orientation.angle`; true IQ `smin` over signed distances; volume-preserving merge; `devicemotion` shake → blob split + sparkle; chord-on-full-overlap with hue-blend.

---

## Banked from Cycle 275 adult DEEP fire — the live-reactive-accompanist "AI band" (build-verified, not committed)

Cycle 275 ran DEEP on JURY.md's named request ("fuse duet-shadow + 225-aria-companion into real reactive accompaniment") — ONE concept, *a live AI accompanist that plays WITH you in real time*, attacked via three "band-member" approaches. **Winner shipped: `251-live-duet-trader`** (gap→Markov-fill→duck-on-re-entry). The other two are the **next two band members** — a clear multi-cycle arc: **Trader (shipped) → Harmonist → Groover = a reactive trio you play with**. Both built clean per their builders' lint+tsc self-verification (folder-isolated; the authoritative build shipped winner-only). All three share the research cite (arXiv 2604.07612, Apr 2026), so all clear the ambition floor on re-build.

### `live-duet-harmonist` — ✅ SHIPPED cycle 277 as `256-live-duet-harmonist` (jazz-voicing variant won a DEEP 2-builder re-fire)
**Status: built + shipped.** Cycle 277 ran a DEEP 2-builder fire on this banked member: builder A = the canonical fixed-clock comping bed below; builder B = a **jazz-voicing + walking-bass + onset-synced** variant that folds this seed's own "next-cycle deepening" into the shipped piece. **Builder B won and shipped as `/dream/256-live-duet-harmonist`** (clears 4 ambition criteria vs A's 3; first spectral-flux onset/tempo + two-clocks scheduler fused with harmony in the lab). Builder A is banked just below as a build-verified fallback. Original seed kept for the record:

Route would be `/dream/<n>-live-duet-harmonist`. **~714 lines, builder-verified lint+tsc clean (cycle 275).** The **bassist/pianist** member, and the one that handles **chordal piano** (where 251 can't — it's monophonic). Mic → AnalyserNode (fftSize 4096) → fold byte-FFT (60–2000 Hz) into a **12-bin chroma** vector (one-pole smoothed) → **cosine-match against 36 templates** (12 maj / 12 min / 12 dom7) → best above a confidence floor → a **~160 ms look-ahead "settle" window** (a new chord must hold before the bed switches, so it's anticipatory not flickery) → synthesized accompaniment: a **triangle bass** on the root + a **3-note sine comp** with **voice-leading** (each oscillator glides to the nearest octave placement of its new pitch class, no hard-cuts) + a gentle ~72 BPM eighth-note arpeggiation; the whole bed **breathes** with input energy over an always-on floor. Canvas-2D: 12-wedge chroma ring, large center chord name, glowing bass/comp staff nodes, scrolling chord-history trail. No-mic → auto ii–V–I–vi loop in C. Reference: arXiv 2604.07612 (look-ahead/settle) + Rowe interactive systems + Pachet Continuator. Tags: **mic input · canvas2d output · chroma→chord + generative comping bed · jazz/responsive**. **Why promising & complements 251**: it's the polyphony-handling half of the duet (Karel plays chords) and the most "useful for a pianist" of the three — a living harmonic bed under your hands. Lost the cycle-275 pick only because its chroma→chord detection overlaps `229-chord-canvas` (less *novel*), but as the **next** member it's the priority build. Deepen (from its README): infer a tonal center over a longer window for diatonic ii–V–I *anticipation* (genuine look-ahead, not just settle); a tiny Markov-over-chords model to pre-voice the likely next chord a beat early; rootless/drop-2 jazz voicings + walking bass; onset-synced comping instead of a fixed clock; expose settle-window/confidence as live controls. **Resurrect**: cycle-275 page.tsx built green.

### `live-duet-harmonist-simple` — fixed-clock voice-led comping bed (the cycle-277 runner-up) `[build-verified, not committed — fallback]`
The cycle-277 DEEP fire's **builder A**: the canonical, simpler harmonist — mic → 12-bin chroma → 36-template (maj/min/dom7) cosine match → 160 ms settle → **triangle bass on the root + 3 sine comp voices** with greedy nearest-octave voice-leading glides + a steady **72 BPM eighth-note arpeggiation**, breathing with input energy over an always-on floor, feedback delay + DynamicsCompressor limiter. Canvas-2D: 12-wedge chroma ring, large root-hued center chord name, left-column bass/comp staff nodes, scrolling chord-history trail. No-mic → ii–V–I–vi in C. **Build-verified clean (cycle 277, `npm run build` exit 0, `/dream/250-live-duet-harmonist` ○ Static 4.23 kB), then removed per orchestration safety.** **Why banked, not dead**: it lost only on ambition (3 vs 4 criteria) — it is the more **demo-reliable** version (no onset/tempo tracking to misfire on legato piano). **Resurrect if** `256`'s spectral-flux tempo-sync proves flaky in a real browser session (the groover caveat applies): ship 250 as the safe comping bed and keep 256 as the "jazz mode." References: arXiv 2604.07612 (settle) + ReaLchords (2506.14723) + Pachet Continuator + Rowe. Tags: **mic · canvas2d · chroma→chord + voice-led comp · jazz/responsive**.

### `live-duet-groover` — a drummer/arpeggiator that infers your tempo and follows it `[seed from cycle 275 DEEP non-winner, build-verified]`
Route would be `/dream/<n>-live-duet-groover`. **~728 lines, builder-verified lint+tsc clean (cycle 275).** The **rhythm-section** member and the most technically novel of the three — **first real beat-tracker + look-ahead scheduler in the lab**. Mic → AnalyserNode (fftSize 1024) → **spectral flux** (sum of positive bin-to-bin energy increases) with an **adaptive threshold** (`flux > mean + 1.6·std`, EMA mean/var, 100 ms refractory) → onsets → ~6 s **inter-onset-interval histogram**, each IOI's BPM **folded into 60–180** by ×2/÷2 (the standard octave-ambiguity fix), neighbor-smeared + parabolic peak → smoothed BPM + a peakiness **confidence** → a **Chris-Wilson "two clocks" look-ahead scheduler** (~25 ms coarse `setInterval` schedules grid steps inside a 100 ms window at precise `AudioContext` times): synthesized kick (sine pitch-drop) on beats, snare (band-passed noise) on 2&4, hats (HP noise) on 8ths/16ths, + an A-minor-pentatonic arpeggio, all density/level-scaled by confidence. Locks to a *moving* target two ways: beat period re-derived from live BPM each tick + a small proportional **phase nudge** toward your latest onset. Canvas-2D beat-radar ring, rotating phase hand, pulsing core, emerald onset-flash, violet arp dots, large BPM readout, locked/listening indicator. No-mic → an internal click source that **drifts 84↔124 BPM** so you can watch it chase tempo. Reference: arXiv 2604.07612 + Rowe *Interactive Music Systems* + Chris Wilson "A Tale of Two Clocks." Tags: **mic input · canvas2d output · onset/tempo-tracking + look-ahead scheduling · jazz/EDM-club**. **Why promising**: completes the trio (harmony + melody + rhythm) and brings genuinely new DSP (beat tracking, two-clocks scheduling) the lab has never had. **Caveat flagged by its builder**: spectral-flux loves *transients* — legato/sustained piano (Karel's instrument) gives weak onsets and a fuzzier tempo estimate, and abrupt tempo jumps take a couple beats to catch (proportional nudge, not a DP/Kalman beat tracker). Couldn't be ear-verified in the build env — **needs a real browser session to tune the flux floor + correction gain** before it's stage-ready. Deepen: Ellis-style DP beat tracker over the onset envelope; half/double-time toggle; key-detect the arp scale; swing/micro-timing inference. **Resurrect**: cycle-275 page.tsx built green.

### `kids-blow-bloom` — BLOW on the iPad to scatter a glowing dandelion that rings `[seed from cycle 276 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-kids-blow-bloom`. **~850-line page.tsx, build-verified clean in the cycle-276 authoritative all-three build (exit 0, 5.05 kB, tsc+eslint clean per builder).** The lab's **first breath/blow-detection input** — every prior mic piece does *pitch* detection; this does the opposite. A luminous **Vogel-spiral dandelion** (~52 seed-petals) sits in a dark meadow; the child **blows** (like blowing out birthday candles) and petals peel off the head, lift on an upward+turbulent breeze, and drift away fading — each departing seed rings a soft **C-major-pentatonic** note (pitch ∝ launch height) through a feedback-delay + DynamicsCompressor limiter; the head visibly thins from the outside in and slowly **regrows** when calm so there's always something to blow. Blow-vs-voice is decided by **three multiplicatively-combined features**: RMS energy (gated above a quiet-room floor) × **spectral flatness** (geometric/arithmetic-mean ratio over 200–4000 Hz — high for noise-like breath, low for tonal voice) × **inverted autocorrelation clarity** (suppresses sung/hummed notes). An asymmetric EMA (fast rise / slow decay) gives a natural ramp-and-hold `blowStrength`; a live puff meter shows detection working. Always-on ambient C/E/G pad swells with blow energy. Mic-denied → tap/drag-to-puff fallback with a `text-rose-300` notice; full rAF/track/AudioContext cleanup. Reference: Nintendo DS blow mechanics (Electroplankton, Nintendogs), Toca Boca's natural-gesture toy ethic, electronic wind controllers (EWI/Aerophone — breath energy *is* the gesture), spectral flatness/Wiener-entropy as a standard MIR noise-vs-tone feature. Tags: **breath/blow-mic input · canvas2d output · spectral-flatness breath-detection + particle physics · meadow/whimsy**. **Why promising**: the single most *surprising* of the cycle-276 trio — a genuinely new input modality in 250+ prototypes, and "blow out the dandelion" is an interaction a 4-year-old already understands with zero instruction. **Honest weakness** (builder-flagged): unvoiced fricatives ("sss/shh") and loud broadband room noise (HVAC, clapping) can partially fool the detector — the autocorrelation gate helps but doesn't fully defeat them. **Resurrect**: cycle-276 page.tsx built green. Deepen: frequency-weighted flatness (weight 200–800 Hz for breath's pink/brown tilt), a 40-bin mel + tiny learned blow/voice/silence classifier, multiple blooms, stereo energy-difference for blow *direction*, chord clusters when ≥3 seeds airborne.

### `kids-sing-garden` (cycle-276 build) — sing a glowing bedtime sky, hear your melody back `[seed from cycle 276 WIDE non-winner, build-verified]`
Route would be `/dream/<n>-kids-sing-garden`. **~849-line page.tsx, build-verified clean in the cycle-276 authoritative all-three build (exit 0, 5.98 kB, tsc+eslint clean per builder).** (A second, independently-built realization of the long-standing `kids-sing-garden` seed — fills the lab's empty **calm/pre-sleep** kids niche.) A fullscreen **raw-WebGL fragment shader**: value-noise **fbm** through **two-stage domain warping**, violet→rose→gold bedtime ramp, a Gaussian vertical glow-pool + vignette + Reinhard tonemap, 4-octave/DPR≤2 capped for tablets. Mic → **autocorrelation** pitch (80–900 Hz, RMS+clarity-gated, analyser-only/never stored) → `uHue` (low violet → high gold, shortest-path eased) + `uY` (high notes bloom up); RMS loudness → `uBloom` brightness + `uFlow` swirl speed — the child paints the sky with their voice. Sung pitches sampled ~every 120ms (cap 48); a big glowing **"Hear it!"** button replays them **quantized to C-major pentatonic** as sine+octave-triangle tones (feedback delay, DynamicsCompressor limiter), pulsing the shader (`uPulse`) in sync. Never-silent detuned C/G drone. Mic-denied → vertical drag-to-paint fallback (Y=pitch/hue) with a `text-rose-300` notice; no-WebGL → notice + pad/loopback still work; full GL/rAF/track/AudioContext cleanup. Reference: Refik Anadol latent color fields; Vincent Morisset *Bla Bla*; loved `158-kids-hum-paint` ❤️ + `100-kids-paint-song` ❤️. Tags: **voice-pitch input · raw-WebGL fbm/domain-warp output · autocorrelation + pentatonic loopback · bedtime/calm**. **Why promising**: fills the empty pre-sleep niche, descends from two loved voice/paint pieces. **Lost the cycle-276 pick** because (a) the *winner* (253) had the direct research→build chain to today's lava-lamp dive, and (b) it overlaps `244-kids-sing-creature` (voice→autocorrelation→pentatonic-loopback, just shipped) — the most redundant of the trio. **Honest weakness** (builder-flagged): plain autocorrelation produces occasional **octave jumps** (half/double-period) that flash the sky's color and insert wrong-octave notes. **Resurrect** only after `244` has had time to breathe (avoid two near-identical voice-pitch kids pieces back-to-back), and swap in **YIN/MPM** pitch tracking first to kill the octave errors. Deepen: per-note petals/seeds that bloom where you sang, optional under-harmony on playback, FPS-adaptive quality.

---

### 257-kids-face-band — single-creature face music toy `[banked, build-verified — cycle 278 DEEP runner-up]`

**Question**: what if a 4-year-old played music with their face, mirrored by ONE charming creature (vs. 258's Rozin swarm-mosaic)?

**What it is**: webcam → MediaPipe FaceLandmarker → a hand-drawn glowing Canvas2D creature with big blinking eyes, blushing cheeks, and a mouth that opens to sing. Mapping: `jawOpen`→singing-voice volume + open mouth + radiating sound rings; `mouthSmile*`→hue violet→gold + cheek blush + sparkle bloom + brighter timbre; `browInnerUp/Outer`→note steps up a C-major-pentatonic scale; head-turn (nose landmark x)→stereo pan + the creature leans & pupils glance; blink→twinkle chime + the creature blinks. Always-on pad, master limiter, EMA smoothing. Degrades: camera/CDN fail → self-playing auto-demo + `text-rose-300` notice; tap the canvas → the creature sings (touch fallback).

**Why it was the runner-up (and worth resurrecting)**: it's the *more legible* take for the actual 4-year-old — "open your mouth → the creature sings louder" is the most direct, joyful cause/effect in the whole face-music space, and the single creature is a character a kid bonds with. It lost to 258 only on *surprise + named-reference strength* (Rozin), not on kid-delight or code quality. **Build-verified** in the cycle-278 DEEP fire (compiled clean alongside 258 before winner-only rebuild).

**To resurrect**: re-create `src/app/dream/257-kids-face-band/page.tsx` from the cycle-278 builder output (the design is documented above and in STATE §278). One-cycle ship. Apply the full MediaPipe house import pattern up front (`// @ts-expect-error - runtime ESM import, no local types` + `eslint-disable-line @typescript-eslint/no-explicit-any` on a single-line import) so the build passes first try. Pairs with 258 as a two-take set: *mosaic-mirror* vs *single-creature*.

**Next-cycle deepenings** (from the builder's README): two-face duet (`numFaces:2`, two creatures harmonizing); use the facial transformation matrix for true 3D head-tilt → note-bend/wah; a 10-second face-looper (record + loop expressions to layer over yourself).
