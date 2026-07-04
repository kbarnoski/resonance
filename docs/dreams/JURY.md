# Concept Jury Verdict — 2026-07-04

## Summary
The lab has never been more technically accomplished and never more monotonous.
Fourteen of the last fifteen prototypes clear the ambition floor — real marching
cubes, a real Lennard-Jones gas, a real superfluid, a real hydrogen wavefunction —
and yet ten of them are the *same* near-dark cosmic-ambient glow and eight of them
are the *same* drag-to-stir interaction. The 2026-05-31 mandate did its job: we
climbed out of pentatonic-melody-plus-canvas. We climbed straight into a new,
higher-budget local minimum — **"a genuine physics/math simulation rendered as a
transporting dark 3D instrument you drag."** Same trap, better production values.

## Diversity audit
- **Over-represented input:** touch / drag / gesture — **8×** (1129, 1130, 1133, 1135, 1142, 1145, 1153, 1158). Camera / body-tracking / MIDI / tilt: **0×**.
- **Over-represented output:** three.js 3D — **5×** (1133, 1142, 1153, 1155, 1158); Canvas2D **4×** (1126, 1129, 1130, 1135). GPU-rendered field (three.js + raw-WebGL2) combined ≈ **8×**. Audio-first: **1×**.
- **Over-represented technique (meta-family):** genuine-physics/math-simulation-as-instrument — **7×** (1136 theta-gamma, 1142 quantum, 1145 Ising, 1148 volumetric, 1153 superfluid, 1155 molecular-dynamics, 1158 gyroid). Individually the algorithms are all distinct and lab-first — that is the lab's real strength — but the *form* has ossified.
- **Over-represented vibe:** near-dark cosmic-ambient / psychedelic glow — **10×** (1133, 1135, 1136, 1140, 1142, 1145, 1148, 1152, 1153, 1158). This is the headline.
- **BANNED for next cycle:** touch/drag input · three.js-or-WebGL 3D-field output · physics/math-sim-as-instrument technique · near-dark cosmic-ambient/psychedelic vibe. Any build combining these four is a re-skin and must be rejected at the Decide step.

## Ambition floor stats (last 15 prototypes)
- **Hit 0-1 criteria: 1** — 1129 kinetic-dancer (Johansson point-light is a textbook 1970s demo; carries a named ref and little else).
- **Hit 2-3 criteria: 10** — 1125, 1126, 1130, 1133, 1135, 1136, 1142, 1145, 1148, 1152.
- **Hit 4-5 criteria: 4** — 1140 ember-replay (5 subsystems + refs + fresh research), 1153 vortex-filaments, 1155 crucible, 1158 gyroid-cathedral. **These are the ones to extend.**

Read the distribution honestly: the floor is no longer the problem. 14/15 clear it. The floor became a plateau — you can satisfy "novel technique + named reference + recent research" and *still* ship the tenth interchangeable dark-glow simulation. The mandate needs a second axis: not just "is it ambitious?" but "does it look, sound, and feel like anything else we've shipped this fortnight?"

## Standouts (positive)
- **1158-gyroid-cathedral**: marching cubes implemented from scratch (full 256-case tables, no addons) tiled into a genuinely infinite, seamless flythrough. The most transporting piece in the window and the math is execution-verified correct. This is the ceiling.
- **1155-crucible**: the one piece that breaks the palette — crystal-cyan→plasma-magenta, not near-black — *and* honors the overdue "use Karel's real piano" mandate by making his recording the literal heat driving a real molecular-dynamics phase transition. Cross-modal, bright, grounded. More of this.
- **1153-vortex-filaments**: fresh-research → build chain visible and clean (arXiv Kelvin-wave law → reconnection bell envelope). A true lab-first domain.
- **1125-verbal-oracle**: the *only* audio-first piece in fifteen. Whatever its polish, it alone fought the screen bias. Praise it for existing and note how alone it is.

## Pruning candidates (concept-level, NOT for deletion — immutability rule holds)
- **1148-light-accretion** & **1152-anechoic-veil** & **1133-resonant-bowl**: the three most generic dark-cosmic-glow contemplative pieces. A "cathedral of light tunnel," a "violet-indigo mandala that blooms in silence," and "singing-bowl light-shells" are beautiful and nearly interchangeable with a dozen priors. Technically fine; conceptually the center of the local minimum. What's missing: a reason this one couldn't have been any of the other nine.
- **1126-enigma-drift** & **1129-kinetic-dancer**: elegant but passive textbook perceptual illusions. Low lab-first ambition; they lean on the named reference and little novel machinery. Fine palette-cleansers, not directions to pursue.

## Provocations for tomorrow's dream cycle
1. **Ban the near-black glow for a week.** It is 10 of the last 15. Next cycle must ship a *bright, daylit, high-key* palette — 1155-crucible proved the lab can do it and still be serious. If it's dark and cosmic, reject it.
2. **Stop simulating physics as a 3D field you drag.** The physics-sim-as-instrument form is 7×. The algorithms are wonderful; the wrapper is exhausted. If tomorrow's idea is "genuine [physics thing] rendered in three.js, drag to stir" — it is banned. Change the output surface or the input entirely.
3. **We have zero embodied prototypes in fifteen cycles.** Camera, body-tracking, depth-camera, MIDI, tilt: all 0×; touch is 8×. Spend a cycle on MediaPipe pose or a depth-camera spatial-audio room — the mandate's "spatial/installation" and "cross-modal translation" menus have not appeared. Gait → tempo, body → harmony, presence → drone.
4. **The screen bias is near-total: one audio-first piece in fifteen.** Build another embedded/audio-only or voice-only experiment. Test the screen bias the mandate explicitly flagged.
5. **Build about something other than physics.** The "real-world data sonification," "AI pipeline chains," and "multi-user/WebRTC" menu categories are all 0× in this window. Sonify external data — weather, transit, satellite passes, language trends — so the piece is *about* the world, not about a Hamiltonian. (And note: Karel's own MORNING open-question #3 has the WebRTC multi-user ask sitting cold, blocked only on a signaling-store decision.)

## Karel-facing line
The lab has never built sharper instruments — but the last fifteen are one dark-cosmic physics sim wearing fifteen costumes, so today I'm banning the near-black glow and the drag-to-stir field until something bright, embodied, or about the real world shows up.
