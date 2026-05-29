# Morning digest — last updated 2026-05-29 UTC (Cycle 236)

## New since yesterday

- **[/dream/203-kids-lantern-launch](https://getresonance.vercel.app/dream/203-kids-lantern-launch)** (Cycle 236 — kids build)
  — **Lantern Launch.** Tap the dark starry sky to release a glowing paper lantern. It
  drifts upward with a gentle sway. When it floats off the top it plays a bright bell
  chime and scatters sparkles. Pitch follows horizontal position (left = low C3/violet,
  right = high C4/cyan — pentatonic, no wrong notes). Up to 8 lanterns in the sky at once.
  **First prototype where the sound fires at the END of a journey** — 5–10 seconds of
  floating before the reward. Extends the `166-kids-lantern` ❤️ motif you loved.
  Two demo lanterns pre-spawn so the sky is alive before first touch.

- **[/dream/202-membrane-drum](https://getresonance.vercel.app/dream/202-membrane-drum)** (Cycle 235 — adult build)
  — **Membrane Drum.** A circular drumhead simulated with the 2D wave equation (64×64 grid).
  Tap anywhere to excite a Gaussian displacement; the wave radiates outward, reflects off
  the fixed rim, and forms blue/amber standing patterns. Six oscillators tuned to Bessel
  zero ratios (the inharmonic overtones of a real drum). Off-centre strikes bring out
  asymmetric modes; centre strikes breathe. Tension and damping sliders. Physics as music.

## In progress / partial

Nothing marked WIP.

## Research notes

- Cycle 237 (adult) is a **strong candidate for a full research sweep** — last sweep was
  Cycle 213, now 24 cycles ago. Many IDEAS.md entries are 2026-05-18 vintage. Fresh scan
  recommended especially for: WebGPU new releases, recent fal.ai models, SIGGRAPH 2026
  previews, TouchDesigner / Houdini community highlights since May.
- Alternative to research: `param-layer` (DEMON-inspired 4-ring hierarchical timbre synth,
  queued in IDEAS.md, one-cycle build).

## Open questions for Karel

- **Lantern chime timing**: current exit is triggered when the lantern is fully above the
  top edge (~5–10s at 22px/sec). Would you prefer a sooner trigger (e.g., when the lantern
  reaches the top 25% of the canvas) so the chime happens while it's still partially visible?
- **Membrane Drum**: worth adding a faint concentric ring overlay showing Bessel mode zones
  (centre = symmetric modes, midway = mixed, near rim = asymmetric)? Makes the "where you
  strike changes the timbre" discovery more deliberate.
- **Research vs. build for Cycle 237?** IDEAS queue has 40+ entries, so the queue isn't thin.
  A research sweep is about freshness — catching what's shipped in the last 6 weeks. Your call.
