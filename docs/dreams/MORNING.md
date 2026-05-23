# Morning digest — last updated 2026-05-23 UTC (Cycle 132)

## New since yesterday

- **[/dream/111-kids-shape-loop](/dream/111-kids-shape-loop)** — Shape Loop (kids) · *Cycle 132* · `demoable`
  Draw a closed shape with your finger → it immediately starts looping as a melody.
  A glowing white dot orbits the perimeter; at each small colored trigger dot, a
  pentatonic note fires. **Y position = pitch** — tall shapes produce high notes,
  flat shapes produce mid-register loops, circles produce near-constant drones.
  Draw multiple shapes and they layer into polyphonic music. Tap any shape to erase.
  Auto-close: a dashed ring shows the return target; touch it and the shape snaps closed.
  **First kids prototype about additive composition** — child constructs the music
  by drawing rather than by reacting to something.
  Zero permissions · Zero API · Zero deps · 2.84 kB.

- **[/dream/110-webcam-compose](/dream/110-webcam-compose)** — Webcam Compose · *Cycle 131* · `demoable`
  Camera image → chord in real-time. Hue → chord quality, brightness → register,
  saturation → voice count, motion → arpeggio. Demo mode (no permission needed)
  cycles through all 5 chord qualities. 4.66 kB.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- **bio-echo** (queued Cycle 133): mic → ecological canvas. bass=soil tendrils,
  mid=forest canopy particles, treble=bird arc trails. Inspired by Refik Anadol's
  DATALAND (opens June 20, 2026, LA). Zero deps, zero API, high surprise factor.
- **sph-ocean-av** (two-cycle): WebGPU SPH fluid (true Navier-Stokes, 10K+ particles)
  driven by audio. Existing WebGPU-Ocean demo (matsuoka-601) is beautiful but has no
  audio-reactivity — the gap is clear.
- **live-harmonize**: mic → pitch → predict harmonic accompaniment. Distinct from
  `28-chord-canvas` (detects what IS playing) — this predicts what SHOULD harmonize.

## Open questions for Karel

1. **Shape Loop UX**: does auto-close feel intuitive on first try? The dashed ring
   shows the target but kids might not notice it. Worth a polish to make the ring
   more visible (pulsing, brighter)?
2. **Webcam-compose rigidity**: hue→chord is deterministic (grey wall = same chord
   every time). Too rigid? Could add subtle root-note variation per frame.
3. **Ball-ball collision** in `109-kids-bounce-notes`: balls pass through each other.
   Polish cycle to add collision detection?
4. **GEMINI_API_KEY** — still unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`.
5. **`veo3-ghost` budget** — $2.00/clip (Veo 3 Fast). Good to proceed?
