# Morning digest — last updated 2026-07-27 (cycle 926, WIDE)

> **No fresh jury today** (JURY-2026-07-27 still stands as the audit — *raise the human from a **dial** to a **decision**, get **off** the WebGL fragment shader, ban a fresh altered-state, keep continuous pitch*). Tonight went **WIDE** against the "too similar" mandate: three unrelated **instruments where a human owns a musical decision that can be wrong** — a different input × output × technique each — and shipped the one that proved its stakes.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3192-bow](/dream/3192-bow)** — **the screen teaches you to BOW a string.** Bow speed and pressure are one 2-D gesture on the *Schelleng playability wedge*: too light and the string only whispers, too hard and it screeches — **only the right zone sings.** Under it is a real stick–slip friction model (McIntyre–Woodhouse–Schumacher 1983), not a filter fake: the bow sticks and slips against a digital-waveguide string, and that alternation *is* the tone. The most literal answer to the jury's "dial → **decision**" — bowing is the canonical skill you can get wrong — and it refills the **SVG** register the jury flagged as vanished.
  - **Try it:** it opens playing a **seeded auto-bow** (visuals) that sweeps light → singing → raucous so you see all three regimes; press **"Play the auto-demo with sound"** to hear it, or **"Pick up the bow"** / just drag on the diagram to take over. **Drag sideways = speed, down = pressure; stay in the violet wedge to sing.** Pick the string with G3/D4/A4/E5 or ←→. *Headphones help — the three regimes are genuinely different sounds, not just louder/quieter.*
  - **Why I trust it for a silent review:** I can't listen headless, so I measured it — inside the wedge the tone is periodic (autocorrelation ≈ 1.0), pushed too hard it goes genuinely aperiodic (≈ 0.43). The stakes provably land in the *sound*, which is why this one shipped over its siblings.

## Also explored tonight (2 more — banked, IDEAS §926)
- **3176-baton** ⭐⭐ — **conduct a synthesized ensemble by tracing beat patterns; rush or drag and the players get pulled off the beat *with* you.** Ambition 4/5 and the truest chain from tonight's research dive (conducting-gesture→bar-phase, arXiv:2604.27957 + Max Mathews' *Radio-Baton*). The freshest *surprise* of the three — held only because the felt drag-the-ensemble loop needs your live hand to judge (the auto-conductor proves the pipeline, not the feel). **Top resurrect.**
- **3184-marble** ⭐ — **tilt your phone to roll a marble down a switchback of tuned pegs and play a melody** (three.js + Wintergatan Marble Machine). Delightful; held because its "wrong answer" is a phrase *stalling* rather than sounding wrong — the loosest stakes of the three.

## Open questions for Karel
- **3192-bow wants a real ear.** The friction is physically shaped and the three regimes are correctly ordered + measured-distinct, but *exactly where each regime bites* along your gesture is tuned by metric, not by ear. Play it for 30s — does the singing wedge feel too easy or too punishing? I'll re-tune from your read.
- **AI-pipeline chains (music→image→video) still 0×** — flagged by 5+ juries, now ~13 cycles overdue. The single most novel unbuilt thing, but it spends your FAL_KEY budget, so I won't start it autonomously. **One word ("go, cap $X/run") unblocks it.**

## Housekeeping
- Winner-only compile build passed **EXIT 0** (the container's hard 4096-fd cap still blocks a full-route local `npm run build` — infra, confirmed un-raisable; Vercel deploys the full pipeline fine). Zero new npm deps; no api route (pure browser Web Audio + SVG). Losers banked as text, never committed.
- STATE.md prepended honestly this cycle (fixing the 923/924 skip).
