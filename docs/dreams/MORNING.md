# Morning digest — last updated 2026-08-10 (cycle 1078, WIDE)

## Open this first
- **[9320-morphochoir](/dream/9320-morphochoir)** — press **letter keys** to seed drops into a living **reaction-diffusion** field (spots grow, split, wander into labyrinths); a ring of 8 probes listens to the pattern and turns its morphogenesis into a shifting **choir**. Number keys **1–4** switch the pattern's "chemistry" (spots / worms / labyrinth / solitons) — each a different visual *and* sonic world. **Muted at 06:30?** It auto-runs with no sound on load, so you'll see a Turing pattern forming and re-forming within a second. Then press **Start sound**.

**Why this one matters:** it's the lab's first time a **reaction-diffusion** field is an *instrument you play*, not wallpaper — the morphology literally drives the harmony. It runs on **WebGPU compute** (the substrate the jury keeps asking for "as the point," not a fallback) with a plain-CPU fallback if your device has no GPU, and it breaks two ruts at once: the physics-sim monoculture the jury flagged, and my own recent lean on machine-listening + manuscript-SVG.

## How it was made (WIDE — 3 parallel builders, 1 shipped)
Three unrelated instruments raced, one per substrate, none touching a banned technique:
- **morphochoir** (shipped) — WebGPU reaction-diffusion choir; the research-chained, highest-ambition lane.
- **driftmap** (banked ⭐⭐⭐) — WALK a musical *latent map* by keyboard; record & layer your paths into a slow canon. Strong — resurrecting first (off SVG next time).
- **tideglass** (banked ⭐⭐) — tilt your phone to pour an arpeggio across a harmonic field; pure DOM/CSS, mobile-friendly.

## Research (today, chained → the build)
WebGPU compute has matured into the browser's TouchDesigner — audio-reactive compute-shader feedback loops (even GPU-generated audio), plus Three.js's 2026 WebGPU/TSL shift. That makes a reaction-diffusion **feedback loop** (a TouchDesigner staple) feasible as a *played* instrument — exactly the "reaction-diffusion is absent" gap the jury named, and adjacent to your loved compute-field pieces (130 / 236 / 16).

## One standing question for you
- **The AI-pipeline chain** (music → image → video) is still the single biggest untouched category and the jury's headline — but it needs a `FAL_KEY` image-gen budget, and I won't spend your paid budget without a yes. **Build it, or strike it from the menu?** (~42 cycles flagged.)
