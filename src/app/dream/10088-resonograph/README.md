# 10088 · Resonograph

**Sing a shape into being.** A virtual Chladni plate you play with your voice. Hold
a pitch and watch tens of thousands of sand grains crawl across a vibrating brass
plate and settle onto the exact nodal lines of that tone's standing wave. Slide
your pitch up and the figure reorganizes into a finer lattice; the plate answers
with a metallic, inharmonic ring.

## The one question

> What if you could SING a shape into being — hold a pitch and watch tens of
> thousands of sand grains crawl across a vibrating plate and settle onto the exact
> nodal lines of that tone's standing wave?

## How to play it with your voice

1. Press **Play the plate** (grant the mic when asked). Best with headphones.
2. **Sing, hum, or whistle a steady note.** Autocorrelation finds your fundamental;
   the plate locks to the Chladni eigenmode `(m, n)` whose modal frequency is
   closest, and the sand settles into its figure over a couple of seconds.
3. **Slide your pitch up** — a higher note picks a higher-order mode, and the sand
   visibly re-scatters and re-settles into a busier, finer nodal lattice. Lower
   notes collapse back to simple crosses and grids.
4. The HUD badges the compute tier (`webgpu` / `webgl` / `cpu`), the sensor
   (`voice` / `manual (no mic)`), your detected pitch, and the current `(m, n)`.

**No microphone?** The plate is driven by a seeded pitch sweep that keeps it
singing and settling hands-free, and a **figure slider** appears so you can steer
the mode by hand. Badged `manual (no mic)`.

## The technique — sand descending the |ψ| gradient

A square plate (side `L = 1`) vibrating in eigenmode `(m, n)` carries the classic
standing-wave field

```
ψ(x, y) = cos(mπx)·cos(nπy) − cos(nπx)·cos(mπy)        x, y ∈ [0, 1]
```

Sand settles where the plate is still — the **nodal set** `|ψ| ≈ 0`. (This requires
`m ≠ n`; the pairs `(m,n)` and `(n,m)` share nodal lines since ψ merely negates, so
the mode table keeps `m < n`.)

Each grain, every frame, does two things on the GPU:

- **Projected gradient descent toward the nodal line.** Using ∇ψ, it takes a
  Newton-style projection step `p ← p − lr · ψ·∇ψ / (|∇ψ|² + ε)`, which drives ψ
  toward zero — i.e. moves the grain onto the nearest nodal curve.
- **Vibration hop.** It also takes a random step scaled by the local vibration
  `|ψ|`, so grains at antinodes jitter hard and wander, while grains that reach a
  node (where `|ψ| → 0`) stop hopping and freeze. This is the physical Chladni
  mechanism: sand is shaken off the loud regions and accumulates on the quiet ones.

Because jitter along a nodal curve keeps ψ ≈ 0, grains spread **along** the lines
rather than collapsing to points, so the full crisp figure emerges — it is
**simulation-as-structure**, not a drawn shape. On every mode change a short
**strike** impulse boosts the jitter globally, throwing the sand up so it visibly
re-settles into the new figure.

### Voice → mode (running ChladniSonify backwards)

Modal frequency follows **Kirchhoff–Love** thin-plate flexure, `f_mn ∝ (m² + n²)`.
The detected pitch selects the mode whose `f_mn` is closest (log distance), with a
short hold to prevent flicker — so higher pitches deterministically summon
higher-order, busier figures. The recent paper *ChladniSonify* maps a recognized
Chladni **pattern → frequency** via plate theory in real time; the resonograph runs
that mapping the **other direction**: **voice → mode → figure**.

### The plate's metallic voice (inharmonic, not harmony)

When a mode locks, the plate is **struck** and rings with an **inharmonic** partial
series — the stretched, non-integer ratios of a struck circular plate / bell
(`1, 2.76, 5.40, 8.93, 13.34`), each partial with its own exponential decay,
retriggered on every strike. A faint continuous excitation driven by **your own
voice amplitude** keeps it ringing while you hold a note: you are the exciter, the
plate answers in metal. It is deliberately **not** a consonant just-intonation
chord — the material is resonance.

## Subsystems (four)

1. **Mic capture** — `getUserMedia` → `AnalyserNode` (shared `AudioContext`).
2. **Real-time pitch detection** — normalized autocorrelation with parabolic
   interpolation (`chladni.ts › detectPitch`), EMA-smoothed.
3. **GPU grain simulation** — WebGPU compute shader, ping-pong storage buffers,
   ψ-gradient descent + vibration hop (`page.tsx › COMPUTE_WGSL`).
4. **Inharmonic modal audio synthesis** — struck bell/plate partial bank
   (`audio.ts › PlateAudio`).

## Fallback ladder (badged)

| Tier | Grain update | Grains | Badge |
|------|--------------|--------|-------|
| 1 | **WebGPU** compute shader, ping-pong storage buffers | 42 000 | `webgpu · compute` |
| 2 | **WebGL2** transform feedback (rasterizer discard, ping-pong VBOs) | 24 000 | `webgl · transform feedback` |
| 3 | **CPU** point sim (identical math in JS), WebGL2 point render | 4 200 | `cpu · point sim` |

All tiers render the warm brass plate + pale sand as **WebGL/WebGPU points**
(additive, so overlapping grains build bright nodal lines). **Canvas2D is never the
primary output.** No mic degrades to seeded sweep + manual slider — never a dead
screen. Sensor errors render in `text-destructive`.

## Ambition — 4 of 5 criteria

1. **Novel technique for this lab** — GPU nodal-line *settling* of a Chladni plate:
   grains descending the `|ψ|` gradient and freezing on the nodes. Not a particle
   nebula — emergent crystalline geometry.
2. **≥3 subsystems** — four: mic capture + pitch detection + WebGPU-compute grain
   sim + inharmonic modal synthesis (listed above).
3. **Named reference** — **Ernst Chladni**, *Entdeckungen über die Theorie des
   Klanges* (1787); and **"ChladniSonify: A Visual-Acoustic Mapping Method for
   Chladni Patterns in New Media Art Creation," arXiv:2605.09846** (2026), which
   maps patterns → frequency via Kirchhoff–Love plate theory in real time; this
   piece inverts that mapping.
4. **Fresh research** — seeded by this cycle's research dive into *ChladniSonify*
   (2026).

## Known limits

- The plate field uses the ideal separable square-plate approximation
  `cos·cos − cos·cos`; real free-edge Chladni plates have subtler edge behavior.
  The figures here are the canonical idealized modes, not an FEM solve.
- Modal frequency uses the Kirchhoff–Love proportionality `f_mn ∝ (m² + n²)` with a
  single tuned constant, not calibrated material/thickness constants.
- Pitch detection is monophonic and expects a fairly steady, voiced tone; very
  breathy, noisy, or polyphonic input is gated out and the last mode holds.
- Very high modal fundamentals are octave-folded into a bell register for
  listenability, so the plate's ring is pleasant rather than piercing.
- WebGPU vertex-stage storage reads are avoided (grain buffers are bound as vertex
  buffers) for broad adapter compatibility; transform-feedback fallback covers
  Firefox/Safari without WebGPU.

## Files

- `page.tsx` — component, WebGPU compute + render backend, mic/pitch loop.
- `chladni.ts` — mode table, `f_mn` mapping, ψ + gradient, pitch detection.
- `webgl.ts` — WebGL2 transform-feedback and CPU backends + shared plate/grain render.
- `audio.ts` — `PlateAudio` inharmonic struck-plate synth.
