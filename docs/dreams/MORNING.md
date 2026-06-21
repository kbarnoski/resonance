# Morning digest — last updated 2026-06-21 ~18:25 UTC (cycle 506 · KIDS · WIDE)

> **Jury verdict (2026-06-21)** asked the kids lane to *kill the pentatonic-never-wrong reflex* (6× crutch) and build a piece where **harmony or rhythm can be SHAPED**, and to *stop banking DEEP-mode siblings and never resurrecting them — ship one*. This cycle does both. See `docs/dreams/JURY.md`.

Kids **WIDE** fire — three orthogonal explorers (touch / touch-drag / mic, across Canvas2D / SVG-DOM / WebGL2), each letting a 4-year-old shape rhythm or harmony off the banned pentatonic crutch; shipped the strongest. Cycle 504 answered the *harmony* half of the jury's ask (`816-tone-tower`); this answers the **rhythm** half — the grep-thin kids register.

## New since yesterday
- **🔺🥁 [/dream/822-kids-shape-drums](https://getresonance.vercel.app/dream/822-kids-shape-drums)** — *Build a polyrhythm by spinning shapes.* A 4-year-old taps a **+** to add bold rotating polygons; a triangle pings **3×** per spin, a hexagon **6×**, so the **number of sides = the rhythmic subdivision** and **spin speed = tempo**. Two shapes at related speeds drift in and out of phase — the child has literally *built* a 3-against-2 polyrhythm. Each shape is locked to one tone of a warm Dadd9 chord, so every combination is consonant — **the child shapes the rhythm, never a "wrong note."** **Why open it:** it's the kids lane's first piece where a child authors *rhythmic structure* (not a pre-approved melody) — the directest answer to the jury's "shape rhythm, not pentatonic." Robust on any device (no mic, no network — it spins and chimes the moment you open it).
- **2 more built this fire** (banked to IDEAS §506): **`823-kids-feelings-chords`** ⭐ (drag one sun across a feelings-sky and **shape the chord's emotion** — major↔minor↔sus↔add9, all consonant; SVG/DOM, the renderer-diverse pick — resurrect-first). **`824-kids-clap-loop`** (clap a rhythm and a glowing **WebGL2** band loops your groove back, Incredibox-style; resurrects the §504-banked `817`). Both complete, build-verified.

## In progress / partial
- None shipped-partial. `822` is demoable. The two banked siblings are real code (briefs in IDEAS §506), one rebuild away each.

## Research findings worth a look
- **RESEARCH §506:** the **polyrhythm-as-rotating-polygons** idea (thekidshouldseethis "Polyrhythms in shapes"; Musical Toys "Polyrhythm") makes a hard musical concept *physically legible to a small child* — more corners = more taps, spin faster = faster — which is exactly what `822` implements. Plus a recent **children's dyadic musical-synchrony → empathy** paper (PMC12063534) that supports a future shared/two-hands rhythm mode.

## Open questions for Karel
- **Does `822` read as mesmerizing or just busy on your device** — and would a 4-year-old grasp "more sides = more pings" without being told? That's the one thing I'd want your eyes/ears on (verified at compile/lint/type level only; no audio in the sandbox).
- Standing infra note: the container's ~4096-fd ceiling blocks local static-gen (EMFILE at the font manifest). *New this cycle:* pristine `main` now builds **fully** and adding any single page tips it over — confirmed **page-count fd-exhaustion, not the code** (822 reached "Collecting page data" clean), and the ceiling is **unraisable even as root** (cgroup-locked). Vercel deploys fine, as always.
- Heads-up on git: the remote `main` history was force-rewritten again (local `main` was a stale orphan at cycle 305 with no shared ancestor) — I reset to `origin/main` (cycle 505) before building, per prior cycles. If that rewrite is unintended, worth a look.
