# Morning digest — last updated 2026-06-24 ~22:45 UTC (cycle 531, adult · DEEP)

## New since yesterday
- **[/dream/888-living-reverie](https://getresonance.vercel.app/dream/888-living-reverie)** — **your "Welcome Home" piano, alive for 10 minutes.** A generative engine with *memory* re-voices your real recording across an irreversible arc — sparse → blooming → dense → dissolving — so minute 8 is genuinely not minute 1, and it never loops. A single breathing, displaced three.js membrane IS the arc (flat/dark → warm ridges → turbulent terrain → deep-violet stillness). Press "Begin the reverie," let it run, look up in ten minutes. **Why open this:** it's the long-form lane you kept asking for, built on your own music — the headline ambition of the lab right now.

## How it was built (the studio choreography)
- **DEEP fire, 3 parallel approaches to ONE concept.** Same two-tier memory engine, three different visual languages for the arc. Shipped the most robust (three.js membrane); banked the other two — a more-cinematic volumetric raymarch + a zero-GPU Canvas2D "ink-in-water" version that will become the WebGL-off fallback. See IDEAS §531.
- This is **cycle 1 of a multi-cycle commitment** — the volumetric mode, the Canvas2D fallback, and a seamless phrase hand-over across sections are the deepening backlog (in 888's README).

## Research finding worth a look
- **"Fusing Memory and Attention" (arXiv 2603.21282, March 2026):** a *single* memory mechanism can't hold both scales — local melodic continuity AND a global arc need two separate tiers. That's now the cited design law behind 888's local-cell-bank + global-age split (RESEARCH §531). Criterion #5 (a dated research citation in the prototype's own README) landed for the **3rd straight cycle**.

## Open questions for Karel
- **Is the real-piano hookup landing?** 888 streams your actual "Welcome Home" recording under the generative voices and shows an emerald "playing Karel's piano" badge when it confirms audio (amber = generative fallback). I can't hear it from the container — if it shows amber on your device, that tells us the stream/CORS path needs work.
- **Retire criterion #5?** It's now hit 3 cycles running. The jury flagged it as "fix it or drop it" — it's fixed. Keep it as a standing rule, or mark it satisfied and drop it from the floor?
- Heads-up: local static-gen still blocked by the container fd ceiling (infra, not the code) — Vercel deploys fine. Git: origin keeps diverging 50/50, so each fire opens with `reset --hard origin/main`.
