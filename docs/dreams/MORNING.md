# Morning digest — last updated 2026-07-01 (~16:20 UTC, cycle 624)

> **The one thing this fire did:** it put **living things on the screen.** Tap the
> dark and a blob of matter takes root — then a real *continuous cellular automaton*
> (**Lenia**) grows it into an alien, gliding creature that you HEAR as it lives.
> And it's the render target the jury has been begging for: **WebGPU-compute**, the
> "template the rest should have reached for."

## Open this first
- **[1086-lenia-organisms](https://getresonance.vercel.app/dream/1086-lenia-organisms)** — *can a screen of self-organizing artificial life be an instrument you seed and that sings back?* It loads playing itself — a couple of creatures already drifting and sounding. **Tap the field** to drop a new blob of living matter and watch the Lenia rule grow it into a gliding organism; switch **Orbium / Rotor / Colony** regimes for different species. Total mass swells the drone, each birth rings a just-intonation bell (pitched by the creature's height), motion adds shimmer. A badge tells you if you're on the real GPU path (`● GPU`) or the identical-model CPU fallback (`● CPU`). `state: DMT entity-encounter / self-organizing alien life · pole: intense`.

## Why this one, and why now
The 2026-07-01 jury's #1 structural complaint was the **render-target monoculture** — three.js 6× + Canvas2D 5× = 11/15, with **WebGPU-compute appearing exactly once** (1066-cosmic-web, which the jury named *"the template the rest should have reached for"*). So this WIDE fire attacked that head-on: **three explorers, three deliberately different non-banned outputs** — WebGPU-compute (this), raw-WebGL2, audio-first/SVG. 1086 is literally 1066's DNA: an alien scientific algorithm (Lenia — the continuous generalization of Conway's Life) turned into a playable instrument. It dodges every ban (WebGPU-compute not three.js/Canvas2D, discrete tap-to-seed not pointer-drag, intense DMT-entity not cosmic-ambient, not real-data, not Kuramoto) and is grounded in RESEARCH §624 (Lenia + its 2025 mass-conservative *Flow-Lenia* extension + live WebGPU particle-Lenia builds — a GPU-native 2025-26 frontier, never before in the lab).

## Also explored + banked this fire (WIDE — 3 outputs, 2 banked ⭐ IDEAS §624)
- **1087-fourth-turn** ⭐ — the **raw-WebGL2** sibling: a real **4D polytope** (tesseract/16-cell/24-cell) whose six 4D rotation planes each drive a JI voice — so you *hear* the "impossible" W-axis rotation your eyes can't follow while the 2D shadow barely moves. Raw-WebGL2 is the OTHER output the jury wants; the cross-modal hook is genuinely fresh. Top resurrect.
- **1088-threshold** ⭐ — the **audio-first / SVG** sibling: an NDE tunnel-to-light rendered almost entirely in sound (HRTF ring around your head + Risset endless-descent), where you **descend by slowing your own tapped pulse**. The screen-bias breaker the lab is chronically thin on (only 1073 before). Banked because audio-first is hardest to verify headless.

## Honest caveats
- **Built green.** Authoritative winner-only `npm run build` → compile + ESLint + full-project `tsc --noEmit` all PASS (reached `Collecting page data`; build-log grep of the slug in errors = **0**). Only the standing container **EMFILE** fd-ceiling stops static-gen (infra, Vercel-safe).
- **Verification honesty:** the **CPU/Canvas2D fallback + auto-demo + always-on audio are fully headless-verified**, and the Lenia field was verified *genuinely alive* via a Node sim of the exact update (all 3 regimes settle to living churn — neither die nor saturate). The **WGSL-compute 256² path, the true creature look, and the audio feel are GPU/audio-device-only** (no WebGPU/audio in the build box) — code + math verified, not pixel-verified. The CPU fallback guarantees a complete living piece regardless.

## Open questions for Karel
- **Open it on a machine with WebGPU** (recent Chrome/Edge/Safari) and tell me how the organisms *move* and *sound* — I'll tune a cycle-2 (a "release a glider" Orbium preset with the exact asymmetric seed, GPU-side stats so audio doesn't trail, Flow-Lenia multi-species interaction).
- **Still open (needs you):** raise the container's ~4096 fd-ceiling (or bless `next build --experimental-build-mode compile`) so the full build finishes locally and the GPU/audio pieces finally get hardware-verified — the standing #1 verification debt, now 5+ juries running.
