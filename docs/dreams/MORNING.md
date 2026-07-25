# Morning digest — last updated 2026-07-25 20:54 UTC (cycle 904, WIDE)

> **The jury's win to *protect* ([JURY.md](JURY.md), 07-25): "keep the danger, drop the keyboard, stop building AI bandmates."** Tonight's winner keeps all three promises — no keyboard, no AI partner, no voice, no scale to hide behind — and the pitches come straight out of a chaos equation.

## New since yesterday
- **[2728-bifurcation](/dream/2728-bifurcation)** — *a piece that IS the route to chaos.* One knob (the logistic map's `r`) creeps from order into chaos and back over ~11 minutes. You hear a single held tone **period-double** into two alternating pitches, into a longer loop, into a **chaotic wash** — and then, deep in the noise, a **clean triplet suddenly surfaces** (the famous period-3 window). Meanwhile the classic **bifurcation diagram draws itself as the score**, a playhead sweeping the pitchforks and chaotic bands.
  - **Why open this:** the mathematics is *audible* — you can hear each doubling as the loop lengthens — and the self-drawing diagram is beautiful even muted. It's long-form and stateful (your #5 ask): minute 5 is a genuinely different piece than second 0.
  - **On your phone:** the diagram animates on load; tap **Begin** for sound, then **drag left↔right** to scrub `r` and hunt the periodic windows yourself. Pitch is continuous/microtonal — chaos sounds like chaos, in no key (no safety-net tuning).
  - **The one thing I need your ears on:** does the chaotic zone read as *thrilling dissolution* or just harsh? Does the period-3 triplet land as a payoff? Does the 11-min arc hold?

## Explored but not shipped (2 more, both ready — see IDEAS §904)
- **2720-primes** ⭐⭐ — *the actual "music of the primes."* The real Riemann-ζ zeros (a genuine quantum-chaos, inharmonic spectrum) played as an additive chord, with the **explicit-formula prime staircase** drawing itself alongside. Gorgeous, deeply on-brand. **TOP resurrect for a math/cosmic cycle.**
- **2736-mic-garden** ⭐ — *plant a garden with any real noise.* Clap, tap, breathe near the mic and each sound is **spectrally frozen** and left to ring; over minutes a chord-cloud grows from the room. The direct cash of your "use a real sensor as the primary surface" (mic is the least-served sensor). **Grab it on the next mic/meditative cycle.**

## Research finding worth a look (RESEARCH §904)
- Long-form-generative music in 2026 is an **ML monoculture** (latent diffusion, transformers) a no-ML browser lab can't and shouldn't chase — yet your most-valued lane (long-form-stateful) is held by *deterministic* substrates. The freshest unmined ones are **number theory** and **low-dimensional chaos**: infinite non-repeating form from a closed rule, natively inharmonic. Tonight's winner is that thesis, shipped.

## Open questions for Karel
- **AI-pipeline chains (music→image→video) are still ZERO — now the third jury running.** They'd spend your FAL_KEY image budget, so I won't start one autonomously. An explicit go-ahead + a per-run budget and I'll build the first model→model→model chain.
- **Deploy watch:** the full `next build` can't finish in this 4096-fd container (858 routes exhaust the fd cap at page-data collection — infra, not code; validated instead via the compile-mode build + project `tsc`, both green, same as cycle 903). Vercel's build env has a higher limit and should deploy 2728 fine — worth a glance it went live.
