# Morning digest — last updated 2026-06-27 (~18:25 UTC)

> **Jury verdict (2026-06-27)**: old ruts fixed, new ones formed. Loudest standing asks: *extend 977/992 into a multi-cycle spatial building*, *retire the explainable-inverse formula* (pure timbre / presence), *rebuild WebGPU-compute*, and the perennial #1 — *pay down verification debt (too many unheard builds)*. See `docs/dreams/JURY.md`.

Cycle 576 · **kids** · DEEP (2 engine approaches, orchestrated). Shipped 1, banked 1. **This fire is the lab's FIRST true-3D scene-graph build (jury: that's 0×) and a deliberately verification-safe ship — it runs on any browser with no WebGPU/permission friction.**

## New since yesterday
- **[/dream/995-kids-moon-trampoline](https://getresonance.vercel.app/dream/995-kids-moon-trampoline)** — *Moon Trampoline (kids 4+).* **Tilt a tablet like a tray and roll a glowing moon-ball across a springy TRAMPOLINE OF STARS — the stretching cloth itself rings like a soft drum, because the sheet's own simulated vibration modes ARE the sound.**
  - *Why it's different:* the lab's **first true-3D scene-graph** piece (hand-written perspective camera that orbits so the sheet stretches toward/away in depth — no three.js), and the most literal "the physical simulation IS the resonating body" — the 960-friction "timbre is physics" idea ported to a 4-year-old toy. A 24×24 Provot mass-spring cloth; where the moon dents it, **the drum's fundamental bends DOWN** (real struck-membrane physics, Avanzini & Marogna), ripples open the higher modes, settling gives a warm Eb chord. Eb lullaby, no wrong notes, never silent.
  - *Try it:* tap the moon to start, then **tilt** (or drag, or just leave it — the moon auto-drifts in a slow circle so it's always moving + singing). Runs on any phone/laptop; calm indigo bedtime palette with a ~12-min goodnight fade.

## Also explored (banked, not shipped — IDEAS §576)
- **994-kids-star-cloth** ⭐ RESURRECT-FIRST (kids) — the **WebGPU-compute** twin: same toy, but the cloth relaxation runs in a genuine WGSL `@compute` pipeline at higher res — the bigger technical swing and the literal jury-encouraged GPU-compute rebuild. De-selected only because its headline GPU path is unverifiable in this box and degrades to a coarser fallback on phones without solid WebGPU; **995 was the more reliable morning artifact.** Cycle-2 graft: fold 994's GPU cloth into 995 as an optional high-res path once we can verify on a real GPU.

## Research finding worth a look (RESEARCH §576)
- The 2026 real-time cloth-animation frontier is going **neural** (arXiv:2603.25580 "UNIC", Mar 2026) — so a *transparent physical* cloth-as-instrument is the on-mandate inversion. Browser feasibility is settled (arXiv:2507.11794, WebGPU cloth @ 60fps/640K nodes). The fun law I built the toy around: a struck membrane's pitch literally bends under a deep dent (Avanzini & Marogna).

## Open questions for Karel
- **995 wants a real-device tilt check** — the render + membrane audio are reasoned but not yet seen/heard; on hardware the tilt axis may need a sign flip (drag/keys/auto-demo work regardless, so it's never dead). One play would let me tune cloth res + modal partials.
- **Next adult step (577):** I'd push the **992 → walkable *building*** thread — fold the banked `991-dream-rooms` doorway-modulation + `993-resonant-halls` per-room acoustics + 977's record/replay ghosts into one piece. Want that, or deepen 995 to its GPU high-res path first?
- Standing infra: either raise the container ~4096-fd ceiling so Next static-gen runs locally, or do one hand-verify pass on a real tilt/GPU/camera device (995/994/992/977/988 all await). Everything builds green + Vercel-deploys.
