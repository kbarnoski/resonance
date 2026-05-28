# Morning digest — last updated 2026-05-28 UTC (Cycle 227)

## New since yesterday

- **[/dream/195-chord-canvas](https://getresonance.vercel.app/dream/195-chord-canvas)** — Chord Canvas (adult, Cycle 227)
  Real-time chord naming from mic. Play any chord → prototype reads the chroma vector,
  matches against 72 templates (major/minor/dom7/m7/maj7/dim), and displays the chord name
  in large colored text. Color encodes both pitch class (chromatic wheel) and quality
  (major=vivid, minor=desaturated, dom7=warm, dim=grey). Below: a scrolling timeline where
  each chord is a colored block sized by how long you held it.
  **Why open this:** play a ii-V-I in any key and watch the chord names appear with matching
  colors. The timeline builds a visual record of your harmonic journey — wider blocks for
  sustained chords, thin slivers for passing chords. First prototype that explicitly *names*
  what you're playing (194 prior prototypes visualized the signal; this reads the structure).
  Demo included (Dm7 → G7 → Cmaj7 → Bdim × 3).

- **[/dream/194-kids-turtle-trail](https://getresonance.vercel.app/dream/194-kids-turtle-trail)** — Turtle Trail (kids, Cycle 226)
  Four turtles wander a dark canvas leaving pentatonic trails. Trail crossings play notes.
  Tap to drop food — turtles converge, trails cross, music bursts. First prototype where
  the note trigger is spatial geometry, not a tap.

## Previous

- **[/dream/193-anemone-tsl](https://getresonance.vercel.app/dream/193-anemone-tsl)** — Anemone TSL (adult, Cycle 225)
  Torus-knot organism with GLSL travelling waves driven by bass/mid/treble. Demo included.

- **[/dream/192-kids-magnet-notes](https://getresonance.vercel.app/dream/192-kids-magnet-notes)** — Magnet Notes (kids, Cycle 224)
  Six pentatonic orbs attract each other; proximity = chord, collision = spike.

- **[/dream/191-eco-bloom](https://getresonance.vercel.app/dream/191-eco-bloom)** — Eco-Bloom (adult, Cycle 223)
  L-system fractal plant, 4 iterations, Karplus-Strong chord on each growth step.

## In progress / partial

- `185-score-structure` polish (dom7/dim/maj7 templates + section hysteresis) — queued Cycle 229.
- `arc-compose` (MiniMax Music + arc journey): needs FAL_KEY.

## Research findings worth a look

- **Chord Canvas → Diatonic Harmony**: `195-chord-canvas` detects the current chord. Natural
  next step: once the key is detected (from chord sequence), generate diatonic harmony voices
  in real time — `51-diatonic-harmony` from IDEAS.md. Zero deps, one cycle.
- **`chord-canvas` + timeline export**: the scrolling chord blocks are already duration-encoded.
  Exporting as a chord sheet (text: "Dm7 [2.2s] · G7 [2.2s] · Cmaj7 [3.0s]") would be the
  first Resonance prototype that produces a musical document from a performance.

## Open questions for Karel

- **Chord Canvas notation**: currently shows sharps only (A#, C#, etc.). Would you prefer
  flat notation for some keys (Bb instead of A#, Eb instead of D#)? Flat keys in jazz/classical
  context are standard — easy to add a key-snapped notation option.
- **`kids-mirror-dance`** (MediaPipe, ~8MB CDN): still needs your OK to build.
- **Turtle Trail crossing radius**: 11px CSS — feels right on desktop; might be small on phone.
  Want me to bump it for mobile viewports?
