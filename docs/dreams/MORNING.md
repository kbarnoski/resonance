# Morning digest — last updated 2026-07-08 (cycle 703, UTC fire)

**WIDE fire — three orthogonal grep-0× *played* instruments explored; shipped the one that sings.**
Mode alternation held: 697 W → 698 D → 699 W → 700 D → 701 W → 702 D → **703 W**.

## New since yesterday
- **[1291-rijke-flame](https://getresonance.vercel.app/dream/1291-rijke-flame)** — **play a *singing flame*.** A **Rijke tube** is a real thermoacoustic instrument: a heat source inside an open pipe makes the air spontaneously sing (via Rayleigh's 1878 criterion — heat added where pressure is rising pumps a standing wave). Here you **drag a glowing gauze up/down** the tube; put it in the lower-half sweet spot (h≈¼) and it swells into a pure tone, drag it to the top and it goes silent, drag the tube's cap for pitch (just-intonation). Idle 3s and it finds the sweet spot and plays itself. **Why open it:** it's a musical instrument with *no string, reed, or membrane* — you play it by moving heat, an input the lab has never had. Copper/ember palette, deliberately off the cosmic-glow. Straight out of today's research dive (below).
- *2 more built & explored this fire (WIDE siblings) — banked to IDEAS §703, both fully working:*
  - **⭐⭐ 1292-wang-loom** — a canon that **mathematically cannot repeat**, woven live by the *proven-minimal* Jeandel–Rao 11-tile aperiodic Wang set + a real backtracking solver you reseed. The highest-ceiling build of the fire (≈4/5); strong candidate to **ship next** as its own winner.
  - **⭐ 1293-neuron-choir** — tap a network of **Hindmarsh–Rose bursting neurons** into self-synchronising polyrhythm; CRT-phosphor palette, genuinely long-form (minute-5 ≠ minute-1).

## Research finding worth a look
- **Thermoacoustics as an instrument** (TEI '25/'26 *"Heat Waves: Thermoacoustics in Ecological Sound Art"* + the *Soundform* heated-cylinder installations): combustion research spends its life *suppressing* the Rijke tube; sound artists *invert* it and play it. That inversion is exactly what 1291 makes hand-playable. (RESEARCH §703.)

## ⚠ Open question for you (unchanged from yesterday — still blocking local verification)
- **`npm run build` still fails LOCALLY with `EMFILE: too many open files`** at Next's prerender step — the container's fd ceiling (soft *and* hard = **4096**, I can't raise it) exhausts opening the font manifest across ~660 dream routes. **Not a code defect:** lint + typecheck pass, and `next build --experimental-build-mode compile` (full lint + typecheck + compile of every route incl. 1291) passes **EXIT 0**. 1291 is a guarded `"use client"` component, so Vercel's normal-fd builder deploys it fine. **But this blocks full local `npm run build` for every cycle.** Options: (a) raise the container `ulimit -n`; (b) prune/archive old dream routes; (c) accept compile-mode as the standing local gate. Your call. *(Also new this fire: fresh containers now need `npm ci --ignore-scripts` — a `sharp` native-binary download 403s through the proxy; harmless, that lib is unused by the dream zone.)*
