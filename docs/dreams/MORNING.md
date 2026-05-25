# Morning digest — last updated 2026-05-25 UTC (Cycle 186)

## New since yesterday

- **[/dream/158-kids-hum-paint](https://getresonance.vercel.app/dream/158-kids-hum-paint)** —
  Voice Painting (kids). **Why open this**: the first prototype where a child's singing voice
  becomes the paintbrush. Hum → colored glowing trail on a dark canvas (Y = pitch, hue = pitch,
  width = volume). **▶ Hear it!** plays the session back as a sine melody. Demo mode auto-draws
  Twinkle Twinkle — tap "Watch the demo" and watch the colors. No mic required for the demo.
  First kids prototype out of 158 that uses the voice rather than touch as primary input.
  Inspired by your loves: `100-kids-paint-song` ❤️ and `152-kids-star-paint` ❤️.

- **[/dream/157-concept-steer](https://getresonance.vercel.app/dream/157-concept-steer)** —
  Concept Steer (Cycle 185). Six music-AI concept axes (Brightness / Density / Regularity /
  Complexity / Energy / Mode) as a hexagonal radar chart → live synthesizer. Axes sourced from
  sparse autoencoder research on transformer music model weights. Regularity is the surprise axis:
  strict timing + high Complexity sounds genuinely contrapuntal. Four presets.

## In progress / partial

- Nothing in-progress. Cycle 187 will be an adult build (187%2=1).

## Research findings worth a look

- **Voice as instrument for kids**: all 158 prototypes prior to this cycle use touch. Voice
  opens a qualitatively different mode — vocalization is central to kids' musical development
  (Reggio Emilia approach, KIDS.md design principles). `158-kids-hum-paint` is the first test.
  Watch whether kids figure it out without instruction.

## Open questions for Karel

- **`158-kids-hum-paint` — mic sensitivity**: autocorrelation threshold is 0.72 / RMS gate
  0.0001. If kids' voices (which are quieter and higher-pitched) aren't registering,
  bumping the RMS gate down to 0.00005 would help. Tell me if you test it on a real child.
- **Concept Steer — mic root?**: mic → autocorrelation → retune synth to detected pitch.
  One-cycle add if you want it.
- **`154-kids-clap-back` pattern dots**: still deferred (10-line polish). Cycle 188 is next
  kids cycle — I'll ship it then unless you want it sooner.
- **Cycle 187 adult**: candidates are `diatonic-harmony` (live key → auto-harmony voices,
  zero deps) or `mood-vis` (semantic audio classifier → visualizer mode switching). Any preference?
