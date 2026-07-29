# Morning digest — last updated 2026-07-29 (cycle 943, DEEP)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3576-bloom](https://getresonance.vercel.app/dream/3576-bloom)** — **open this and hit the surface.** A real physical-modeling *instrument*: strike a plate, gong, drum, bar or string and it rings with genuine **non-linear physics** — hit it *harder* and the pitch glides sharp and **blooms**, energy sloshing between its modes into an evolving **shimmer**, exactly like a real struck plate. And you *watch* the vibration draw itself as living **Chladni nodal patterns** — the picture is driven by the exact same mode energies you hear, so it blooms on strike and reorganises as the sound rings. No score, no win/lose — you excite a material, it sings back. It self-plays (strikes across plate/gong/membrane) until your first strike takes over. Directly implements today's research (non-linear modal synthesis).

## In progress / partial
- Two more realizations of the same idea were built + explored this DEEP cycle, then banked (not shipped) — see IDEAS §943:
  - **`3584-anvil`** — the same instrument as a *true per-sample DSP engine* (an AudioWorklet, not automation-faked). The most rigorous version; its whole value is the audio, so it wants a **headphones-on** test — I held it for a slot where you can listen.
  - **`3592-plate`** — the same instrument as a **3-D plate** you can see physically deform in its vibration shapes as it rings. Spectacular, but held one cycle (three.js is over-used lately + it needs your GPU to verify).

## Research findings worth a look
- **The modes go non-linear.** nlm (arXiv:2603.10240, Mar 2026) + Stable Differentiable Modal Synthesis (arXiv:2601.10453, Jan 2026): real-time struck-surface modeling where the modes are *coupled and amplitude-dependent* — energy raises tension raises frequency (the bloom), energy migrates between modes (the shimmer). Phenomena a plain sum-of-decaying-sines can't produce. That's exactly what `3576-bloom` is built on, and it massively expands the linear-modal `3560-matter` I banked yesterday. (RESEARCH §943.)

## Open questions for Karel
- **Ear-check `3576-bloom` on your device:** does the *bloom* (pitch gliding sharp on a hard hit) and the *shimmer* come through, and do the 5 materials sound genuinely different? The modal ratios are textbook idealisations and the tuning was reasoned, not listened to — one listening pass would tell me a lot. (The banked `3584-anvil` is the more faithful per-sample version if you want to compare — say the word and I'll ship it.)
- **AI-pipeline chain (music→image→video)** is the one big lane still at 0× — 9th+ cycle I've flagged it. It needs your explicit **FAL go-ahead + a per-run $ cap** before I can build it (guarded, budgeted). Say the word.
- **Your real Path piano** is still uncashed — a clean way in now: seed this instrument's mode set from your piano's spectral profile so you strike *your own* harmony.
