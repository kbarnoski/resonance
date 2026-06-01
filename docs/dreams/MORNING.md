# Morning digest — last updated 2026-06-01 (cycle 275, adult · DEEP orchestration)

## New since yesterday
- **[251-live-duet-trader](https://getresonance.vercel.app/dream/251-live-duet-trader)** — **a partner that trades fours with you.** Play a line into the mic; the instant you pause it darts in with a melodic answer **in your key**, and the instant you play again it **ducks out of the way** — you always have right of way. It learns your intervals live (a Markov table) and infers your key as you go. **Why open this:** it's the reactive accompanist the jury asked for by name — the real-time upgrade of `225-aria-companion` (which just waits a polite 2 seconds; this one weaves into the *gaps* of your phrasing). Tap **Play demo** to hear the trading with no mic. First continuous interleaved-trading interaction in the lab.
- This was a **DEEP 3-builder fire** on one big concept — *a live AI accompanist that plays WITH you in real time*. The other two members built clean and are **banked** in IDEAS.md as a multi-cycle "**AI band**": `live-duet-harmonist` (a continuous bass+comp **bed under your chords** — handles chordal piano, where the Trader can't) and `live-duet-groover` (a **drummer that infers your tempo** and follows it — first beat-tracker in the lab).

## In progress / partial
- **The "AI band" arc:** Trader (shipped, melody) → **Harmonist next adult cycle** (harmony, build-verified, ~714 lines, handles chords) → Groover (rhythm). Three reactive accompanists = a band you play with, not a toy.
- Honest gap: 251 is **monophonic** (tracks one pitch) — chordal piano confuses it. That's exactly why Harmonist (chroma-based, polyphonic) is queued next: together they cover melody *and* chords.

## Research findings worth a look
- **arXiv 2604.07612 "Real-Time Human–AI Musical Co-Performance"** (Apr 2026) — frames accompaniment as a *sliding-window look-ahead* protocol: the AI plays on **partial** live context, anticipating rather than waiting for a finished phrase, with **latency as the constraint**. We borrowed the *interaction shape* (not the heavy diffusion model) with cheap browser DSP. Full note in RESEARCH.md §275.

## Open questions for Karel
- **Build the Harmonist next?** It's the comping bed under your chords and probably the most directly useful of the three for a pianist — build-verified and one-cycle-ready. Or do you want all three before iterating?
- The **Groover** (tempo-follower) needs a real browser session to tune — spectral-flux onset detection is happiest with percussive input and fuzzier on legato piano. Worth a tuning cycle, or is melody+harmony enough of a "band" for now?
- Next is a **kids** cycle (276) — I'll orchestrate it (no more solo kids builds) using a non-touch input. Lean to the banked **`kids-sing-garden`** (voice→bedtime sky, fills the calm/pre-sleep niche) or `kids-tilt-pour`?
