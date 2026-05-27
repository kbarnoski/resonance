# Morning digest — last updated 2026-05-27 UTC (Cycle 211)

## New since yesterday

- **[/dream/180-cellular](https://getresonance.vercel.app/dream/180-cellular)** — Cellular (adult, Cycle 211)
  Conway's Game of Life on a 64 × 16 grid. Each column is a pitch (C2→C5). Every Life generation
  tick fires triangle-wave notes for all columns with a live cell. The spatial pattern IS the music.
  **Why open it**: hit **Glider** — a small diagonal pattern traces a rising 4-note melody that
  walks rightward across the screen and then vanishes in silence. Hit **R-pent** — 5 cells evolve
  for 1,103 generations of unpredictable jazz-like phrases. Hit **Pulsar** — a symmetric oscillator
  that loops the same balanced chord indefinitely. Then: BPM to 120, hit Random, and watch a dense
  population self-organize into rhythmic clusters.
  Click/drag the grid to draw your own Life patterns. Left side = bass, right side = treble.
  Zero permissions · Zero API · Zero deps · 3.02 kB.

- **[/dream/179-kids-voice-monster](https://getresonance.vercel.app/dream/179-kids-voice-monster)** — Voice Monster (kids, Cycle 210)
  Hum/sing to feed a glow-monster (30s). It sings back the distinct pitches it detected.
  "Try demo" button shows the full cycle without a mic. First kids prototype with character memory.

- **[/dream/178-splat-bloom](https://getresonance.vercel.app/dream/178-splat-bloom)** — Splat Bloom (adult, Cycle 209)
  500 Gaussian-distributed screen-blended ellipses. Dense centre blooms to white. Try with live mic.

## In progress / partial

- Nothing in-progress. Next queued:
  - **Cycle 212 (kids)** → `kids-texture-drum` — five material zones (wood/metal/water/earth/glass)
    each with a distinct synthesized timbre. First kids prototype about timbre, not pitch.
  - **Cycle 213 (adult)** → Research sweep (Cycle 203 was last, now 10 cycles ago — overdue).
    Or build: `gesture-music` (webcam hands → synth), `chord-canvas` (chord detection + color
    timeline), or `voice-scene` (Web Speech API → AV mode switching, zero deps).

## Research findings worth a look

- **Conway Life acoustics** (Cycle 211 observation): symmetric Life patterns are acoustically
  symmetric — Pulsar's mirrored clusters play identical pitches simultaneously. Gliders produce
  a pitch arc as they move through the frequency space. The geometry of Life = the structure
  of the melody. This was surprising enough to be worth a future research pass specifically on
  cellular-automaton music systems.

## Open questions for Karel

- **Cellular / toroidal grid**: the current grid has hard edges — gliders die when they reach the
  boundary. A toroidal (wrap-around) grid would let gliders travel forever, creating infinite
  repeating phrases. Trivial to add — want it?
- **`gesture-music`**: still waiting on Karel OK for ~8MB MediaPipe WASM from jsDelivr CDN.
  Webcam hands → pitch/reverb/percussion. Genuinely different from all 180 existing prototypes.
- **Research cadence**: last research was Cycle 203 (now 8 cycles ago). Plan to do a research
  sweep at Cycle 213 unless Karel directs otherwise.
