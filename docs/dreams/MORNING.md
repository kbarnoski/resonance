# Morning digest — last updated 2026-05-25 UTC (Cycle 187)

## New since yesterday

- **[/dream/159-synesthetic-sketch](https://getresonance.vercel.app/dream/159-synesthetic-sketch)** —
  Synesthetic Sketch (adult). **Why open this**: it's the first prototype where music maps to
  *shape*, not just color. Sustained piano note → violet circles accumulate. Play a chord →
  hexagons with inner rings. Strum or use percussion → star bursts + sparks. After 5 minutes
  the canvas fills into a luminous nebula — a visual record of what you played and *how complex
  it was*. Additive blending makes overlap areas glow. **Demo mode shows the shape transitions
  without mic**: watch circles morph into hexagons and stars as the LFOs cycle.
  Try: play a single held note (circles) then a full chord (hexagons) then a cluster or
  strum (star bursts). The shape legend is visible before you start.
  Zero API · Zero deps · Download PNG at any time.

- **[/dream/158-kids-hum-paint](https://getresonance.vercel.app/dream/158-kids-hum-paint)** —
  Voice Painting (kids, Cycle 186). Voice → colored glowing trail; ▶ Hear it! replays as melody.
  First kids prototype where the voice replaces touch. Demo mode auto-draws Twinkle Twinkle.

## In progress / partial

- Nothing in-progress. Cycle 188 is next (kids cycle, 188%2=0).

## Research findings worth a look

- **Shape = acoustic fingerprint**: in `159-synesthetic-sketch`, a session's shape distribution
  is directly readable. A jazz improvisation (harmonically rich, many bands active) will fill the
  canvas with hexagons and stars. A meditation session (single piano tones, no chords) will fill
  it with circles. The download artifact encodes what KIND of music was played, not just that
  music was played.
- **Additive blending surprise**: overlapping objects at `lighter` composite produce color mixing
  that's visually beautiful and acoustically meaningful — where two violet circles overlap
  they become brighter violet (same pitch played twice at the same register). Where a violet
  circle and a rose circle overlap they blend toward white (bass + treble simultaneously).

## Open questions for Karel

- **`159-synesthetic-sketch` — object deposition rate**: currently 15 objects/sec at full
  amplitude. If the canvas fills too fast on dense playing, I can halve it (every 8 frames).
  If it's too sparse on quiet playing, the gate (amplitude > 0.10) can be lowered. Let me know
  after you try it.
- **`159-synesthetic-sketch` — shape placement**: objects are placed uniformly at random.
  One alternative: scatter them radially from the canvas center (centroid radius = amplitude).
  Would create a more organized composition. Want me to try it?
- **`154-kids-clap-back` pattern dots**: still deferred. Cycle 188 is the kids cycle —
  I'll ship it then (10-line polish).
- **Cycle 189 adult candidates**: `diatonic-harmony` (detect your key live, generate diatonic
  3rd + 5th harmony voices alongside your melody, zero deps) or `tap-rhythm` (clap a rhythm,
  get a step sequencer). Any preference?
