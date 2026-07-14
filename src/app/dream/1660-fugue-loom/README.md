# Fugue Loom (`1660-fugue-loom`)

**The one question:** *What if you could watch a fugue compose ITSELF — the
subject entering voice by voice, answered, inverted, driven to a stretto — and
hear the whole architecture unfold?*

Fugue Loom is a genuine **fugal-architecture engine**, not a scale drone and not
a Markov melody. From a single integer seed it composes a complete three-voice
fugue in D minor with real form and **memory**: the same subject and
countersubject shapes recur, transformed, so the music at 3:00 is a development
of the music at 0:00. It plays itself start to finish (~90 s) and writes its own
scrolling piano-roll score as it goes, highlighting every subject entry so you
*see* the subject enter voice by voice, *see* the answer sit a fifth above, and
*see* the stretto overlap. A **New subject** button re-seeds the whole fugue
deterministically.

This is off-GPU by design: the output surface is **SVG + DOM only** — the
self-writing score is the point.

---

## The fugal form it implements

A real fugal-form state machine runs these sections in order (see the live
section label and the timeline bar):

1. **Exposition** — Voice I states the SUBJECT alone. Voice II enters with the
   **tonal ANSWER** (the subject at the fifth, its opening rising-fifth head
   *contracted to a fourth* — a genuine tonal adjustment) while Voice I plays the
   **countersubject**. Voice III then enters with the subject in the bass, the
   others in counterpoint.
2. **Episodes I–IV** — connective passages that state *no* full subject: a
   **sequence** built from the subject's head fragment, imitated across voices
   and transposed by step (descending, then ascending) to modulate.
3. **Counter-exposition** — subject + answer restated in a fresh voice order
   (bass first), the same material re-voiced.
4. **Middle entries** — the subject returns in related colours: **relative
   major** (+2 diatonic degrees), then in **melodic INVERSION** (contour
   mirrored about the tonic, top and bass), then in the **dominant** region.
5. **Stretto** — overlapping entries: a voice enters with the subject *before*
   the previous statement finishes, in two rounds with a tightening gap.
6. **Pedal-point close** — the bass sustains a dominant→tonic pedal under a final
   subject statement, resolving to a held D-minor tonic triad.

### Voice-leading

Voices are independent diatonic lines worked in **scale-degree space** (so every
transposition, answer and inversion stays in key by construction). The
countersubject is generated with contrary-motion and consonance preference; free
counterpoint is stepwise and consonant; and a final pass scans every voice pair
for **parallel perfect fifths/octaves** and nudges the offending *free* note by a
diatonic step (subject statements are never altered). It does not claim academic
perfection — it aims to *read* as a fugue in both ear and eye.

### Memory

`makeSubject` and `makeCountersubject` run once per seed and are **frozen**; every
later entry reuses those exact shapes, transposed / inverted. That reuse is what
makes the piece cohere and develop rather than wander.

---

## Named references

- **J.S. Bach**, *Die Kunst der Fuge* (BWV 1080) and *Das Wohltemperierte
  Klavier* — the canonical models for subject/answer, countersubject, episode,
  inversion, stretto and pedal-point.
- **J.J. Fux**, *Gradus ad Parnassum* (1725) — species counterpoint; the source
  of the contrary-motion / consonance / no-parallel-perfects rules applied here.
- **G. Mazzola et al.**, three-voice counterpoint (arXiv:2606.01102, 2026) — a
  formal model of admissible three-voice motion informing the voice-leading pass.

---

## Ambition criteria hit

- **Genuinely different at 0:30 vs 3:00** — 11 distinct formal sections; the same
  subject appears as answer, in relative major, inverted, in the dominant, and in
  stretto — never a loop.
- **Reads as a fugue** — recognizable subject, real tonal answer at the fifth, a
  returning countersubject, audible/visible stretto overlap, pedal-point cadence.
- **See = hear weld** — the SVG piano-roll writes exactly what sounds; each
  subject statement is outlined and labelled in its voice's warm hue.
- **Deterministic** — seeded mulberry32; no `Math.random` / `Date` in executable
  code; "New subject" advances the seed via an LCG step.
- **Off-GPU** — SVG + DOM only, no canvas/WebGL/WebGPU.
- **Safe & self-playing** — autonomous on load, master gain ≤ 0.14 →
  compressor, slow glow pulse (~0.13 Hz), reduced-motion honoured, full teardown
  (`audioContext.close()`).

---

## Files

- `fugue.ts` — the composition engine (PRNG, scale, subject/answer/countersubject/
  inversion, the section builder, the parallel-perfects pass).
- `audio.ts` — output-only Web Audio player: three detuned-oscillator voices,
  per-note ADSR, look-ahead scheduling, master → compressor → subtle delay.
- `page.tsx` — the `"use client"` page and the self-writing SVG scrolling score.

---

`state: composes-itself-end-to-end · pole: architecture-you-can-see-and-hear`
