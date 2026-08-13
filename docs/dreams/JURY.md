# Concept Jury Verdict — 2026-08-13

## Summary
This is the strongest fortnight the lab has posted in a while, and the reason is
narrow and real: **the build step finally stopped bunting.** The physics-sim
monoculture the last two juries flogged is *gone* (zero PDE/CA/mass-spring/
mechanism sims in 15), warm-molten is gone, and in their place the lab shipped
**seven genuine grep-0 or near-first techniques** — an embodied body→HRTF
spatial-audio room (the single lever prior juries named most and the build kept
declining), a Factor Oracle machine-improviser, an Echo-State reservoir net, a
Kohonen SOM, Sacred-Harp shape-note, MQ partial-tracking, live-Wikipedia
sonification. That is the climb. The catch is that the lab cured one monoculture
by growing its mirror image: **Canvas2D (6×) + SVG-DOM (5×) + pointer/keyboard
desk-input (6×) + violet-on-black (7×)** is the new rut, live sensors nearly
vanished, and only two of fifteen cleared 4/5. The verdict keeps rotating and
the lab keeps treating the ban list as a swap-table.

## Diversity audit
- **Over-represented input:** **pointer/keyboard desk-input (6×)** — testfield,
  thresholdway, fasola, choruskeeper, echofold, craquelure — plus audio-file (3×)
  and none/self-driving (2×) = **11 of 15 are non-sensor, sit-at-a-desk inputs.**
  Only inkmirror + orbitroom (camera, 2×) read a live body. The 08-12 jury banned
  mic/tilt for over-use; the lab overcorrected and the *sensors themselves* nearly
  disappeared. mic, tilt, MIDI, camera are all rested now — that's a vacuum, not a
  win.
- **Over-represented output:** **Canvas2D (6×)** — orbitroom, choruskeeper,
  partialharp, oraclequartet, datamatics, dropforge — and **SVG-DOM (5×)** —
  thrumline, testfield, fasola, echofold, craquelure. The 08-12 jury declared
  Canvas2D "dead as a primary (win)"; it is now the single most-used output in the
  fresh 15. WebGL2-fragment-quad correctly dropped to 1× (inkmirror, pre-verdict),
  but exactly ONE piece (cortexbloom, three.js height-field) touches real GPU 3-D,
  and **WebGPU-compute is 0× shipped** (spectral-sculpt was banked, not committed).
- **Over-represented technique:** **nothing hits ≥4 — a genuine win.** The physics-
  sim family is at **zero.** The emerging house move is healthier: *port a named
  CS/ML algorithm and make its live state the instrument* — ESN, SOM, Factor
  Oracle, motif-development, MQ-tracking = **5× "model-as-instrument."** Unlike the
  old physics sims (criterion #2 for free), most of these are honest grep-0 #1s, so
  this is not a rut to ban — but it *is* the pattern to watch before it calcifies
  the way sims did.
- **Over-represented vibe:** **violet/brand-on-black (7×)** — thrumline, lumia,
  partialharp, echofold, craquelure, cortexbloom, dropforge all live in the violet
  ramp + one secondary. This is the lab's comfort palette, the resting state it
  snaps back to. Credit where due: the prior wishlist mostly got filled — jazz (2×),
  Ikeda 1-bit (2×), EDM (dropforge), verdant-bioluminescent (cortexbloom). The one
  register still at zero is **playful** (kids is paused per AGENT.md, so that's
  expected, not a miss).
- **BANNED for next cycle:** Canvas2D output · SVG-DOM output · pointer/keyboard
  desk-input · violet-on-black palette. Do not combine any of these. Also **rest
  jazz and Ikeda-1-bit** — each shipped twice this window; a register the lab just
  opened is not a register to camp on.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0.** As before, every build is competent and degrades
  gracefully. No throwaways.
- **Hit 2–3 criteria: 13.** Six at exactly **2/5** — inkmirror, testfield,
  thresholdway, craquelure, dropforge, datamatics (cleared the floor on #2
  subsystems + #3 a named ref). Seven at **3/5** — thrumline, lumia, fasola,
  orbitroom, choruskeeper, partialharp, oraclequartet. The middle shifted **up**
  vs the 08-12 window (which had nine at exactly 2/5): most of these 3/5s carry an
  **honest criterion #1** — a genuine novel technique — where the prior window's
  #1 was, in the last jury's words, "essentially one piece."
- **Hit 4–5 criteria: 2** — **`10984-echofold`** (real reservoir net + Jaeger 2001
  + a *2026* arXiv frontier hook + long-form drift) and **`11048-cortexbloom`**
  (grep-0 Kohonen SOM + three.js terrain + recent-research anchor). Zero hit 5/5.
  **The ceiling is the problem now, not the floor.** Seven firsts is broad, but
  they're mostly single-cycle "port an algorithm, sonify it, canvas-viz it" 3/5
  builds. The ambition is *distributed*, not *concentrated* — nothing this window
  is "massively bigger," it's fifteen honest medium builds.

## Standouts (positive)
- **`10808-orbitroom`** — the headline. It claimed the **exact grep-0 lever the
  last three juries named most** and the build kept declining: an embodied
  body-position → HRTF binaural room, camera-driven, model-free silhouette
  centroid, the pan *drawn* on a top-down map so you see the spatialisation a phone
  speaker can't render. The build step finally took the lever instead of bunting a
  safe sim. This is what "make the next claim a real #1" looks like. 3/5, and the
  right 3.
- **`10984-echofold`** — the most *complete* build in the window: a genuine
  Echo-State Network (state ∈ R²²⁰, unit-spectral-radius recurrent matrix, fixed
  untrained readouts firing on threshold-crossings), long-form drift that never
  returns, and it chained **today's research to today's build** (arXiv:2605.26848,
  the three sliders = the paper's three control axes). A real first + recent
  research + long-form in one honest piece. 4/5, and honestly under-claimed at 3.
- **`11048-cortexbloom`** — fresh on **three axes at once**: grep-0 Kohonen SOM
  (technique), real three.js height-field terrain where the vertices *are* the
  neurons (not the banned shader-on-a-quad), in the verdant teal/violet
  bioluminescent palette the 08-12 jury explicitly asked for. 4/5. This is the
  template for dodging the bans without inflating the score.
- **`11176-oraclequartet`** — a faithful Factor Oracle / OMax machine-improviser,
  grep-verified 0 across 7500+ prototypes, a **living** machine-improv technique
  (Assayag & Dubnov 2004) ported — not a dead-inventor name-drop. Directly answered
  the 08-12 provocation #2.
- **`10760-fasola`** (honorable mention) — grep-0 Sacred Harp shape-note; ports a
  **living oral tradition** exactly as criterion #3 intends, in a folk/sacred
  register the lab had never touched. The most genuinely *surprising* register of
  the fifteen.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **`11240-datamatics`** — the 1119 WIDE *winner*, and the weakest ship-decision in
  the window. It is honestly 2/5 (it says so itself), and it is the **second** Ikeda
  1-bit black/white/red datamatics piece in this very fifteen — `10664-testfield`
  (cycle 1108) got there eleven cycles earlier — yet MORNING.md billed it as "the
  lab's first piece in Ikeda's black-white-red datamatics register." The register
  was already taken. A duplicate shipped as a novelty.
- **`10664-testfield`** — the *other* Ikeda 1-bit; drag-a-scan-head-over-a-dithered-
  field. Competent, but 2/5 (dithering isn't novel) and it opened the door to the
  datamatics duplication. Two 1-bit datamatics pieces is one too many.
- **`11128-dropforge`** — EDM build-and-drop is a real Karel directive (journey-arc
  #4) and the electric-magenta palette is genuinely fresh, so the *idea* earns its
  place — but the build sits at the 2/5 floor: a state machine + look-ahead
  scheduler + sidechain synth + modest viz, no named reference, no first. The
  concept is bigger than the execution.
- **`11000-craquelure`** — a lovely Tarbell-Substrate crazing that *cleverly dodged*
  the physics-sim ban (line-agents, explicitly "not a PDE/CA/mass-spring/mechanism"),
  but landed at 2/5 on the most over-used substrate+palette pair in the window
  (SVG-DOM + violet/frost). Local minimum on both axes the audit flags.

## Provocations for tomorrow's dream cycle
1. **Canvas2D is NOT dead — stop the swap-table.** The 08-12 jury killed the WebGL2
   quad and the lab replaced it with Canvas2D (6×) + SVG-DOM (5×). One monoculture
   for another. Next cycle: rest *both* Canvas2D and SVG-DOM and **ship the banked
   WebGPU spectral-sculpt** (or another three.js-geometry piece). WebGPU-compute is
   0× shipped and the one three.js piece (cortexbloom) was a standout — the GPU lane
   is rested and outperforming.
2. **Reclaim a live sensor.** Sensors went from "over-used" (08-12) to *near-extinct*
   (11 of 15 are desk-input). Only 2 pieces read a live body. mic, tilt, MIDI, and
   camera are all rested — build the next piece around one of them. The pendulum
   swung from "too many sensors" straight to "too many desks"; land it in the middle.
3. **Concentrate the ambition — take one first multi-cycle to 5/5.** Seven grep-0
   firsts shipped, but only two reached 4/5 and **none reached 5/5.** The breadth is
   banked; now go deep. Spend a DEEP cycle deepening a *proven* first — orbitroom's
   HRTF room wants per-source distance reverb (its own next-cycle note); echofold
   wants trained readouts for exact transposition. Stop shipping fifteen honest
   mediums; ship one genuinely massive.
4. **Don't let the newly-opened registers become the next ruts.** Jazz (choruskeeper
   + oraclequartet) and Ikeda 1-bit (testfield + datamatics) each shipped **twice**
   this window. They were absent registers the jury asked for — good — but a register
   opened twice in fifteen cycles is a register at risk. Rest jazz and Ikeda for a
   week.
5. **Grep the "first" before you bill it as one — in MORNING too.** datamatics
   shipped billed as "the lab's first Ikeda black-white-red datamatics" when testfield
   had done exactly that eleven cycles earlier. The STATE-side grep discipline is
   excellent (Factor Oracle verified across 7500+). Hold the phone digest to the same
   bar: a "first" claim Karel reads at 06:30 should survive the same grep the STATE
   claim did.

## Karel-facing line
The lab genuinely climbed — physics-sims dead, molten gone, and it shipped seven real grep-0 firsts (embodied spatial-audio room, Factor Oracle, reservoir net, Kohonen SOM, Sacred Harp) instead of bunting — but it cured one monoculture by growing its mirror image: Canvas2D/SVG + desk-input + violet-on-black is the new rut, live sensors nearly vanished, and only two of fifteen cleared 4/5; reclaim a sensor, ship the banked WebGPU piece, and take one first multi-cycle to 5/5.
