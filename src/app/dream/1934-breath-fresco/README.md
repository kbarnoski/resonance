# 1934 · Breath Fresco

**The one question:** What if your *breath* painted a persistent spatial timeline
of a whole listening session — a fresco of your breathing you can read back like
an autobiography?

Breathe near the microphone. Each exhale trowels a glowing horizontal stratum
into wet plaster. After a few minutes the wall is a readable record of the whole
session: where you breathed hard, where you rested, the rhythm of it.

## The tags

- **INPUT — breath envelope (non-touch, non-pitch).** `getUserMedia` →
  `AnalyserNode` time-domain → smoothed RMS (loudness only, never pitch) →
  a rise / hold / fall breath-stroke state machine (`breath.ts`). A confirmed
  exhale is the event that deposits a stratum and opens a drone partial.
- **OUTPUT — a WebGPU compute fresco** (`fresco-gpu.ts`): two `rgba16float`
  storage textures ping-ponged; a compute pass does vertical-fuse + additive
  deposit on a window of columns around the trowel; a fullscreen render pass
  tone-maps the field over plaster, oxidizes by age, and draws the trowel sheen.
  A **full Canvas2D fallback** (`fresco-canvas.ts`) runs the identical logic on
  a CPU field when `navigator.gpu` is absent.
- **TECHNIQUE — additive just-intonation partial bank + GPU compute field**
  (`audio.ts` + the field backends).
- **PALETTE — warm plaster/fresco:** deep-umber ground, sienna, ochre,
  chalk-white. No violet.

## The memory mechanic — and how it differs from a decaying chord

The wall's **horizontal axis is session time.** A trowel head advances slowly
left→right as the session runs (`SESSION_MS ≈ 5 min` maps across the wall). Each
completed exhale deposits a **persistent horizontal band** at the current
time-column; the band's vertical position is the breath's peak intensity mapped
to a just-intonation partial (louder → higher stratum).

Deposits are **cumulative and effectively permanent.** The update pass only
touches a small window of columns around the trowel — once the trowel has
passed, a column is frozen history. Columns behind the trowel slowly **oxidize**
(a render-time warm deepening toward sienna by age), so they mellow over minutes
but **never vanish.** Buon fresco: pigment fused into wet plaster, permanent.

This is **explicitly not** a "hold a tone and it fades in ~30s unless renewed"
mechanic. Nothing decays back to the ground. Your past gestures durably shape the
artifact — compositional memory as spatial autobiography, not a fading stack.

## Input → sound → image

| Breath event | Sound | Image |
| --- | --- | --- |
| Exhale onset (RMS > threshold) | — | trowel begins wetting the current column |
| Exhale confirmed (peak > CONFIRM) | opens **one** sustained JI partial over ~60 Hz | fixes the stratum's height from the peak |
| Exhale sustains | drone thickens (bounded ≤24 voices, gentle shimmer) | additive glow builds along a short horizontal streak |
| Exhale ends (RMS < OFF) | partial keeps ringing (long Radigue drone) | stratum frozen; oxidizes with age |

Audio path: voices → `DynamicsCompressor` → master gain (≤ 0.18, ramped from the
Start gesture) → destination. Nothing autoplays loudly; no clicks.

## Headless self-demo

If the mic is **denied or silent**, a deterministic **ghost-breath generator**
(mulberry32 seeded with a literal + `performance.now`) drives the *exact same*
state machine, so the wall fills and the drone evolves on its own. The status
row labels it as a demo (mic-denied uses `text-destructive`). The instant a real
breath registers above the live floor, the live feed takes back over.

## References

- **Éliane Radigue** — long-form, slowly-evolving drone.
- **Pauline Oliveros**, *Deep Listening* — attention to breath and sustained tone.
- **buon fresco** — pigment fused into wet plaster is permanent; the source of
  the permanence metaphor.

## Determinism & teardown

- No `Math.random` / `Date.now` / argless `new Date()`. Randomness is mulberry32
  seeded with literal constants; time is `performance.now()`.
- On unmount: `cancelAnimationFrame`, stop mic tracks, dispose the fresco
  (destroy GPU textures/buffers), ramp master down and `AudioContext.close()`.

## Known rough edges

- Mic RMS is lifted by a fixed gain (`MIC_GAIN`) rather than auto-calibrated, so
  very quiet rooms may lean on the ghost demo; very loud rooms may over-trigger.
- The trowel parks at the right edge once the ~5-minute session fills the wall;
  further breaths pile at the last column rather than scrolling.
- Vertical fuse is intentionally tiny to keep strata crisp; on the Canvas2D
  fallback the field is 512×256, so fine strata are a touch softer than on GPU.
