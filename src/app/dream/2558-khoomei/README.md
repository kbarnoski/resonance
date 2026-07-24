# 2558 · Khoomei — biphonic overtone singing by a physical vocal tract

**Route:** `/dream/2558-khoomei`

## The one question

> What if one sustained note could split into two — a droning fundamental and a
> piercing whistle overtone you sweep by hand, like a Tuvan throat singer —
> synthesized by a real physical vocal tract?

## How it works

### The engine: a Kelly–Lochbaum digital-waveguide vocal tract

The whole instrument is a **1D Kelly–Lochbaum waveguide** — the model behind
Neil Thapen's *Pink Trombone* — running sample-by-sample inside an
`AudioWorkletProcessor` (source in `worklet-source.ts`, loaded from a `Blob`
URL, no network).

- The tract is an array of **44 cylindrical sections**, each with a diameter
  `d[i]` and area `A[i] = d[i]²`.
- Sound travels the tube as two counter-propagating sample streams: a rightward
  wave `R[i]` and a leftward wave `L[i]`.
- At every junction the change of area scatters the waves via the canonical
  one-multiply Kelly–Lochbaum update with reflection coefficient
  `k[i] = (A[i-1] − A[i]) / (A[i-1] + A[i])`:

  ```
  w        = k[i] · (R[i-1] + L[i])
  Rout[i]  = R[i-1] − w      // correct signs → passive → stable
  Lout[i]  = L[i]   + w
  ```

- **Glottis** (`i = 0`): reflects ~0.75 and injects a sustained **drone** — a
  Rosenberg-style asymmetric glottal pulse train at a continuous `f0`, rich in
  harmonics so there are overtones to isolate.
- **Lips** (`i = N-1`): radiate with reflection ~ −0.85.
- Per-section damping `< 1`, a DC-block, and a `tanh` soft-clip keep the passive
  network bounded and click-free.

### The biphonic (sygyt) trick

The tract is a **source–filter**: the drone supplies `f0, 2f0, 3f0, …` and the
tube's resonances (formants) boost whichever harmonics fall near them. Squeeze
**one movable section** to a near-pinch and you get a **sharp front-cavity
resonance** that isolates and amplifies a *single* harmonic. Sliding that
constriction toward the lips shortens the front cavity and raises its resonance,
so the boosted harmonic climbs the series (5f0 → 6f0 → 7f0 …) — a bright whistle
rising over the steady drone. That is the two-pitch **khoomei / sygyt** effect,
produced by the physics, not by a second oscillator.

The constriction section index is derived from the target overtone frequency via
the front-cavity quarter-wave relation (`f ≈ sr / (2·frontSections)` at 2×
oversampling), then lerped per-sample so the whistle **glides** rather than
steps.

### Dissonance-capable — by construction

No scale, no pitch lattice. `f0` is continuous, and the emphasized overtone is a
**continuous** point on the ladder: the `detune` control drifts it *off* the
exact harmonic so it beats and clashes against the drone. The instrument is
meant to be able to sound alien.

## Controls (keyboard-first)

| Input | Action |
| --- | --- |
| `←` / `→` | sweep the overtone down / up the harmonic ladder |
| `1`–`9` | jump straight to a harmonic (5·f0 … 13·f0) |
| `↑` / `↓` | glide the drone `f0` (100–160 Hz) |
| `z` / `x` | constriction tightness — tighter = purer, more piercing whistle |
| `,` / `.` | detune the overtone off the harmonic (beat / clash) |
| `Space` | start / silence the drone |
| pointer-drag on the tract | secondary: x = overtone, y = tightness |

Readouts show drone `f0` (Hz), the emphasized overtone (`h·f0 ≈ … Hz`),
tightness, and detune (flagged *clashing* when off-harmonic).

## The visuals (SVG only — no Canvas2D)

1. **Vocal-tract cross-section** — the 44-section diameter profile as a smooth
   filled path (violet → magenta), with the constriction visibly pinching and
   sliding as you sweep, plus drone particles drifting glottis → lips.
2. **Harmonic ladder / spectral column** — bars for harmonics 1…14. When audio
   is live the heights come from a real `AnalyserNode` FFT of the tract output;
   the fundamental holds steady on the left while the emphasized overtone glows
   magenta and climbs. In the silent demo the heights are modeled (1/f tilt + a
   formant bump).

## Fallbacks

- On load a **silent, deterministic auto-demo** (driven by `performance.now()`)
  sweeps the constriction up and down the ladder with **no audio**, so a
  headless screenshot shows the pinched tract and a glowing overtone mid-ladder.
- Audio starts only on the first user gesture (AudioContext resume).
- No `AudioContext` / no `AudioWorklet` → a `text-destructive` notice; the silent
  visual demo keeps running.
- Determinism: any randomness (breath-particle offsets only) uses a seeded
  `mulberry32(0x2558)`; no `Math.random`, `Date.now`, or `new Date`.

## References

- **Kelly & Lochbaum**, "Speech synthesis" (1962) — the digital-waveguide vocal
  tract / scattering-junction ladder.
- **Neil Thapen, *Pink Trombone*** (2017) — the interactive KL tract this engine
  follows.
- **arXiv:2606.04943**, differentiable articulatory copy-synthesis of biphonic
  singing (2026) — fits exactly this KL waveguide to real sygyt recordings.
- The **Tuvan khoomei / sygyt** overtone-singing tradition.

## Honest caveats

- The model runs **headless** — I have **not verified by ear** whether the
  overtone audibly splits cleanly from the drone. The physics is a genuine
  source–filter with a sharp movable formant, so a rising/falling whistle over a
  steady drone is expected, but how *isolated* the single harmonic sounds (versus
  a bright formant coloring several harmonics) is untested acoustically.
- Only overtones the tube can sharply resonate are reachable (roughly 5·f0
  upward at these `f0` values); lower harmonics clamp. The displayed harmonic is
  the *intended* target — the emphasized point on the real FFT should track it
  when audio is live.
- `ScriptProcessorNode` is **not** used as a fallback; the engine requires
  `AudioWorklet` (widely supported in current browsers).
