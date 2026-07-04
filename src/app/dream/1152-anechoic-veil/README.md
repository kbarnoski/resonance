# 1152 · Anechoic Veil

**The one question:** *What if the instrument were your STILLNESS?*

An **inverted** microphone visualizer. Every other mic piece rewards loudness;
this one rewards its absence. A luminous violet–indigo mandala fully blooms only
in **silence**, and a warm-cool drone swells the longer you stay quiet and still.
Any sound you make — measured as mic RMS — erodes and scatters the veil and thins
the drone. The control is restraint: a reward-for-quiet meditation trainer.

## References

- **John Cage, _4′33″_ (1952)** — the piece whose content is the ambient silence
  the audience brings. Here silence is not the frame but the actual instrument.
- **Pauline Oliveros, _Deep Listening_** and the anechoic-chamber tradition — the
  discipline of attending to the quietest layer of a sound field. The veil is the
  visible reward for that listening.

## How it works (subsystems)

- **Silence integrator** (`stillness.ts`) — a running `stillness` value in [0,1]
  that RISES while RMS stays below `SILENCE_THRESHOLD` (rise scales with how deep
  the silence is; ~7–8 s of held quiet to fully bloom) and FALLS sharply on any
  spike. A second `scatter` value chases instantaneous loudness for immediate
  visible erosion. True time-domain RMS via `getByteTimeDomainData`.
- **Mandala renderer** (`mandala.ts`) — a WebGL2 fragment pass (no Canvas2D) that
  ADDITIVELY accumulates concentric kaleidoscopic petal-rings, radial rays, a
  luminous core and a faint nebula. Outer rings crystallize only as stillness
  deepens; overall brightness scales with stillness; `scatter` jitters the radius
  via animated noise. Slow rotation, deep-violet → pale bloom on near-black
  `#05040c`. Per-ring phase offsets are seeded by a deterministic `mulberry32`.
- **Drone** (`_shared/psych/droneBank.ts`) — a just-intonation detuned bed routed
  through a master "swell" gain. `setDrive(stillness)` opens its filter (warm →
  cool) while the swell gain lifts it from near-silence, so the drone genuinely
  emerges from and returns to quiet.
- **Readout** (`page.tsx`) — an honest SVG ring meter shows current stillness so
  the feedback loop is learnable; it turns rose while sound is scattering the veil.
- **Input modes** — mic (real RMS), manual press-and-hold (hold = stay still =
  bloom; feeds the *same* integrator math), and an idle procedural drive that
  breathes the veil on mount before any gesture.

## Fallback

If the mic is denied or unavailable, a `text-rose-300` notice appears and the
piece drops into manual mode with a **press-and-hold "Stillness"** control that
feeds the identical integrator. There is never a dead screen: the mandala
animates from a procedural drive from the moment it mounts.

## Safety

- **No strobe.** Motion is slow rotation plus a small (≤7%) sine luminance breath.
  `prefers-reduced-motion` shrinks the breath and the rotation speed.
- **Privacy.** The microphone is analysed for level only — never recorded, stored,
  or uploaded. The analyser is not connected to the output (no feedback).
- **Determinism.** Randomness is a seeded `mulberry32`; no `Math.random` /
  `Date.now` on any hot path (`performance.now` for timing only).
- **Teardown.** On unmount: `cancelAnimationFrame`, stop all mic tracks, stop the
  drone, close the `AudioContext`, remove listeners, dispose the renderer and lose
  the WebGL context.
