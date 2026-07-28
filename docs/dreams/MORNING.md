# Morning digest — last updated 2026-07-28 (cycle 930, WIDE)

> **Tonight: the browser grew a GPU physics engine — so I got off Canvas2D.** Six of the last ten pieces rendered to Canvas2D (we escaped the shader rut straight into a Canvas2D one), so tonight raced **three fresh render substrates** — WebGPU/GPU-compute, three.js instanced geometry, and SVG — and shipped the one that's genuinely new for the lab. A 2026 finding (three.js WebGPU compute now simulates *thousands* of particles entirely GPU-side) became a playable **marble machine**.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3272-cascade](/dream/3272-cascade)** — **compose a groove by aiming a waterfall of physics particles onto tuned bars.** A browser **Wintergatan marble machine** where the marbles are thousands of GPU-simulated particles. Tilt the draggable **deflectors** so the falling stream lands on the bars you want, in the rhythm you want — aim it into a groove, or over-drive the flow and it collapses into a noisy wash. *Where the particles land is which notes play.*
  - **Try it:** press **Start the machine**, then drag/rotate the deflectors and nudge the emitter + flow. Particles fall, strike a row of pitched bars, and both ring and flash.
  - **Why it matters:** this is the lab's **first GPU-compute / GPU-physics piece** — the compute substrate you (and the jury) kept asking for, a browser port of the TouchDesigner/Houdini particle paradigm. The heavy sim runs entirely on the GPU (raw WGSL compute shader); where WebGPU isn't available (Safari/Firefox) it falls back to an identical CPU/WebGL sim so it *always* works.
  - **Love-aligned:** extends three you've loved — `130-tsl-particle-compute`, `169-kids-marble-run`, `236-particle-life-song`.

## Also explored tonight (2 more — banked, IDEAS §930, both built + tsc/eslint-clean)
Two other fresh non-Canvas2D substrates, same "one ambitious idea each" bar:
- **3280-orrery** ⭐⭐ — **a polyrhythm you tune as a solar system.** Concentric rings of orbiting bodies; a fixed spoke is the playhead; each ring's *orbital period* is its pulse. Simple ratios (3:2, 4:3) interlock into a canon; detune them and the phases slowly drift so it's never the same minute to minute. three.js instanced geometry; **Kepler's *Harmonices Mundi***. The lab's cleanest long-form/evolving piece.
- **3288-arbor** ⭐⭐ — **music that grows like a plant.** An L-system tree where every branch is a voice pitched at an interval above its parent — so the harmony literally *branches*, bushy sub-trees becoming clusters. You prune to steer it. **SVG** (a register that had cratered to 1×), **Lindenmayer / Prusinkiewicz**. Botanical, long-form.

## Open questions for Karel
- **Which substrate should I deepen?** GPU-physics (cascade), instanced orbital-mechanics (orrery), or generative-botany SVG (arbor)? All three are fresh lanes — I'll build out whichever lands. The WebGPU compute engine is the biggest unlock: it's now reusable for a whole family of kinetic instruments (pinball, Galton board, sand pendulum).
- **AI-pipeline chains (music→image→video) still 0×** — the single most novel unbuilt thing, but it spends your FAL_KEY budget so I won't start it autonomously. **One word ("go, cap $X/run") unblocks it.**

## Housekeeping
- Winner-only compile build passed **EXIT 0**. The full-route local `npm run build` still hits the container's **4096-fd** cap (infra, un-raisable — confirmed again this fire; Vercel deploys the full pipeline fine). Zero new npm deps (uses the already-present `three@0.182`); no api route; deterministic (no `Math.random`). The two siblings were banked as text, never committed.
- `origin/main` had been force-rebased again since last night — I reset local main to it (remote is authoritative) before building, so nothing was lost.
