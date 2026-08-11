# Morning digest — last updated 2026-08-11 ~20:30 UTC (cycle 1099)

## New since yesterday
- **`10216-claymemory`** — /dream/10216-claymemory — **the clay remembers your hands.** Reach into the webcam and knead a glowing lump of warm terracotta: an open palm dents it, a pinch pulls a peak — and every mark is **permanent**. It never springs back and never heals; the lump becomes a physical record of everything you did to it. Only "Fresh lump" restores the sphere. **Why open this:** it finally puts your **hands** back in the driver's seat (we'd drifted into 3 mic-driven fires in a row) and it's the lab's first **plastically-deforming** soft body — a real shape-matching solver with a plasticity yield, so it behaves like actual clay, not rubber. Warm, tactile, inharmonic. Best with a webcam + good light; a muted phone still watches the ghost-hands sculpt the lump, deepen the ember-glow as "memory %" climbs, then wipe to a fresh sphere on a loop.

## In progress / partial
- DEEP fire built 2 solvers of one concept (*knead warm clay*), shipped 1. The runner-up banked (IDEAS §1099), demoable + clean, never committed:
  - ⭐⭐⭐ **`10200-handclay`** — the **ELASTIC** twin: same hands, same terracotta, but the dents **heal** back to a sphere over ~1.5 s (a mass-spring / Verlet lump — living, breathing clay). **Resurrect FIRST** as the natural cycle-2: one lump with a **toggle** between the elastic and plastic solvers, so you feel the same gesture heal vs. stay — the material *is* the instrument.

## Research findings worth a look
- **§1099 — shape-matching soft bodies with a plasticity threshold** (Müller et al., SIGGRAPH 2005; XPBD, Macklin 2016): the model that makes virtual clay *remember* the hands that shaped it — vs. mass-spring, which springs back. Two opposite souls for the same gesture; that contrast *is* today's DEEP race. Full note in RESEARCH.md.

## Open questions for Karel
- **AI-pipeline chain** (music → image → video, the empty menu cell) still needs a `FAL_KEY` budget I won't authorize on my own (Rule #6). Say the word + a per-prototype budget and I'll build it.
- Warmth turn is holding strong (1096 brass/sand · 1097 ember · 1098 molten metal · 1099 terracotta clay). Want me to keep warm, or swing one cold/cosmic again next? And the output substrate wants rotating too (three fires of WebGL/WebGPU/three.js) — a Canvas2D-free SVG/DOM lane or a deeper WebGPU-compute-as-structure piece?

---
*Cycle 1099 · DEEP · 2 parallel builders → shipped 10216-claymemory · build EXIT 0 (1154/1154 pages) · one commit to main. Next fire ~2h (WIDE due).*
