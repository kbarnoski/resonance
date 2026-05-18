# Resonance Dream Sandbox — prototype index

This is the single page Karel opens each morning. It mirrors the live
index at `/dream/` (the Vercel preview URL). Click a route to play
with the prototype; click the design notes link to read the agent's
thinking.

Status legend: `skeleton` (route exists, not yet interactive) ·
`wip` (partial) · `demoable` (works, rough) · `polished` (refined).

---

## ⭐ Newest (Cycle 23 — research)

- **Cycle 23 was a research sweep** (no new prototype). 7 new entries in RESEARCH.md (§§22–28).
  3 new prototype ideas added to IDEAS.md: `three-mesh-av` (Three.js R3F + TSL audio-reactive 3D
  mesh, buildable next cycle, zero new deps), `code-score` (browser music DSL + canvas painter),
  `pitch-harmonize` (AudioWorklet phase vocoder harmony + HRTF + dual vectorscope). Ghost-animate
  plan updated: prefer HappyHorse-1.0 (new #1 ranked joint audio-video model) over Seedance 2.0.

  **Most surprising finding**: `three@0.182`, `@react-three/fiber`, `@react-three/drei`, and
  `@react-three/postprocessing` are all already installed in Resonance — 20 prototypes built
  and none use Three.js. The next prototype will fix that.

---

## Previous newest (Cycle 22)

- **[/dream/20-scope](/dream/20-scope)** — Vectorscope.
  Two modes: **Lissajous demo** (no permissions) plots two sine waves against each other —
  each musical ratio (octave, fifth, fourth, M3rd, m3rd) traces a distinct closed figure.
  The CRT phosphor persistence makes cusps glow bright and fast arcs dim, exactly like
  a real oscilloscope. **Phase portrait** (mic) plots the live signal against its own past
  at an adjustable delay — a single piano note makes an ellipse, a chord makes overlapping
  loops, percussion makes an explosive spray. Rainbow colors from direction-of-travel hue
  (atan2 of trajectory tangent). **The geometry of harmony — visible.**

---

## Previous newest (Cycle 21)

- **[/dream/19-cymatics](/dream/19-cymatics)** — Cymatics.
  Sand particles settling into Chladni figures — the geometric node line patterns of a
  vibrating plate. 2000 amber grains drift onto the exact curves where sound is stationary.
  Eight modes from simple (1,2) Ring to intricate (5,6) Snowflake. Additive blending makes
  the node lines glow bright against black. Demo auto-cycles every 4.5s; mic mode maps
  spectral centroid to mode; manual buttons always override. **The hidden geometry of
  frequency — what Resonance literally means.**

---

## Previous newest (Cycle 20)

- **[/dream/18-granular](/dream/18-granular)** — Granular Cloud.
  Your audio shattered into overlapping grains and reassembled as a glowing cloud. Each dot IS
  a grain playing: X = where in the recent audio buffer it was sampled from, Y = its pitch shift
  in cents. Hue encodes buffer age (blue = older audio, orange = most recent). Additive blending
  makes dense grain regions glow bright. Four sliders: density, pitch range, grain size, scatter.
  Demo mode (synthetic oscillators, no permissions) and mic mode. **First prototype that transforms
  rather than visualizes — the dots are the sound.**

---

## Previous newest (Cycle 19)

- **[/dream/17-acoustic-trail](/dream/17-acoustic-trail)** — Acoustic Trail 3D.
  Your audio mapped to its own coordinate space: spectral centroid → X, treble ratio → Y,
  bass energy → Z. Each frame leaves a glowing point; the trail accumulates into a 3D scatter
  cloud that is the acoustic fingerprint of the performance. Additive blending means dense regions
  (repeated acoustic patterns) glow brighter. Drag to rotate. Color = centroid warmth (indigo =
  dark/bassy → orange = bright/treble). Demo mode runs 6 LFO-modulated oscillators that trace a
  slow Lissajous path over 30 seconds. **First prototype where audio becomes its own geometry.**

---

## Previous newest (Cycle 17)

- **[/dream/16-particle-life-gpu](/dream/16-particle-life-gpu)** — Particle Life GPU.
  9,000 particles across 6 species simulated entirely on the GPU via WGSL compute shaders —
  10× the count of `/dream/8-particle-life` (CPU, 900). Tiled N-body reduces GPU bandwidth
  64×. Additive blending creates galaxy-cluster glow; dense cores bloom white-hot, tendrils
  spiral like galactic arms. Requires WebGPU. Same audio mapping: band energy → species
  turbulence, onset → matrix reshuffle. Demo mode shows periodic reshuffles automatically.
  **10× more particles. GPU-native emergent behavior.**

---

## Previous newest (Cycle 18 — research)

- **Cycle 18 was a research sweep** (no new prototype). 6 new entries in RESEARCH.md (§16–§21).
  2 new prototype ideas added to IDEAS.md: `acoustic-trail` (3D spectral coordinate trail, buildable
  next cycle, zero deps) and `elevenlabs-compose` (streaming structured music with section control,
  needs budget approval). Ghost-animate entry updated to use Seedance 2.0 (native audio, one step).
  Strongest finding: ElevenLabs Music streaming + section control opens a genuinely different music
  generation path than MiniMax or ACE-Step.

---

## Previous newest (Cycle 16)

- **[/dream/15-webgpu-fluid](/dream/15-webgpu-fluid)** — WebGPU Fluid.
  Navier-Stokes fluid simulation at 512×512 via WebGPU render pipelines — 16× the resolution of
  `/dream/3-fluid` (WebGL2, 128×128). Uses `rgba16float` ping-pong textures natively: no extension
  flags, no Safari workaround. Same audio mapping (bass→pressure pulse, treble→turbulence,
  centroid→dye color, onset→burst). Drag to stir. Requires WebGPU; clear error message otherwise.
  **Compare side-by-side with 3-fluid** — vortex clarity difference is visible immediately.

---

## Previous newest (Cycle 15)

- **[/dream/14-typography](/dream/14-typography)** — Kinetic Typography.
  Six Resonance phrases — RESONANCE, SOUND INTO LIGHT, BODY OF MUSIC, EACH NOTE A WAVE,
  FREQUENCIES, OF BEING — cycle every 8 seconds. Each letter is a physical object assigned
  to a frequency band; bass hits scatter bass-colored letters, treble shimmer agitates
  the high-frequency ones. Spring dynamics assemble the phrase from scatter over ~1.5s.
  Demo mode runs synthetic LFO bands — immediate, no permissions. Mic input drives letter
  turbulence live. **First prototype where language itself is the visual material.**

---

## Previous newest (Cycle 14)

- **[/dream/13-piano-canvas](/dream/13-piano-canvas)** — Piano Canvas.
  Your improvisation becomes a painting. Mic input → autocorrelation pitch detection →
  each note leaves a glowing brush stroke on a persistent canvas. Pitch → hue (A4=0°,
  rotating ~60°/octave), loudness → weight (1.5–8 px), duration → length. Rising melodic
  lines arc upward; descending ones drift down. Strokes accumulate; save as PNG when done.
  Demo mode plays a silent wandering melody so the canvas paints itself automatically.
  **The first prototype where the session leaves a permanent visual artifact.**

---

## Previous newest (Cycle 13 — research)

- **Cycle 13 was a research sweep** (no new prototype). 7 new entries in RESEARCH.md,
  4 new prototype ideas in IDEAS.md. Highlights: `piano-canvas` (built Cycle 14),
  `reference-compose` (MiniMax Music 2.5 style-match, needs FAL_KEY), WebGPU desktop-universal.

---

## Previous newest (Cycle 12)

- **[/dream/12-tessellate](/dream/12-tessellate)** — Tessellate.
  A 40×28 grid of Truchet tiles whose topology rewires on every beat. Each tile is a
  quarter-arc in one of two orientations; adjacent arcs form long connected curves across
  the canvas. On a bass hit, 12% of tiles flip simultaneously — the curves disconnect and
  reconnect into entirely new paths in a flash of white. Between beats, bass energy drives
  a slower drizzle of individual tile flips. Two complementary arc colors (warm + cool)
  rotate through the spectrum; mids control saturation. Op-art aesthetic — the first
  tile-based geometric prototype in the sandbox.
  **Start demo** for immediate visuals (no permissions). **Start mic** for live audio response.
  **Reshuffle** button resets the grid topology.

---

## Previous (Cycle 11)

- **[/dream/11-terrain](/dream/11-terrain)** — Spectrogram Terrain.
  Your audio history becomes a 3D landscape: frequency on the X axis, time receding to the
  horizon on Z, amplitude as terrain height. 64 log-spaced frequency columns (30 Hz → 20 kHz),
  80 frames of time-history. Bass forms blue mountains; treble draws bright orange ridges.
  The newest frame is at your feet; the oldest fades to the horizon.
  **Start demo** for instant visuals (silent oscillators with LFO breathing). **Start mic**
  for live input — piano chords show as overtone-series ridgelines.

---

## Previous (Cycle 10)

- **[/dream/10-strange](/dream/10-strange)** — Strange Attractor + FM Synthesis.
  The Lorenz chaotic system traces a butterfly in 3D and simultaneously drives FM
  synthesis — you see **and** hear the same chaos evolve. x-position flips carrier
  pitch between low (left wing, cool blue) and high (right wing, warm orange). z-height
  shapes harmonic richness (pure sine at bottom, buzzy at top). Wing transitions are
  irregular, non-repeating melody notes — because they're deterministically chaotic.
  **Mic mode**: your volume reshapes σ, accelerating wing transitions.
  **Start demo** for instant visuals + audio (no permissions, no upload).

---

## Previous (Cycle 9)

- **[/dream/9-reaction-diffusion](/dream/9-reaction-diffusion)** — Gray-Scott
  Reaction Diffusion. Two virtual chemicals on a GPU grid create Turing patterns:
  coral, fingerprints, dividing spots, maze walls — emergent from diffusion rates
  alone. Bass raises the feed rate; treble raises the kill rate; percussive hits
  inject new seed colonies. Click the canvas to inject manually. 6 presets.
  **Start demo** for instant visuals (no permissions).

---

## Previous (Cycle 8)

- **[/dream/8-particle-life](/dream/8-particle-life)** — Particle Life. 900
  particles across 6 species governed by a random 6×6 attraction/repulsion matrix.
  Emergent flocking, predator-prey spirals, orbiting clusters — nobody programmed
  them. Audio energy injects velocity noise per species. Percussive onsets reshuffle
  the matrix mid-song. Matrix heatmap in the corner shows the current rules.
  **Start demo** for instant (no permissions). **Start mic** for live audio response.

---

## Previous (Cycle 7)

- **[/dream/7-spatial](/dream/7-spatial)** — Binaural HRTF Spatial Audio. Six
  frequency bands placed in 3-D space around you via Web Audio `PannerNode`
  (HRTF model). Default: bass front-left, treble above, sub-bass below. Drag
  any dot on the sphere to move that band. Three modes: Demo oscillators (instant),
  Mic, File upload. Wear headphones — the spatial illusion is real above ~2kHz.

---

## Previous (Cycle 6)

- **[/dream/5-arcs](/dream/5-arcs)** — Journey Arc Engine v2. Five arc types
  (Psychedelic / EDM Build-and-Drop / Cinematic / Ritual / Sleep Cycle), each
  with distinct phases, color palettes, particle behaviors, and intensity curves.
  Demo mode compresses to 60s. Phase timeline at the bottom lets you jump to any
  phase. Mic input drives particle intensity live. The right panel explains each
  arc's design rationale vs. the psychedelic baseline.

---

## Previous newest (Cycles 4–5)

- **[/dream/4-operator](/dream/4-operator)** — Operator Panel — two-pane
  live performance interface. Left: performer canvas (6 AV scenes). Right:
  scene picker, BPM tap, mic crowd-noise meter, MIDI detection. Keys 1–6
  trigger scenes; Space taps BPM. Dip-to-black transitions. MIDI notes
  C3–A3 trigger scenes via hardware.
- Cycle 4 was a research cycle (no new prototype). See RESEARCH.md for 8 findings.

- **[/dream/3-fluid](/dream/3-fluid)** — Fluid — real-time Navier-Stokes ink-in-water
  driven by audio. Bass pulses the center, treble stirs turbulence, pitch shifts dye color.
  Drag to stir manually. Ambient drift mode for no-mic use.
- Cycle 4 was a research cycle (no new prototype). See RESEARCH.md for 8 findings.

---

## Prototypes

### dashboard (/ route)
**Status**: `demoable` · **Cycle shipped**: 1 · **Last touched**: 2026-05-18

`/dream/` is now an async server component that reads `MORNING.md` and
`STATE.md` at build time. Layout: MORNING.md hero → recent cycle
stream (label, summary, when) → clickable prototype list → footer.
Phone-first, no JS required.

### 1-live
**Status**: `demoable` · **Cycle shipped**: 0 · **Last touched**: 2026-05-17

Open `/dream/1-live` on the preview URL. Click **Start mic**, allow
permission, play or hum something. Six frequency bands bloom as
concentric color fields — sub-bass deep violet at the outer edge,
high treble white-hot at the center. Onsets flash. BPM and band
levels display top-right.

Design notes: see `src/app/dream/1-live/README.md`.

---

### 2-ghost-lab
**Status**: `demoable` · **Cycle shipped**: 2 · **Last touched**: 2026-05-18

Open `/dream/2-ghost-lab`. Two modes:
- **LoRA vs no-LoRA**: same prompt, A=flux-lora (Ghost character LoRA attached),
  B=flux-dev (base model). Directly shows whether identity lock is working.
- **A/B Prompts**: two independent prompts, each with optional LoRA toggle.

Five pre-set scenes (stone chamber → root portal → underground pool → tiny planet →
cosmic ascension) with alternate camera angles. Vote buttons (👍 A / Both / 👍 B /
Neither) stored in localStorage with running tally.

Design notes: `src/app/dream/2-ghost-lab/README.md`

---

### 3-fluid
**Status**: `demoable` · **Cycle shipped**: 3 · **Last touched**: 2026-05-18

Open `/dream/3-fluid`. Click **Start mic** or **Ambient drift**. Drag to stir.

Real WebGL 2 Navier-Stokes fluid sim (128×128 RGBA16F). Bass injects radial
pressure pulses from center; treble adds turbulence splats; spectral centroid
maps to dye color (indigo → green → orange/red); onsets fire burst splats.
25 Jacobi iterations per frame for incompressibility. Filmic tone-mapped display.

Requires WebGL 2 + EXT_color_buffer_float (Chrome/Firefox/Safari 15+). Falls
back to an error message with explanation on unsupported browsers.

Design notes: `src/app/dream/3-fluid/README.md`

---

### 4-operator
**Status**: `demoable` · **Cycle shipped**: 5 · **Last touched**: 2026-05-18

Two-pane operator panel. Left: Canvas performer view with 6 AV scenes
(Void / Threshold / Bloom / Current / Ascension / Terminus). Right: scene
picker, BPM tap tempo, crowd-noise mic meter, MIDI device readout.

Keys 1–6 trigger scenes; Space taps BPM. MIDI notes C3–A3 trigger scenes
via hardware controller. Transitions use dip-to-black (350ms).

Design notes: `src/app/dream/4-operator/README.md`

### 5-arcs
**Status**: `demoable` · **Cycle shipped**: 6 · **Last touched**: 2026-05-18

Open `/dream/5-arcs`. Pick an arc tab at the top, click **Demo mode**.
The arc runs for 60 seconds; phase chips at the bottom light up as you
progress. Click any chip to jump. Start mic for live audio input.

Five arc types: Psychedelic (the current baseline, 6 phases) · EDM
Build-and-Drop (5 phases, compressed catharsis) · Cinematic (7 phases,
three-act narrative) · Ritual (4 phases, ceremony) · Sleep Cycle (5 phases,
8-hour arc that never flashes).

Design notes: `src/app/dream/5-arcs/README.md`

### 7-spatial
**Status**: `demoable` · **Cycle shipped**: 7 · **Last touched**: 2026-05-18

Open `/dream/7-spatial`. Click **Demo oscillators** (no mic/file needed) —
six sine tones play, each from a different 3D position in your headphones.
Drag colored dots on the sphere to reposition each frequency band. Try moving
"High" below your ears and "Sub-bass" above — the tones really move.
Mic and File modes split real audio into 6 spatial channels.

Design notes: `src/app/dream/7-spatial/README.md`

---

### 8-particle-life
**Status**: `demoable` · **Cycle shipped**: 8 · **Last touched**: 2026-05-18

Open `/dream/8-particle-life`. Click **Start demo** — 900 particles immediately
self-organize into emergent patterns driven by a random 6×6 attraction/repulsion
matrix. No flocking code; no goals; purely emergent. Press **reshuffle** to
randomize the matrix and watch the entire swarm re-organize.

Start mic → play something with clear percussive hits (drums, piano). Loud
onsets reshuffle the matrix automatically. The six species respond to their
corresponding audio bands — sub-bass kicks animate the violet particles, cymbal
shimmer animates the pink ones.

Matrix heatmap in the top-left corner (green=attraction, red=repulsion) shows
the current rules. FPS counter and species energy bars also displayed.

Design notes: `src/app/dream/8-particle-life/README.md`

---

### 11-terrain
**Status**: `demoable` · **Cycle shipped**: 11 · **Last touched**: 2026-05-18

64 log-spaced frequency columns × 80 time-history rows. Painter's algorithm renders back-to-front:
each row's ridge occludes rows behind it. Fake-perspective scale makes the nearest row fill the
bottom of the screen and the oldest row converge at the horizon. Two modes: demo (6 oscillators
with LFOs, silent) and mic (live FFT). Peak frequency label updates at 8 Hz.

Design notes: `src/app/dream/11-terrain/README.md`

---

### 10-strange
**Status**: `demoable` · **Cycle shipped**: 10 · **Last touched**: 2026-05-18

Open `/dream/10-strange`. Click **Start demo** — the Lorenz attractor begins tracing
its butterfly immediately, and FM synthesis starts. The carrier pitch flips between
registers as the trajectory switches wings. Watch the z readout rise and fall; you'll
hear the timbre shift from clean to buzzy in sync.

Start mic → play something or sing loud. Your RMS amplitude feeds into σ, accelerating
or decelerating the wing transitions. Loud = chaotic pitch turbulence. Quiet = the
attractor settles into longer wing visits, more sustained tones.

Design notes: `src/app/dream/10-strange/README.md`

---

### 9-reaction-diffusion
**Status**: `demoable` · **Cycle shipped**: 9 · **Last touched**: 2026-05-18

Open `/dream/9-reaction-diffusion`. Click **Start demo** — a Gray-Scott RD simulation
initializes and runs 600 warmup steps before the first frame so the pattern is
already visible. Pick a preset (Coral, Fingerprint, Spots, Stripes, Mitosis, Maze)
to switch pattern families mid-run. Click anywhere on the canvas to inject a new
activation blob and watch a colony grow from scratch.

With mic + music: bass raises feed rate (denser, more energetic patterns); treble
raises kill rate (structures become more isolated). Drum hits auto-inject blobs.

Requires WebGL2 + EXT_color_buffer_float (Chrome 56+, Firefox 51+, Safari 15+).

Design notes: `src/app/dream/9-reaction-diffusion/README.md`

---

### 20-scope
**Status**: `demoable` · **Cycle shipped**: 22 · **Last touched**: 2026-05-18

Open `/dream/20-scope`. Click **Lissajous demo** — no permissions needed. Ratio starts at
1:1 (unison, ellipse) and auto-cycles every 5 seconds through octave, fifth, fourth, sixth,
M3rd, m3rd. Watch each figure build up its CRT glow over 1–2 seconds. Click any ratio button
to jump. The phase slowly oscillates so the figure breathes between open/closed states.

Click **Phase portrait** and allow mic. Play a sustained piano note — you'll see an ellipse
with overtone loops decorating it. Play a chord — multiple loops overlap. Use the delay slider
to find the delay that gives the cleanest ellipse for the note you're playing (quarter-period
of the fundamental). Play staccato — the figure appears on the attack then fades.

Design notes: `src/app/dream/20-scope/README.md`

---

### 19-cymatics
**Status**: `demoable` · **Cycle shipped**: 21 · **Last touched**: 2026-05-18

Open `/dream/19-cymatics`. Click **Start demo** — particles scatter from the canvas center
and gradually resolve into the (1,2) Ring pattern (two diagonal node lines + an ellipse).
Watch the modes cycle every 4.5 seconds: Clover, Cross, Asterisk, Lattice, Fine Star,
Crystal, Snowflake — each pattern distinct, more intricate than the last. The transition
(scatter → resolve) takes 2–4 seconds per mode.

Click **Start mic** and play a sustained piano note. The spectral centroid maps to the
nearest mode; hold a bass note for the simpler modes, play high treble for the complex ones.
Manual mode buttons override at any time.

Design notes: `src/app/dream/19-cymatics/README.md`

---

### 18-granular
**Status**: `demoable` · **Cycle shipped**: 20 · **Last touched**: 2026-05-18

Open `/dream/18-granular`. Click **Start demo** — five LFO-modulated sine oscillators feed the
analyser silently and grains immediately begin spawning. Each dot that appears is a real grain of
audio playing through your speakers; X is where in the recent buffer it was sampled, Y is its
pitch shift. Watch the cloud breathe as the LFO mix slowly shifts.

Click **Start mic** and play piano or sing. A sustained note creates a vertical stripe (all grains
near the same buffer position, random pitch smear). A chord thickens the stripe. Staccato notes
make the cloud pulse and fade between attacks. Try: density=40, pitch=800¢ for a lush alien reverb.

Four sliders live-adjustable while running: density (grains/sec), pitch range (¢), grain size (ms),
scatter (how far from recent audio grains are allowed to sample).

Design notes: `src/app/dream/18-granular/README.md`

---

### 17-acoustic-trail
**Status**: `demoable` · **Cycle shipped**: 19 · **Last touched**: 2026-05-18

Open `/dream/17-acoustic-trail`. Click **Start demo** — six oscillators with independent LFOs
begin tracing a slow path through the acoustic feature space. The point cloud grows and the
trail curves as dominant frequencies shift. Drag to rotate the 3D view and see the path from
different angles.

Click **Start mic** and play anything — piano, voice, or drums. Single pitches trace vertical
columns; rich chords spread into clouds; bass notes pull the trail toward the Z wall; treble
content lifts it up the Y axis. The `clear` button resets the trail without stopping audio.

Design notes: `src/app/dream/17-acoustic-trail/README.md`

---

### 16-particle-life-gpu
**Status**: `demoable` · **Cycle shipped**: 17 · **Last touched**: 2026-05-18

Open `/dream/16-particle-life-gpu`. Click **Start demo** — 9,000 particles immediately
self-organize into emergent patterns driven by a random 6×6 matrix, simulated on GPU via
WGSL compute. Compare with `/dream/8-particle-life` (CPU, 900 particles) to see the
density difference. Press **reshuffle** for a new emergent pattern. With mic: loud onsets
reshuffle automatically; band energies drive per-species turbulence.

Requires WebGPU (Chrome 113+, Edge, Firefox 147+, Safari 26+).

Design notes: `src/app/dream/16-particle-life-gpu/README.md`

---

### 15-webgpu-fluid
**Status**: `demoable` · **Cycle shipped**: 16 · **Last touched**: 2026-05-18

Open `/dream/15-webgpu-fluid`. Click **Ambient drift** — fluid starts immediately. Same
controls and audio mapping as `3-fluid` but at 4× the linear resolution (512² vs 128²).
Drag to stir. "Start mic" → play piano; spectral centroid shifts dye hue in real time.

Requires WebGPU (Chrome/Edge 113+, Firefox 147+, Safari 26+). Displays a clear error on
unsupported browsers — no silent failure.

Design notes: `src/app/dream/15-webgpu-fluid/README.md`

---

### 14-typography
**Status**: `demoable` · **Cycle shipped**: 15 · **Last touched**: 2026-05-18

Open `/dream/14-typography`. Click **Start demo** — letters immediately scatter in from
random positions and spring-assemble into RESONANCE. Watch the phrase cycle every 8 seconds.
Each letter belongs to one frequency band; the LFO-driven demo bands keep letters in gentle
perpetual motion even between beats.

Click **Start mic** and play anything with rhythmic content. Bass hits scatter the violet/cyan
letters; drum attacks burst all letters radially outward. Between hits, the spring pulls them
back into the phrase. Long phrases (SOUND INTO LIGHT) become abstract particle clouds on loud
passages; short phrases (FREQUENCIES) read clearly even at high energy.

Design notes: `src/app/dream/14-typography/README.md`

---

### 13-piano-canvas
**Status**: `demoable` · **Cycle shipped**: 14 · **Last touched**: 2026-05-18

Open `/dream/13-piano-canvas`. Click **Demo mode** — a wandering piano melody plays silently
and the canvas begins painting itself. Each note leaves a glowing brush stroke; pitch sets the
hue (bass notes = cool blues/greens, treble = warm oranges/reds), loudness sets the weight,
duration sets the length. The stroke cursor drifts up for rising melodic lines and down for
descending ones.

Click **Start mic** and play piano, sing, or hum. Your improvisation accumulates as a painting.
Click **save PNG** to download.

Design notes: `src/app/dream/13-piano-canvas/README.md`

---

### 12-tessellate
**Status**: `demoable` · **Cycle shipped**: 12 · **Last touched**: 2026-05-18

Open `/dream/12-tessellate`. Click **Start demo** — a 40×28 Truchet tile grid
appears instantly. Watch the curves: they connect across the full canvas, then
rewire on each beat. Click **reshuffle** to reset the topology with a full-grid
flash. **Start mic** → play something with clear bass hits; the rewire mass-flip
fires on each onset.

Two complementary-colored arc families (primary hue + 165° offset) slowly rotate
through the spectrum over 40 seconds. With mids loud, saturation peaks and the
colors pop; with quiet audio, the arcs dim to near-black.

Design notes: `src/app/dream/12-tessellate/README.md`

---

### 6-compose `[queued — from Cycle 4 research]`
ACE-Step AI music generation: type a mood → 30s musical sketch → plays
through the fluid/live visualizer. "Compose your journey soundtrack."

### 8-particle-life `[shipped Cycle 8 — see above]`

### 9-particle-life-gpu `[queued]`
WebGPU upgrade of 8-particle-life: same physics but WGSL compute shader, 50k+
particles. Requires WebGPU (2026: 70%+ browsers). Will look like a galaxy.

### 9-ghost-sound `[queued — from Cycle 4 research]`
Ghost LoRA images + MMAudio V2 soundscaping: Ghost scenes that breathe.
Admin-only. ~$0.01/generation.

---

## How to use this sandbox

- **Don't expect production polish**. These are dreams. Some will be
  beautiful, some will be broken, all are exploratory.
- **You're in the loop.** Open a Claude Code conversation, say "what
  did you dream last night?" The assistant will summarize and propose
  directions. Tell it what to deepen / kill / add.
- **Adding ideas**: tell Claude "add this to the dream queue: ..." and
  it'll write into IDEAS.md. Next agent cycle picks it up.
- **Stopping the loop**: go to claude.ai/code/routines, disable
  "Resonance Dream Agent." Re-enable any time.

---

## Files to scan each morning

In rough order:

1. **`/dream/`** — the live dashboard (renders MORNING.md + cycles + prototypes)
2. **STATE.md** — chain of thought for each cycle
3. **INDEX.md** (this file) — prototype status board
4. **RESEARCH.md** — findings from research cycles (created cycle ~4)
5. **IDEAS.md** — full queue
