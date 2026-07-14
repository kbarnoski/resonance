# 1638 — Reel

**What if Resonance's journey engine told a cinematic STORY instead of a
psychedelic arc?** A self-playing, wordless, ~5.7-minute short film whose music
and image both obey a classic dramatic beat sheet. This is an **alternate
journey-engine arc** — built against the design director's directive #4 ("EDM
build-and-drop, ritual, jazz responsive, **cinematic narrative** as alternate
arcs" to Resonance's fixed 6-phase psychedelic engine).

Press **Play the reel** and it rolls start-to-finish on its own. A WebGL
atmosphere (drifting horizon, volumetric fog, particulate light, slow filmic
push) and a generative film score are driven by **one shared dramatic-tension
curve**, so image and music never disagree.

## The structure — a beat-sheet state machine

Seven acts, each with a target tension, a key + mode, a tempo/density, and a
cinematic color grade. A smooth curve eases the tension from each act's opening
level toward the next; the grade and atmosphere interpolate over the same curve.

| # | Act | Tension | Key / Mode | Grade → | Motif |
|---|-----|---------|------------|---------|-------|
| 1 | Setup | 0.10 | A lydian | cool slate / teal | stated plainly |
| 2 | Inciting Incident | 0.32 | F# dorian | cooler, tighter | lifted a register |
| 3 | Rising Action | 0.55 | D aeolian | off-violet shadow | driven, faster |
| 4 | Midpoint | 0.62 | A# lydian | false brightening | augmented / stretched |
| 5 | Climax | 0.95 | C phrygian | dark warm, hot gold | **inverted, octave up, dissonant** |
| 6 | Falling Action | 0.40 | G dorian | cooling | descending, slowing |
| 7 | Resolution | 0.08 | **A major** | warm teal / gold | **slowed, lands on the tonic** |

**Tension mapping (the one shared signal):**
- **Score** — tension drives detune/dissonance (a semitone cluster appears above
  0.72), filter brightness, register, motif density/rate, air-noise swell, and
  reverb length. The chord's colour tone bends toward a biting neighbour near the
  climax.
- **Image** — tension sharpens and heats the horizon glow, raises the horizon,
  increases turbulence/warp, thins the fog, and lifts mid-tones into the gold
  highlight. The color grade itself is act-specific and graded continuously.

**Memory / state:** the recurring motif (scale degrees `0 4 3 5 7 4 2`) is the
memory of the piece — the shape you hear in the Setup returns *inverted* an
octave up at the Climax and finally *resolves* on the tonic in the Resolution,
which returns to the **home key (A)** of the opening. Minute five is genuinely a
different place than minute one — it's the opposite of a loop.

## Deterministic + headless

- Seeded **mulberry32** PRNG (`SEED = 0x1638`) for every generative choice.
- All timing from `audioContext.currentTime` deltas (story clock) and a frame
  counter (visual clock). **No** `Math.random` / `Date.now` / `new Date` in
  executable code; **no** Canvas 2D — the render surface is a three.js WebGL
  fragment-shader quad.
- Web Audio is built only on the Play gesture, mastered through a
  `DynamicsCompressor` at master gain ≤ 0.14, and torn down cleanly on unmount.
- Degrades gracefully: no WebGL → on-brand notice, and the score still walks the
  whole arc. Reduced-motion calms the camera to a slow drift.

## Optional real-piano carrier

The real app can serve Karel's piano at `/api/audio/[id]`, but the build machine
has no network and no valid id, so this prototype does **not** depend on it. The
synth engine is the default and fully self-sufficient; any carrier would sit
behind a try/catch that silently falls back.

## References

- Gustav Freytag, *Die Technik des Dramas* (1863) — **Freytag's Pyramid**.
- Blake Snyder, *Save the Cat!* (2005) — the **beat sheet**.

## Tags

- **input** = autonomous (long-form, ~5.7 min)
- **output** = WebGL cinematic shader field
- **technique** = dramatic-beat-sheet state machine → tension curve → generative
  score + color grade
- **palette** = cinematic slate / teal-shadow / gold-highlight, off-violet (art
  layer); violet only for UI chrome

## Self-assessment

Honest: the arc genuinely evolves — the harmony travels from A lydian to a C
phrygian climax and comes home to A major, the motif returns transformed, and
the palette grades act-by-act, all off the single shared tension curve; the one
soft spot is that the shader is a strong *atmosphere* rather than a legible
*scene*, so the "story" reads as mood and light more than as depicted events.
