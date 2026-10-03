# Morning digest — last updated 2026-10-03T01:24Z (17:45 PT fire, cycle 1275)

> **The lab finished something — for the first time ever.** You've been asking
> (via the jury) for a concept to reach **cycle-3**, not a seventh fresh part-one.
> Tonight it did: `chordweave` is the finished `chordwell`→`chordfold` merge, built
> **DEEP ×2** (two voice-leading algorithms raced, one shipped, **nothing banked** —
> the six-deep backlog did NOT grow). See `docs/dreams/JURY.md`.

## New since yesterday
- **`18624-chordweave`** → https://getresonance.vercel.app/dream/18624-chordweave
  **Harmonize your recording in the chord of the moment — now with real
  four-part voice leading.** Play one of your takes, then pull your two hands
  apart: the single recording fans into a chord of *itself*, diatonic to whatever
  chord the piece is actually playing right now (read live from its own chord
  track). The deepening over cycle-2 (`chordfold`): when the harmony changes, the
  four voices no longer each jump to their nearest tone independently — a **global
  solver moves the whole stack the least total distance and never lets voices
  cross** (it'll swap two voices if that's smoother), gliding to the new chord.
  Every chord boundary now **blooms a surge** through the current so you can *see*
  the harmonic rhythm. Harmonic-chroma light: warm over major, cool over minor.

## In progress / partial
- **Nothing half-built, and nothing new banked** — this was a deliberate
  *consolidation* fire. The DEEP sibling `18608-chordglide` (a per-voice greedy
  glide with an explicit audible-portamento engine) lost the curation and its two
  good ideas were folded into chordweave's README as **cycle-4 notes**, not added
  to the backlog.
- The backlog is still ~6 deep (swellform, leanfield, swellbody, steppulse,
  vowelbend). Next fire I lean toward a **second** finish — `vowelbend`→`throatmorph`
  (throatmorph is the window's 5/5 best) — to prove cycle-3 is repeatable, not a fluke.

## Research findings worth a look
- **Minimal Audio *Lucid*** (2026) ships real-time **grain scale-lock** — every
  grain retuned to a *fixed* key. chordweave inverts it: lock the harmonizer's
  grains to the take's **own moving chords** with minimum-motion part-writing.
  (~4mo old, so honestly not badged as last-14-days research — just the anchor.)

## Open questions for Karel
- **30-second check on chordweave:** allow the camera, play a track, and pull your
  hands apart through a chord change — do the four voices glide smoothly (not jump),
  and does the chord fan sound diatonic to your piece? (Cloud can't test a webcam or
  play audio — the solver, the detune glide, the surge in both renderers, and the
  full control path are code-verified; the live hand-feel and the sound of the
  part-writing on your real take are the only unconfirmed parts.)
- **I took the cycle-3 merge despite the two-hand tension** (your open question from
  yesterday) because the jury promoted FINISH to #1 and named chordfold itself — a
  cycle-3 *deepening* is exempt from the "break off two hands" ban (that's for fresh
  mints). If you'd rather I keep minting fresh non-two-hand signals instead, one word
  flips it back.
- `main` fast-forwarded cleanly a **4th** fire running — the force-rewrite problem stays fixed.
