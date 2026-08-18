# 15328 · Bloomwork

**One of Karel's own piano recordings grows itself into a living sunflower seed-head — every note it plays places a new seed at the golden angle, so by the end you are looking at the whole recording bloomed into one readable Fibonacci spiral.**

## Design notes

Phyllotaxis — the spiral packing of seeds in a sunflower head — is usually drawn
as a finished pattern. It is really the *residue of growth*: primordia bud one
at a time at the plant's **meristem** (its growing tip) and are pushed outward as
later primordia crowd in behind them, competing for space. Bloomwork treats that
literally. It does not render a pre-seeded field; it **accretes** one, live, from
Karel's own playing.

### Growth from the real note-roll

- On **Grow**, the piece loads the track's audio (`loadRealTrackBuffer`) and its
  analyzed **note-roll** (`loadTrackAnalysis` → `notes[]`) in parallel. The
  note-roll is the emission timeline.
- Each animation frame reads playback position `t = ctx.currentTime - startedAt`.
  Every note whose onset `time <= t` emits a new **primordium** (a seed). The
  i-th note to play becomes phyllotaxis index `i`.
- The seed is placed at angle `i · 137.507°` (the **golden angle**, Vogel's
  `π(3 − √5)` radians) and target radius `c · √i` (Vogel's equal-area model). It
  is *born at the center* (r = 0) and eases outward — evoking the meristem-to-rim
  push that makes a real seed-head, rather than snapping to a static coordinate.
- If a track has no analysis note-roll, a coarse envelope-follower onset picker
  runs on the real audio buffer as a fallback, so the bloom still grows from
  Karel's recording — never a synth.

### Chroma → color (full-chromatic palette)

Pitch-class drives hue around the **entire** color wheel: `hue = (midi mod 12) /
12`, so all twelve semitones map to twelve hues (`THREE.Color.setHSL`). Velocity
sets each seed's disc **size** and **brightness** (lightness). Time is radius —
inner seeds are the opening bars, the rim is the close. This is the lab's rare,
deliberate full-color register, and it lives entirely *inside* the canvas; the UI
chrome stays on the house design tokens.

### Bézier melodic contour

A single Bézier thread runs through the seeds **in the order they were played** —
the literal melodic contour of the take. Each spoke is a quadratic Bézier between
consecutive seeds, its control point bowed perpendicular to the chord by the
**melodic interval** (`midi[k] − midi[k−1]`), so leaps bow wide and steps stay
taut. The thread is rebuilt from current seed positions every frame, so it stays
attached as seeds glide outward and as the spiral is re-steered; newer segments
read brighter.

### Steering & reactivity

Two live sliders steer the growth without touching the audio: **Growth** is how
fast a newborn seed eases to its Vogel radius; **Spiral** is Vogel's constant
`c`, re-tightening or loosening the whole head as you drag. The center
**meristem glow** and an overall shimmer are driven by the safe-master
**analyser** tap. Audio is routed through the shared ear-safety master
(`createSafeMaster`) before the speakers. The camera dollies to keep the whole
bloom framed as it grows.

### Rendering

WebGL via **three.js**. Seeds are two `InstancedMesh` layers (a colored disc plus
a bright inner core) — the required instanced surface — with per-instance color
and matrix updated each frame; the contour is one additive `THREE.Line`. Full
teardown on unmount: source stopped, master disconnected, `AudioContext` closed,
rAF cancelled, all geometries/materials/renderer disposed and the canvas removed.

## References

- **Music Visualization Using Dynamic Phyllotactic Patterns: A Generative Design
  Approach with Bézier Curve Mapping.** *Archives of Design Research*, 2026. —
  the core insight that phyllotaxis is not a static pattern but the product of
  dynamic *growth* through spatial competition of primordia at the meristem, and
  that Bézier mapping can carry the musical line across the spiral.
- **H. Vogel, "A better way to construct the sunflower head."** *Mathematical
  Biosciences* 44 (1979): 179–189. — the golden-angle seed model `θ = i · 137.5°`,
  `r = c · √i`.

## Tags

`input: catalog playback · output: three.js · technique: phyllotactic-growth · palette: full-chromatic`

## Honest limits

- A **static** phyllotaxis field already exists in the lab as `3424-attending`
  (a fixed golden-angle glyph packing, deposited into by attention). The fresh
  move here is **not** the golden-angle packing itself — it is real-catalog-
  *driven* **growth / accretion** over playback, plus the **Bézier melodic
  contour** and **chroma readback** of his actual note-roll. If you want the
  still, meditative packing, that piece is the reference; this one is alive.
- The bloom is only as musical as the analysis: hue and size read the note-roll
  directly, so the picture is faithful when the analysis is good, and coarser on
  the envelope-onset fallback (which has no true pitch, so hues are approximate).
- Seeds are capped at 4000; note-rolls longer than that stop emitting near the
  end of very long takes.
- Connecting *consecutive-in-time* seeds means the contour thread hops across the
  head (neighbors sit ~137° apart). That is intentional — it draws the melody's
  path through the seed-head — but it reads as a woven web, not a smooth arc.
