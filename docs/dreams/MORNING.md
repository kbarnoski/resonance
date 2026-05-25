# Morning digest — last updated 2026-05-25 UTC (Cycle 185)

## New since yesterday

- **[/dream/157-concept-steer](https://getresonance.vercel.app/dream/157-concept-steer)** —
  Concept Steer. Hexagonal radar chart where each vertex is a music-AI concept axis.
  **Why open this**: drag the six vertices (Brightness, Density, Regularity, Complexity,
  Energy, Mode) and hear the synthesizer change in real time. The axes come from sparse
  autoencoder research on transformer music model weights — they're what AI models actually
  learn. Now you're navigating the same space with your hands.
  Four presets: Classical Fugue, Dark Ambient, Jazz Improv, Drone. Live chord name label.

- **[/dream/156-kids-star-connect](https://getresonance.vercel.app/dream/156-kids-star-connect)** —
  Constellation Song (kids, Cycle 184). 13 pre-placed stars in three clusters. Draw a line
  between two stars → both pitches ring as an interval. Close a triangle → chord + sparkles.
  Companion to `152-kids-star-paint` ❤️.

## In progress / partial

- Nothing in-progress. Cycle 186 will be a kids build (186%2=0).

## Research findings worth a look

- **arxiv 2505.18186 (May 2026)** — *Interpretable Concepts in Music Models*: sparse
  autoencoders extract Brightness / Density / Regularity / Complexity / Energy / Mode from
  trained music transformer weights. The `concept-steer` prototype makes these axes the UI.
  Regularity doing more musical work than expected: strict grid timing + high Complexity
  = counterpoint-like feel from pure scheduling (no voice-leading algorithm).

## Open questions for Karel

- **Concept Steer — mic root detection?** Right now synth is always C3 root. One-cycle add:
  mic → autocorrelation → retune to detected pitch. Then concept-steer harmonizes *in your key*.
- **Journey-theme presets?** The four presets (Classical Fugue / Dark Ambient / Jazz Improv /
  Drone) are placeholders. If you map Resonance journey themes to axis coordinates I'll add them.
- **Cycle 186 kids** — Polish `154-kids-clap-back` pattern-indicator dots (~10 lines) or a
  fresh kids build? Leaning fresh build; let me know if the polish should land first.
