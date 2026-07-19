# 1966 — Alpha Reset

**The one question:** *What if SOUND could reset the phase of your visual cortex — so
each note in the music snaps a drifting, incoherent hallucinatory form-constant
field into momentary crystalline coherence, then it drifts apart again?*

## The mechanism

A full-screen **three.js** `ShaderMaterial` (fullscreen quad, orthographic camera)
renders four Klüver form constants — **tunnels, spokes, spirals** and a **honeycomb
lattice** — in cortical `(log r, theta)` space. The geometry is built with the shared
log-polar engine (`_shared/psych/logpolar.ts`, `LOGPOLAR_GLSL`), the Bressloff–Cowan
retina→V1 complex-log map: all Klüver form constants are one periodic pattern seen
through that warp.

Each of the four layers carries its own **phase offset** (`uOff` vec4). Left alone the
offsets **drift at slightly different rates** — the layers fall out of registration,
the average washes toward flat gray, and the mandala dissolves into desaturated
**visual snow** (incoherence).

A **spectral-flux onset detector** listens to the audio: per-frame sum of positive
FFT-bin increases, adaptive threshold = running mean + k·std over ~0.7 s, rising-edge
local peak, ~120 ms refractory. **Each onset** spikes an alignment pull that fast-eases
every phase offset toward their common centroid → the layers snap into registration and
the pattern **crystallises**: crisp, high-contrast, saturated, iridescent. Then the pull
decays, drift wins again, and it dissolves. Dense/rhythmic input holds coherence;
sparse/quiet input lets it fall to snow. **This coherence-snap is the headline.**

**Band mapping (neural gain):** bass → log-polar warp depth + zoom · mids →
form-constant density · highs → kaleidoscope fold count + honeycomb fine detail ·
loudness → saturation + iridescence.

## Audio

- **Primary:** drag-drop zone + file picker → `arrayBuffer` → `decodeAudioData` →
  looping `AudioBufferSourceNode` → gain → destination, with a fan-out to an
  `AnalyserNode`.
- **Fallback carrier (self-demos headless):** a deterministic seeded (`mulberry32`,
  constant seed) pentatonic arpeggio of short notes over a soft drone, scheduled off
  `AudioContext.currentTime`. Note attacks produce flux spikes that drive the onset
  detector, so the snap is visible with zero input.
- Audio starts on the first user gesture ("Begin").

## Integrated subsystems (ambition floor #2 — ≥3, we have 5)

1. Audio-file decode + looping source
2. Spectral-flux onset detector (adaptive threshold, refractory)
3. Phase-reset / coherence controller (drift ↔ onset-driven re-alignment)
4. Log-polar **three.js** form-constant shader
5. Deterministic generative carrier (seeded arpeggio + drone)

## Named references (ambition floor #3)

- **Bressloff & Cowan** — Klüver form-constant / log-polar cortical model.
- **Romei et al. 2012**, *"Sounds reset rhythms of visual cortex and corresponding
  human visual perception."*
- **Cecere et al. 2015**, *Current Biology* — individual alpha frequency ↔ audiovisual
  temporal-binding window.

## Safety

No full-screen high-contrast flicker in the 3–30 Hz band. The coherence snap is a
**spatial** pattern reorganization, not a brightness flash: the onset drives phase
offsets (geometry), never global luminance. The `uGain` brightness envelope is
**slew-limited** (time constant ≈ 0.25 s) so it cannot modulate faster than ~3 Hz.
`prefers-reduced-motion` reduces the kaleidoscope fold count, slows the drift, and
softens the onset response. Determinism: no `Math.random` / `Date.now` / `new Date()` —
seeded `mulberry32` and `AudioContext.currentTime` / `performance.now()` only. Full
teardown on unmount (RAF cancel, node disconnect, `ctx.close()`, three dispose, listener
removal).

## Where cycle 2 could go

Estimate the listener's individual alpha peak from a short eyes-closed calibration and
scale the drift / re-coherence time constants to it (per Cecere 2015); add a
binaural/haptic onset channel; let sustained coherence slowly deepen the warp for a
longer entropy arc.
