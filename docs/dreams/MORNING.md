# Morning digest — last updated 2026-07-01 (~20:20 UTC, cycle 626)

> **The one thing this fire did:** it broke the screen. After two straight GPU-field-sim
> fires (Lenia, cosmic-connectome), this WIDE fire ran three explorers on three DIFFERENT
> outputs — audio-first/SVG · raw-WebGL2 · WebGPU-compute — and **shipped the one whose
> output the lab has used least**: an eyes-closed, headphone NDE "tunnel-to-light" with
> almost no screen. You **descend by slowing your own tapped pulse**, and a luminous tone
> blooms only when you go still. It's the directest answer yet to your "too similar in
> design and theme."

## Open this first
- **[1090-threshold-descent](https://getresonance.vercel.app/dream/1090-threshold-descent)** — *what if Resonance could take you through a near-death dissolution with your eyes closed?* Put on headphones, press Begin. A dark spatial void opens — eight just-intonation voices ring around your head (HRTF), a Risset/Shepard glissando falls forever, a cavernous reverb. The only visual is six austere SVG rings contracting toward a point (no strobe — deliberately minimal so the *sound* is the piece). You don't touch a control to go deeper — you **tap a pulse and then slow it down**. Fast taps hold you at the surface; as you slow, and finally go still, you sink. The reward for letting go is the **"light"**: a warm difference-tone (a phantom fundamental) that turns on ONLY when you reach stillness. If you never tap, it auto-descends and holds at the light within ~2s. `state: NDE tunnel-to-light / ketamine dissolution · pole: cosmic-ambient → luminous-intense`.

## Why this one, and why now
Three things pointed the same way. (1) Your **"too similar"** note — the recent window is dominated by GPU visual field-sims; an audio-first, no-screen piece is the biggest *felt* break from it. (2) The 2026-07-01 jury has wanted an **audio-first/SVG** ship since 1073 (its only prior one) and lists it as "actively wanted"; jury #1 begged the render target to "actually CHANGE, not slide sideways." (3) The jury's #2 discipline — **grep the substrate before claiming a lab-first** — did real work this fire: it caught that the two flashier siblings weren't the lab-firsts they looked like (a true 4D polytope already ships twice; a WebGPU fluid already ships), so shipping either would have repeated the "built the solar-wind aurora twice" mistake. Audio-first won on honest diversity, not on being the flashiest.

## Also explored + banked this fire (WIDE — 3 outputs, 2 banked ⭐ IDEAS §626)
- **1092-liquid-melt** ⭐ (top resurrect) — *your voice melts the world into fluid.* A genuine **Jos Stam Navier–Stokes** solver on **both** WebGPU-compute and a true CPU/Canvas2D fallback, with a closed **mic→fluid→audio** loop (your sound injects dye+force; the fluid's motion drives the drone back). The strongest engineering of the fire — banked only because shipping it would be the **4th WebGPU-compute piece in the window / 3rd in a row**, the exact monoculture the jury warns of. Resurrect once WebGPU has cooled a fire or two.
- **1091-fourth-turn** ⭐ — *hear a rotation you cannot see.* A real 4D polytope (verified edge counts) tumbling through six planes in **raw WebGL2**; the three "impossible" W-planes barely move the picture but each drives its own audible voice, so you HEAR the fourth dimension turn. Banked because the 4D-polytope substrate already ships twice (1042, 1051) — its genuine novelty is the plane→voice *sonification*, worth resurrecting as an honest cycle-N with the stereographic curved-edge view added.

## Honest caveats
- **Built green (for shipping).** Authoritative winner-only `npm run build` → compile + ESLint + full-project type-check all PASS (reached `Collecting page data`; build-log grep of the slug in errors = **0**; scoped `eslint` on the folder = exit 0). Only the standing container **static-gen infra failure** (`EMFILE` on the font manifest — the ~4096 fd-ceiling, every cycle since ~472) stops a full green. Vercel-safe.
- **Verification honesty — and this one's the hard case:** audio-first is the *hardest* category to verify headless. The scripted auto-descent + non-strobing SVG + always-on audio graph are code-verified and the build is clean, but the actual **spatial-audio feel** (the HRTF ring, whether the difference-tone "light" reads as a reward) is **ear-only** — I couldn't hear it in the box. The jury explicitly accepts this tradeoff to finally get the audio-first category shipped, but it means this one genuinely needs your ears.

## Open questions for Karel
- **Put on headphones and go still.** Does the descent-by-slowing mechanic *feel* like sinking, and does the "light" arriving at stillness feel earned (or too subtle / too abrupt)? That's the one dial I'd tune next and can't tune without your ears.
- **Was shipping the quiet one the right call?** I had two flashier GPU pieces built and passing — I chose the audio-first one specifically to break the sameness you flagged. If you'd rather I ship the boldest-looking thing each fire even when it repeats a technique, tell me and I'll reweight.
- **Still open (needs you):** raise the container's ~4096 fd-ceiling (or bless `next build --experimental-build-mode compile`) so the full build finishes locally and GPU/audio pieces finally get hardware-verified — the standing #1 verification debt, now 7+ juries running.
