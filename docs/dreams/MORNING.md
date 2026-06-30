# Morning digest — last updated 2026-06-30 ~14:15 UTC (cycle 611)

> **Yesterday's jury (2026-06-30)** asked for three things at once: **#1 pay the ~7-cycle-overdue `_shared/psych/` infra debt**, **#2 go embodied/spatial + three.js (the sameness migrated to pointer-on-Canvas2D, 8×/15 each)**, **#3 ship an intense piece that isn't a membrane or a bloom (cosmic-ambient was 6×/15).** This fire answers all three in one move. See `docs/dreams/JURY.md`.

## Open this first
- **[1068-entity-lattice](https://getresonance.vercel.app/dream/1068-entity-lattice)** — *your body becomes the hyperspace.* Tap **Start · allow camera**, then **move** — your whole tracked body is multiplied into a luminous ~200k-point lattice of recursive kaleidoscopic copies of *you*, tiled across "more directions than there should be," and the more you move / raise / spread your arms, the faster an endless **rising** Shepard–Risset glissando climbs toward breakthrough. No camera? It runs a synthetic **demo body** so it moves + sounds anyway. Headphones help. `state: DMT hyperspace / entity-lattice · pole: intense`.

## Why this one
It clears the whole jury list in a single fire:
- **#2 embodied + three.js** — full-body MediaPipe camera-pose (zero pointer), a three.js GPU point-field (zero Canvas2D). The window had **0× embodied**; this is it.
- **#3 intense, not a membrane, not a bloom** — a DMT-breakthrough lattice you inhabit, not a calm drift or a center-out bloom.
- Grounded in **today's research**: the embodied-installation frontier ("Waves of Connection," Osaka Expo 2025 — three.js+WebGPU, ~1M particles, Kinect body tracking) fused with DMT-breakthrough phenomenology ("experiencing more directions in space than there should be" + accelerating geometry + an ascending sound, which is literally a Shepard ascent).
- **Love-signal tailwind**: your loved cluster is luminous particle fields (130-tsl-particle-compute, 262-aurora-particle, 321-spectral-flight, 243/267-spectral) — a 200k-point lattice of selves sits right there.

## Infra debt — paid (the jury's #1)
- Extracted the audio engines that were re-derived by hand nearly every recent cycle into **`_shared/psych/`**: `shepard.ts` + `droneBank.ts` + `convolutionVoid.ts` (joining the existing `logpolar.ts` + `safeFlicker.ts`). 1068 is their first consumer, so the refactor isn't invisible — it's load-bearing on today's ship. Only `feedback.ts` (ping-pong FBO) is left to extract.

## Also explored (DEEP — 2 three.js substrates, 1 banked)
- **1069-entity-swarm** (IDEAS §611) — the same body-multiplied concept as a swarm of ~7,500 **spinning geometric beings** (`THREE.InstancedMesh` octahedra) instead of a dust-field. Discrete polyhedra read more literally as "entities," but it's CPU-bound at ~7,500 where the point-field is GPU-scalable; banked to resurrect on the GPU with flocking *between* the copies (true entity-contact).

## Honest caveats
- **Built green, not camera/GPU/ear-verified.** `✓ Compiled successfully` + ESLint (0 issues from 1068 or `_shared/psych`) + project `tsc` (exit 0) all pass; full `npm run build` hit only the standing container EMFILE block (infra, not code — Vercel deploys fine). The 3 extracted audio engines are verifiable by reading (pure Web Audio). The **demo-body fallback IS the headless path** (lives + sounds with no camera). Unverified on a device: the pose→drive ranging and the *felt* intensity ramp with a real camera + sound.

## Open questions for Karel
- **Does the body→lattice→ascent coupling land?** The bet: moving visibly densifies the lattice *and* speeds the upward glide. If it feels weak with your camera, I can add depth-aware z (lean in/out scales the lattice) and per-joint velocity colouring.
- **Honor a cycle-2 next?** The jury's #4 (multi-cycle commitment, claimed 6× / cashed 0×) is the obvious next move — deepen 1068 (entity gaze, breakthrough-threshold mandala, two-body lattices) instead of starting another skeleton. Want that, or a fresh embodied direction?
- **Still open:** the fd-ceiling block (full `npm run build` can't finish locally — raise the ~4096 ceiling or bless `next build --experimental-build-mode compile`); and multi-user/WebRTC + real-world-data sonification + score-following are all still 0× in the window.
