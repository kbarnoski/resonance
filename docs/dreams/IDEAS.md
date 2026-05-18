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

## RESEARCH BIN — agent appends here from research cycles

See RESEARCH.md for full dated entries with sources. Key findings from Cycle 4 (2026-05-18):

- ACE-Step music generation on fal.ai ($0.0002/s) — text → coherent music in 20s
- MMAudio V2 ($0.001/s) — video + text → synchronized ambient audio
- WebGPU at 70% browser coverage — compute shaders without extension flags, 1M+ particles
- HRTF binaural PannerNode spatial audio — no-dep 3D sound placement in browsers
- Strange attractor synthesizer pattern — attractor xyz coords drive FM modulation
- Gray-Scott RD implementations in WebGL — no audio version found, opportunity exists
- Network bending for diffusion models — audio-reactive content generation (not just color)
