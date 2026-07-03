# Ember Replay

_Route: `/dream/1140-ember-replay`_

`state: psychedelic hallucination as top-down replay of a learned world · pole: cosmic-ambient (warm, dreamlike)`

`ambition: #2 (5 subsystems) + #3 (named refs) + #5 (fresh research <30d, implemented as the replay engine)`

## The one question

**What if a psychedelic hallucination is not random noise but the mind
REPLAYING a learned world top-down — and we fed it Karel's real recorded piano
to replay?** You hear the actual piano dissolve and re-bloom as memory, and
watch each recalled grain flare as a warm ember in a slowly-breathing
constellation.

## Fresh research anchor

A **2026 eLife computational study** modelled classical psychedelics as shifting
perception away from bottom-up sensory inference toward a top-down generative
**REPLAY of a learned world** — under that model a hallucination looks less like
noise and more like recombined wake-time memory. This piece is a drug-free
embodiment of that model, with Karel's real music standing in for the "learned
world." The replay walk _is_ the implementation of the eLife idea, not a
decoration on top of it.

This is deliberately **not** a "first-ever" novelty claim — granular replay and
recombination have deep priors (see below). The fresh part is the honest
research-model framing plus the use of real recorded music as the learned world.

## How it works — five subsystems (`audio.ts` + `page.tsx`)

1. **Three-tier real-audio loader.** (1) Paste a Path recording id →
   read-only `GET /api/audio/:id` → `{url}` → `fetch` → `decodeAudioData`.
   (2) Drop your own file → `decodeAudioData`. (3) A deterministic,
   offline-rendered warm-piano demo so the world is never empty or silent — it
   auto-plays on mount.
2. **Grain analysis (LEARN).** `analyzeGrains()` runs energy-novelty onset
   detection with an adaptive threshold, and for each onset captures a short
   slice of the **actual audio** (its offset + duration) plus a rough pitch
   (autocorrelation, confidence-gated), brightness (zero-crossing rate) and
   energy. That is the vocabulary — the learned world.
3. **Top-down replay generator (REPLAY).** A 30 ms look-ahead scheduler (the
   Chris Wilson pattern) walks the vocabulary as memory: mostly it steps to a
   grain _like_ the current one (similar register + brightness — smooth recall),
   and sometimes it jumps (drift/mutation). It plays the **actual captured
   grains**, gently overlapping and micro-detuned. It never hard-loops.
4. **Warm particle field.** Canvas2D additive-glow (`"lighter"`) constellation
   on a warm near-black ground (`#0a0705`), deep-rust → amber → gold → pale-ember
   highlights. Each replayed grain blooms a mote at a **fixed home position for
   its grain index**, so a recurring memory re-blooms in the same place; faint
   threads trace the recombination path; the whole field breathes and drifts
   slowly (no strobe).
5. **JI drone bed.** `startDroneBank` (shared) provides a warm just-intonation
   drone whose root is folded down from the recording's median pitch, sitting
   under the replay.

Steerable live: **Replay density**, **Drift / mutation**, **Register**, **Bloom**.

### How it differs from its neighbours

- `1130-spectral-scrub` did granular _time-stretch scrubbing_ of real audio.
- `1135-deep-memory` was a _synthetic_ Markov + Hebbian note-machine.
- **Ember Replay** replays the _actual captured grains of the real recording,
  recombined_ — the audio is Karel's piano re-sequenced, not synthesised notes.

## References / lineage

- The **2026 eLife** top-down-replay-of-a-learned-world psychedelic model
  (implemented as the replay engine).
- **Refik Anadol** — data / memory treated as living pigment.
- **Brian Eno** — generative / systems music that evolves without repeating.
- Granular synthesis (Xenakis / Roads) and concatenative/mosaicing resynthesis
  are the honest technical priors.

## How to use

- **Load a real track:** paste a Path recording id into the field and press
  **Learn track** (or drop an audio file). It analyses the recording into grains
  and immediately begins replaying them.
- If no track is loaded, a warm demo world auto-plays so the piece is never
  blank or silent.
- Move the sliders to steer the dream: **Density** (how often memory re-blooms),
  **Drift** (how far the walk wanders / detunes), **Register** (low → high
  grains), **Bloom** (loudness of each ember).

## Honest limits

- **Not ear- or eye-verified in this build.** It typechecks, lints clean, and
  the logic was read end-to-end, but it was assembled headless — the
  grain-replay tuning (interval, overlap, detune ranges) really needs a listen on
  a real recording to dial in, and the balance below assumes typical piano
  material.
- **Onset detection is energy-novelty**, not a state-of-the-art onset model;
  dense or heavily-reverberant material may under- or over-segment, and pitch is
  a confidence-gated autocorrelation estimate (unvoiced grains report 0).
- **Autoplay policy:** the demo engine starts on mount but some browsers keep the
  `AudioContext` suspended until a gesture — loading a track or dropping a file
  resumes it. The constellation always animates regardless.
- The "never hard-loops" property is about the continuous similarity-weighted
  walk with drift, not a formal aperiodicity proof; with Drift at zero it can
  settle into a slowly-wandering attractor. Nudge Drift to keep it dreaming.
- Rendering is Canvas2D additive glow (chosen for reliability), not a true bloom
  shader; the volumetric feel is layered radial gradients plus a trailing fade.
- Determinism: all choices come from a seeded mulberry32 PRNG + `performance.now`
  — no `Math.random` / `Date.now`. The same seed dreams the same dream.
