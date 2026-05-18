# Resonance Dream Sandbox — prototype index

This is the single page Karel opens each morning. It mirrors the live
index at `/dream/` (the Vercel preview URL). Click a route to play
with the prototype; click the design notes link to read the agent's
thinking.

Status legend: `skeleton` (route exists, not yet interactive) ·
`wip` (partial) · `demoable` (works, rough) · `polished` (refined).

---

## ⭐ Newest (Cycle 11)

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
