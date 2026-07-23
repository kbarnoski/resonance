# Morning digest — last updated 2026-07-23 ~18:30 UTC (cycle 880, WIDE)

> **Day 3 of your jury's "full week off altered-states"** (tool → game → **technical-firsts**). The jury's sharpest line, #5: *"WebGPU compute is STILL a zero — the sharpest single technical gap left; and webcam is the rising monoculture — if you use the camera, ban bare centroid, use real MediaPipe."* So this WIDE fire cashed **both** named 0× gaps at once — and shipped the WebGPU one.

Open the lab: https://getresonance.vercel.app/dream · **best on a recent browser with sound on.**

## New since yesterday
- **`2402-sandfall`** → https://getresonance.vercel.app/dream/2402-sandfall — **the lab's FIRST WebGPU compute simulation.** Pour tens of thousands of grains; the pile's own collisions and flow *are* the instrument — build a heap, then shake it and hear it avalanche. **Why open it:** it finally ships the substrate your jury's been begging for (a GPU compute pipeline, ~40k grains) as a *playful material toy*, not a mood piece. One control (where you pour), one goal. Auto-demo self-pours on load; no WebGPU → full local CPU sim, so it always works.
- **2 more explored this fire (WIDE), banked to IDEAS §880:**
  - ⭐⭐ `2404-handspan` — the *other* jury-named 0× gap: first **real MediaPipe** 21-landmark hand tracking. Conduct a chord with bare hands (finger-spread = voices, height = register, pinch = strike). Held back only because it needs camera + a CDN load = least reviewable at a silent glance. TOP resurrect for a deliberate camera cycle.
  - ⭐ `2406-piano-print` — a bulletproof pianist's tool: play one note into your mic, it measures **your** piano's real inharmonicity, draws its Railsback stretch fingerprint, then A/Bs a synth retuned to match. The most on-brand of the three (a near-tie); cycle-2 layers your real Path piano.

## In progress / partial
- None. Clean single-commit cycle: winner shipped, two seeds banked.

## Research findings worth a look
- **WebGPU compute is now universally deployable** (MLS-MPM → ~100k particles on an iGPU; compute is "the single most important capability WebGPU adds"). Cashed this cycle as `2402`. **Real MediaPipe** hands run client-side at sub-20ms → banked as `2404`. RESEARCH.md §880.

## Open questions for Karel
- **The GPU-verify debt, honestly.** `2402`'s WebGPU path can't run headless, so it's compile/lint-verified only — but it degrades to a fully-local CPU sim and can never white-screen. On your real machine you'll see the true 40k-grain GPU version. Worth a glance: does the sand→sound coupling feel alive?
- **Two lanes still need your go-ahead** (jury has flagged for weeks, both 0×): a real **AI-pipeline chain** (audio→image→video — needs a FAL_KEY budget + your OK) and a **true cross-machine WebRTC** listening room. Say the word and I'll spend a cycle on either.
- Mode ledger …878 W · 879 D · **880 W** → back to DEEP next cycle.
