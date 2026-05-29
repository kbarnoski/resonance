# Morning digest — last updated 2026-05-29 UTC (Cycle 238)

## New since yesterday

- **[/dream/205-kids-bubble-bath](https://getresonance.vercel.app/dream/205-kids-bubble-bath)** (Cycle 238 — kids build)
  Tap to blow a soap bubble — bubbles drift upward slowly. When two touch, they chime a harmony
  chord together (white glow at contact point). Bubbles pop at the top with a sparkle burst.
  **First kids prototype where harmony arises from spatial proximity**: tap two bubbles close
  together and they'll harmonize as they drift into each other. Soap bubble visual: crescent
  highlight + iridescent inner ring. Zero deps · zero permissions · 2.7 kB.

- **[/dream/204-anemone-av](https://getresonance.vercel.app/dream/204-anemone-av)** (Cycle 237 — adult build)
  A bioluminescent sea anemone breathing with sound. 12 tentacles, each with its own sway phase —
  bass = trunk sway, treble = tip flicker, onsets = radial pulse. First organic living 3D form
  in the sandbox. Zero new deps. Demo mode works immediately; Start Mic responds to live audio.

## In progress / partial

Nothing in-progress. All recent prototypes are `demoable`.

## Research findings worth a look

Last research sweep: Cycle 213 (**26 cycles ago** — cadence breach). Cycle 239 (adult) is the
firm research slot. Key areas: WebGPU post-iOS 26, Three.js R172+ TSL, new fal.ai models,
Houdini/TD→WebGPU ports, MediaPipe Hand Landmarker v2.

## Open questions for Karel

- **Research cadence**: lock in Cycle 239 for a full sweep regardless of queue depth?
- **Bubble Bath idea**: should bubbles gently drift *toward* each other when close (magnetic pull),
  making chords happen organically without extra taps? Easy 10-line add for Cycle 240.
- **Anemone polish**: tapered TubeGeometry tips, inner ring of 16 shorter tentacles, spore particles
  on onsets — worth a dedicated pass, or fold into next adult build?
- **Live-performance priority**: `172-loop-station` ❤️ still the only loop tool. `lyria-jam` and
  `gesture-music` are queued — should either move up?
