# Morning digest — last updated 2026-06-25 ~00:2x UTC (cycle 543, adult · DEEP)

## ☀️ Open this first
**[922-breath-aeolian](https://getresonance.vercel.app/dream/922-breath-aeolian)** — *breathe into the screen and the air sings back.* Your breath injects wind into a real GPU fluid simulation; the vortices it stirs whistle past 7 reeds, and **the pitch is set by airflow physics, not by any scale** (`f = St·U/d`, the Aeolian-tone law). No mic? A synthetic breath keeps the cloud alive and singing, so it works on a glance.
*Why it matters:* the lab's first **aeroacoustics** piece — sound generated *by the airflow itself* — the cleanest answer yet to the jury's two standing asks: swing back to GPU (#1) and make music from texture, not pitch theory (#3). Built on a Jan-2026 arXiv paper (FW-H + fluid-on-a-sphere).

## New since yesterday
- **922-breath-aeolian** (adult, DEEP fire) — winner of 3 technical takes on one concept: *the air itself sings.* Real WebGL2 Jos-Stam stable-fluids solver + mic breath input + per-reed aeolian-tone synthesis. Lab-first technique (live fluid-solver aeroacoustics). Ambition 3–4/5.

## Explored but banked (see IDEAS §543)
- **923-aeolian-globe** ⭐ resurrect-first — gorgeous three.js planet, 36k GPU wind particles, peaks sing as winds stream past; *directest homage to the arXiv paper.* Lost only because its wind field is prescribed, not solved — 922's flow is a real simulation. Fix: give it a real on-sphere solver.
- **921-aeolian-loom** — the same real fluid solver as a *pointer-stir* "stir the air" instrument; lost on the touch-as-primary jury ban. Resurrect as a desktop/trackpad piece.

## Research finding (RESEARCH §543)
- **arXiv:2601.15982** (Jan 2026) — real-time fluid + **Ffowcs Williams–Hawkings aeroacoustics**: pressure fluctuations → real far-field sound. The inversion that drove this cycle: sound *from* the flow, pitch dictated by vortex shedding. June-2026 confirmations: ShaderVine, Ghost Arcade both shipping WebGPU fluid-compute.

## Open questions for Karel
- 922's audio scaling (`U→Hz`, amplitude) is a first-guess calibration — **does it read as "wind singing" or just "filtered noise"?** Only your ears can settle this one.
- Worth deepening 922 over a few cycles (true FW-H far-field term; let breath *pitch* bend the flow), or resurrect the **923 planet** next? Both are queued.

*Build: `✓ Compiled successfully`, lint + types clean (only the standing container EMFILE static-gen blocker — infra, Vercel deploys fine). Not yet ear/mic/GPU-verified — no audio hardware in the build sandbox.*
