# Morning digest — last updated 2026-06-30 ~21:00 UTC (cycle 606)

## Open this first
- **[1063-dissolve-void](https://getresonance.vercel.app/dream/1063-dissolve-void)** — *an instrument of un-control.* Tap **Enter the void**, then tilt your phone (or drag on desktop) to float through a vast luminous dark. The twist: what you do, what you see, and what you hear come gently **un-bound** — your motion is the truth, but the image trails it through one drifting lag and the sound through a *different* lag, so cause and effect feel unglued. Over ~4.5 min the binding loosens toward a peak, then **snaps clear once** (a bright re-sync) before a soft return. Five sound-motes orbit you in 3D (HRTF). `state: ketamine K-hole / dissociation · pole: cosmic-ambient void`.

## Why this one
This is the **interactive** answer to the void pole — it replaces the lean-back `1041-nde-tunnel` the jury pruned ("no reason for the human to be there"). The core is the lab's **first audio-visual desync engine**, and it comes straight from the freshest research I found this cycle: a **2026** review of ketamine dissociation (Bera, Looger, Proekt & Cichon, *The Neuroscientist*) whose headline finding is that the *mechanism* of the K-hole is the brain **uncoupling sensory input from awareness**. So the build literally enacts the paper — the dissociation IS the broken control loop, not a decoration. It's an instrument you play *into* the state (JURY #1), on plain **Canvas2D** (dodges the jury-banned full-screen WebGL2 shader, which was 5× in the last 10), and it adds a second lab-first: HRTF-spatialised sound.

## Also explored (banked, not shipped — WIDE fire, 3 orthogonal instruments)
- **1061-skin-membrane** ⭐ (IDEAS §606) — *press, pull and TEAR a thin sheet of reality; the pressing makes the sound.* The lab's first mass-spring physics sim, with real Bessel-mode drum synthesis. **Intense pole, and the most hardware-free to verify (mouse only)** — my top resurrect-first for the next intense swing.
- **1062-shepard-stair** (IDEAS §606) — *climb an endless staircase of light + sound that never goes anywhere.* First Shepard–Risset engine, on the shared log-polar tunnel. Banked because that tunnel is now the 3rd of its kind.

## Honest caveats
- **Built green, but not tilt/ear-verified.** Compile + ESLint (0 issues from the 1063 folder) + project `tsc` (0 errors) all pass; the full `npm run build` reached `Compiled successfully` then hit the standing container EMFILE block (infra, not code — Vercel deploys fine). But there's no phone-tilt or audio device in the box, so I couldn't confirm the tilt feel, the HRTF mote spatialisation by ear, or whether the desync reads as *dissociation* vs merely "laggy." You'll be first to feel it.
- On desktop it falls back silently to drag (no tilt). iOS asks for motion permission on the first tap.

## Open questions for Karel
- **Is the desync legible or just annoying?** The whole piece bets that a *controlled, drifting* lag between motion/image/sound evokes dissociation. If it reads as lag-bug rather than altered-state, tell me and I'll tune the magnitudes (or add the clarity-snap earlier).
- **Pole + infra:** intense is owed (1061 is queued ⭐ for it). Still want the overdue **`_shared/psych/` infra cycle** (extract `shepard.ts` / `feedback.ts` / `droneBank.ts`) — pairs naturally with resurrecting 1062 — or keep shipping instruments?
- **The fd-ceiling block is still open** — full `npm run build` can't finish locally (container `EMFILE` at ~4096 open files during static-gen of 1000+ routes). Worth raising the ceiling or blessing `next build --experimental-build-mode compile` as the gate.
