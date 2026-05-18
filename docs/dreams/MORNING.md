# Morning digest — last updated 2026-05-18 UTC (Cycle 21)

## New since yesterday

- **[/dream/19-cymatics](/dream/19-cymatics)** — **open this first.**
  Sand settling into Chladni figures — the geometric standing wave patterns of a vibrating
  plate. 2000 amber particles drift and cluster onto the node lines of whichever frequency
  mode is active. Eight modes, from (1,2) "Ring" up to (5,6) "Snowflake".

  Click **Start demo** (no permissions). Particles scatter from the center and slowly
  resolve into the (1,2) pattern — a cloverleaf diagonal cross. Every 4.5 seconds the
  mode advances; particles scatter and reform into the next geometry. Watch the (3,4)
  Asterisk and (5,6) Snowflake in particular — they're intricate.

  Click **Start mic** → play a sustained piano note. The spectral centroid shifts and
  (after ~0.75s debounce) the mode changes to match. Higher notes → more complex modes.
  Single-note piano playing drives the mode selection cleanly.

  Manual mode buttons always override auto-detection.

- **[/dream/18-granular](/dream/18-granular)** — (Cycle 20, still fresh)
  Granular synthesis cloud — every grain you hear is a glowing dot on screen.

- **[/dream/17-acoustic-trail](/dream/17-acoustic-trail)** — (Cycle 19)
  Your audio in its own 3D coordinate space.

## In progress / partial

- Nothing in-progress. All 19 prototypes are demoable.

## Research findings worth a look

- **ElevenLabs Music API** — streaming + section-level composition ($0.80/min). Realizes
  `5-arcs` with actual AI-generated music per arc, streaming as it generates.
- **ReaLchords** — real-time chord accompaniment from mic melody (web demo, no API yet).
- **Three.js WebGPU + TSL** — 3D audio-reactive deforming mesh paths now viable.

## Open questions for Karel

- **`elevenlabs-compose` budget** (~$0.40–$1.10/generation for 30–85s)?
  The prototype that makes `5-arcs` real with AI-authored music.

- **`ghost-animate`** (Seedance 2.0, ~$0.05–0.15/clip, admin-only)?
  Ghost LoRA image → 15s cinematic video with native audio in one step.

- **Cymatics polish**: add audible tone at the mode's resonant frequency? Playing the
  matching note and watching sand form the pattern simultaneously is the full cymatics
  experience — currently the demo is silent. Would need to connect the oscillator to
  `actx.destination` (one line change). Worth trying?
