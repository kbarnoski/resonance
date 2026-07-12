# Morning digest — last updated 2026-07-12 ~00:40 UTC (cycle 745, WIDE)

## New since yesterday
- **[1492-pulsar-clock](https://getresonance.vercel.app/dream/1492-pulsar-clock)** — *the night sky as a clock you can hear.* Fifteen **real neutron stars** hang on the celestial sphere at their true sky coordinates (decoded straight from each pulsar's name — PSR B1919+21 → RA 19h19m/Dec +21°), and each **ticks at its real measured rotation period**: the millisecond pulsars fuse into a beating pitched chord, the second-scale ones (Vela, Geminga, Bell Burnell's own B1919+21) fire spatialised woodblock clicks, and the 76-second J0901−4046 tolls once like a cathedral bell — every tick HRTF-placed where its star actually is. **What you see sweeping is what you hear ticking.** Fly with arrow-keys/WASD or tilt your phone; it fully self-plays. *Headphones on — the whole sky is a vast slowly-phasing polyrhythm, every number in it real.*
- **Why open this one:** it's the lab's **first pulsar sonification** (a genuinely new lane) and one of very few pieces built on **real external data**. Three orthogonal ideas were explored in parallel tonight — this shipped for being the biggest, most surprising concept with the tightest see=hear unity, on a three.js scene-graph (off the fragment-shader rut). **2 more explored — see below / IDEAS §745.**

## In progress / partial
- Nothing half-built. Winner is demoable; the two banked pieces have full working code preserved (scratchpad `banked-745/`).

## Also explored tonight (banked, ready to ship)
- **⭐ 1496-escher-fall** — *fall forever into Escher's Circle Limit.* A real Poincaré-disk hyperbolic tessellation you plunge into endlessly (Möbius navigation), married to a descending Shepard tone — Canvas2D, **intense/vertiginous**. TOP pick for the next intense night (it rests the recent calm/cosmic cluster).
- **⭐ 1494-tarab-room** — *find a room's hidden chord with your voice.* **The mic is back:** sing and any sympathetic string tuned to your note (or its harmonics) lights and rings, like a sitar's tarab strings; wake all six and the room blooms. DOM/CSS-3D, warm.

## Research findings worth a look
- **RESEARCH §745** — pulsar-timing sonification is institutionally live (NASA/Chandra "A Universe of Sound"; the 76-s ultra-slow pulsar J0901−4046 vs the 1.5-ms fastest = a millionfold span of real metronomes) yet grep-0× here → became 1492. **Honesty note:** the strict "last-14-days" freshness hunt genuinely came up short this cycle, so tonight's trio rests on ≥3-subsystems + named-reference, not a fresh-paper citation. Logged straight rather than faked.

## Open questions for Karel
- **We keep landing on cosmic-ambient.** 1492 is beautiful but it's another cosmic piece; the banked **1496-escher-fall** (intense) and **1494-tarab-room** (mic, warm) deliberately break that — want me to ship one of those next fire to diversify the vibe?
- **Your real Path piano is still unused.** Banked **1488-the-long-now** (from cycle 744) has a plan to build a cosmos around a real recording — say the word and I'll cash the "use my actual music" ask next.
- **The ≥2-model AI-pipeline chain (audio→image→video) is still 0×** — named by several juries as the last standing demand, gated only on your paid-budget go. Green-light it?

## Note
- Local build hit the usual ~700-route fd-ceiling (`EMFILE`) at page-data collection — infra, not code; full TypeScript + ESLint + compile all passed clean and the route builds via the standing compile-mode gate. Deploys to Vercel fine.
