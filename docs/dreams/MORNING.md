# Morning digest — last updated 2026-06-28 ~04:30 UTC

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday — Cycle 581 (ADULT · DEEP, 2 engine approaches, shipped 1)
- **`1006-modal-anvil` — strike glowing metal plates in a dark forge; the sound IS real physics.** Click/tap a hanging plate and you hear the *literal motion* of a GPU-simulated vibrating plate, read back at a pickup point. A hard strike blooms sharp and bright, then glides DOWN in pitch as it rings — the way real bronze and gongs do — and the metal heats steel-blue → white-hot under the blow. **Why open this:** it's the lab's directest answer to the jury's #1 design ask (rebuild real WebGPU *compute* — it had collapsed to ~1 build in 15) and the literal "close the GPU→audio loop" deepening last cycle's banked anvil promised. No scale, no chords, no keyboard — pure metallic timbre, and the pitch-bloom *emerges* from the physics (no scripted pitch envelope anywhere). Strikes itself on a slow rhythm after ~2s so it's never silent. Best with a real GPU; works everywhere via a fallback (below).

## Also explored this fire (built complete, banked as an idea — not shipped)
- **`1007-modal-anvil-modal` ⭐ resurrect-first** — the SAME forge, but a *deterministic, provable* non-linear modal engine plus a live **Chladni nodal-line** picture, so you literally SEE the standing-wave pattern of the modes you're hearing. I verified its math in numbers (inharmonic 220/445/655/821/880 Hz; a hard centre strike droops the fundamental ~232→226 Hz over 3s). I shipped 1006 instead to break the 4-cycle retreat from GPU compute — but 1007 is the better *verification-debt* answer and is queued to ship next adult cycle.

## Why this shape (DEEP, resurrect)
- The jury's loudest standing complaint: "WebGPU compute collapsed 6×→1×; 14 of 15 builds render flat 2D — force a real GPU-compute path; make the sim the instrument's resonating *body*." The lab kept *banking* the GPU-compute swing and shipping the safe twin (4 cycles running). This fire I shipped the GPU one. My research dive (2nd cycle confirming it) found this week's audio-AI frontier is **entirely neural** — zero physical-wave synthesis — so a transparent GPU-physics plate is the contrarian, on-mandate build (the praised "sound IS physics" lane: 960/970).

## Open questions for Karel
- **Honest trade:** 1006 *adds* to verification debt — I can't run a GPU or hear audio in my box, so loudness, the exact amount of pitch-bloom, decay times, and whether 4 plates hold 60fps are reasoned, not measured. The no-WebGPU fallback is a *real* per-sample physics plate (not a fake), so it sounds like real metal regardless — but a 60-second listen on your laptop would tell me if the constants need a nudge.
- Next adult cycle: ship the provable 1007 (Chladni viz), or deepen 1006 (tune on a real device, add a sustained "bow" strike, fuse 1007's nodal lines onto the GPU plate)?
