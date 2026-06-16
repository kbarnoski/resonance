# 671 · Glasswork

A tender, intimate, 3am music-box. A slow generative glass/celesta piece whose
harmony **breathes** through real four-part **voice-leading**: on every chord
change each voice glides (audible portamento) to its *nearest* available chord
tone, so you can both **see** the threads cross and **hear** the pad slide
rather than jump.

Route: `/dream/671-glasswork`. It plays itself — press **Begin** and listen.
Zero interaction required; a reviewer glancing at 6:30am sees blooming nodes and
hears the piece.

## How to use

- **Begin** — creates and resumes the `AudioContext` inside the click (iOS
  Safari requirement) and starts the autonomous piece. The pad swells in over a
  few seconds, then the melody enters.
- **Move the pointer** (optional, gentle): higher = brighter register + more
  shimmer; further right = slightly busier (shorter chords, faster melody).
- **Tap / click** "drops a stone": pulls the harmony toward rest (the tonic)
  on the next chord change.
- After ~1.5s of no interaction the mood eases back to neutral and it is fully
  autonomous again.

## Musical design

- **Key:** D Dorian (D E F G A B C) — minor-ish but with the bright natural-6
  (B) that gives the wistful-not-sad colour. Deliberately **not** C-major
  pentatonic. An occasional Lydian #11 (G#) tint appears as a rare colour note
  when the register is bright.
- **Harmony:** a tension/resolution-weighted random walk over a small palette of
  diatonic chords (`i` Dm7, `IV` G, `bVII` C, `v` Am7, `ii` Em, `bIII` F,
  `IVadd9`, and a rare `tint`). Hand-tuned transition weights give a homeward
  gravity — tension chords lean to rest, home is allowed to wander. A new chord
  lands roughly every 6–10s. Never a fixed loop.
- **Voice-leading (the technique anchor):** four voices, each in its own
  register window. On each chord change an **exhaustive** 4-voice assignment
  search picks target notes that minimise total semitone motion, penalising
  doublings and unisons so the chord stays open. Each voice then portamentos
  (~0.4–0.8s) to its target — the glide is the point.
- **Melody:** a separate bell voice that never repeats its previous note,
  weighted over chord tones (strong) + Dorian passing tones (weak), with a
  per-phrase sine register-arch (rise then fall over ~7–10 notes) and woven-in
  rests. Silence is part of the piece.

## Synth (all Web Audio, no samples, no deps)

- **Music-box bell:** FM-ish carrier + inharmonic modulator, fast attack / long
  decay, for the melody.
- **Glass pad:** four voices, each a detuned triangle+sine pair through a
  lowpass; frequencies portamento on retarget so the voice-leading is audible.
- **Sub:** a soft sine on the chord root, an octave below the bass voice.
- **Reverb:** a `ConvolverNode` fed a synthetic decaying-noise impulse.
- **Shimmer:** a filtered (bandpass) feedback delay tail, also routed into the
  reverb for glassiness; pointer height opens it up.
- **Master chain:** ends in a `DynamicsCompressor` brick-wall limiter
  (threshold −6dB, ratio 12) into a master gain of 0.34 — it can never clip or
  blast.

## Visual design (inline SVG only)

Dark constellation of soft glowing nodes built from `<radialGradient>` +
`<feGaussianBlur>` filters. One node per pad voice, positioned by pitch
(y = pitch height). Nodes **bloom** (scale + opacity) on each onset and fade.
Faint `<line>` threads trace each voice's glide from old tone to new and fade
out. The melody bell spawns a brief brighter `<radialGradient>` spark. Per-frame
state lives in `useRef`; React re-render is throttled to ~24fps via a small tick
counter, so the SVG animates without re-rendering on every rAF.

## Files

- `theory.ts` — D Dorian scale, chord palette, transition weights, MIDI helpers.
- `voiceleading.ts` — nearest-tone four-part assignment search (the engine).
- `compose.ts` — harmonic random walk + weighted never-repeating melody.
- `synth.ts` — the full Web Audio graph (bell, pad, sub, reverb, shimmer,
  limiter).
- `page.tsx` — client component: scheduler, inline-SVG renderer, interaction, UI.

## Named references

- **Brian Eno** — *Music for Airports*, *Reflection* (generative ambient).
- **Harold Budd** — *The Pearl* (glassy, intimate piano).
- **Erik Satie** — *Gymnopédies* (intimate melancholy, space, slow harmony).
- Technique anchor: classical four-part **voice-leading** — move each voice the
  smallest distance.

## Ambition self-assessment — honest 2/5

This clears the ambition floor on two counts, no more:

- **#2 ≥3 distinct subsystems** — five: harmonic random-walk · nearest-tone
  voice-leading engine · weighted melody + scheduler · 4-voice synth with
  reverb/shimmer · inline-SVG renderer.
- **#3 named references** — Eno / Budd / Satie + the voice-leading anchor.

Generative ambient with voice-leading is **worked territory** — this is not a
first-ever technique and does not claim to be. The contribution here is honest
craft: a real (exhaustive, doubling-penalised) voice-leading solver wired to an
*audible* glide and a matching SVG that shows the threads cross.

## Unverified / tuning surface

- **Build-verified, not ear-verified.** `npx tsc --noEmit` and `npx eslint` pass
  clean on this folder; it has not been listened to in a browser in this
  environment. The glide timing (0.4–0.8s), the chord-walk transition weights,
  the melody rest probabilities, and the reverb/shimmer balance are the tuning
  surface — they are reasoned defaults, not auditioned ones.
- The exhaustive voice search assumes small per-voice candidate sets (it is, for
  triads/7ths inside tight windows); if windows were widened a lot it would want
  a beam/greedy cutoff. The current pruning keeps it trivially cheap.
