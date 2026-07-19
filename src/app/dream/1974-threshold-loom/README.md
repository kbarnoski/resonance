# 1974 — Threshold Loom

*A sleep-onset instrument. The letters don't matter — only the rhythm.*

**The one question:** What if falling asleep were an instrument — what if the
*rhythm* of your typing (not the letters) paced a hypnagogic sleep-onset field
that dissolves you toward the threshold of sleep?

You type. The letters are ignored; only the **cadence** — the timing of the gaps
between keystrokes — is read. Type slow, even, and drowsy and the field deepens,
carrying you toward the threshold of sleep. Type frantically and you pull
yourself back toward waking. Stop, and a deterministic phantom typist takes over
at a drowsy pace and keeps sinking.

## The state — hypnagogia

Hypnagogia is the borderland between waking and sleep: the mind loosens, the
senses drift, and unbidden imagery blooms. This piece stages it as a **Ganzfeld**
— an unstructured, near-uniform luminous field. Deprived of edges to hold onto,
the visual cortex begins to hallucinate its own structure: phosphenes and
"form constants" (Klüver) — speckles, faint lattices, drifting spots of light.

## How it listens — cadence, not letters

Every keystroke's inter-keystroke interval feeds a slow state integrator called
**depth** (0 = awake, 1 = at the threshold). Long, even intervals read as drowsy
and push depth up; short, jittery bursts read as frantic and pull it down.
Steadiness counts too — an even rhythm sinks faster than a ragged one. Nothing
reads *what* you typed: a poem and a password drive it identically.

## What you see — Canvas2D only

- A full-viewport **Ganzfeld ground**: dim warm-dusk violet with a soft vignette
  while you're awake, brightening and losing its edges toward a boundless
  soft-white as you approach the threshold.
- Each keystroke blooms a **phosphene form-constant** — frantic keys scatter
  tight speckle; steady drowsy keys grow soft drifting spots and organized hex
  lattices. Blooms swell and fade on a gentle `sin()` envelope — nothing snaps.
- Near the threshold the imagery loses contrast and dissolves into the uniform
  field: structure, and language, let go.

Plain 2D canvas only — no WebGL / WebGPU / three.js / SVG.

## What you hear — descending forever

Master gain is low (≤ 0.16), behind a `DynamicsCompressor` limiter.

- A **Shepard–Risset glissando descending forever** (Shepard 1964 / Risset):
  octave-spaced sine partials under a fixed Gaussian envelope glide down with no
  audible bottom, so the ear is carried downward toward sleep without ever
  arriving. Deeper state → faster, brighter descent.
- A soft detuned **cosmic pad** that swells and opens as you deepen.
- A quiet **phosphene chime** per keystroke, dropping an octave in the deep
  state.

## The phantom typist (self-demo)

So the piece is never blank or silent, a deterministic, seeded phantom typist
types at a drowsy cadence on its own after **Begin** — driving the field and the
sound (critical for the headless review, where nobody types). The moment you
touch a real key it yields to you, and re-arms only after ~16 s of stillness.

## Safety

Built to be gentle. **No strobe or flicker** — every luminance change is a slow
sub-Hz drift, blooms fade over seconds, and any theta-band feeling lives in
*audio amplitude*, never in light. `prefers-reduced-motion` freezes the field to
a calm still state. Audio is gated behind the Begin gesture and kept quiet.

## Determinism

No `Math.random`, `Date`, or `performance.now` touches anything you see or hear —
timing rides the animation frame's own clock (`dt`) and a fixed-seed mulberry32
PRNG, so the piece is byte-reproducible (the 06:30 headless review sees the same
dream every morning). `AudioContext.currentTime` (allowed) schedules audio.

## References

- Wackermann, Pütz & Allefeld, "Brain electrical activity and subjective
  experience during altered states of consciousness: ganzfeld and hypnagogic
  states" (*Cortex*, 2002; PMID 12433389) — form-constants ≈ 86% of hypnagogic
  imagery; Ganzfeld EEG resembles relaxed waking.
- 2020 fMRI: multimodal Ganzfeld induces progressive thalamo-cortical decoupling
  (PMC7596232).
- Roger Shepard (1964) / Jean-Claude Risset — the endlessly descending
  Shepard–Risset glissando (the auditory barber-pole).
- The "Tetris effect" and the hypnagogic-imagery literature — repeated waking
  activity replays as sleep-onset imagery.

## Files

- `page.tsx` — React client component: keystroke-cadence integrator, phantom
  typist, render/audio loop, HUD, teardown.
- `field.ts` — Canvas2D Ganzfeld field + phosphene form-constant blooms +
  mulberry32 PRNG.
- `audio.ts` — Web Audio bed: descending Shepard–Risset (shared engine),
  cosmic pad, per-keystroke chimes.
- `readme-text.ts` — these notes as an exported string (design-notes overlay).
- `README.md` — this file.
