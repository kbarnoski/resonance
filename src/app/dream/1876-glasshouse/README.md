# 1876 — Glasshouse

**A self-portrait of the machine you're on.** No microphone, no camera, no
uploaded file. The only input is the browser's own live self-telemetry, turned
in real time into a continuous, stylistically-coherent piece of music **and** a
dithered field of signal-noise that pushes and breaks as the machine works
harder.

## The one question

What if your device sang its own inner life? What if the live telemetry of the
very machine you're on — its frame stutter, memory pressure, network weather,
battery drain, and the entropy of your own mouse — became a continuous, coherent
groove that intensifies with load, and a chromatic dither field that tears when
the device strains and settles when it's calm?

## The tag line

- **input:** system-telemetry only (Performance API + navigator + pointer). No
  mic, camera, or keyboard-as-instrument.
- **output:** three.js — a dithered `THREE.Points` field (Bayer 4×4 ordered
  dither + per-channel chromatic offset in a custom `ShaderMaterial`).
- **technique:** telemetry → continuous, coherent, never-repeating generative
  music that intensifies with machine load.
- **vibe:** machine self-portrait / monitoring-as-music.

## What it samples (all real, all free, all client-side)

- **Frame timing / jank** — `requestAnimationFrame` delta each frame gives
  instantaneous FPS and a rolling jitter/variance metric. Rising jank = rising
  tension.
- **Memory pressure** — `performance.memory.usedJSHeapSize / jsHeapSizeLimit`
  where present (Chromium). Absent elsewhere → the readout hides, engine adapts.
- **Network weather** — `navigator.connection.effectiveType / downlink / rtt`
  where present.
- **Battery** — `navigator.getBattery()` → level + charging, Promise-guarded.
- **Pointer restlessness** — accumulated pointer speed and direction-change
  rate, decaying toward calm → a single "restlessness" scalar.
- **Context** — `hardwareConcurrency`, `devicePixelRatio`, `visibilityState`,
  viewport.

All access happens inside effects/handlers only (SSR-safe). Every source
degrades gracefully: a missing signal reads "unavailable" and the piece keeps
going.

## How the music works (Web Audio, no libraries)

A lookahead scheduler walks a 16th-note grid; each step reads the freshest
telemetry snapshot, so the piece genuinely differs at minute three from second
three — the machine's state has moved on. Coherence comes from a fixed A-minor
pentatonic and a slow harmonic root-drift; the loop-free feel comes from live
continuous input plus a deterministic glitch RNG.

Mappings:

- **fps / jank** → rhythmic density + glitch/retrigger probability (stutters).
- **memory pressure** → sub-bass drone level + a dissonant ♭9 tension partial.
- **network rtt** → delay/echo time; **downlink** → lowpass brightness.
- **pointer restlessness** → lead arpeggio activity.
- **battery draining** → slow global downward detune (a tiring machine);
  **charging** → the detune lifts back to zero.
- **load** → tempo climbs 92 → 138 bpm.

Chain: voices → master lowpass → limiter (`DynamicsCompressor`, ratio 16) →
master gain (≤ 0.22) → destination. Silent until the user clicks the primary
action; 1.8 s fade-in; clean teardown on unmount.

## How the field works (three.js)

A dense `THREE.Points` lattice (up to 40k) rendered through a custom
`ShaderMaterial`. The fragment shader thresholds each point's brightness against
an **ordered Bayer 4×4 matrix** indexed by screen pixel — the ordered-dither
look — and splits the R/G/B thresholds by a jank-driven offset for chromatic
fringing. The vertex shader shoves points off the lattice along a noisy vector as
jank rises (tearing), squeezes vertically with memory pressure, and swirls with
pointer restlessness.

**The feedback loop:** the number of drawn points scales with machine load via
`setDrawRange` (bounded, smoothed, capped well below anything that could freeze
the tab), so a straining machine literally spends more GPU on its own portrait —
which the frame-timing sensor then hears. The sound and the strain feed each
other, gently.

If WebGL is unavailable the page shows an on-brand notice and the audio still
plays.

## References

- **Alunno & Bientinesi — "EDM-Inspired Supercomputer Sonification"**
  (arXiv:2605.21874, submitted May 2026). Real-time *monitoring* (not debugging)
  of a running machine, turned into virtually-infinite, coherent music.
  Glasshouse is the browser-inward version: the "supercomputer" is the tab
  you're in.
- **Robert Borghesi — *ASTRODITHER*** (three.js WebGPU/TSL experiment, 2026).
  The dithered signal-noise / chromatic-fuzz visual language the field borrows.

## Notes / honest limits

- `performance.memory` and `navigator.connection` are Chromium-only; on Firefox
  and Safari those cards read "unavailable" and their mappings fall back to
  gentle defaults, so the piece stays alive and musical.
- Battery API is deprecated/absent in several browsers; guarded so it never
  throws.
- The load→points feedback is deliberately bounded — this is a self-portrait, not
  a stress test.
