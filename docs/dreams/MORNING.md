# Morning digest — last updated 2026-08-13 UTC

Cycle 1116 · **DEEP** (one grep-0 first — the Kohonen self-organizing map — raced across three renderings, 1 shipped) · ledger 1113 WIDE · 1114 DEEP · 1115 WIDE → **1116 DEEP**.
The jury's provocation #2 — *"make the next DEEP a real #1, stop bunting a genuine first for a safe simulation"* — taken head-on: this is the lab's **first self-organizing map**.

## New since yesterday — OPEN THIS (sound on; then click a fold)
- **`/dream/11048-cortexbloom`** — **watch your music grow a cortex.**
  A **Kohonen self-organizing map** (the 1982 unsupervised-learning algorithm that's the standard model of
  how the auditory cortex forms its *tonotopy* — neurons laid out by frequency, like the keys of a piano) is
  fed a corpus of timbres and, live on mount, **self-organizes** so neighbouring neurons come to represent
  similar sounds. You watch that happen as a **3-D terrain**: each neuron is a vertex, its **height** is how
  different it is from its neighbours (so ridges rise between unlike regions and the flat sheet **buckles into
  cortex-like gyri**), its **colour** is the timbre it learned (teal→violet). As it orders itself you **hear**
  the timbres it's sorting; **click any fold** to play that neuron's sound.
  → **The lab's first SOM** — a genuine grep-0 first (verified 0 across 7500+ prototypes), the real #1 the
    jury kept asking for; on three.js terrain (rested substrate, and the particle/latent register you've loved).

## Also explored (banked, not shipped — see IDEAS §1116)
- **`11064-tonotopy`** — the same SOM as a **flat Canvas2D topographic sheet**: U-matrix cluster ridges + a
  piano/frequency strip that *names* the low→high gradient the map discovers. The most **legible** read of the
  idea — arguably the better silent-screen read; lost on substrate freshness. (One-line `ctx`-null build fix noted.)
- **`11080-somdrift`** — the SOM held **permanently plastic** with a **drifting timbre-diet**, so the map never
  settles — genuinely different at minute 5 than minute 1. Pure-CSS glow field, long-form/ambient.

## Note worth a glance
- **Verification lesson re-earned:** both losers self-reported "tsc 0 / eslint 0", but the authoritative
  `npm run build` caught a real null-safety error `tsc --noEmit` missed. Only `npm run build` is the gate — the
  winner was re-built winner-only before shipping.
- The recurring **50/50 diverged-clone** artifact hit again on sync; `git reset --hard origin/main` fixed it
  (unchanged behaviour since §1108). Fresh clones also arrive with **no `node_modules`** → `npm ci` each fire.

## Open questions for Karel
- **DEEP-vs-legible:** cortexbloom is the bigger spectacle, but `11064-tonotopy` may be the clearer teaching read.
  Want the tonotopy sheet resurrected as a sibling (it's one `ctx`-null fix away)?
- **Your real music:** all three use a *procedural* timbre corpus. The obvious cycle-2 is dropping your **Path
  piano** in (decode → FFT → 12 bands) so the map organizes *your* recordings. Worth prioritizing?
