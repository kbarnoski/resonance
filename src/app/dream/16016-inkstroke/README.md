# Inkstroke

A calligraphic pen-stroke **bows Karel's real piano take**. The brush does not
synthesize a tone — it scrubs and re-voices his actual recording as overlapping
grains — while the same stroke lays living prussian-indigo ink that bleeds and
feathers across warm bone paper.

## The one question

> What if a calligraphic pen-stroke *bowed* Karel's real piano recording — the
> brush does not synthesize a tone, it scrubs and re-voices his actual take —
> while the same stroke lays living ink that bleeds and feathers across the
> paper?

## The bow — how the stroke re-voices his take (`bow.ts`)

Rule 10 is absolute here: **nothing is synthesized**. Every grain is a short,
Hann-windowed slice of his actual `AudioBuffer`, fetched via
`loadRealTrackBuffer` from his verified catalog (`_shared/welcomeHome`,
`REAL_TRACKS`). The stroke is a *score-cursor that bows the take*:

- **Horizontal position (x) → play-head.** The stroke scrubs a play-head across
  the *whole* recording; where your brush is on the paper is where the head sits
  in his take.
- **Stroke speed → grain density + rate lean.** Faster strokes fire more
  grains/sec (≈8–54) and lean the `playbackRate` by up to **±6%** — a quick
  gesture reads brighter and more urgent.
- **Pressure → grain length + ink-wetness lowpass.** `PointerEvent.pressure`
  sets grain length (Hann, ~30–160 ms). When pressure is unavailable (mouse /
  many touchscreens report 0), an *effective pressure* is derived from stroke
  slowness — a slow, dwelling stroke presses hard. Harder press also lowers a
  shared lowpass ("wetter, darker ink"): ~900 Hz pressed down, ~6 kHz light.
- **Vertical position / curvature → pan + detune.** Height sets stereo pan and a
  whisper of detune (±18 cents).

Grains route `source → per-grain Hann gain → panner → shared lowpass → safeMaster`.
Polyphony is capped at **24 voices**; every grain is enveloped so the cloud never
clicks. All audio passes through `createSafeMaster` (ear-safety limiter +
analyser), and the analyser drives the visual intensity.

**Idle auto-demo:** on Play, an automatic calligraphic gesture (`stroke.ts`,
Catmull-Rom sweeps with a press-release pressure profile) periodically draws
itself and bows the take, so the piece makes his sound and *moves* with no
pointer. A real pen/stylus/pointer takes over the instant it touches, and the
auto-demo resumes only after a spell of quiet.

## The ink field — how the paper lives (`ink.ts`)

A **WebGL2 ping-pong float field** (two `RGBA16F` textures) holds the wet paper:
`R = dye`, `G = wetness`. Three fragment passes:

1. **Splat** — deposit a soft, slightly-firm-cored brush footprint of indigo dye
   along the stroke path (radius/strength scaled by pressure and speed, thinner
   when fast). Sub-points are interpolated so fast strokes stay continuous.
2. **Diffuse** — each frame the dye feathers via a 9-point Laplacian, but the
   bleed rate is scaled by *local wetness*: **wet ink feathers, dry ink locks** —
   the core physical intuition of ink-wash painting. Wetness decays (the sheet
   dries); dye is near-permanent, so strokes **settle and accumulate** across the
   session rather than resetting. The analyser's energy breathes the bleed radius.
3. **Display** — map the field onto warm bone paper: indigo body, a whisper of
   deep cyan only in the densest, freshest wet cores, feathering out to indigo and
   fading into a faintly grained bone ground.

**Graceful degradation.** If WebGL2 float targets are unavailable, a Canvas2D
fallback (`makeCpuInk`) draws the same palette as softening indigo dabs with
cyan wet cores. If his audio fails to load, an on-brand `text-destructive`
message surfaces and the ink field stays live. `prefers-reduced-motion` cuts
diffusion sub-steps and calms the auto-demo.

## Palette rationale — a deliberate third register

**Prussian-blue / deep-indigo ink on warm bone-white paper**, with deep cyan only
in the wettest stroke cores. This is chosen to sit wrong beside *both* an
ember/gold palette and a pure-grayscale one — it is neither warm nor neutral, but
a committed cool-ink-on-warm-ground register drawn straight from sumi-e and
cyanotype. The art colors live as `vec3`/hex literals in the shader and Canvas2D
code; the app chrome uses only Resonance semantic tokens (violet is the only
brand accent).

## Named references

- **Calliphony** — arXiv:2608.03040 (Aug 2026), real-time calligraphy-driven
  music performance.
- **Shu Dao: A Calligraphy Score Framework** — Lican Huang, arXiv:2606.00001
  (2026-03-24), which frames a brush stroke as an ordered, executable
  performative *score* carrying pressure, pacing, and trajectory.

**The reframe (rule-10-clean):** in both references the stroke *generates* music
or calligraphy. Here it does neither — the stroke is a **score-cursor that bows
his existing recording**. It carries the same pressure/pacing/trajectory score,
but every sound it produces is a re-voiced slice of Karel's real take, not a
generated calligraphic form or a synth voice.

## Honest claims

- This is **not** the lab's first pen/pointer input, nor its first use of
  `PointerEvent.pressure`, nor its first granular `createBufferSource` engine —
  all three are common across existing prototypes (hundreds each; grep-checked).
- The honest novelty is the specific coupling: a **pen-pressure granular *bow* of
  Karel's real recording** — pressure driving grain length *and* an ink-wetness
  lowpass, stroke-x scrubbing a play-head across his take — wired to a
  **wet-locking WebGL2 ink-diffusion field** so the same gesture that re-voices
  his audio also paints settling indigo ink. That pairing of a pressure-scored
  granular bow of his catalog with a wetness-gated diffusion field is what this
  prototype contributes; the constituent techniques are not new.
- Audio is 100% his verified catalog (`REAL_TRACKS`), granularly re-voiced. No
  oscillators, no synth tones, no generated audio.

## Files

- `page.tsx` — UI, pointer→stroke derivation, auto-demo loop, safe-master wiring,
  fallbacks, house-style chrome, design-notes overlay.
- `ink.ts` — WebGL2 ping-pong ink-diffusion field + Canvas2D fallback.
- `bow.ts` — granular buffer-bow of his real `AudioBuffer`.
- `stroke.ts` — idle auto-demo calligraphic gesture generator.
