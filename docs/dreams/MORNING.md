# Morning digest — last updated 2026-06-24 ~22:20 UTC (cycle 530, kids · DEEP)

## New since yesterday
- **[/dream/886-kids-marble-music](https://getresonance.vercel.app/dream/886-kids-marble-music)** — 🎢 **a marble music machine where the SOUND is the MATERIAL.** Tap the top to drop a glowing marble; it falls through a track of wood / glass / metal / drum objects and **each one sings in its own material** — wood thuds, glass rings, metal shimmers, drums boom — and a soft graze sounds different from a hard slam on the same bell. Tilt the device (or two big buttons) to steer. *Why open it:* it's a real **modal synthesizer** (collision timbre from material + impact velocity, not a fixed ping), so the machine plays itself and never repeats — Wintergatan's Marble Machine for a 4-year-old. Works on any device, no permissions, no GPU.
- Kids **DEEP** fire: one concept, **3 parallel approaches**; shipped the most robust. Surface is **Canvas2D** (non-WebGL2 per the jury). This cycle's research → build chain is visible: §530 material-based modal impact sonification → this machine.

## In progress / partial — 2 more explored (IDEAS §530)
- **`885-kids-marble-music-3d`** ⭐ — the **three.js 3D-gravity twin**: tilt to roll marbles around a 3D tray of material objects. Built complete this fire; banked only because Canvas2D was the diversity-stronger surface (the jury asked for non-WebGL2). The 3D version is more immersive on a real iPad — natural resurrect when a GPU surface is scarce.
- **`887-kids-marble-build`** — **build-your-own machine**: drag material blocks onto a board, then drop marbles that play the track you built (Wintergatan "program it" + Toy Theater's March-2026 "Music Marbles"). Builder timed out mid-build; pure seed, rebuildable on 886's engine.

## Research findings worth a look (RESEARCH §530)
- **Material-based modal impact sonification** (Schütz et al., *Material-Based Sonification*, IEEE ISMAR 2025; *Real-Time Non-linear Modal Synthesis*, arXiv 2603.10240, March 2026): a struck object's **material** (density/stiffness) sets the timbre, the **impact** (force/velocity) sets the energy. The lab has used modal synth 5× but always as a fixed voice — never *parameterized by material + driven by live physics*. That's the fresh hook this cycle shipped.

## Open questions for Karel
- **Worth a DEEP next on the 3D twin (`885`)?** A 3D marble tray you physically tilt is the more "wow" version — held back only by the non-WebGL2 diversity ask, which lifts soon.
- The kids template is now broken for good (868/880 + this generative machine). Want the next kids piece to keep leaning generative/self-playing, or return to a clear child-driven goal?
- #5 (dated RESEARCH citation in the prototype's own README) landed a **3rd straight cycle** — keep the criterion, or is it satisfied enough to retire?
