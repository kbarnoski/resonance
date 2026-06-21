# Morning digest — last updated 2026-06-21 ~16:30 UTC (cycle 505 · ADULT · DEEP)

> **Jury verdict (2026-06-21)**: the renderer wall finally broke (Canvas2D 10→3) and the depth ceiling climbed back 1→2 — but the adult lane is now **4-of-7 "a machine listens to your piano"** and it asked to *rest your recording, end the answering-agent thread, and stop defaulting to adult-ambient*. This cycle answers all three. See `docs/dreams/JURY.md`.

Adult **DEEP** fire — one *massively-bigger* concept attacked by three parallel builders, shipped the strongest. The concept: the lab's **first feedback instrument** — after 800+ prototypes, none has ever let *instability itself* be the sound. No samples, no recordings, no follower-AI: the sound is *born from a feedback loop that wants to scream.*

## New since yesterday
- **🌀 [/dream/820-feedback-ecology](https://getresonance.vercel.app/dream/820-feedback-ecology)** — *An instrument that's a living dynamical system.* Eight high-Q resonators each sit in a feedback loop, wired into a small-world graph so they feed each other. Turn up **coupling** and the network bifurcates from isolated pings → nodes entraining and beating → a roaring emergent drone with energy visibly circulating the ring; **self-resonance** rides the edge of chaos. **Tap a node to kick it** and watch energy propagate; phase-space traces inside each node draw their limit cycles. **Why open it:** it's the lab's first self-oscillating feedback instrument, and unlike most pieces it's genuinely **non-stationary — minute 2 ≠ minute 0** (the depth-ceiling quality the jury prizes, and the exact thing it said `805` lacked). Energetic and alive, not ambient. Earbuds fine — it's hard-limited; tap "Awaken" and it self-organizes on its own.
- **2 more built this fire** (banked to IDEAS §505): **`819-no-input-mixer`** ⭐ (a faithful no-input mixer played by an **XY pad**, on a WebGL2 oscilloscope — the more directly *playable* one, on the scarcest renderer; resurrect-first). **`821-larsen-field`** (live mic **acoustic feedback** you sculpt by carving notch/peak filters on a spectral heat-field, with a safe virtual fallback for headphones). Both are complete, build-verified implementations.

## In progress / partial
- None shipped-partial. `820` is demoable. The two banked siblings are real code (briefs in IDEAS §505), one rebuild away each.

## Research findings worth a look
- **RESEARCH §505:** the **no-input / self-oscillating feedback instrument** is having a 2026 moment — **Body Synths Laboratory** (a feedback synth that self-oscillates with no input) was at **Superbooth 2026** (Berlin, May 7–9), no-input-mixing albums fill Bandcamp in 2026, and the ACM paper *"Musicking with dynamical systems"* frames the instrument as a coupled system you *perturb*. The lab had **never** built one (grep-0×). Note: the freshest arXiv music papers (LiveBand, Live Music Diffusion) are all the *follow-the-musician* lane the jury just banned — so I steered around them deliberately.

## Open questions for Karel
- **Does `820` audibly read as a self-organizing *ecology* on your device** — energy genuinely circulating and evolving over a couple of minutes — or just as a drone? That's the one thing I'd want your ears on (verified at compile/lint/type level only; no audio in the sandbox).
- Standing infra ask unchanged: the container's ~4096-fd ceiling blocks local static-gen (compile + lint + types verified green this cycle; **proven infra — pristine main fails identically**; Vercel deploys fine).
- Heads-up on git: the remote `main` history was force-rewritten again (the recurring divergence) — I reset local to `origin/main` (cycle 504) before building, as prior cycles have. If that rewrite is unintended, worth a look.
