# Morning digest — last updated 2026-06-07 (cycle 343, UTC)

> **Jury (2026-06-07)**: the lab's standout is `380` — the one piece that *deepened* instead of deferring — so extend it, and stop satisfying the ambition floor with the two cheapest criteria. Today does exactly that. See `docs/dreams/JURY.md`.

## New since yesterday
- **/dream/391-resilient-accompanist** — *the accompanist that survives your mistakes.* Cycle **3** of the Accompanist thread: 375 followed your *tempo* → 380 added *dynamics + articulation* → 391 adds **robustness**. It runs **two followers in parallel** (a smooth online-DTW + an error-aware HMM) and a **confidence supervisor** that hands control to the robust HMM the instant you fumble, then back when you recover. **Open it and wait ~1.5s:** a baked "Twinkle" (C major) auto-plays and *deliberately* stumbles — wrong-note run → skip-ahead → hesitation → clean cadence — so you can hear+see it catch each mistake hands-free, no MIDI. **Why open it:** it's your #1 jury ask taken literally (extend the only 4/5 piece, don't open a fresh explorer), and it stacks the two ambition criteria the jury said were missing — multi-cycle + recent research.

## How this was made (the orchestration)
- **DEEP fire**: one concept — *an accompanist that survives your mistakes* — three parallel builders each built a different robustness algorithm. Shipped the dual **DTW⇄HMM supervisor** (most legible + research-truest + keeps the full cycle-2 expressivity). **2 more explored, banked in IDEAS §343:** `393-forgiving-accompanist` (a **particle-filter swarm** of hundreds of guesses that scatters on a wrong note and re-converges — the most *beautiful*; banked as the cycle-4 candidate) and `392-anticipating-accompanist` (a predictive tempo model that plays a hair *ahead* of you). All SVG/Canvas2D — no WebGL2 (your renderer ban), all in non-D keys (your D-Dorian ban).

## Research findings worth a look
- RESEARCH §343: robustness is the live frontier — **Matchmaker** (2025 open-source piano score-follower + robustness eval), **Nakamura** parallel-HMM for errors/repeats/skips, **Otsuka** particle filter. Honest note: still no <30-day client-buildable hit (~8th dive) — but these directly shaped the build.

## Open questions for Karel
- The accompanist thread is inherently **keyboard/MIDI input** (a jury-over-used input) — but the jury *also* told us to extend this exact thread, so I followed "extend it" over the input ban. Keep deepening (cycle 4 = the particle swarm), or pivot the thread to a **non-keyboard input** (sing/hum the melody via mic)?
- The **embodiment gap** is still open (13–14 of the last 15 pieces output to a screen). A DEEP non-screen / spatial-audio / haptic cycle is owed whenever you want it.
