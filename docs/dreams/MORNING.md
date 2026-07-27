# Morning digest — last updated 2026-07-27 (cycle 923, DEEP)

> **Consumed today's jury** (`JURY.md`, 2026-07-27): *ban a fresh altered-state, get off the WebGL fragment shader (8 of 15!), and extend the pieces with real musical stakes — `2920-follow`, `2952-tabla`, `2960-murmuration`.* So tonight is **not** psychedelic: it's a hands-on, off-the-shader, stakes-first **duet**.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3120-continuator](/dream/3120-continuator)** — **a duet partner that LEARNS how you sing and answers in your own voice.** Sing a phrase; it goes quiet, folds what you sang into a running model of *your* idiom, then sings back a **new** phrase that's recognisably you but never a literal repeat. The model keeps accumulating — the duet at minute 8 differs from second 0 *because of what you sang*. The lab's **first generative turn-taking instrument** and first online model of the player. Audio-primary, drawn in **SVG** (no shader). Named after **François Pachet's *Continuator* (2002)**.
  - *Why open this:* it's the truest extension of `2920-follow` you asked the lab to chase — a score-*follower* became a partner that *generates* an answer in your style. The most product-relevant seam: **Resonance as a partner that learns YOU.**
  - **Needs your eyes/ears (headless here):** press **Play a demo phrase** a few times and watch the "idiom-contexts / order" readout climb — then **Start mic** and sing to it. Do the two formant voices read as distinct warm companions, and does the answer *feel* like it came from your own material?

## Also explored tonight (2 more — banked, IDEAS §923)
- **3112-antiphon** ⭐⭐ — the same duet answering in **strict canon** (it mirrors / reverses / transposes *your* actual contour — Fux species counterpoint). The most *visually* legible of the three (you watch the inversion mirror on the transcript). Lowest-risk; held only because canon is the more "inevitable" concept.
- **3128-jugalbandi** ⭐ — a partner that **harmonizes under your live voice** and takes the lead in your silences (Hindustani sawal-jawab). Held on two fixable strikes: its lead snaps to a just-intonation scale (the JI net we've kept killed), and the live-shadow latency needs a real-device check.
- All three were one idea (a real two-way vocal duet) attacked three ways — a DEEP fan. I shipped the strongest and folded the others into IDEAS.

## Open questions for Karel
- **AI-pipeline chains (music→image→video) still 0× — flagged by the FIFTH+ jury in a row (~12 cycles overdue).** The single most novel unbuilt thing, but it spends your FAL_KEY image budget, so I won't start it autonomously. **One word ("go, cap $X/run") unblocks it.**
- Next cycle: **deepen the duet** (toward a real song / a two-way conversation, per the jury) or **pivot** to another stakes-first hands-on instrument (extend `2952-tabla` / `2960-murmuration`)?

## Housekeeping
- Winner-only compile build (the container's 4096-fd cap still blocks a full-route local `npm run build` — infra, not code; Vercel deploys the full pipeline fine). Continuous pitch preserved; no JI net. Losers banked as text, never committed.
