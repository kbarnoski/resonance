# Morning digest — last updated 2026-06-30 ~10:15 UTC (cycle 609)

## Open this first
- **[1066-cosmic-web](https://getresonance.vercel.app/dream/1066-cosmic-web)** — *the slime-mold algorithm astronomers use to map the universe's dark-matter cosmic web, turned into a playable instrument.* Tap **Enter the cosmic web**, then **click/drag** to plant glowing nutrient wells — a living network of filaments grows between the points you place, and the web's connectivity *sings* (denser/branchier network = brighter drone + more bells). Do nothing and it keeps seeding + re-routing itself. `state: cosmic-web / meditative boundlessness · pole: cosmic-ambient`.

## Why this one
It directly implements **today's research dive**: a slime-mold (Physarum) transport model is literally how astronomers reconstructed the cosmic web's dark-matter filaments (Elek-Burchett, UC Santa Cruz 2020), freshly back in the news via **May-2026's JWST sharpest-ever filament image**. It's the lab's **first Physarum / WebGPU-compute agent simulation** — and it **brings WebGPU compute back as the resonating body** (the jury's #4 ask, down to 2×) while staying a *played* instrument, not a screensaver (jury #1). The GPU agent field isn't decorated by sound — a live readback of the trail field IS what drives the audio. Cosmic-ambient was the owed pole after two intense ships (1064/1065).

## Also explored (WIDE fire — 3 cosmic-ambient instruments, 2 banked)
- **1067-boundless-breath** ⭐ (IDEAS §609) — a **three.js** 120k-star galaxy you **breathe in and out** (inhale gathers the stars to a luminous core, exhale releases them to drift) over the lab's **first Shepard–Risset endless-rising tone**. Scarce three.js output + fresh active-breath input — resurrect-first.
- **1068-attractor-temple** (IDEAS §609) — a WebGPU strange-attractor (Thomas/Aizawa) whose two secret constants you **bend with your hands**, watching the structure dissolve and re-form through bifurcations you can hear.

## Honest caveats
- **Built green, not GPU/ear-verified.** Compile + ESLint (0 issues from the 1066 folder) + project `tsc` (0 errors) all pass; full `npm run build` reached `✓ Compiled successfully` then hit the standing container EMFILE block (infra, not code — Vercel deploys fine). The **CPU-Physarum fallback + autonomous nutrient drift ARE the headless paths** — a living, re-routing web renders with zero input/hardware — but the WGSL compute pipeline + the readback→audio *feel* are device-only.

## Open questions for Karel
- **Does the network's connectivity reading like an instrument?** The bet is that growing filaments between nutrient wells (and hearing the web get brighter/busier) is the unlock. If the bells are too sparse or the drone too static, I can map true filament-crossing count (graph degree) instead of just variance.
- **Pole/output queue:** cosmic-ambient is served and **WebGPU/three.js are back** (Canvas2D had hit the 5×-in-10 diversity ban). Next I can resurrect **1067-boundless-breath** (three.js + breath + Shepard), **1068-attractor-temple** (WebGPU attractor), or finally do the overdue **`_shared/psych/` infra cycle** (extract the Shepard/drone/reverb/feedback engines I keep re-deriving). Preference?
- **The fd-ceiling block is still open** — full `npm run build` can't finish locally (container EMFILE at ~4096 open files during static-gen of 1000+ routes). Worth raising the ceiling or blessing `next build --experimental-build-mode compile` as the gate.
