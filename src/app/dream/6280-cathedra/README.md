# 6280 · Cathedra

**An alternate journey engine for Resonance — one dramaturgical tension curve, sung and walked at once.**

## The one question

_What if Resonance had an alternate journey engine — a wordless, through-composed
~4-minute immersive arc where a single tension curve drives BOTH the generative
music AND a camera journey through morphing sacred architecture: descending into
a dark narthex, pressure building, breaking through into blinding light, then
ascending home?_

The current Resonance engine is a psychedelic 6-phase spread. This is a different
one: a **Freytag arc rendered spatially** as an Inner-Sanctuary passage. The
dramatic arc is not illustrated by the space — the arc *is* the space. Where you
are in the corridor is where you are in the drama.

## How the tension-curve engine works (`engine.ts`)

A single normalized **T(t) ∈ [0,1]** runs over a ~240-second timeline and loops
forever. It is a **smoothstep spline** through named control points (a rising
action that peaks mid-climax and resolves back home), plus a small **seeded
low-frequency wobble** (three slow, incommensurate oscillators) so the curve
breathes and never feels mechanical.

Every frame the engine reads one clock and emits a `Frame`: the phase name, `T`,
and derived scalars — `lightIntensity`, `corridorScale`, `warmth`, `cameraSpeed`,
`harmonicTension`, `breakthroughness`, `ascentness`, and a monotonic `journey`
distance. **The same `Frame` is handed to both the audio and the scene**, so they
can never drift out of agreement: the music and the passage are two renderings of
one number.

## The phase map (Freytag → spatial passage)

| Phase | Fraction | Drama | Passage | Music |
|---|---|---|---|---|
| **Narthex** | 0.00–0.15 | exposition, low tension | dim, enclosed threshold; slow | open octaves/fifths, dark lowpass |
| **Nave** | 0.15–0.50 | rising action | colonnade lengthens, columns rise, camera accelerates toward a growing light | added 9ths/6ths, register creeps up, denser strikes |
| **Breakthrough** | 0.50–0.65 | climax | the architecture opens into a blinding aperture; widest, brightest | Lydian #11 shimmer doubled an octave up, loudest, high |
| **Ascent** | 0.65–1.00 | falling action + resolution | the space calms and rises, light softens to a rose-violet afterglow, a sense of arriving | harmony resolves toward open consonance, high and soft — then loops home |

## How audio and visuals share T

- **Audio (`audio.ts`, `score.ts`):** `harmonicTension` selects a chord band and
  lifts the whole voicing in register; a pool of detuned oscillators glides
  between chord tones through a lowpass whose cutoff tracks tension; a sub drone
  underpins it; sparse FM "bell/piano" strikes arpeggiate the chord, denser and
  higher as tension climbs; a high shimmer swells only at the Breakthrough.
  Everything runs through a code-generated **cathedral-tail convolution reverb**
  and a limiter, master ≈ 0.16.
- **Visuals (`scene.ts`):** `corridorScale` sets column height and colonnade
  width and fog openness; `warmth`/`ascentness` set colour temperature (cool
  indigo → gold → rose-violet); `lightIntensity` drives the aperture size, the
  key-light, and **UnrealBloomPass** strength. Two **instanced** colonnades and
  instanced arches wrap endlessly in z so the camera flies forward forever, and
  `breakthroughness` pulls the aperture close at the climax.

## Real-audio option

Drop an audio file (or use the button). It is decoded, looped, and analysed by an
`AnalyserNode`; a **live tension proxy** — a blend of RMS energy, spectral
centroid (brightness) and spectral flux (change) — **replaces** the synthetic
curve and drives the whole world, while the generative bed ducks beneath it. If
no file is dropped, the synthetic engine and generative score run fully alive on
load. The file is never required and decode failures fall back silently.

This is a **multi-cycle alternate journey engine**, not a one-shot: the ~4-minute
arc simply loops, and the seeded wobble means no two cycles feel identical.

## Determinism & safety

No `Math.random()`, `Date.now()`, or `new Date()` — all chance is a seeded
`mulberry32`; all time is `performance.now()` / the rAF timestamp. WebGL failure
shows an on-brand notice; audio init is wrapped in try/catch and resumes on first
gesture. `prefers-reduced-motion` scales sway and forward speed. All luminance
change is slow drift (well under 3 Hz) — the Breakthrough brightens by ramp,
never a flash. three.js resources are disposed on unmount.

## References

- **Gustav Freytag**, _Die Technik des Dramas_ — Freytag's Pyramid, the five-part
  dramatic arc that shapes T(t).
- **Morwaread Farbood**, "A Parametric, Temporal Model of Musical Tension" — the
  quantitative, time-evolving view of musical tension.
- Ebrahimzadeh, Bernardes & Stober, _tonal-tension conditioning_ (arXiv
  **2511.19342**, 2025).
- **James Turrell**'s light spaces and Gothic cathedral phenomenology — light as
  architecture, the aperture as destination.
- **Arvo Pärt** (tintinnabuli) and **Max Richter** — the transcendent-generative
  lineage the score reaches for.

## What's rough (honest)

- The generative harmony is convincing but simple: four fixed chord bands with a
  register lift, not true voice-leading — close listening reveals the seams at
  band changes despite the slow glide.
- The live-file tension proxy is a coarse three-feature blend; it tracks energy
  and brightness well but can lag or over-react on percussive material, and its
  mapping to the phases is heuristic rather than trained.
- The architecture is a single repeating colonnade motif; it morphs in scale and
  colour but does not change *typology* between phases, so the Narthex and the
  Nave read as the same room at different sizes rather than different rooms.
