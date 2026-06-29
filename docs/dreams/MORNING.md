# Morning digest — last updated 2026-06-29 ~12:00 UTC (cycle 598)

> **Jury verdict today**: The psychedelic steer is making gorgeous work, but the lane has hardened into seven full-screen shaders-you-watch in a row — beautiful, passive, unverifiable; tomorrow build one you can actually *play* (ideally driven by your own piano), bring back WebGPU compute, and pull the reusable engines into `_shared/`. See `docs/dreams/JURY.md`.

## New since yesterday
- **`/dream/1050-mycelial-grow`** ⭐ — the psych lab's **first warm piece** and **first psilocybin state**. Gold mycelium that actually *grows* out of the dark — branching filaments colonize the field forever (it's genuinely different at minute 5 than minute 1), and every fork rings a soft consonant tone. Real **Space Colonization Algorithm**; breathe into the mic and the network blooms faster. *Why open it:* after a week of cool, peak-centric DMT/LSD geometry, this is the opposite pole — warm, organic, alive, slow. Open it and just let it grow for a couple of minutes.

## How this cycle ran
- **DEEP mode** (not WIDE) on purpose — the lane had run WIDE 5 cycles straight, so I went deep on ONE concept (warm psilocybin "mycelial bloom") with **2 parallel approaches** and shipped the stronger: `1050` the *growing network* beat `1048` the *fragment-shader warp*. The loser was built complete + clean and is banked ⭐ to re-drop next fire (IDEAS §598).
- Honest note: the growth algorithm is **not** lab-first — `322-kids-voice-garden` used it years ago. I didn't over-claim it; the fresh axis is the adult, long-form, breath-driven, fork-sonified register. Ambition cleared at 3/5 (≥3 subsystems + named refs + today's research).

## Research finding worth a look (RESEARCH §598)
- **Nature Comms 2025 "Psilocybin alters visual contextual computations"** — psilocybin changes how the visual cortex blends each point with its *surround*, and (bioRxiv 517847) literally *raises the fractal dimension* of brain activity. That reframed the build: the come-up is *growth + rising complexity*, not a frozen peak pattern.

## Open questions for Karel
- **The build can't finish locally** — every cycle `npm run build` compiles + lints + type-checks clean, then dies on the container's 4096 open-file cap (`EMFILE`) during static-gen of 1000+ routes. Vercel deploys fine (it's live), but I can't run a *full* local build. Two fixes, your call: raise the fd ceiling, or bless `next build --experimental-build-mode compile` as the gate.
- **A `_shared/` psych-infra cycle is ~6 fires overdue** — I keep shipping self-contained pieces that each leave a reusable module behind (`growth.ts`, `feedbackBuffer.ts`, Möbius-fold GLSL, `safeFlicker.ts`, `logPolarWarp.glsl`, `raymarch4D`). Want me to spend one DEEP cycle extracting them so future builds compose faster? It's low-visual-payoff but high-leverage.
