# Concept Jury Verdict — 2026-07-24

## Summary
The lab did the hard thing: it took last week's verdict and actually turned the
ship. The altered-states monoculture is **gone** — only 2 of the last 15
(`2360-blind-spot`, `2388-round`) are still "about consciousness." The other 13
are games, physics toys, clinical tools, and real-world-data sonifications,
exactly the outward-facing lane the 07-23 jury said was strongest. Ambition
held while the form diversified: zero local-minimum builds this window, eight at
4–5/5. `2502-duel` (a real adversarial AI you can lose to) and `2402-sandfall`
(the lab's first true GPU compute sim) are the peaks and both close named gaps
the last jury named explicitly. **But** — every ship needs a new critic, and the
new rut is audible, not thematic: **half the window snaps its audio to a
just-intonation / pentatonic lattice so it literally cannot sound bad.** The
JI-safety-net is the new no-master-knob. Nothing here risks a single ugly
second, and a lab where nothing can sound wrong is a lab where nothing can
surprise you with how it sounds.

## Diversity audit
- Over-represented input: **pointer / drag / click / slider** (7×: 2360, 2396, 2402, 2422, 2428, 2482, 2502) — the physical control differs but it's still "poke a screen"
- Over-represented output: **Canvas2D** (7×: 2392, 2396, 2410, 2422, 2428, 2474, 2494) — WebGPU (2402, 2450) and SVG (2360, 2466, 2502) are the healthy minority
- Over-represented technique: **just-intonation / pentatonic consonant-lattice audio engine** (7×: 2360 additive, 2428, 2450, 2466, 2474, 2482, 2494) — the sound layer converged even as the visual/conceptual layer diversified. Runner-up: **physics / particle simulation as core content** (4×: 2402 sandfall, 2422 chladni, 2450 flock, 2482 collide)
- Over-represented vibe: **"here is a physical/mathematical system — measure it or play it" clinical-instrument** (7×: 2392, 2396, 2402, 2422, 2428, 2450, 2482) — with **outward-facing real-world data** the strong rising second (4×: 2366, 2466, 2474, 2494)
- **BANNED for next cycle:** Canvas2D-primary output · pointer/drag/click/slider-only input · **the just-intonation/pentatonic safety-net audio — force a sound engine that CAN sound bad** (real dissonance, microtonality, noise, or rhythm-first-not-pitch-first) · physics-particle-sim as the content · the "measure/play a physical system" clinical-tool framing. If the piece "snaps to a consonant lattice so random events always sound nice," reject it.

## Ambition floor stats (last 15 prototypes)
Criteria: (1) novel technique · (2) ≥3 subsystems · (3) named reference · (4) multi-cycle · (5) research <14d.
- **Hit 0–1 criteria — the local-minimum builds:** **0.** For the first time in the record there are none. The floor mandate is fully internalised.
- **Hit 2–3 criteria:** 7 — `2392-room-tone`, `2396-ear-dial`, `2422-chladni`, `2428-comma`, `2450-flock`, `2482-collide`, `2494-signal`
- **Hit 4–5 criteria — the ones to extend:** 8 — `2360-blind-spot` (4), `2366-solar-wind` (4), `2388-round` (**5/5**), `2402-sandfall` (4), `2410-facesong` (4), `2466-horizon` (4), `2474-worldwire` (4), `2502-duel` (4)

The distribution moved up and to the right versus 07-23 (then: 2 at 0–1, 8 at
2–3, 5 at 4–5). The problem is no longer ambition *or* thematic monoculture —
it's a convergent **audio** aesthetic (everything consonant, everything pretty)
riding underneath genuinely diverse concepts.

## Standouts (positive)
- `2502-duel` — Counterpoint Duel: the lab's **first real adversarial AI** (3-ply negamax, Shannon 1950) and first game with an actual winner, scored live by Fux's 1725 rules. It cashed jury provocation #1 ("build a game") to the letter, and the technique — an opponent that *thinks ahead* — generalises far past counterpoint. This is the seam to extend.
- `2402-sandfall`: the lab's **first true WebGPU compute shader** — 40k-grain PBD granular sim, audio derived from the sim's own GPU-reduced stats. The 07-23 jury called WebGPU compute "the sharpest single technical gap left"; this closed it, for real, one week later.
- `2410-facesong`: **first real MediaPipe FaceLandmarker** driven by the 52 blendshapes — the exact "use real face/hand tracking, not bare frame-difference centroid" the last jury demanded. A genuine expressive-face vocal instrument.
- `2388-round`: still the only 5/5 — long-form, stateful, *accumulating* (body-as-looper, Reich phasing across your own past selves). Different at minute five than minute one. The rarest lane, still held by one piece.
- `2494-signal` / `2366-solar-wind`: real-world-data sonification done with taste — DSN links across the solar system, and the live Sun–Earth field. Music genuinely *about something*. The lane to keep feeding.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- `2428-comma`: a beautiful explanation of the Pythagorean comma — but it is the purest specimen of the new template: Canvas2D + drag-a-slider + additive audio engineered to beat "correctly." It teaches; it never risks. Ambition 3, no research chain, no multi-cycle plan. Lovely, and exactly the build the *next* mandate exists to prevent.
- `2450-flock`: the lesser of two WebGPU-compute-sim twins in one window. `2402-sandfall` did the compute-shader-first thing with a fresher named reference and a playable material; flock is boids (well-trodden since 1987) → order-parameter → the same JI chord everything else lands on. Good engineering, redundant concept.
- `2422-chladni` (with `2428`): two "here's a resonance/tuning system, watch the pretty Canvas2D figure while a consonant tone plays" pieces back to back. Each is fine alone; together they mark the clinical-physics-tool groove hardening.

## Provocations for tomorrow's dream cycle
1. **Kill the just-intonation safety net.** 7 of 15 snap audio to a just/pentatonic lattice so random events *always* sound nice — the new no-master-knob. Ban it for a week. Build a sound engine that can genuinely sound bad: real dissonance under the composer's control, a microtonal/non-octave tuning (Bohlen–Pierce, 19-TET), a **noise/spectral/granular** voice with no pitch lattice at all, or a **rhythm-first** engine where groove — not consonance — is the substrate. Let one piece be allowed to sound dangerous.
2. **Ban Canvas2D + physics-toys.** Canvas2D is primary in 7 of 15 and physics-particle-sim is the content in 4 (sandfall/chladni/flock/collide). Next build: not a physical-system-you-measure. SVG, WebGPU-render, or audio-only. A joke, a story, a piece with a human on the other end — not another beautiful demo of a differential equation.
3. **AI-pipeline chains remain at ZERO — now 3+ weeks overdue.** Two live-data pieces shipped (worldwire, signal) but still no model→model→model chain. music→image→video, or lyric→cover-art→looping-animation (fal.ai / replicate, both untouched). This is the single most novel unbuilt thing, and it needs **Karel's explicit FAL_KEY-budget go-ahead** before the agent spends his image budget autonomously — flag it and ask, don't start silently.
4. **True cross-machine multi-user is still unbuilt.** `2418-two-rooms` (WebRTC duet) has been banked for weeks; `2326-we-breathe` was only same-machine tabs. Two people, two devices, one shared field. Needs a QR-SDP handshake helper to self-demo. Biggest unbuilt gap on the menu.
5. **Extend `2502-duel` — but generalise the technique, don't just add rules.** Second/third-species counterpoint deepens it; the bigger prize is that *an AI that plays adversarially against your musical line* is a whole genre. An improv trading-fours partner that actually plans, a call-and-response that sets traps. The negamax-as-musician idea is worth three prototypes, not one.

## Karel-facing line
The altered-states rut is dead — the lab broke wide into games, tools and real-world data (2502-duel is a real AI you can lose to; 2402-sandfall is a real GPU sim) — but the new crutch is snapping every sound to a just-intonation lattice so nothing ever risks sounding bad; tomorrow, let something sound dangerous.
