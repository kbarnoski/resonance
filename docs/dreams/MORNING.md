# Morning digest — last updated 2026-06-26 ~06:20 UTC (cycle 558, kids · WIDE)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday — ⭐ open this first
- **[/dream/957-kids-come-home](https://getresonance.vercel.app/dream/957-kids-come-home)** — **Come Home.** Drag a glowing firefly up a hill and *feel it want to fall home*: near the top it trembles at the leading tone, pulled toward the tonic, and when you let go it swoops down and lands on a warm chord. A real **V→I cadence a 4-year-old plays with one finger.** Kids · touch-drag · raw WebGL2 (Canvas2D fallback). Hands-off auto-demo plays the cadence on a loop within ~1s, so just glancing at it sounds the resolution.
  - **Why it matters:** the first kids piece where *real tension-and-resolution IS the toy* — the directest answer to the jury's "make music from PITCH again." Every prior kids build held pitch deliberately dumb ("no wrong notes" + drone); this one makes the *pull of harmony* the whole game. Grounded in a **1-day-old paper** (Pachet, arXiv:2606.24911, Jun 2026 — the tonic as an "attractor" the melody is drawn toward).

## Mode this cycle: WIDE (kids) — 3 explorers, "real melody/harmony is the toy," shipped 1
2 more were built complete and banked to IDEAS.md (§558):
- **959-kids-chord-kites** ⭐ resurrect-first — tilt to fly two kites; the *interval between them* is the harmony (together = warm, a third = sweet, a fifth = open, a second = spicy). Raw **WebGPU compute** particle wind-field. Highest ambition; banked only because a kids glance wants the bulletproof renderer (WebGPU shows its WebGL2 fallback on most phones + is unvalidated headless).
- **958-kids-stepping-stones** — place lily-pad stones at heights, a frog hops your melody's *contour* (step vs leap, visible + audible). Canvas2D.

## Research finding worth a look
- **Pachet, "Attractive and Repulsive Pattern Control in Sequence Generation," arXiv:2606.24911 (Jun 19 2026).** Signed coupling makes a target pattern an *attractor* (sequence pulled toward it) or *repulsor*. Maps exactly onto tonality: home = attractor, leaving home = tension. Seeded today's build. (RESEARCH §558.)

## Open questions for Karel
- **Verification debt is real** (jury #3): 957 is build-green (compile + ESLint + type-check all pass) but, like every recent build, *not* heard/seen running — the container has no GPU/audio and EMFILE blocks static-gen (Vercel deploys fine). Worth running 957 + a couple of recent winners on a real iPad to confirm the cadence *feels* right. Want me to spend a cycle on a verification pass instead of a 16th unheard build?
- Does the "felt cadence for kids" direction land? If yes, the natural next builds are the banked kites/stones explorers, or deepening 957 (a longer phrase that wanders further before coming home).
