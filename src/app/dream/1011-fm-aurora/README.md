# 1011 · FM Aurora

**What if you could sculpt a 6-operator FM synthesizer's timbre by tilting your
phone through a 2-D timbre-space — and watch the spectrum bloom as you move?**

A bright DX7-chrome instrument. There is no harmony theory and no physics
simulation here — the *math of FM IS the instrument*. A soft D-Lydian
arpeggio plays on its own; tilting (or dragging, or just watching) re-sculpts
its timbre live while a luminous spectral ridge sprouts more sidebands.

## How to use

1. Tap **Start** (creates + resumes the `AudioContext` inside the gesture, as
   iOS autoplay rules require; on iOS it also calls
   `DeviceOrientationEvent.requestPermission()` from the same tap).
2. **Tilt** your phone:
   - left/right tilt (**gamma**) sweeps the modulator:carrier **ratio**,
     snapping to musically useful values `0.5, 1, 1.5, 2, 3, 3.5, 7`;
   - front/back tilt (**beta**) sweeps the **modulation index** `0 → 12`.
3. No gyroscope, or permission denied? **Drag** anywhere on the canvas to move
   through the same 2-D timbre space (x = ratio, y = index).
4. Do nothing for ~2 s and an **auto-demo** LFO slowly sweeps the timbre on its
   own, so it always sounds and morphs at a 06:30 phone glance.
5. Switch **operator algorithm** (DX7-style routings):
   - `2-OP` — `M → C` (one modulator drives one carrier);
   - `3-STACK` — `M2 → M1 → C` (cascaded modulation, brighter/clangier);
   - `PARALLEL` — three carriers each modulated, voiced as a chord.

The sensor/input mode and renderer mode are shown in readable text below the
stage.

## What you see

- **Spectral ridge** — `AnalyserNode.getFloatFrequencyData` drawn as glowing
  cyan→magenta bars with a white-hot ridge line. As the modulation index
  rises you can watch energy spread into higher partials.
- **Operator-algorithm graph** — operators as orbiting glowing nodes; carriers
  glow cyan-white, modulators magenta; modulation links pulse, brightening
  with the modulation index.
- **WebGL2 aurora wash** behind it all (hand-written GLSL, no three.js). If
  WebGL2 is unavailable it falls back to drawing everything in Canvas2D and
  shows a `text-rose-300` notice.

## Engine

- `fm.ts` — pure, DOM/audio-free synthesis math: the tilt→timbre mapping,
  ratio snapping, the analytic FM spectrum via Bessel functions `J_k(I)`
  (sidebands at `fc ± k·fm`), the spectral centroid, the DX7-style algorithm
  table, and the arpeggio note set. Designed to be unit-testable headlessly.
- `render.ts` — WebGL2 + Canvas2D renderers.
- `page.tsx` — Web Audio FM voices (`OscillatorNode` modulator →
  `GainNode(=index·modFreq)` → carrier `.frequency`), per-note ADSR, master
  chain ending in a `DynamicsCompressor` limiter, and the input/animation glue.

## References

- John M. Chowning, **"The Synthesis of Complex Audio Spectra by Means of
  Frequency Modulation,"** *Journal of the Audio Engineering Society* 21(7),
  pp. 526–534, 1973. (The foundational FM-synthesis paper; the Bessel-function
  sideband structure modelled in `fmSpectrum`.)
- The **Yamaha DX7** (1983) and its 6-operator, 32-algorithm UI — the
  inspiration for the selectable operator routings and the orbiting-operator
  graph.

## Verified vs unverified

**Verified (headless, `fm.ts`):**

- Bessel function `besselJ` matches known values: `J0(0)=1`, `J1(0)=0`, and its
  first zeros near `2.4048` (J0) and `3.8317` (J1).
- `fmSpectrum` blooms: more partials and a higher spectral centroid as the
  modulation index rises.
- `snapRatio` / `axisToModIndex` / `tiltToTimbre` map their normalised ranges
  correctly (tilt centres to `(0.5, 0.5)`; `midiToHz(69)=440`).
- `tsc --noEmit` and `next lint` are clean for this folder.

**Unverified (no headless audio/WebGL in this environment):**

- Actual audible output, voice balance, and that the limiter prevents clipping
  were *not* run — they need a real browser. The ADSR/voice graph is wired but
  has only been reasoned about, not heard.
- Live `DeviceOrientationEvent` behaviour and the iOS permission prompt were
  not exercised on a device; the pointer-drag and auto-demo fallbacks are the
  safety net.
- WebGL2 shader compilation succeeds in code but was not run on a GPU; the
  Canvas2D fallback path covers failures.
