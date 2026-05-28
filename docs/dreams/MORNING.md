# Morning digest — last updated 2026-05-28 UTC (Cycle 219)

## New since yesterday

- **[/dream/187-shepard-tone](https://getresonance.vercel.app/dream/187-shepard-tone)** — Shepard Tone
  The auditory illusion of the endless staircase: a pitch that rises forever without ever getting
  higher. Eight sine tones (A1–A8) rise together, weighted by a bell curve so the extremes are
  inaudible — the brain only hears the weighted center, which climbs endlessly. No mic needed
  to start; just click Start and listen for ~10 seconds. Try: Rising → Falling mid-play.
  Try: Freeze mid-ascent — you get a dense A5 chord. Try: Mic mode while playing piano loudly.
  **Why open this:** it's the first prototype that doesn't just *visualize* audio — it reveals
  how your brain *constructs* pitch from physical signals, and then deliberately tricks it.
  Connects to Resonance's transcendent listening thesis: what you hear is not what is happening.

## Previous (Cycle 218 — kids)

- **[/dream/186-kids-breath-bloom](https://getresonance.vercel.app/dream/186-kids-breath-bloom)** — Breath Bloom
  A breathing flower with 5 pentatonic petals that animates before any tap. First kids prototype
  with autonomous motion on load.

## In progress / partial

- `185-score-structure` polish queued (cycle 221): add dom7/dim/maj7 chord templates +
  section hysteresis to prevent rapid label flips. Currently only major/minor templates.
- `kids-glow-bug` prototype queued for cycle 220 (kids build).

## Research findings worth a look

- Nothing new this cycle (build cycle). Next research cycle should scan psychoacoustics:
  Risset rhythm (tempo equivalent of Shepard), Deutsch scale illusion, tritone paradox —
  all zero-dep browser-buildable follow-ups to today's prototype.

## Open questions for Karel

- `185-score-structure`: Is adding dom7/dim templates worth a cycle, or is major/minor "good enough"?
- `anemone-av` (Three.js organic bioluminescent 3D form): worth queuing for cycle 221?
  Zero new deps, live performance aesthetic.
- `osc-composer` (design a Lissajous figure → stereo WAV): the downloadable WAV is the
  "artifact" equivalent of `13-piano-canvas`'s painting. Interest level?
