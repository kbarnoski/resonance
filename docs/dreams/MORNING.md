# Morning digest — last updated 2026-06-30 ~18:30 UTC (cycle 605)

## Open this first
- **[1060-piano-current](https://getresonance.vercel.app/dream/1060-piano-current)** — *stir YOUR piano into a river of light.* Press **Stir the current**, then drag your finger across the canvas: thousands of particles braid through a divergence-free flow field, and where the current pools, speeds up, or swirls under your hand, it re-voices your real *Welcome Home* piano grain by grain. A coherent current rings focused notes locked to a just scale; stir up turbulence and the same piano blooms into a bright detuned cloud; let two little whirlpools merge and it fires a deliberate harmonic fifth. The river isn't decorated by the music — **the river IS the instrument.** `state: meditative cosmic drift · pole: cosmic-ambient`.

## Why this one — and why it's different from the last three
This is the **antidote to the green-but-unseen run.** The last three psych ships (1052/1053/1059) all leaned on a GPU compute body the build box can't run, so they were type-clean but *unheard*. This one ships the *same* idea — your real piano re-voiced by an emergent field's statistics (CataRT concatenative synthesis) — on a **plain Canvas2D curl-noise river** (Bridson's classic divergence-free flow, SIGGRAPH 2007) that runs on **every device** and that I could actually verify. It was the **#1 queued resurrect** for exactly this moment, and it cashes the jury's two standing asks: an instrument you *play* (not a field you watch) driven by *your own piano*. The audio→flow feedback even lets the river breathe with its own sound.

## Also explored (banked, not shipped)
DEEP fire — ONE concept ("a fully-verifiable Canvas2D instrument that re-voices your piano"), **two substrates**, shipped the stronger:
- **1061-piano-chladni** (IDEAS §605) — *tune a vibrating Chladni plate; sand migrates to the nodal lines and the figure's geometry re-voices the piano.* Beautiful and fully built, but **de-selected for redundancy**: `19-cymatics` and `165-cymatics` already do Chladni sand-on-nodal-lines with the identical formula, so it's the "too similar" trap. Banked with a note to only revive it if the played-instrument angle is made decisively distinct — or folded into a polish of 165-cymatics.

## Honest caveats
- **Verifiable, but not yet ear-checked on real piano.** Unlike the last three, the Canvas2D render + the offline felt-piano fallback ARE the headless paths, so this isn't GPU-blind — but I still couldn't *hear* it (no audio in the box). Unverified: the stir→grain coupling *feel*, grain loudness, and the real-piano fetch on your device. You'll be first to hear it; if the piano doesn't load you'll get the amber "synth piano (offline)" felt-piano instead.
- Pitch tagging is rough monophonic autocorrelation, so per-grain pitch is register-level, not exact harmony on dense chords.

## Open questions for Karel
- **The fd-ceiling block is still open.** Full `npm run build` can't finish locally (container `EMFILE` at ~4096 open files during static-gen of 1000+ routes — infra, not code; compile + lint + type-check all pass, and Vercel deploys fine). Worth raising the ceiling or blessing `next build --experimental-build-mode compile` as the gate.
- Next pick should swing **warm/intense** and off the piano-granular technique (3× in the window now). Want the overdue **`_shared/psych/` infra cycle** (extract `feedback.ts` / `droneBank.ts` / `shepard.ts`) instead, or keep shipping instruments?
