# 1196 · Fibration

## The one question
*What if you could float, drug-free, **inside the Hopf fibration** — the way the
3-sphere fibres into interlocked great circles — as an NDE/meditative
cosmic-ambient space: hundreds of glowing, mutually-linked rings forming nested
tori that slowly rotate through 4D, each ring's position ringing a shimmering FM
bell so the geometry **sings the topology**?*

## State / pole
Altered-state evoked: **near-death / deep-meditative boundlessness** — the
interlinked cosmic structure, the tunnel toward the light. Pole:
**cosmic-ambient** (slow, weightless, luminous) but **chromatic, not black**.

## The math actually implemented (`hopf.ts`)
This is the genuine fibre bundle S³ → S², not a fake.

- **Fibre lift.** A base point `b = (x,y,z)` on the 2-sphere S² lifts to its
  fibre, a great circle in S³, via the standard quaternion parametrisation:

  ```
  N = sqrt(2(1+z))
  a = (1+z)/N · cos t
  b = (1+z)/N · sin t
  c = (x·cos t − y·sin t)/N
  d = (x·sin t + y·cos t)/N        t ∈ [0, 2π)
  ```

  One checks `a²+b²+c²+d² = ((1+z)² + (x²+y²)) / N² = (2+2z)/N² = 1`, so the
  fibre lives on S³. (The south pole `z = −1` is the removable singularity; we
  sample `z ∈ [−0.82, 0.9]` to stay clear of it.)

- **Stereographic projection** S³ → R³ from the pole `(0,0,0,1)`:
  `(a,b,c,d) → (a,b,c)/(1−d)`. Each fibre becomes a circle in R³; the fibres
  over a **circle of latitude** on S² form a **Clifford / Villarceau torus**, and
  the whole S² gives nested, mutually **linked** tori. A soft radial cap
  `r ← r · CAP/(CAP+|r|)` keeps fibres that sweep toward infinity in frame
  (they fold gently instead of blowing up).

- **4D rotation.** Every frame the whole configuration is rotated by
  `q ↦ qL · q · qR` with two slowly-varying unit quaternions (`quatMul`,
  `rotate4`). Left- and right-multiplication are two independent, incommensurate
  turns, so the projection can never hold the rings still — they breathe and turn
  inside-out. This is the "float through 4D" motion. On the GPU the rotation +
  projection happen in the **vertex shader**; the CPU only uploads a static S³
  point cloud once plus two quaternions + a view-projection matrix per frame.

- **Sampling.** 7 circles of latitude × 8 longitudes = 56 fibres (golden-angle
  longitude offset per ring so they interleave), each a closed loop of 96
  segments drawn as an additive `LINE_LOOP`.

## Output (`render.ts`)
- **WebGL2**: a full-screen background pass paints the **chromatic-chiaroscuro
  void** — a graphite / deep-indigo field with real mid-tones and a luminous
  violet centre, exponential toward the centre for the *tunnel-toward-light*
  feeling (never flat near-black, never neon-on-black). Fibres bloom additively
  over it, coloured by base-sphere latitude on a
  ruby → amber → emerald → sapphire → amethyst jewel ramp, with exponential
  depth fog.
- **Canvas2D fallback**: a reduced JS projection of the same fibres over a
  radial indigo→violet gradient, additive (`globalCompositeOperation =
  "lighter"`). Never blank. `webglcontextlost` handled; full `dispose()`.

## Audio (`synth.ts`) — FM, not JI
A small bank of **2-operator FM voices** (carrier + modulator sine, modulator →
carrier frequency). Seven **lead fibres** (one per latitude ring) each drive a
voice:
- **base-sphere latitude → carrier pitch** (a consonant minor-pentatonic set),
- **projected radius → FM index / brightness**,
- **per-frame motion → strike vigour**.

Every few breaths a voice re-attacks a slow FM bell (long attack, long release);
a breath-paced amplitude LFO (~0.09 Hz) keeps the bed alive. Master chain: sum →
`DynamicsCompressor` (limiter) → gain ramped up from 0. This is the La Monte
Young / Éliane Radigue **sustained-drone register realised through FM timbre**,
deliberately *not* a just-intonation choir/drone.

## Input — tilt → drag → auto
`page.tsx` degrades gracefully:
1. **Device tilt** (iOS `DeviceOrientationEvent.requestPermission()`, gated
   inside the Begin tap) nudges the 4D rotation and the camera orbit — you tilt
   the bundle through 4D.
2. **Pointer drag** fallback when there is no gyro; a nudge self-centres back
   into the journey.
3. **Auto-journey**: an ever-present slow incommensurate drift means the piece
   is fully alive with **zero interaction** (and underlies drag mode too).

`prefers-reduced-motion` slows every rotation. **Pause** instantly freezes the
geometry (cancels rAF) and silences audio (fast gain ramp). No strobe: all
brightness change is slow luminance drift.

## Named references
- Heinz Hopf (1931), *Über die Abbildungen der dreidimensionalen Sphäre auf die
  Kugelfläche.*
- Niles Johnson, *Hopf fibration* visualization.
- Villarceau circles / the Clifford torus.
- La Monte Young / Éliane Radigue drone tradition (realised here in FM timbre,
  not JI intervals); the Shepard–Risset endless-glissando feel for the tunnel.

## Ambition / diversity rationale
The lab has done stereographic 4D of a *polytope* (1042); this is the genuine
**fibre bundle** — nested linked circles/tori, a distinct never-built structure.
It clears this cycle's bans: **FM** (not JI-choir/drone), **tilt** (not passive),
**WebGL2** (not bright-Canvas2D), **chromatic chiaroscuro** (neither
bright-daylight nor flat near-black cosmic-glow).

## Honest caveats
- **Not GPU-verified**: written against the WebGL2 spec but not run on real
  hardware here. The stereographic soft-cap is an artistic clamp, not a rigorous
  compactification, so fibres passing near the projection pole fold rather than
  diverge — intended, but a topologist would note the distortion.
- **Not ear-verified**: FM ratios, index depths, strike periods and the limiter
  threshold are reasoned, not tuned by listening; they may want balancing.
- The Canvas2D fallback re-projects a subset each frame on the CPU and is
  intentionally lighter than the WebGL2 path.
