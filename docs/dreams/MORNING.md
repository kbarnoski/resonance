# Morning digest — last updated 2026-05-28 UTC (Cycle 225)

## New since yesterday

- **[/dream/193-anemone-tsl](https://getresonance.vercel.app/dream/193-anemone-tsl)** — Anemone TSL (adult, Cycle 225)
  A torus-knot organism that breathes, ripples, and flutters with your music. Bass sends slow
  waves rolling across its surface; mid adds a finer wrinkle; high-mid makes it flutter. When a
  transient hits — a piano attack, a drum hit, a consonant — it bursts outward then retreats.
  Spectral centroid shifts its colour from violet (warm, bass-heavy) to cyan (cool, bright,
  treble-forward). The knot auto-rotates; you can grab and orbit it.
  **Why open this:** first prototype where a travelling wave actually travels — you can watch
  individual crests chase each other around the knot's path. The torus knot shape is also new to
  the sandbox (none of the 192 prior entries use one). Try it with piano: the bass notes make
  it breathe while the runs flutter. Demo mode included (no mic required).

- **[/dream/192-kids-magnet-notes](https://getresonance.vercel.app/dream/192-kids-magnet-notes)** — Magnet Notes (kids, Cycle 224)
  Six glowing pentatonic orbs drift on a dark canvas. When two get close, magnetic
  attraction pulls them together — their notes hum softly as a chord. When they touch:
  sparkle burst + loud chord spike. Tap any orb to kick it toward the farthest one.
  Music happens autonomously — proximity IS the chord. For kids 3+.

## Previous

- **[/dream/191-eco-bloom](https://getresonance.vercel.app/dream/191-eco-bloom)** — Eco-Bloom (adult, Cycle 223)
  L-system fractal plant grows through 4 iterations, each playing a Karplus-Strong chord.
  2,401 glowing branch segments; violet trunk → emerald tips. Auto-cycles. Patient pace.

- **[/dream/190-kids-wave-organ](https://getresonance.vercel.app/dream/190-kids-wave-organ)** — Wave Organ (kids, Cycle 222)
  Seven pipes rise from the ocean floor; wave height = which notes play. Already ringing on load.

- **[/dream/189-voice-scene](https://getresonance.vercel.app/dream/189-voice-scene)** — Voice Scene (Cycle 221)
  Speak "cosmic", "earth", "forest" → ambient scene shifts. Six environments.

## In progress / partial

- `185-score-structure` polish (dom7/dim/maj7 templates + section hysteresis) — queued Cycle 227.
- `arc-compose` (MiniMax Music 2.6 + arc journey): needs FAL_KEY availability confirmed.

## Research findings worth a look

- **Travelling-wave torus knot**: `193-anemone-tsl` opens a direction — the (p, q) parameters
  of the knot could be audio-driven. Changing p from 2 to 3 mid-performance would transform
  the shape entirely. Could be a "morph" prototype.
- **Proximity-as-chord**: `192-kids-magnet-notes` adult variant — 12 orbs spanning two octaves,
  stable orbit clusters form chords like planets in resonance.
- **Eco-bloom mic mode**: L-system branch angle spread driven by amplitude → plant changes
  shape as you play.

## Open questions for Karel

- **anemone-tsl**: want a mode where you can change the knot's (p, q) parameters with sliders?
  Or animate them slowly over time for a metamorphosis effect?
- **Magnet Notes**: gravity mode (orbs drift to the bottom, form low clusters that ring
  continuously)? Or mic mode (RMS energy → velocity kick)?
- **eco-bloom variant**: mic-reactive branch angles? Or rule picker?
- **`kids-mirror-dance`** (MediaPipe, ~8MB CDN): still needs your OK to build.
