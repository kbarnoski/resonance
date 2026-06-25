# Morning digest — last updated 2026-06-25 ~06:1x UTC (cycle 546, kids · DEEP)

Open the lab: https://getresonance.vercel.app/dream

## ☀️ Open this first
- **[931-kids-tide-pool](https://getresonance.vercel.app/dream/931-kids-tide-pool)** 🌊🔔 — *Tilt the iPad at bedtime; a glowing sea of light flows downhill, pools in the low corner, and every pool rings a soft bell.* The lab's **first all-GPU shallow-water sim** — the *entire* physics (water height + four pipe-fluxes per cell) lives in ping-pong float textures, advanced every frame by fragment shaders, so a 4-year-old's tilt makes the light-water **genuinely** run downhill and pool (real conserved flux, not a faked wobble). **The rhythm of the music is the rhythm of how they tilt** — gentle rock = sparse drops, fast sway = a flurry; pitch is a fixed warm pentatonic (no wrong notes, no harmony engine). The directest answer to the jury's "swing all-in to GPU" + "make music from rhythm, not pitch theory," as a calm, parent-tolerable bedtime piece.
  - Kids-safe: master gain 0.24 → 6kHz lowpass → limiter; a hard tilt makes *more soft* bells, never louder. Always-on drone so it's never silent. Tilt input (the freshest — touch was over-used in recent kids builds).
  - On your laptop (no tilt sensor): pointer-drag + an idle auto-demo rock the tide for you, so it sees+sounds within ~0.6s.

## In progress / partial
- Nothing mid-thread. Cycle 547 (adult) resurrect-first: **928-tilt-orrery** (WebGPU-compute N-body gravity rhythm).

## Research findings worth a look
- **RESEARCH §546** — a full shallow-water sim now runs *entirely on the GPU* in-browser via the **virtual-pipes model** (Mei/Decaudin/Hu 2007; lisyarus/webgpu-shallow-water 2025; 80.lv WebGPU water Jan 2026). This is what made the tide-pool's pooling real physics, not a damped membrane. In-README dated-citation streak now **12 cycles**.

## Also explored (DEEP — 1 concept × 2 approaches, shipped 1)
- **930-kids-tilt-tide** — same tide-pool idea, solved on the CPU + rendered with three.js (the bulletproof, no-float-texture path). Build-clean, banked ⭐ resurrect-first in IDEAS §546.

## Open questions for Karel
- Tide-pool deepening: should a *sustained* tilt-hold carve a standing channel the water **remembers** (state/memory over minutes — the long-form depth the jury most praised)? Or keep it simple and immediate for a 4-year-old?
- Only compile+lint+type are verified here (container has no GPU/tilt/audio; static-gen still hits the standing EMFILE infra ceiling — Vercel deploys fine). Worth a real-iPad pass on the tilt-feel when you have a moment.
