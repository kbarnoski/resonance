# Concept Jury Verdict — 2026-10-08

## Summary
The audio ambition is genuinely good right now and I want to say that first: the source-break lineage (vicinity → cantor → graft → imbue) is four distinct fusion mechanisms in a row — spatial ensemble, voice-resonator, channel vocoder, convolution — and that is a real direction, not a stunt. But the window as a whole is still fifteen honest mediums. **Zero of the last 15 prototypes cleared 4 of 5 ambition-floor criteria; thirteen sit at 2–3.** And the lab has collapsed onto one body: **8 of 15 are full-body-pose input, 14 of 15 are camera input, and three.js is back to 6×.** The lab is climbing in the DSP and flat-lining in form, interaction, and sense-of-occasion. Meta note that overshadows all of it: the four strongest pieces in this window (vicinity/cantor/graft/imbue) are **404 on production** behind a ~2.5-day deploy freeze — we are grading work nobody can see.

## Diversity audit
- Over-represented input: **full-body pose (8×)** — and more damningly, **camera/body is 14 of 15**. The webcam is the lab's monoculture.
- Over-represented output: **three.js (6×)** — the exact rut the 2026-10-07 verdict banned at 7×. Canvas2D (4×) is also over the line.
- Over-represented technique: **"your body conducts a transform of Karel's real take" (≈13–15×)** — the single idea the whole lab is now orbiting.
- Over-represented vibe: **contemplative solo-instrument ambient (≈13×)**; on palette, **warm-earth/amber/ember (≈4×)** plus a jade/green cluster (3×).
- **BANNED for next cycle:** full-body-pose input · camera-as-primary-input · three.js output · Canvas2D output · body-conducts-one-real-take technique · warm-earth/amber palette.

## Ambition floor stats (last 15 prototypes)
Criteria: ① novel-to-lab technique · ② ≥3 subsystems · ③ named reference · ④ multi-cycle commitment · ⑤ research from the last 14 days.
- **Hit 0–1 criteria: 2** — `18512-facescore`, `18544-gaitpulse`. The local-minimum builds: pleasant, body-conducts-one-take, nothing novel/cited/researched.
- **Hit 2–3 criteria: 13** — everything else. This is the problem: the entire window bunches here.
- **Hit 4–5 criteria: 0** — nothing reached the ceiling. The 2026-08 directive to "take one proven first to 4–5/5" has not been honored once in this window.

## Standouts (positive)
- `19520-graft`: the best thing in the window. A real two-take channel vocoder where the modulator provably has **zero path to the speakers** — one recording literally plays *through* another. A new fusion verb, verifiable by reading the graph, and it finally rotated the render off three.js (raw-WebGL2). This is what ambition looks like.
- `18720-sediment`: the lab's first true long-form memory piece — genuinely different at minute 5 than minute 1. It answers the "stateless-instrument" complaint head-on. The one structural idea in the window that isn't an instrument.
- `19360-vicinity`: broke the single-take monoculture *first* (four real takes in an HRTF room) and opened the whole source-break lineage. The embodied-spatial category had been 0×.
- `18960-surgeline`: cleanest research→build chain here (Dyna2Music, arXiv:2610.00726, 2026-09-30 — actually fresh ≤14d at build) and a real earned-over-minutes arc, not a loop.
- `19600-imbue`: the 4th distinct fusion mechanism (navigable convolution IR from a second take) — proof the source-break is a direction, and it correctly rested three.js (Canvas2D).

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- `18624-chordweave`: cycle-3 of `fluxweave → chordfold → chordweave`. Three cycles of the *same* two-hands-harmonize-your-own-take idea, differing only in how clever the voice-leading math is (fixed stack → greedy snap → global solver). The solver is nice engineering, but a refinement of a concept already shipped twice is the "fifteen honest mediums" pattern in its purest form. **Consider this lineage closed — no cycle-4.**
- `18416-chordfold`: the cycle-2 that started that same over-mined vein.
- `18512-facescore`: 1/5 on the floor. Face conducts articulation of one take, drawn as a score. Genuinely likeable, but no novel technique, no named reference, no research, and squarely inside the body-conducts-a-param monoculture. The template for what to stop shipping.
- `18544-gaitpulse`: body-sway → granular re-articulation of one take. Granular re-articulation is already heavily worn, and "pose conducts one recording" is the exact tag we have too much of.

## Provocations for tomorrow's dream cycle
1. **Put the camera down.** Full-body pose is 8/15 and camera is 14/15. The categorical-diversity menu has at least four lanes with 0 recent entries: real-world-data sonification, multi-user/WebRTC, audio-only/embedded, AI-pipeline-chain. Spend the next cycle on one of them with **no webcam at all.**
2. **Cast the particle engine already.** `19104-particle-engine` is a first-class WebGL2 GPGPU engine (up to 1M bodies, FFT-band-per-particle) sitting unused in `src/lib/particles/`. Two prior verdicts and two RESEARCH dives (cymatica, 2026-10-08) have asked for its first embodied agent-cycle use. Build the first journey that casts the *real* particle engine instead of another fragment shader — that is a ready-made path to a 4/5 build.
3. **Four fusion verbs is enough.** vicinity → cantor → graft → imbue was the right arc, but a *fifth* two-take fusion mechanism would just be a new monoculture. Keep the source-break, rotate the **interaction axis** instead (something other than body-conducts-a-fusion-param). `antiphon` is still banked; don't let it become fusion verb #5.
4. **Aim one build at 4/5, on purpose.** Nothing hit the ceiling this window. Stop optimizing for "shippable tonight." Pick an idea that stacks novel-technique + ≥3 subsystems + a named reference + a fresh research hook *by design*, and let it be a DEEP.
5. **Meta (not a build note):** the four best pieces here are 404 on prod behind the audit freeze. A one-command `npm audit fix` unblocks the entire backlog. Until it lands, every cycle is critiquing invisible work — worth weighing against minting a sixth stuck proto.

## Karel-facing line
Audio ambition is real and climbing, but the lab has collapsed onto one body (8/15 full-body-pose, three.js back to 6×), nothing reached 4/5 ambition, and your four best pieces are still 404 behind the frozen deploy — put the camera down tomorrow and cast the particle engine.
