# Morning digest — last updated 2026-05-28 UTC (Cycle 226)

## New since yesterday

- **[/dream/194-kids-turtle-trail](https://getresonance.vercel.app/dream/194-kids-turtle-trail)** — Turtle Trail (kids, Cycle 226)
  Four glowing turtles wander a dark canvas. Each leaves a colored trail (violet/teal/amber/rose
  = C3/E3/G3/A3 pentatonic). When a turtle crosses another's trail, it plays its note. Tap
  anywhere to drop a golden food treat — all turtles steer toward it, their converging paths
  create crossing clusters → brief musical burst.
  **Why open this:** watch it for 30 seconds without touching — the turtles naturally intersect
  each other's trails and the notes emerge on their own. Then tap a few times to direct them.
  The music is in the geometry, not in your fingers. First kids prototype where trail crossing
  triggers sound (193 prior prototypes all require a tap for a note event). Zero permissions.

- **[/dream/193-anemone-tsl](https://getresonance.vercel.app/dream/193-anemone-tsl)** — Anemone TSL (adult, Cycle 225)
  Torus-knot organism with GLSL travelling waves. Bass rolls slowly across the surface; mid
  wrinkles it; high-mid makes it flutter. Try with piano: the knot breathes with your bass
  notes and flickers with fast runs. Demo mode included. First torus-knot geometry in sandbox.

## Previous

- **[/dream/192-kids-magnet-notes](https://getresonance.vercel.app/dream/192-kids-magnet-notes)** — Magnet Notes (kids, Cycle 224)
  Six pentatonic orbs drift and attract; notes hum as chords on proximity, spike on collision.
  Autonomous — just watch the magnets find each other.

- **[/dream/191-eco-bloom](https://getresonance.vercel.app/dream/191-eco-bloom)** — Eco-Bloom (adult, Cycle 223)
  L-system fractal plant grows through 4 iterations, each playing a Karplus-Strong chord.

- **[/dream/190-kids-wave-organ](https://getresonance.vercel.app/dream/190-kids-wave-organ)** — Wave Organ (kids, Cycle 222)
  Seven pipes rise from the ocean floor; wave height = which notes play. Already ringing on load.

## In progress / partial

- `185-score-structure` polish (dom7/dim/maj7 templates + section hysteresis) — queued Cycle 227.
- `arc-compose` (MiniMax Music + arc journey): needs FAL_KEY availability confirmed.

## Research findings worth a look

- **Turtle Trail adult variant**: 12 turtles spanning two octaves, smaller crossing radius
  (7px) for denser music — closer to a generative composition than a kids toy. Could become
  `195-turtle-field`.
- **Trail-as-score**: the trail left by `194-kids-turtle-trail` is visually a "score" —
  each crossing is a note event. Recording the turtle trajectories and replaying them as
  a MIDI file could be a demo of Resonance's recording/export concept.
- **Proximity-as-chord adult variant** (from `192-kids-magnet-notes`): 12 orbs at chromatic
  pitches, orbits governed by consonance-vs-dissonance gravity. Simple ratios attract,
  complex ratios repel. Clusters = chords; orbit resonances = modes.

## Open questions for Karel

- **Turtle Trail**: crossing radius is 11px CSS — feels right on desktop; might be too small
  on a phone (turtles glide past each other without triggering). Want me to increase it for
  mobile, or do you like the sparse character?
- **anemone-tsl knot morphing**: still interested in a (p, q) slider that transforms the
  knot shape live? Or auto-animate slowly over the session for a metamorphosis effect?
- **`kids-mirror-dance`** (MediaPipe, ~8MB CDN): still needs your OK to build.
