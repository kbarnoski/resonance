# Morning digest — last updated 2026-10-19T13:20Z

> **Today's jury (2026-10-19) + this fire's answer.** The verdict: `roundtable` is the first build the lab ever carried to a cycle-3 finale and it's genuinely good — but three fires on it meant Canvas2D (9/15) and the "find a new sensor" order were both deferred a third time, and the bill was due. **This fire pays it:** `22880-vantage` is raw WebGL2 (not Canvas2D), head-position tracked (not the pointer+one-hand template), and opens the spatial-installation category the lab had zero pieces in. Full verdict: `docs/dreams/JURY.md`.

## New since yesterday
- **`22880-vantage` — move your head, move through his music in 3-D.** One of your takes becomes a **swarm of sound-bodies orbiting you**; your **head position** (webcam, or the mouse) is your vantage point inside it.
  - Your take is split into five band voices (sub → air), each pinned in 3-D and panned with an HRTF `PannerNode`; your head drives the *listener*, not the sources.
  - **Lean in** → voices pull close and the hall dries (intimate). **Lean back** → it opens into a wide hall. **Turn your head** → the field rotates around you.
  - Even the reverb is *your* sound: the hall is a convolver whose impulse is a decayed slice of your own recording.
  - **See == hear:** one vantage drives both the ears and the camera, and each voice's particle cluster glows from its own live level — the thing you hear move is the thing you see move.
- **Why open it:** press Play, then **drag the mouse** (or ←/→/↑/↓) — the whole binaural + particle experience works with no webcam. If you have a camera, hit the head-tracking toggle and lean around.
- **status: demoable.** Fully playable with the mouse; the head-tracking path wants your ~30-second webcam check (I can't point a camera at myself up here).

## The "huh" (today's research)
- The dive hit a **real last-7-days arXiv paper** this time — the first fresh anchor in six fires: **SPARO — "HRTF Upsampling and Personalization via Neural Operators"** (arXiv:2610.20400, 14 Oct 2026). It reconstructs a *continuous* HRTF field from as few as 3 measurements, 15–373× faster than the prior neural method — exactly the regime a head-driven binaural renderer lives in. It motivated the build; I did **not** over-claim novelty (HRTF/head-tracking exist in the lab), so the floor is an honest 3/5.
- **2 directions explored, 1 shipped.** The sibling `nearfield` (a raymarched volumetric *nebula* instead of a particle swarm) is banked in IDEAS — it lost only on palette (it leaned violet, which the jury told me not to) and on a synth-comb hall instead of your-own-sound reverb.

## Open questions (decisions are yours)
1. **~30-second webcam check:** open `/dream/22880-vantage`, Play, toggle head-tracking — lean in/out and turn your head. Does the field move *with* you, immediately, or does it feel laggy / mis-calibrated? That's the one thing I can't verify from the cloud.
2. **Keep pushing the spatial/installation lane?** This opens a category the lab had *zero* pieces in. Next could go further off-screen — true multi-person presence, or a projection/Tauri ambient-room version. Worth a few fires, or back to the intimate single-listener space?
3. **Deploy-health alarm (still standing):** a scheduled deploy-health alert or dependabot auto-merge would catch the next freeze in minutes. Want me to draft it for you to land? (Out of my fence.)
