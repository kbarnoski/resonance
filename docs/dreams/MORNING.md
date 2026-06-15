# Morning digest — last updated 2026-06-15 (UTC) · cycle 431

**Open this first:** [/dream/622-wolfram-rhythm](https://getresonance.vercel.app/dream/622-wolfram-rhythm) 🔢

## New since yesterday
- **🔢 [622-wolfram-rhythm](/dream/622-wolfram-rhythm)** — "Wolfram Rhythm" (adults). **A single integer composes the music.** A 1D cellular automaton unfolds row by row on a beat; each new row's live cells fire short, metallic, edged hits. Turn one knob — the **rule number (0–255)** — and the whole piece transforms: **30** is pure chaos/noise, **90** a self-similar Sierpinski fractal, **110** complex and alive (it's Turing-complete). The iconic scrolling Wolfram diagram drives the visuals. Why open it: it's the lab's **first 1D-CA / Wolfram instrument** (the existing CA pieces are all 2D — Conway Life, Lenia, sandpile), and a deliberate swing **off the adult edges/real-data rut** (howl/vivisection/seismic/solar) into a colder, rule-driven register. Leave it alone and the diagram self-draws; tap Begin to hear it.

## Why this cycle was chosen
- ADULT cycle (431 odd), **DEEP** mode — one concept (cellular automata that *compose themselves*), 3 parallel builders each a different CA paradigm (Conway Life · Wolfram 1D · Lenia). Gates: love-aligned to your emergent-music ❤️ (236/130/262); ambition floor **3/5** (first Wolfram instrument + 4 subsystems + refs Wolfram 2002 / Cook 2004 / Xenakis); diversity clean (WebGL2, off the over-used WebGPU-5×; a single-integer lever, not mic/data/body).

## The honest story this cycle
- The other two builders both turned out to be **duplicates of things you already have** — `620-life-engine` ≈ `25`/`180-cellular` (both "Conway's Life as composer"), and the Lenia one ≈ `264-kids-lenia-pond` (it even reused 264's code). A corpus grep at curate-time caught it (after a `grep` bug nearly hid it). So only the **1D Wolfram** sub-lane was genuinely new — that's the winner. Banked the dupes as *do-not-rebuild* notes (IDEAS §431).

## Caveats
- **Build-verified, not browser-verified** (no GPU/audio in sandbox). Untested by ear: that rules 30/90/110 sound as distinct as they look, and that the metallic voices read as edged-not-harsh. The visual auto-runs on load, so a silent glance already shows the diagram drawing; Canvas2D fallback covers no-WebGL2.
- **Numbering:** §430 had reserved the labels 620/621 for banked kids text-seeds, so the winner was renumbered to **622** to avoid collision (per the lab's skip-reserved-numbers convention).

## Open questions for Karel
- Adult side has now gone **edges/real-data ×4 → austere-CA ×1**. The truly empty adult lane is still **off-screen / audio-only / spatial** — but you already have spatial pieces (80/394/400/576), so it'd need a genuinely fresh angle. Want me to push there next, or keep mining autonomous/generative systems?
- This Wolfram piece is deliberately *cold* (Xenakis register). Too austere, or a good contrast to all the warm work?
- Worth a **polish cycle** that re-voices the old Conway pieces (`25`/`180`) with the richer FM-bell sound design the rejected `620-life-engine` built?
