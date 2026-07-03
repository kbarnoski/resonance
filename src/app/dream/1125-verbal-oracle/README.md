# 1125 · The Verbal Oracle

**The one question:** What if you looped a single *identical* spoken word until
your own brain rewrote it into different words that were never spoken?

Put on headphones, press **Begin**, and hold your attention on the word. Nothing
in the sound will change. Somewhere after fifteen or twenty seconds, it will
begin to change anyway — into *stress*, *dress*, *arrest*, a name, a nonsense
syllable. The change is manufactured entirely inside you.

## The mechanism: the Verbal Transformation Effect

R. M. Warren (1958; Warren & Gwynn, 1961) found that when **one recorded word is
repeated completely unchanged** at roughly 1.5–3 times per second, most listeners
begin, after ~15–40 s, to *hear it morph* into other words or nonsense. The
percept is purely auditory and self-generated — the stimulus never varies. The
strict precondition is a **byte-for-byte identical, click-free loop**: if the
repetitions differ (even by a seam click) the spell is weaker or absent.

This is deliberately **not** Deutsch's dichotic illusions and **not** semantic
satiation (which is about *meaning* draining from a written/spoken word). VTE is
about the *acoustic form* itself reorganizing.

## What it does

- **`voice.ts` — a source–filter formant synthesizer.** No audio assets, no
  fetch: the word is built in-browser and rendered **offline** into an
  `AudioBuffer`.
  - _Glottal source_: a sawtooth buzz at f0 ≈ 110–125 Hz with a gentle natural
    pitch contour.
  - _Vocal tract_: **three parallel band-pass "formant" filters** (F1/F2/F3)
    whose centre frequencies are automated along a short **vowel script** to
    spell the word's vowel nucleus. Values are the canonical adult-male formants
    of **Peterson & Barney (1952)** (e.g. /ɛ/ ≈ 530/1840/2480, /i/ ≈
    270/2290/3010, /ɑ/ ≈ 730/1090/2440, /oʊ/ ≈ 570/840/2410). Diphthongs are
    written as a glide between two targets.
  - _Consonants_: band-passed **noise bursts** for the fricatives and plosive
    edges (the /s/ + /t/ of "rest", the /f/ of "life"/"flow").
  - _Post_: peak-normalize, then **cosine-fade both edges to exact silence** so
    the loop seam is click-free.
- **`words.ts`** — four one-syllable presets: **rest** (Warren's canonical
  stimulus), **life**, **say**, **flow**, each with an `alternates` list of the
  illusory words listeners commonly report (used only as gentle placard hints).
- **`VerbalOracleEngine`** — a **look-ahead scheduler**. A 25 ms timer stays
  ~0.2 s ahead of `ctx.currentTime` and queues a *fresh* `AudioBufferSourceNode`
  playing the *same* buffer at `nextTime += period`. Rate is adjustable 1.2–3 Hz.
  Everything runs through a master gain → `DynamicsCompressor` (soft limiter) →
  destination. **Every repetition is sample-identical — that invariance is the
  entire illusion.**
- **`page.tsx`** — a paper-white (ink-on-cream) client component: Begin / Stop,
  the four-word picker, a rate slider, a **perception log** (drop a timestamped
  mark the moment your percept shifts, read against the shaded ~15–40 s onset
  window), and a **minimal Canvas2D companion** (the word breathing, a
  loop-pulse ring that flashes each repetition, and a thin waveform of the actual
  buffer with a playhead). A deterministic **seeded ghost listener**
  (`mulberry32`, no `Math.random`/`Date.now`) drops a couple of *illustrative*
  marks in the onset zone so the timeline reads as populated on a cold glance.

## Why audio-first

The sound is the artwork. The illusion happens in the ear and the auditory
cortex, not on screen, so the visual is deliberately **sparse** — a companion,
not a spectacle. The restraint is the point: a busy canvas would pull attention
out of the very listening the piece depends on.

## Honest caveat

This was built in a box with **no speakers**, so it is **not ear-verified**. The
formant recipes are physically reasonable (Peterson & Barney values, parallel
band-pass tract) and the loop is provably identical and click-faded, but whether
each word is *intelligible* and whether the transformation actually *lands* needs
a real **headphones pass** by a human. Treat the formant tuning as a first draft.

## Next-cycle deepening

- A proper phoneme / di-syllabic articulatory model (formant transitions with
  real consonant place cues, nasalization, better /r/,/l/,/w/ glides).
- A free-text "what did you hear?" capture that **clusters** listeners' reported
  illusory words over time — turning the placard hints into real data.
- Adaptive rate: nudge toward whatever repetition rate makes a given listener
  transform fastest.
- Optional stereo/diotic vs. slight-detune conditions to probe the identical-loop
  precondition directly.

## Constraints honored

Web Audio + Canvas2D only, no new deps, no assets, no network. Everything is
self-contained in this folder. Degrades to a readable notice without Web Audio;
the seeded ghost + the synthesized word keep it non-blank/non-silent before any
interaction.
