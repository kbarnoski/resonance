# Emberfield

**Status**: Demoable — Canvas2D ember field, 3-state face/pointer/demo attention, real-catalog audio, builds clean against the QA gate.

Your memory of one of Karel's recordings as a **field of embers that fade unless
your attention keeps them warm** — so what survives at minute five is a
self-portrait of where you looked. A piece about **memory as forgetting**:
attention decay-and-renewal.

## The mechanism

Up to nine embers each hold a `warmth ∈ [0,1]` that **decays every frame**
(`warmth *= exp(-dt/7)`, τ≈7 s → a neglected ember fades to silence in about
twenty-five seconds; below `warmth ≤ 0.025` it dies, leaving a brief expanding
afterglow ring of dispersing sparks).

Each ember sounds as a **looped, band-filtered slice of one of Karel's real
recordings** (from `REAL_TRACKS` via `loadRealTrackBuffer`):

```
AudioBufferSourceNode(loop, per-ember offset)
  → BiquadFilter(bandpass, Q≈6, center = freqForY(vertical position))
  → GainNode(warmth^1.25 · VOICE_GAIN)
  → StereoPannerNode(pan = horizontal position)
  → createSafeMaster(ctx).input      // never ctx.destination
```

Vertical position maps to a pitch region (160 Hz at the bottom → 2.6 kHz at the
top); horizontal position maps to stereo pan.

### Attention drives renewal

A **coarse** attention blob (~19 % of the stage wide — a broad zone, not a pixel
cursor) comes from the face: the mirrored nose position, amplified around centre,
sweeps it as you turn and tilt your head. Dwelling attention on a region:

- **recovers** the warmth of nearby embers (`warmth += renewRate · falloff · dt`)
  and **slows their decay** while attended (τ grows 7 s → 26 s);
- a **nod** (vertical oscillation of the nose) or a **forward lean / push**
  (inter-eye distance growing past a slow baseline) throws a **stronger renewal
  pulse** to the attended region;
- dwelling on an **empty dark region** for ~1.2 s **plants a new ember** there
  (vertical → pitch), up to the cap of nine — at cap, the **coldest** ember is
  retired first.

So doing nothing empties the field; the surviving constellation is a map of where
you looked. Neglected embers visibly cool, shrink and die; attended ones flare.

## Input — graceful 3-state

Always shown as a mono status line while the stage is active, so a fallback is
never mistaken for live tracking:

1. `tracking · live` — face detected (MediaPipe FaceLandmarker via the shared
   `_shared/cameraTracking`), driving attention; lost tracking shows a
   `text-destructive` "face the camera" hint.
2. `pointer · attention` — no camera / denied / model-load failed → the pointer
   is the attention point (full, fully-usable fallback; a press fires a pulse).
3. `demo · autonomous` — before start or idle: an autonomous attention point
   drifts (Lissajous) and tends a few embers while others fade, so the idle
   screen is alive. Four demo embers are seeded at mount (alive in <1 s).

## Render — Canvas 2D only

No SVG, no WebGL. Thousands of additive glow sprites
(`globalCompositeOperation = "lighter"`) on near-black, with motion-blur trails
from a low-alpha fill each frame and radial gradients. Warm **bone-gold /
ember-amber** for warm embers cooling to **ash / slate**; an expanding afterglow
ring on death. Warm hues live only inside the canvas art — all UI chrome uses
semantic tokens. No film-grain / noise overlay (motion-blur trails only). DPR and
resize handled so the canvas stays crisp.

## Grounding / references

- Sustained attention as a limited resource governed by **competing degradation
  and recovery processes**: Rosenberg 2026, *"A Temporal Hierarchy of Sustained
  Attention Dynamics"*; the dynamical-systems "competing recovery and degradation
  processes" framing, **arXiv:2604.02059**. This is the decay-and-renewal heart
  of the piece.
- **Memory reconsolidation on retrieval** — a memory is re-written each time it
  is recalled — the sibling idea: **arXiv:2609.16053** / LETHE
  **arXiv:2609.04289**. Re-attending an ember here is exactly such a retrieval.

## Audio source

Karel's real catalog only (`REAL_TRACKS` — Welcome Home + Snowflake, 16 tracks),
chosen with a track selector on the start screen. No synth tones. Every node path
terminates at the shared `createSafeMaster` bus.
