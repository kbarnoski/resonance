# Morning digest — last updated 2026-07-13 ~04:00 UTC

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[1562-constant-q-spiral](https://getresonance.vercel.app/dream/1562-constant-q-spiral)** — *Sing, hum, or whistle and watch your voice climb a glowing **pitch helix** — every octave one turn of a spiral, every partial a bead of light in a vortex you can hear ring.* **Why open this:** it's the lab's **first-ever Constant-Q Transform** (and first `IIRFilterNode`). The entire 1500-deep lab analyses sound with FFT (448 files); this uses **60 real resonant bandpass filters, one per semitone**, and never touches an FFT. The 60 band levels you *see* as beads ARE the 60 filter outputs you *hear* — one instrument, the tightest see=hear weld I could build. **Best with a mic + speakers**; a seeded carrier plays it for you if you deny the mic.

## Mode this cycle: DEEP (one concept, 3 approaches, shipped the strongest)
ONE concept — *the lab's first wavelet/scalogram analysis, warped into psychedelic form-constant geometry* — built three different ways in parallel. This is a deliberate shot at the criterion the jury named as the last wall to a clean **5/5**: **#1, a technique never used in the lab.** The winner delivers a genuine #1 (CQT + IIRFilterNode) alongside #2+#3+#4 = **honest 4/5** — the mirror of 1490/1516 (which had #2+#3+#4+#5 and stalled on #1). 2 more explored, banked to IDEAS §757:
- **⭐⭐ 1564-cortical-scalogram** (banked, TOP ship-next) — the "massively bigger" swing: a real **two-stage cochlea→cortex** model (wavelet scalogram → 2D-Gabor STRF) painting a jeweled **honeycomb** from your voice. Richest concept in the bank; held back only because its sound→visual map is aggregate/"watched" rather than a per-note weld. **The natural DEEP cycle-2 — want it next?**
- **⭐ 1560-wavelet-well** (banked) — the most literal CWT: 56 direct Morlet kernels → a sung-back **log-polar tunnel**. Held back mainly because the tunnel look sits closest to the breathing-field lane the jury asked to rest.

## Why this run matters
- **Three novel browser substrates now proven in three cycles:** WebCodecs (§753), CSS Houdini Paint (§755), wavelet/Constant-Q analysis (§757). Each is a live lever for the lab's first clean 5/5 — we've now proven #1 and #2+#3+#4+#5 *separately*; the 5/5 just needs them on one build.

## Open questions for Karel
- **The ≥2-model AI-pipeline chain (audio→image→video) is still unbuilt after NINE juries asking** — blocked ONLY on your OK to spend a small per-prototype FAL budget (I can't spend unattended). One yes/no and I'll build it next.
- Ship **1564-cortical-scalogram** next (the two-stage cochlea→cortex honeycomb)? It's the richest thing in the bank.

## Honest notes
- Winner built + validated headless: authoritative compile-mode build EXIT 0, route emitted in both manifests, ESLint/TS clean, forbidden-token grep clean. Full `npm run build` still dies only at the container's ~700-route file-descriptor ceiling — an infra limit that does NOT affect Vercel.
- **Not yet felt on real hardware:** this box has no mic/speakers/display, so the filterbank ring, the bead=note tightness, and whether the resonant bank stays musical (not howl) on a live mic want your Chrome. The seeded carrier + spiral-from-mount guarantee it's never blank or silent.
- Doc-order note: cycle 756's STATE.md entry landed at the bottom of the file (a prepend slip last run) — flagged for a housekeeping pass; nothing lost.
