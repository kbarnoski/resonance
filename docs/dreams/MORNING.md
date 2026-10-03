# Morning digest — last updated 2026-10-03T13:15Z (05:45 PT fire, cycle 1276)

> **Jury verdict (pushed since the last fire)**: The lab finally FINISHED something — `chordweave` is the first concept ever to reach cycle-3, a real algorithmic deepening (proper four-part voice leading), and it did it without growing the backlog — but finishing the chord lineage re-concentrated two-hands + WebGPU, so tomorrow I want either the *second* finish (to prove it's a habit, not a fluke) or a clean swing into the untouched "memory" lane; tone is **it listened, real progress — one win, not yet a pattern.** See `docs/dreams/JURY.md`. — **This fire answered it: the second finish below.**

> **The lab finished a second one — cycle-3 is now repeatable, not a fluke.**
> Last fire shipped the first-ever cycle-3 (`chordweave`). Tonight it shipped the
> **second** — `formantwell`, the other merge the jury named (`vowelbend`→`throatmorph`)
> — built **DEEP ×2** (two architectures raced, one shipped, **nothing banked**, the
> backlog drawn **down** 6→5). Your "No piece has ever reached cycle-3" number is now
> answered twice. See `docs/dreams/JURY.md`.

## New since yesterday
- **`18656-formantwell`** → https://getresonance.vercel.app/dream/18656-formantwell
  **Reshape the vocal tract of your own recording with two hands — the piano learns
  to sing vowels (glassy→woody→vowel) at dead-fixed pitch.** Play a take; midpoint of
  your hands slides the timbre, height = how far from the original, spread = the vowel.
  The cycle-3 win over throatmorph (cycle-2): it reads your recording's **own** formants
  with a cepstrum **and** renders the morph through a provably-stable biquad cascade — so
  it keeps throatmorph's "own-body" character but, with **no STFT resynthesis, it
  structurally can't hiss** (the one risk that kept throatmorph unshipped for a while).

## In progress / partial
- **Nothing half-built, nothing new banked** — a deliberate *consolidation* fire. The
  DEEP sibling `18688-tractblend` (ran both engines in parallel with a 4th hand axis to
  crossfade STFT⇄biquad and A/B them by ear) lost curation; its audition idea became a
  **cycle-4 note** in formantwell's README, not a backlog entry.
- Backlog is now **5** (down from 6): swellform ×2-banked, leanfield, swellbody, steppulse.

## Research findings worth a look
- **zplane TIMBRE** (2026-09-16) — a real-time **poly-formant shaper** that moves
  formants while leaving pitch intact, shipping as a plugin. formantwell advances it:
  reshape the recording's *own* formants toward glassy/woody/vowel via a clean ordered
  cascade, conducted by hand. (17 days old → anchor + named ref, honestly not badged as
  last-14-days research.)

## Open questions for Karel
- **30-second check on formantwell:** allow the camera, play a track, and move your
  hands apart/up — does the piano morph toward a vowel-like body smoothly and **cleanly
  (no hiss)**, with pitch unmoved? (Cloud can't test a webcam or play audio — the full
  control path, the cepstral extractor, the ordered-biquad morph, and the hiss-proof
  design are code-verified; only the live hand-feel and the sound on your real take are
  unconfirmed.)
- **Both named cycle-3 merges are now done** (chordweave + formantwell). With FINISH
  proven repeatable and divergence healthy, I lean next toward the jury's thinnest lane:
  a piece with **MEMORY** — different at minute 5 than minute 1, a genuinely new category.
  Or a low-risk `swellform` backlog burn-down. One word steers it.
- `main` fast-forwarded cleanly a **5th** fire running — the force-rewrite problem stays fixed.
