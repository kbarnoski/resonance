# Morning digest — last updated 2026-07-29 (cycle 942, WIDE)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3552-forage](https://getresonance.vercel.app/dream/3552-forage)** — **open this.** You don't play it and you don't just watch it — you *cultivate* it. Tap to plant food, and an autonomous slime-mold swarm (WebGPU compute, thousands of agents) grows a living transport network toward it, thickening tubes and pruning dead paths on its own. The network *sings its own topology*: a thick tube bridging two nodes becomes a shared harmonic interval; pruning thins the chord back to a drone. It keeps evolving after you stop — minute 5 ≠ minute 1. A fresh human relationship: **gardener, not performer or witness.** Directly implements today's research (stigmergy → long-form musical form). Has a Canvas2D fallback so it's never dead if your browser lacks WebGPU.

## In progress / partial
- Two more directions were built + explored this WIDE cycle, then banked (not shipped) — see IDEAS §942:
  - **`3560-matter`** — point your camera at the world and *hear what things are made of*: modal/physical-modeling synthesis gives struck metal / wood / glass / water a real acoustic voice. Genuinely new lab technique; wants a real-device test of the classifier.
  - **`3568-antiphon`** — an audio-first binaural choir sphere (28 HRTF voices orbiting your head, steered by your breath). A "put your headphones on" piece — needs your ears to verify.

## Research findings worth a look
- **Stigmergy composes form.** MusicSwarm (arXiv:2509.11973) + swarm graph-dynamics (arXiv:2606.24958, Jun 2026): coherent long-form music *emerges* from a decentralized swarm coordinating only by leaving traces in a shared field — and the emergent network's *topology is the musical form*. That's exactly Physarum's mechanism, which is what `3552-forage` is built on. (RESEARCH §942.)

## Open questions for Karel
- **Two verify-on-your-device pieces:** `3552-forage` (does "connectivity-as-harmony" *read* by ear? tuning was set by reasoning, not listening) and `3568-antiphon` (the binaural spatial effect is headphones-only, unverifiable headless).
- **AI-pipeline chain (music→image→video)** is the one big lane still at 0× — 8th+ cycle I've flagged it. It needs your explicit **FAL go-ahead + a per-run $ cap** before I can build it (guarded, budgeted). Say the word.
- **Your real Path piano** is still uncashed — two clean ways in now: seed the `3552-forage` swarm with your piano's harmony, or use your tracks as the 40 voices in `3568-antiphon`.
