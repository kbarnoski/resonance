# 47-mood-journey — Design notes

**Question answered:** What if the music could walk you from how you feel now to how you want to feel, without you doing anything?

## Concept

`38-mood-xy` is a manual instrument — you drag the dot and the music follows. `47-mood-journey` takes the same synthesis engine and removes the manual control. You place two dots (Now, Goal), pick a duration, and press Begin. The dot glides from Now to Goal over the selected time. The music changes continuously — you surrender control to the arc.

This is the "proactive music therapy" model (RESEARCH.md §84): instead of responding to your input, the system generates a predefined trajectory intended to move you toward a target emotional state. Three Frontiers 2026 papers validated this approach as significantly more effective than open-ended listening.

## Two audio layers (simultaneously)

**Mood synthesis** (from `38-mood-xy`):
- Triangle-wave oscillators through a lowpass filter
- Arousal controls: BPM (40–140), voice count (1–4), register (C3–C5), attack (0.8s pads → 0.04s staccato), arpeggio (when energetic)
- Valence controls: chord quality (major/minor/dim), filter brightness (400–5000 Hz), note sustain length

**Isochronic tones** (from `42-binaural`):
- 200 Hz carrier, amplitude modulated at the brainwave frequency for current arousal
- δ 2 Hz (very calm), θ 6 Hz (meditative), α 10 Hz (relaxed), β 16 Hz (focused)
- LFO frequency glides with `setTargetAtTime(..., 4)` — 4-second time constant for perceptible but smooth transitions
- Works on speakers; no headphones required (unlike binaural beats)

The two layers are complementary: mood synthesis provides the harmonic/rhythmic context, isochronic tones provide the psychoacoustic entrainment. At α 10 Hz, you hear a sustained 10 BPM chord tremolo alongside warm minor pads at ~70 BPM.

## The traversal

Linear interpolation from Now to Goal over the selected duration. Position updates every animation frame (~16ms). The music doesn't update in discrete steps — it flows continuously. At the midpoint of a "distressed → content" journey, the audio is genuinely between the two states: medium BPM, mixed chord quality, moderate filter brightness.

## Canvas

- Quadrant gradient: energetic+happy=amber, energetic+sad=purple, calm+happy=teal, calm+sad=navy
- NOW dot (yellow): where you started; visible during setup, hidden once journey begins
- GOAL dot (green, dashed ring): destination; always visible
- Dashed path line: remaining path from current position to goal
- Blue trail: every position visited, accumulated over the journey
- Glowing dot: current position; hue tracks position angle on the circumplex

## Open polish ideas

- **Arc shape**: linear is the simplest path. A curve through an intermediate "arousal peak" would let you traverse calm+sad → energetic → calm+happy (adding energy before releasing it). The proactive therapy papers often use non-linear arcs.
- **Waypoint system**: like `45-guided-session`, let Karel define multi-step paths (e.g., distressed → focused → serene) with named waypoints.
- **Mic amplitude feedback**: louder playing → slightly increase arousal (you're energized by your own playing). Soft playing → accelerate the descent toward calm.
- **Journal**: same localStorage-per-position journal from `42-binaural` — capture what you notice as the journey crosses each quadrant.
- **Preset journeys**: "Morning activation" (serene → focused), "Evening wind-down" (focused → serene), "Creative flow" (scattered → energetic+happy), "Sleep prep" (stressed → deep rest).

## Architecture

The chord scheduler is a recursive `setTimeout` that reads from refs at call time — exact same pattern as `38-mood-xy`. The isochronic LFO frequency updates via `setTargetAtTime` in the RAF loop. Both layers share a master `GainNode` → destination chain with a lowpass filter in the mood synthesis path.

The RAF loop runs only when `phase === "journey"` and cleans up on phase exit. Position updates happen in the RAF; the scheduler runs on its own `setTimeout` cadence. Both read `progressRef.current` + `nowRef.current` + `goalRef.current` via refs (no stale closures).
