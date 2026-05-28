# Morning digest — last updated 2026-05-28 UTC (Cycle 231)

## New since yesterday

- **[/dream/198-osc-composer](https://getresonance.vercel.app/dream/198-osc-composer)** (Cycle 231 — adult build)
  — Oscilloscope Composer. Design a Lissajous figure — then download the stereo WAV
  file that *draws* it. Two sine oscillators at `n×220 Hz` (left channel) and `d×220 Hz`
  (right channel) trace an X–Y figure that matches the canvas preview exactly.
  Seven frequency ratios (Unison → Minor 7th), Phase 0–360°, X/Y balance, traveling dot,
  five presets (Circle, Figure-8, Trefoil, Rose, Starburst).
  Puzzle mode: match a ghost target by ear and eye. ↓ WAV button generates a
  5-second 44.1 kHz stereo file in pure JS — no server, no permissions, works offline.
  Play the file on a real oscilloscope in XY mode and the waveform draws itself.
  *Why open this:* The download IS the art. The audio doesn't describe the shape — it IS the shape.

- **[/dream/197-kids-rain-chain](https://getresonance.vercel.app/dream/197-kids-rain-chain)** (Cycle 230 — kids build)
  — Rain Chain. Five pentatonic cups in a staircase. Rain fills the biggest
  cup (C3, violet, top-left) first. When it overflows, a glowing water stream
  arcs into the next cup, ringing a bell 0.22s later. Five-note ascending
  arpeggio C3→E3→G3→A3→C4 emerges from gravity and overflow physics.
  Tap anywhere for a rain burst; drag for sustained downpour.
  *Why open this:* The melody isn't scripted — the staircase IS the scale.

## In progress / partial

Nothing in progress. Next cycle (232) is kids — candidates:
- `kids-glow-bug` (fireflies that land on plants and ring notes; tap to release more)
- `197-kids-rain-chain` cascade-delay polish (Karel's preferred timing)

## Research findings worth a look

Nothing new this cycle (build cycle).

## Open questions for Karel

- **198-osc-composer**: The WAV download produces a real oscilloscope music file.
  If you have access to a hardware oscilloscope (or Lissajous app), try playing the
  WAV in XY stereo mode — the waveform should trace the figure on screen.
- **197-kids-rain-chain**: Does the 0.22s cascade delay feel right as an arpeggio,
  or would you prefer slower (0.35s = more deliberate) or faster (0.15s = more of
  a chord burst)? Currently the five-note arpeggio takes ~0.88s total.
- **195-chord-canvas**: ♭/♯ toggle defaults to sharps (F#m). One tap flips all
  blocks to flats (Gbm). Does the default feel right, or prefer a persistent choice?
