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

### data-cosm — particle physics data stream as audio-visual material `[queued, zero deps, zero API]`
Route: `/dream/116-data-cosm`. Ryoji Ikeda data-cosm aesthetic: synthetic particle physics event stream as audio-visual medium. The visual: a full-canvas grid of monospace white text on pure black, rows scrolling upward, each row = one synthetic collision event (particle type label in brackets, 6 numeric fields for energy/momentum/angles — all synthetic, formatted as CERN CMS output: `[μ+] pt=48.3 eta=-1.27 phi=2.95 m=0.106 q=+1`). Events fire at a rate controlled by the current "scale." On each event: a 300ms scatter animation (each character in the row jumps to a random offset then snaps back via CSS transform), a 4kHz sine pulse (30ms attack, 80ms decay, gain 0.28), and a 3-pixel particle trail from the event row's position. Continuous sub-bass at 38Hz (OscillatorNode gain 0.06) underlies — felt not heard.

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

### image-chord — drag an image, hear its music `[queued, zero deps, zero API]`
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
