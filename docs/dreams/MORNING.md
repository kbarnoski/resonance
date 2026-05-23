# Morning digest — last updated 2026-05-23 UTC (Cycle 138)

## New since yesterday

- **[/dream/116-kids-bloom-garden](/dream/116-kids-bloom-garden)** — Bloom Garden (kids) · *Cycle 138* · `demoable`
  **Press and hold** anywhere to plant a glowing flower. It blooms from a bud
  over 650ms, plays a sustained pentatonic note (X=pitch: violet/low left →
  rose/high right). After 10 seconds it **seeds itself** — petals scatter as
  sparkles and a new bud sprouts 30–62px away, inheriting the pitch ±1 step.
  **Tap any flower to burst it.** Up to 12 flowers; the garden slowly
  self-organizes into harmonic clusters over 3–4 minutes as seeds drift ±1 each
  generation.
  Zero permissions · Zero API · Zero deps · 3.17 kB.
  **"The most contemplative kids prototype yet — designed for quiet play before
  sleep."** Different from all prior kids builds: the gesture is a *hold* (not
  a tap), the music is *sustained* (not a single note event), and the garden
  *acts without you* (self-seeding means it keeps changing when you stop
  touching).

- **[/dream/115-kids-weather-music](/dream/115-kids-weather-music)** — Weather Music (kids) · *Cycle 136* · `demoable`
  Touch anywhere on the screen — you're inside that weather. Drag between
  zones to blend four atmospheric music engines. Multi-touch blends both
  simultaneously. Zero permissions · Zero deps · 3.48 kB.

## Cycle 137 — research sweep (adult)

6 new prototype seeds added to IDEAS.md and RESEARCH.md §191–§196:

1. **`data-cosm`** (zero deps, zero API, one cycle) — Ryoji Ikeda aesthetic.
   Synthetic particle event stream: scrolling monospace matrix + sub-bass sine
   tones. Three auto-advancing scales (Quantum → Biological → Cosmic).
   **Queued for Cycle 139.**

2. **`poem-fluid`** — WebGL Navier-Stokes fluid + Markov text overlay keyed to
   vorticity (Memo Akten / Whitney Artport 2026 paradigm). Still water = full
   sentence; turbulence = single word.

3. **`image-chord`** — Drag any image → hue/saturation/brightness maps to chord
   quality / harmonic richness / register. 8 journey-theme swatches. Inspired by
   Mozualization (Apr 2026).

4. **`arc-steer`** (FAL_KEY) — 6-phase journey arc via 6 sequential ACE-Step
   calls. ~$0.036/journey.

5. **`audio-cloud`** (WebGPU, 2 cycles) — 6 particle species × FFT bands,
   distinct physics per species. Elekktronaut TD particlesGPU technique.

6. **`body-conductor`** (CDN ~8MB, needs your OK) — MediaPipe PoseLandmarker:
   full-body dance → synthesizer. Wrist Y=pitch, arm span=stereo, body speed=dynamics.

## In progress / partial

- Nothing in-progress.

## Open questions for Karel

1. **`data-cosm` vs `poem-fluid` for Cycle 139** — both zero deps, one cycle.
   `data-cosm` = more visually striking / surprising (Ikeda aesthetic, completely
   new to the sandbox). `poem-fluid` = more emotionally resonant (Ghost narrative
   + fluid). Which calls to you?
2. **`body-conductor` CDN dep** — MediaPipe ~8MB, CDN-loaded. Good to proceed?
3. **`arc-steer` spend** — 6 × ACE-Step 30s ≈ $0.036/run. Good to proceed?
4. **GEMINI_API_KEY** — unlocks `30-lyria-jam`, `43-lyria-ghost`. Any update?
5. **`veo3-ghost` budget** — $2.00/clip (Veo 3 Fast). Still waiting for OK.
