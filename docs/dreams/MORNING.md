# Morning digest — last updated 2026-10-20T01:30Z

> **The jury's bill, paid two ways.** The 2026-10-19 verdict set two unmet targets: hold the substrate-break off Canvas2D with an *actually new* sensor (not the pointer+one-hand template), and end the 7+ fire drought with no fresh research anchor by *implementing* a last-7-days paper, not just citing it. **This fire does both.** `23040-priorbody` is full-body pose (the furthest sensor from both the old template and yesterday's head-tracking), raw WebGL2 (not Canvas2D), and it *implements* a paper submitted 4 days ago. Full verdict: `docs/dreams/JURY.md`.

## New since yesterday
- **`23040-priorbody` — the lab that *teaches your spatial hearing*.** One of your takes is hidden at a direction in 3-D space that slowly drifts around you; you **turn and reach your body** toward where you *hear* it, and commit a guess.
  - The piece measures how far off you were, splits the error into left/right, up/down, and front/back, and takes a tiny learning step on three **precisions**. Guess well and they climb.
  - **As they climb, the same recording sharpens** — from a smeared, everywhere-at-once cloud into a pinpoint you can place — and the glowing belief-field collapses from a diffuse ice-blue haze to a tight beam. *Your ear and the light sharpen together.* Minute 5 is calmer and more certain than minute 1.
  - This is a real, live **action-perception loop** — the exact thing the paper it's built on names as its own future work.
- **Why open it:** press Play, then **drag the mouse** and **click (or Enter)** to commit a guess — the whole loop works with no webcam. If you have a camera, toggle body-tracking and point your whole body at the sound.
- **status: demoable.** Fully playable with the mouse; the body-tracking path wants your ~30-second webcam check (I can't point a camera at myself up here).

## The "huh" (today's research)
- The dive hit a **paper submitted 4 days ago** and — rare — its *limitations section handed me the build*: **"Framing Spatial Hearing within the Free Energy Principle"** (arXiv:2610.23196, 16 Oct 2026). It models how people *learn* to localize sound by minimizing "free energy" over three precisions (lateral / polar / front-back), and explicitly says a **closed-loop action-perception version is future work**. The dream lab's embodied-camera directive *is* that missing loop — so I didn't cite it, I built it. That ends the 7-fire stretch with no fresh research anchor, by the harder standard (implement, not cite). Honest 3/5 — I did **not** claim novelty (predictive-coding already exists in the lab).
- **2 directions explored, 1 shipped.** The sibling `priorgaze` (same instrument, but you *look* toward the sound instead of reaching) is banked in IDEAS — it lost only because yesterday's piece already used head-tracking, so full-body was the fresher sensor.

## Open questions (decisions are yours)
1. **~30-second webcam check:** open `/dream/23040-priorbody`, Play, toggle body-tracking, and point/reach toward where you hear it. Does your reach map cleanly to the aim, and does the ~0.6s "hold to commit" feel right? That's the one thing I can't verify from the cloud.
2. **The jury's open summit — "stack 4":** nothing in the window yet combines a lab-first technique (#1) + a multi-cycle build (#4) + a fresh ≤14-day anchor (#5) at once. This fire bagged the #5 leg honestly. Want the next ambitious build aimed squarely at all three — e.g. a multi-cycle piece that also claims a genuine lab-first (ambisonic decode of your *real* catalog, a WebGPU-compute audio path, or a multi-person sensor)?
3. **Deploy-health alarm (still standing):** a scheduled deploy-health alert or dependabot auto-merge would catch the next freeze in minutes. Want me to draft it for you to land? (Out of my fence.)
