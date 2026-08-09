# Morning digest — last updated 2026-08-09 06:38 UTC

**Open first:** https://getresonance.vercel.app/dream/8776-roommode

## New since yesterday
- **`8776-roommode` — a room you can SEE and HEAR.** A rectangular room drawn as
  a real 3D box (hand-rolled WebGL2, no three.js). Its acoustic standing-wave
  modes show as flat translucent nodal planes + glowing antinode voxels, and
  sound as a soft sine chord. **Drag the room's Lx/Ly/Lz sliders and it retunes
  live — you hear the room's shape become its pitch.** ←/→ sweep modes, drag to
  orbit. Blueprint-cyan, no violet, no drone. *Why open it:* the lab's first
  real 3D-geometry acoustics piece — a literal answer to the jury's "build a
  room, not a dot-field." (Auto-orbits + auto-sweeps on load, so it moves even
  muted; audio is best on real speakers.)

## How it was made (WIDE fire, 3 parallel builders → 1 shipped)
- Cycle 1068 ran **WIDE**: three unrelated ideas on three different render
  substrates (WebGL2 / SVG / pure DOM-CSS), all off the just-used Canvas2D and
  the banned three.js. Shipped the strongest; **2 more explored — see IDEAS.md.**

## In the bank (built to demoable this fire, resurrect-ready — IDEAS §1068)
- **⭐⭐⭐ `8792-graft` — put your voice's vowels onto your piano.** A channel-
  vocoder cross-synthesis instrument with an editable SVG "marriage diagram."
  Directly cashes your standing *"use my real Path piano"* directive — resurrect
  first. (Didn't ship only because its payoff is audio-only — invisible on a
  muted morning phone.)
- **⭐⭐ `8808-truelevel` — hold your phone level for a pure tone.** Tilt frays it
  into beating/roughness (Plomp–Levelt); stillness = consonance. The only pure
  DOM/CSS lane (your most-starved substrate). Mobile-tilt only, so it couldn't
  win a desktop review.

## Research finding worth a look (§1068)
- Meta-finding: at 1000+ prototypes, "today's arxiv" is largely already built
  here — the freshest cs.SD papers (Calliphony, AnyBand, even the Föppl–von
  Kármán plate paper) each already shipped in a past cycle. Freshness now comes
  from grep-0 *verbs* + filling starved substrates, not new papers. The one
  un-cited fresh hook — **Scene2Sound** (arXiv:2608.01093, "scene geometry →
  sound") — seeded today's winner.

## Open questions for Karel
- The AI-pipeline chain (music→image→video, needs `FAL_KEY`) has been standing
  ~34 cycles. Build it or strike it from the queue?
- Strategic (flagged ~14 cycles): grep-0 "first-ever technique" is exhausted —
  formally shift the ambition bar to reward fresh-verb + scope/fusion +
  diversity? Tonight is another clean 3/5-with-honest-NO-#1.
