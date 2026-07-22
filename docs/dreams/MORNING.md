# Morning digest — last updated 2026-07-22 (cycle 866)

> **I took today's jury head-on.** Its loudest demand was *"ban the single knob for a week — no master 0→1 dial; force ≥2 independent state variables that can conflict, a system with memory that contradicts your input."* Tonight's winner is the explicit inverse of that formula. See `docs/dreams/JURY.md`.

## New since yesterday
- **`2290-phase-society`** → https://getresonance.vercel.app/dream/2290-phase-society — **a "society" of 320 phase-oscillators — a slow inner crowd and a fast outer crowd — argues its way toward or away from agreement. You HEAR consensus emerge as a detuned cluster-cacophony collapses toward a locked chorus; you SEE it as phase-dots gathering on a circle.** Why open it: there is **no unity dial**. The level of agreement (Kuramoto's order parameter *r*) is an *emergent readout* of two conflicting crowds plus the field's own **hysteretic memory** — you only perturb it (drag = pull the crowds together vs widen their argument; tap a ring = shock a crowd), and the field can visibly contradict your hand (`Breaking` / `Coalescing` in the HUD). It's the direct anti-formula to the last two weeks of "one scalar climbs to ecstasy" — and a genuinely different look: **Ikeda monochrome**, not the violet-gold jewel palette the jury flagged 6× in a row. Autopilot self-demos the sync↔fracture breathing the moment it loads; drag/tap/tilt to play.

## Also explored tonight (WIDE fire — 2 more built, banked to IDEAS §866; one commit ships one)
- **`2294-solar-counterpoint` ⭐⭐** — two **live NOAA space-weather feeds** argue: the solar wind pushing vs Earth's geomagnetic field lagging hours behind, sonified as counterpoint that beats when they diverge and locks when they align. Off-menu real external data, aurora-cold palette. Resurrect on a data cycle.
- **`2298-mirror-hands` ⭐⭐** — your **two webcam hands are two independent voices** that fuse into one bloom when you mirror them and split into two detuned forms when you don't. three.js, warm-daylight palette; works with no camera via a phantom-hands autopilot. The mandated camera cycle-2 candidate.

## Research finding worth a look (§866)
- The structural cure for the "single knob" is a **coupled-oscillator network** — *"Sound in Multiples"* + the *"Collective Rhythms Toolbox"* (coupling-matrix topologies that self-synchronize or fracture), on **Kuramoto (1975)**. In that model "how unified is it?" *cannot* be a dial — it's a readout of the whole population — which is exactly why tonight's piece is built on it.

## Open questions for Karel
- Cycle-2 for `2290`: I'd like to extract a shared Kuramoto engine + an interactive **coupling-matrix editor** (topologies beyond two crowds), and/or wire **camera hands** in so each hand perturbs a community. Which interests you more?
- The two banked pieces (live space-weather, two-hand camera duet) are fully built — say the word and I'll ship one next instead of banking it.
- ⚠️ Note: the local full `npm run build` can't finish in this sandbox (a file-descriptor cap / EMFILE on the ~800-page static-gen step) — but TypeScript + ESLint pass clean and Vercel builds fine. Flagging so nothing looks off.
