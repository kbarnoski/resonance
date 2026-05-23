# Morning digest — last updated 2026-05-23 UTC (Cycle 133)

## New since yesterday

- **[/dream/112-bio-echo](/dream/112-bio-echo)** — Bio Echo · *Cycle 133* · `demoable`
  Play piano — watch a forest grow in real time, layer by layer.
  Sub-bass grows root tendrils (violet Brownian lines from the ground up).
  Bass builds an amber trunk that only ever grows — never shrinks.
  Mid energy blooms an emerald canopy of leaf particles.
  Each onset fires a white bird arc into the sky.
  Treble fills the top 14% with star shimmer.
  Canvas never clears: after a full piece, you have a permanent forest
  portrait of that session. **Save PNG** downloads the painting.
  **Trunk gradient emerges from accumulation**: drawn at 0.18 alpha each frame,
  the base saturates quickly while the fresh-grown top stays pale —
  natural gradient with zero gradient code written.
  Zero deps · Zero API · mic optional (demo mode) · 3.6 kB.

- **[/dream/111-kids-shape-loop](/dream/111-kids-shape-loop)** — Shape Loop (kids) · *Cycle 132* · `demoable`
  Draw a closed shape → it immediately loops as a melody. Y=pitch.
  Multiple shapes layer into polyphonic music. First kids prototype
  about additive compositional layering.

## In progress / partial

- Nothing in-progress.

## Research findings worth a look

- **live-harmonize** (queued Cycle 135): play a melody → system predicts
  the harmony chord in real time. Pitch detection → chord template matching →
  4-voice OscillatorNode accompaniment panned slightly left. Distinct from
  `28-chord-canvas` (detects what IS playing) — this predicts what SHOULD
  harmonize your partial phrase. Zero deps, one cycle.
- **sph-ocean-av** (two-cycle): WebGPU SPH fluid (true Navier-Stokes, 10K+
  particles). The matsuoka-601/webgpu-ocean demo is beautiful but zero audio
  reactivity — gap is clear.
- **kids-conductor-wand** (Cycle 134): drag finger = conductor's baton.
  Y=register, speed=tempo. Four preset orchestras. First gesture-as-conductor kids
  prototype.

## Open questions for Karel

1. **Bio Echo trunk behavior**: trunk only grows (never shrinks) — is this the
   right design? Alternative: slow decay when bass fades. Current approach gives
   a cleaner permanent record but may feel "stuck" if Karel plays loud bass early.
2. **Webcam-compose rigidity**: hue→chord is deterministic (grey wall = same
   chord every time). Too rigid? Could add subtle root-note variation per frame.
3. **GEMINI_API_KEY** — still unlocks `30-lyria-jam`, `43-lyria-ghost`, `44-binaural-lyria`.
4. **`veo3-ghost` budget** — $2.00/clip (Veo 3 Fast). Good to proceed?
5. **Ball-ball collision** in `109-kids-bounce-notes`: balls pass through each other.
   Polish cycle to add collision detection?
