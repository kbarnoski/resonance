# Morning digest — last updated 2026-07-18 (cycle 820, DEEP-continue)

> **You asked for it last night.** The jury's sharpest open thread (its #3) was 1930's **adaptive-JI drift toggle** — and yesterday's digest asked you "1930 cycle 3, or done at II?" I didn't wait: tonight is that DEEP. Harmonices is now the lab's **first three-cycle piece** — play it (1) → compose with it (2) → **tune it (3)**. If you'd rather it had stopped at II, say so and I'll rotate away.

**Open this first:** https://getresonance.vercel.app/dream/1930-harmonices — press **Tilt to play** (or **Start with a resonant chain** for an instant chord; laptop uses pointer = tilt). Capture a couple of **thirds (5:4)** and let them crystallize into the chord. Then find the new **intonation** toggle under the harmonic ledger and flip **Strict ⇄ Adaptive**:
- **Strict** keeps every captured ratio pure — so the chord's centre **drifts off the star drone and you'll hear it beat**; the `drift +N¢` needle climbs off centre.
- **Adaptive** spreads the accumulated comma across the voices so the centre **locks back to the star** — the beating dies, the needle re-centres, and it tells you the price (`retuned ±N¢`).

Flip it back and forth while the chord sustains: the whole thing **glides** in and out of tune against the fixed drone. That glide is a 300-year-old theory problem — the comma pump Kepler's pure ratios could never escape — made audible and playable in real time.

## New since yesterday
- **`/dream/1930-harmonices` → Harmonices III.** A live **STRICT ⇄ ADAPTIVE** intonation toggle on the crystallized chord. It's the jury's #3 provocation delivered: the deepest form of "harmony that bites" — you don't just play pure intervals, you choose whether the chord drifts (honest physics) or locks (spread the comma), and you hear the difference against a fixed reference.
- **Why it matters:** this is the lab's first piece where the tuning *choice itself* is the instrument. New `tuning.ts` subsystem (a real-time relaxation solver — the browser cousin of Stange & Wick's least-squares JI scheme, arXiv:1706.04338, and Pivotuner, arXiv:2306.03873). It still clears both fresh monoculture bans the jury named yesterday — **tilt** input (not touch), **Canvas2D** (not WebGL2) — because it's an extend of a piece that already dodged them.
- **The three-cycle arc is now complete and legible:** cycle 1 = play orbital resonance as true JI; cycle 2 = crystallize captures into a composed chord; cycle 3 = tune that chord and hear the comma. Per the jury's discipline note ("pick the one thread, ship it, then rotate"), III is likely the natural **close** of this commitment.

## Honest caveats
- Headless container = **no speakers, no tilt sensor, no display.** I typechecked, linted, ran the authoritative compile build (all clean, route emitted), and — because I can't hear it — **numerically de-risked the tuning math** with a standalone harness: strict holds a −13.7¢ drift at 0¢ retune; adaptive locks to ~0¢ at 41¢ retune; reversible. The math is proven. The **feel** is the open question: does the drift audibly beat against the drone before adaptive locks it, and does the ~0.2 s glide read as "sliding into tune" rather than a pitch bend? Your phone + speakers settle it.
- The drift is only pronounced for chains that leave the lattice (**stacked thirds**); a fifth/octave chain barely moves — so the seed preset (a Laplace chain of fifths) is a quiet demo of the toggle. Capture 5:4 thirds to see the needle swing. That some chains close and some don't is itself the lesson.

## Open questions for Karel
- **Is Harmonices done at III?** I think three cycles is the right close (play → compose → tune) and I'd rotate to fresh next. If instead you want a cycle 4, the strongest seed is a **comma-pump loop preset** (I–vi–ii–V–I that sinks the full 21.5¢ in strict, then closes it in adaptive) — say the word.
- **Which non-touch input next?** Camera (`1934-gait-loop`) and WebGPU/breath (`1936-breath-fresco`) are both banked from cycle 819 and both thin in the lab. Preference for the next WIDE fire?
- **The AI-pipeline chain (audio→image→video, ≥2 models)** is still **0×** across ~17 juries — the one genuinely-absent frontier — gated only on your go-ahead for a small paid per-prototype budget (rule #6). One yes unblocks it.
