# Morning digest — last updated 2026-07-31 (cycle 962, WIDE)

> **Sing a body of water into motion.** Tonight went WIDE — three unrelated directions raced in one fire (a GPU fluid, a tilt-drawn harmonograph, a modal string), and the winner is the lab's **first real GPU physics simulation**: a fluid you churn with your voice, that churns you back a chord.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[4120-brine](/dream/4120-brine)** — **a real, GPU-simulated body of water that you sing into motion.** Hit **Enter** (it self-demos instantly — no mic needed) and then sing: **loud** = violent churn, **bright/high** notes make the water thin and splashy, **dark/low** notes make it thick and gloopy, and a **rising glissando visibly reverses the swirl**. As the fluid moves it *sings back* — a low drone swells with the churn you cause. Under the hood it's an **8,192-particle SPH fluid running entirely in WebGPU compute shaders** — the lab's first GPU physics solver (everything before was a texture reacting to sound; this is an actual simulation). **Why open it:** it's the biggest "huh" in a while, and the whole loop — *your voice → water moves → water sings* — is meant to be felt, not read. If your machine has no WebGPU it quietly drops to a smaller CPU fluid, so it works everywhere, including your phone (just sing).

## The one thing I need from you
- **Does the water read as water, and does the loop feel coupled?** The build is verified but I'm headless — no GPU, no mic, no speakers. I tuned the fluid constants analytically (bounded-by-construction) but only your eyes/ears confirm the churn looks fluid and the "sing → move → sing back" coupling *feels* alive. One known limit: the solver is brute-force, so on a weak laptop GPU it may run ~20–30 fps — a spatial-hash grid is the top next-cycle fix.

## Two more explored tonight (WIDE fire — 3 directions; both banked in IDEAS §962)
- **`4136-pendulum`** ⭐⭐ HIGH, ship-next — **tilt your phone to draw a harmonograph.** Two pendulums whose ratios you set by leaning the phone trace a slowly-fading Lissajous rosette as crisp **SVG**, while two voices sound the same ratio — a *closed figure = a consonant chord*. It's the most **phone-native** thing in the queue (and your review is on a phone) — say the word and I'll ship it.
- **`4128-planar`** ⭐ — a plucked string you **watch buckle into its overtones** at the instant you hear them (the picture literally *is* the modal sound; pluck the middle vs the end and both timbre and shape change).

## Research finding worth a look
- **RESEARCH §962** — the frontier that seeded tonight: *differentiable planar-modal synthesis* (arXiv:2407.05516 / 2601.10453) makes one model that is BOTH a string's sound AND its visible 2-D shape, and **WebGPU compute-SPH crossed into creative-coding-mature this year** (Borghesi's *ASTRODITHER*, Jul-2026). Brine is that second thread, shipped.

## Open questions for Karel
- **Ship the phone-first `4136-pendulum` next?** It's the one you can fully play by tilting your phone at review time.
- **AI-pipeline chain (music→image→video) is STILL 0×** (jury #3, flagged five cycles running) — needs your explicit **FAL_KEY** go-ahead + a per-run $ cap. A decision, not a build.
- **Multi-user (jury #5):** real two-device WebRTC, or retire the seed? Demoed-solo four windows now.
