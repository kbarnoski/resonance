# Morning digest — last updated 2026-07-20 (cycle 841, WIDE)

> **A Shepard tone for TEMPO.** `2036-eternal-groove` is a percussion groove that accelerates (or decelerates) *forever* without ever actually getting faster — the underlying pattern is static and loops seamlessly, yet the ear keeps hearing "faster." Five layers are stacked an octave apart in tempo and glide through a fixed loudness window; a layer that runs off the top wraps silently back to the bottom. It's the rhythmic transposition of the Shepard/Risset endless-pitch illusion — **grep-0× in the tempo domain across ~800 protos** — and it's a genuine *perceptual* trip (an altered perception without the drug). Best on headphones over ~15–20 s. Pure percussion, no scale at all.

## New since yesterday
- **[2036-eternal-groove](https://getresonance.vercel.app/dream/2036-eternal-groove)** — the winner above. Press Begin (auto-demo sweeps within ~2 s), tap the pulse to set tempo, drag up/down to steer accelerate-forever / hold / decelerate-forever. **CSS-compositor only** (concentric DOM rings, no canvas/WebGL), warm ink-brass on dark.

## How this cycle ran (WIDE — 3 parallel builders → 1 shipped)
- 3 explorers disjoint on input × output × technique × harmony × palette, all off every jury ban; each cleared **3 ambition criteria**. Shipped the boldest diversity move + freshest perceptual surprise. Winner has **no pitch lattice at all** — the cleanest possible dodge of the jury-banned JI partial-stack.

## Explored & banked (IDEAS.md §841 — each one curation-away from shipping)
- **⭐ diffusion-field** — *draw glowing colour-curves; the luminous field diffusing between them IS the music.* Real **diffusion curves** (Orzan et al., SIGGRAPH 2008) via WebGL2 Poisson/Jacobi relaxation → a 5-formant synth. The most substantial + beautiful of the three, and a **cosmic-ambient rebalance**. **Top resurrect.**
- **recurrence-loom** — *see a sound's hidden self-similarity as a woven cloth, and hear the period it finds.* The true N×N **recurrence matrix** (Takens/Eckmann, NOT an XY scope) of live audio, Canvas2D + comb-echo. Grep-0× but more analytical than immersive.

## Research finding worth a look (RESEARCH §841)
- The frontier feed's July-2026 default is still *server-grade joint audio-visual generation* (heavy, budgeted). The fresher, **$0** move: three foundational techniques the lab has never coupled to sound — **Risset rhythm** (shipped), **diffusion curves**, **recurrence plots** — all grep-0× in-lab.

## Open questions for Karel
- Does the tempo illusion **actually convince** on your speakers? (Built headless — no display/speakers here. Builder says it's strongest on headphones; the *visual* direction cue is subtler than the audio.)
- **Infra flag:** the dream-agent container now hits a hard 4096 open-file cap during a *full* `npm run build` at ~800 routes (`EMFILE` — and HEAD fails identically, it's not my code). The lab has been quietly relying on `next build --experimental-build-mode compile` (the exact compile phase Vercel fails on — it passed EXIT 0 with the winner). Worth raising the env ulimit or pruning/paginating the `/dream` index so the real static build can run again.
- The audio→image→**video** AI chain is still the one unbuilt frontier rung (asked-for for weeks; the $0 in-browser path is proven). Want me to scope a full cycle on it?
