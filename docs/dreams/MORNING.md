# Morning digest — last updated 2026-07-28 (cycle 933, WIDE)

> **Jury verdict today**: You asked me to get off the shader and I did — it fell 8→2, altered-states cooled 8→4, and output is finally diverse — but the lab over-corrected on "make it a decision you can get wrong," and now 6 of the last 15 are physics-textbook instruments you can fail on (`3192-bow` is the rigorous peak); tomorrow I want one piece with **no** win/lose at all, and it's time to say go/no-go on the AI-pipeline chain that six juries have now deferred. See `docs/dreams/JURY.md`.

## New since yesterday
- **`3360-tightrope` → [/dream/3360-tightrope](https://getresonance.vercel.app/dream/3360-tightrope)** — **every note you play has to keep a tightrope walker from falling.** Play the computer keyboard; each note's *harmonic tension* (a Lerdahl-inspired model — distance from the key on the circle of fifths + chord-tone status + the dissonance of the leap) becomes a **lateral shove** on an inverted-pendulum walker. An in-key note steadies him and strides him toward the far platform; reach for the tritone (`G` / `5`) a few times and he topples — the music collapses to silence and you restart. *Why open it:* it's the jury's two loudest asks in one piece — a real **three.js** 3-D scene (walker, tracking spotlight, an instanced ~180-pillar audience that leans on every wobble — off the fragment shader jury #2 flagged at 8/15) AND the sharpest **dial→decision** (jury #3): a wrong note has an unambiguous physical cost. Press **Start**, then play `Z X C V B N M` (safe) vs `G`/`5` (danger) and watch him lean.
- **2 more instruments explored this WIDE fire, banked to IDEAS §933:** `3344-baton` ⭐⭐ — **conduct a synth ensemble with your body (webcam, dependency-free optical-flow) and rush it right off a cliff** — off-grid beats detune the players ~38¢ and fill a red "LOST THE PULSE" meter (ref: *Sympathetic Orchestra*, CHI 2026); and `3376-waterline` ⭐ — **a gravity-anchored theremin you play by tilt**, holding a sloshing waterline inside a ±14¢ band to sustain a clean tone, rendered in SVG (ref: the Theremin). Both built demoable + lint-clean, then set aside (not committed).

## In progress / partial
- Nothing half-built. `3360-tightrope` shipped whole this cycle.

## Research findings worth a look
- **§926 — the conducting loop went webcam-native + web-first.** *"Sympathetic Orchestra"* (CHI 2026, ACM DL 10.1145/3772363.3798418) + arXiv:2604.27957 — webcam hand-tracking → a responsive virtual orchestra. It's a *practice tool*; the Resonance flip (built + banked as `3344-baton`) is a *performance instrument you can fail on*. The recent ship-window had **zero** camera/body pieces despite the loved camera cluster — that seam is open.

## Open questions for Karel
- **AI-pipeline chains are STILL at zero** — the fifth+ jury in a row flags it (music→image→video, lyric→cover-art→loop via fal.ai/replicate). It spends your FAL_KEY budget so it needs your **explicit go-ahead + a per-run cap**. One word ("go, cap $X/run") unblocks the single most novel unbuilt thing in the lab.
- **`3344-baton` (camera-conduct) is demoable now and pulls toward your loved camera cluster** — want it shipped next cycle, or should I keep chasing fresh non-camera sensors first?
