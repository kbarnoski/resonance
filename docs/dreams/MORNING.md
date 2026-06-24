# Morning digest — last updated 2026-06-24 ~10:15 UTC (cycle 536, kids · WIDE)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **`899-kids-moire-beats`** 〰️ (cycle 536, kids · WIDE, 1 of 3 shipped) — **a 4-year-old plays "rough vs. calm" with one finger, and SEES the exact thing they HEAR.** Two striped op-art grids overlap; sliding the top one twists them. Line them up → the rolling moiré band slows to nothing *and* the two-tone drone smooths to one clear calm tone. Twist them apart → the band shimmers fast *and* the sound throbs WAH-WAH-WAH. *Why open it:* it's a real cross-modal fact made into a toy — **moiré IS visible acoustic beating** (the visual band's speed and the audio wobble are literally the same number), with **no scale, no notes, nothing that can be "wrong"** — just roughness↔calm felt through the hand. The lab's **first moiré piece**, on Canvas2D (dodging the WebGL2 wall the jury banned). Works on any iPad/phone; no mic, no camera, no login — and it's moving + sounding on its own within a second if nobody touches it.
  - **Lands the citation rule a 3rd straight cycle:** the README cites this cycle's dated research dive (RESEARCH §536) plus Gerald Oster (Scientific American, 1963) and Bridget Riley — the in-README dated-research citation the jury flagged **0-for-15 for five windows**.

## Also explored this cycle (banked, not shipped — see IDEAS §536)
Both are **brand-new lab techniques** (each grep-verified 0×), sequenced for future kids cycles:
- **`900-kids-rope-singer`** ⭐ — *a hanging rope you play with your hands.* Pure **SVG** (the scarce 0× surface the jury keeps naming): a **catenary** rope where you hang beads to make it sag and sing lower, and pluck it for a damped twang. **Resurrect-first.**
- **`901-kids-water-bowl`** — *hum and see the note's shape.* A **three.js** bowl of water whose surface blooms into **Faraday standing-wave** cymatic patterns in time with your voice (low note = big rings, high note = fine petals). Has a hands-free auto-demo so it sings even with no mic.

## In progress / partial
- Nothing blocked. The `888-living-reverie` long-form thread is still paused on purpose — it needs a real new *capability* next, not a renderer swap.

## Open questions for Karel
- **The kids template is now broken three ways (868/849/897 let a child reach dissonance, and 899 drops scales entirely for a roughness↔calm continuum). Keep pushing kids pieces about a *perceptual fact* rather than a *melody*?**
- We keep generating great never-used-technique builds and shipping the *safest-to-demo-on-a-phone* one (899 here, over the SVG rope and three.js water bowl). Right call for the 06:30 glance, or want the bigger-swing build some nights?

## Caveat
- Built + **compile/lint/type-clean** (authoritative winner-only `npm run build`, zero warnings in the 899 folder); **NOT browser/ear-verified** (no audio in the container) — whether the moiré band reads as "the same wobble I hear," small-iPad readability, and the twist gesture's feel are unverified. Static-gen still blocked by the standing container fd limit (infra, not code — every cycle since ~472); Vercel deploys normally.
