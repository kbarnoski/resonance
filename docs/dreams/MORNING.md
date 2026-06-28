# Morning digest — last updated 2026-06-28 ~06:10 UTC

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday — Cycle 582 (KIDS · WIDE, 3 explorers, shipped 1)
- **`1008-kids-hand-cloud` — wave your bare hands at the webcam to conduct a glowing, singing cloud of light.** No touching the screen: MediaPipe reads your hands, and a real **WebGPU compute** field of 120,000 particles swirls toward them. Open your palm and the cloud *blooms*; pinch (thumb + index) and the particles gather into a bright **chiming star**. Every voice snaps to a warm pentatonic over a soft drone — nothing is ever wrong. **Why open this:** it's the lab's first *bare-hands-in-the-air* instrument (no touch, no keyboard) AND the kids-lane answer to the jury's loudest ask — rebuild real GPU compute (it had collapsed to ~1 build in 15). Best on a real GPU with a webcam; if either is missing it falls back to a Canvas2D cloud + an auto-demo, so it always moves and sings.
- ⚠️ **Heads-up I want your eyes on:** I could NOT test the camera, WebGPU, or the MediaPipe model download inside my sandbox — so the live hand-tracking and 60fps-at-120k-particles are *reasoned, not measured*. A 30-second try on your phone/laptop (allow the camera) tells me if the hand thresholds + particle counts need a nudge. Worst case it still runs the fallback cloud.

## Also explored this fire (built complete, banked — not shipped)
- **`1009-kids-balloon-breath`** — BLOW and HUM into the mic to fill, float, and tune singing balloons, drawn in crisp **SVG** (the lab's rarest surface). Fully deterministic + testable — it's my strongest *provable, no-GPU* kids piece, queued for the next kids cycle to pay down "unheard" debt.
- **`1010-kids-tide-pool`** — tilt to slosh a glowing **WebGPU shallow-water** pool that rings stones. I caught that it's a near-clone of the *existing* `931-kids-tide-pool` (same name/concept), so I did NOT ship it — banked instead as a GPU-compute *upgrade* for 931.

## Why this shape (WIDE, kids)
- The jury said the adult lane hardened into one formula and asked to "break similarity." Two prior fires were DEEP, so this was **WIDE**: 3 unrelated kids directions (camera, mic, tilt) in one fire. The diversity audit **banned** the over-used pointer/touch input (4×) and raw-WebGL2 output (6×) — so all three picked fresh tags, and I shipped the camera + GPU-compute one (freshest input + the scarce compute surface the jury keeps begging for).

## Open questions for Karel
- The camera/GPU verification gap above is the one real risk — your quick try settles it.
- Next kids cycle: ship the provable **balloon-breath** (SVG, mic, fully testable), or fold 1010's WebGPU compute into 931's tide-pool?
- Next adult cycle (583): the jury's top pick is **deepen `977-echo-room-gpu`** (walk among HRTF recordings of your past selves — the only 5/5, nothing extended it) into a multi-zone spatial *room*. Want me to take that on?
