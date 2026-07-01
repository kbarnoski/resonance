# Morning digest — last updated 2026-07-01 ~00:15 UTC (cycle 616)

> **The one thing this fire did:** finally shipped the lab's **first score-follower / reactive accompaniment** — a thing that has been named by the jury, banked, and deferred **three times** ("the lab ships novelty-first and never returns"). Play a rhythm and a duet partner tracks your tempo and answers *on the beat, anticipating it*. It's a live-performance instrument you play — and it fully demonstrates without a mic.

## Open this first
- **[1074-pulse-mirror](https://getresonance.vercel.app/dream/1074-pulse-mirror)** — *a duet partner that lands on your beat.* Tap **Start mic** and clap / tap / sing a steady rhythm — it detects your onsets (spectral flux), finds your pulse (median-IOI beat tracker), and plays a warm just-intonation call-and-response committed to your **predicted** next beat, so the answer arrives *in time*, not late. No mic? Tap **Start demo performer** and the whole follow-and-answer loop runs on a synthetic player. Amber = you (left), violet/rose = the instrument's reply (right, with a faint pre-glow as it anticipates). `state: jazz / call-and-response · pole: warm`. Refs: Dannenberg (1984), Ellis (2007).

## Also explored this fire (WIDE — 3 orthogonal explorers, 2 banked ⭐)
- **1076-strange-canon** ⭐ — *a chaotic system as the composer.* A strange attractor (René Thomas' ODE) is the score; **4 voices read the same wandering path at staggered delays — a strict canon over a line that never repeats** — while it paints a luminous auto-rotating ribbon. The most *surprising* of the three; anchored on a fresh Jun-2026 find (SYTHM). Banked because 1074 discharges a named jury gap. (IDEAS §616)
- **1075-flux-veil** ⭐ — the lab's first **optical-flow** piece: your webcam motion smears and ignites a WebGL2 dye field (the TouchDesigner "optical flow → advection" port). Highest ambition (4/5) — banked a **second** time because its GPU+camera payoff is device-only; resurrect with a real-hardware pass. (IDEAS §616)

## Why this one won
Three strong candidates, all dodging the banned outputs. **1074 won on four converging reasons:** it discharges **JURY #5** (score-following — named, 0× shipped, deferred 3×; *actually returning to ship a named gap* is the discipline the jury keeps asking for); it lands **your priority #3** (live-performance fitness — a low-latency mic instrument for the stage); it's **fully verifiable headless** (the demo performer runs the entire loop, no hardware); and its anticipatory call-and-response is a genuinely different *play* relationship, not the luminous-field sameness you flagged as "too similar." 1076's edge was surprise alone — banked, one fire away.

## Honest caveats
- **Built green.** `npm run build` → `✓ Compiled successfully in 48s` + ESLint + project `tsc --noEmit` (exit 0), 0 issues from the 1074 folder; only the standing container EMFILE fd-block stops static-gen (infra, Vercel-safe). The demo-performer path IS a full headless demo — untested only on real-mic onset sensitivity (flux thresholds may want per-room tuning) and the ear-feel of the duet on a device.

## Open questions for Karel
- **Does the anticipatory duet actually feel *with* you?** The bet: committing the reply to the *predicted* beat (not reacting late) is what turns accompaniment into a partner. Worth a clap-along test on your phone.
- **Which banked explorer next?** `1076-strange-canon` (attractor-as-composer — most surprising, fully verifiable, one fire away) or `1075-flux-veil` (optical-flow — needs a GPU pass). Or honor a multi-cycle commitment again: **1068's cycle-3** (depth-z, entity gaze, multi-body) still uncashed since 612.
- **Still open (needs you):** raise the container's ~4096 fd-ceiling (or bless `next build --experimental-build-mode compile`) so the full build finishes locally and I can stop caveating the static-gen step.
