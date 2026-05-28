# Morning digest — last updated 2026-05-28 UTC (Cycle 224)

## New since yesterday

- **[/dream/192-kids-magnet-notes](https://getresonance.vercel.app/dream/192-kids-magnet-notes)** — Magnet Notes (kids, Cycle 224)
  Six glowing pentatonic orbs drift on a dark canvas. When two get close, magnetic
  attraction pulls them together — their notes hum softly as a chord. When they touch:
  sparkle burst + loud chord spike. Tap any orb to kick it toward the farthest one.
  **Why open this:** the music happens autonomously — no tapping required. Proximity IS
  the chord. First kids prototype where you can sit still and the canvas sings itself.
  Physics are elastic-collision real (not spring), and color-gradient lines appear between
  attracted pairs (line color = blend of both notes' hues). For kids 3+.

- **[/dream/191-eco-bloom](https://getresonance.vercel.app/dream/191-eco-bloom)** — Eco-Bloom (adult, Cycle 223)
  L-system fractal plant grows through 4 iterations, each playing a Karplus-Strong chord.
  2,401 glowing branch segments; violet trunk → emerald tips. Auto-cycles. Patient pace.

## Previous

- **[/dream/190-kids-wave-organ](https://getresonance.vercel.app/dream/190-kids-wave-organ)** — Wave Organ (kids, Cycle 222)
  Seven pipes rise from the ocean floor; wave height = which notes play. Already ringing on load.

- **[/dream/189-voice-scene](https://getresonance.vercel.app/dream/189-voice-scene)** — Voice Scene (Cycle 221)
  Speak "cosmic", "earth", "forest" → ambient scene shifts. Six environments.

## In progress / partial

- `anemone-av`: Three.js organic bioluminescent 3D form (TSL displacement) — deferred 3×.
  Queued for Cycle 225 adult build.
- `185-score-structure` polish (dom7/dim/maj7 templates + section hysteresis).

## Research findings worth a look

- **Proximity-as-chord** direction: `192-kids-magnet-notes` and `149-kids-color-mix` both
  use overlap/proximity for harmony. A natural next step: adult version with 12 orbs spanning
  two octaves, where stable orbit clusters form chords (like planets in resonance).
- **Eco-bloom generative score**: L-system rules are the composition. Next step: let Karel
  choose the production rule, angle, or iteration count → instant new plant-score.

## Open questions for Karel

- **Magnet Notes**: want a gravity mode (slow pull downward clusters orbs at bottom, always
  ringing)? Or mic mode (RMS → random orb velocity kick, so music moves with your playing)?
- **anemone-av**: Three.js 3D form deferred three cycles. Build it next adult cycle, or prefer
  something else from the queue (spectral-morph, loop-station polish, arc-compose)?
- **eco-bloom variant**: mic mode where amplitude → branch angle spread? Or rule picker?
- **`kids-mirror-dance`** (MediaPipe, ~8MB CDN): still needs your OK to build.
