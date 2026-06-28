# Morning digest — last updated 2026-06-28 ~02:30 UTC

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday — Cycle 580 (KIDS · DEEP, 2 engine approaches, shipped 1)
- **`1005-kids-singing-slinky` — flick a glowing rainbow slinky in true 3D.** Drag-and-release one end and a bright compression pulse races down the coil, bounces off the far end, and settles into a humming standing wave you can both SEE (coils bunch up and stretch into stationary bands) and HEAR (the spring's own resonant pitch). **Why open this:** it's the lab's first *longitudinal* (compression) wave — every slinky/string we've built before was transverse — and the sound literally IS the physics: the standing-wave modes drive the tone, so the pitch is the spring resonating, not a sample. Tap once to start, no permission, no reading; it flicks itself after ~2s so it's never silent. Best on a phone/iPad.
  - *No wrong notes:* the grab point snaps the fundamental to D pentatonic; harder flick = more motion, never louder/harsher (kids-safe gain → lowpass → compressor).

## Also explored this fire (built complete, banked as an idea — not shipped)
- **`1004-kids-slinky-wave` ⭐ resurrect-first** — the SAME slinky on a genuine **WebGPU `@compute`** mass-spring chain (the scarce GPU surface the jury keeps asking for). Held back only because its GPU path can't be verified in my headless box and falls back to CPU on most phones anyway — so today's ship is the version that's *guaranteed* to look right on your phone. Revive it on a GPU-verifiable cycle.

## Why this shape (DEEP, fresh concept)
- Last two fires were WIDE, so I went DEEP. The hard part was novelty: the lab is 1000+ prototypes deep, so I grep-rejected firefly, chladni, ferrofluid, crystal, plinko, echo (all already done) before landing on longitudinal spring waves (0× in the lab). Today's research dive found this week's audio-AI frontier is *all* neural — zero physical wave synthesis — so a transparent "see-the-wave-that-makes-the-sound" toy is the contrarian, on-mandate move (the praised "sound IS physics" lane: 960/970/995). True-3D render breaks the flat-2D monoculture the jury flagged.

## Open questions for Karel
- **Verification debt (the standing #1 ask):** 1005 is touch-verifiable on a phone in ~1s with no friction — a good dent — but the timbre + physics tuning (k, damping, flick feel) are reasoned, not heard. A 60-second listen on a real device would tell me if the constants need a nudge. The only thing blocking a full in-box build is the container's ~4096 file-descriptor cap (Vercel deploys fine).
- Want me to deepen 1005 next (pull-to-stretch = pitch glides down as the spring lengthens; two-finger pinch for two pulses; add the sideways transverse mode), or revive the 1004 WebGPU slinky on a GPU cycle?
