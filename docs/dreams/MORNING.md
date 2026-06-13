# Morning digest — last updated 2026-06-13 (UTC) · cycle 414

> **The jury** banned the kids **pentatonic-tap-wash** (≈6 of 7 kids pieces are "tap → a pretty consonant note"), banned three.js/SVG/the mic, and begged for **WebGPU back** (it's starved 1×, the lab fled into a three.js monoculture) and **warmth you feel**. This kids cycle answers all of it with one move: a sheet you *bend with your hands*, no notes to tap, on WebGPU. See `docs/dreams/JURY.md`.

## ⭐ Open this first
**[/dream/579-silk-choir](https://getresonance.vercel.app/dream/579-silk-choir)** — **Silk Choir** (kids 4+ · iPad/touch)
**Grab a luminous sheet of silk and pull it.** The sheet stretches like real cloth, and its **tension bends a warm choir chord** — pull it taut and the voices rise and brighten; let it billow and they sigh and fall. There are **no notes to tap**: you bend the chord with your fingers, and it always sounds beautiful.
- **The headline:** the directest break from the kids **pentatonic-tap-wash** you've been seeing — pitch here is **continuous and physical**, never a discrete safe-note. And it runs on **WebGPU** (a real compute-shader cloth solver), the renderer the jury keeps asking back.
- **See/hear it in 10 seconds:** press start — the silk shimmers from frame one and a silent auto-demo sweeps a pull across it so it's already singing on a glance. Then drag it yourself (multi-touch). Falls back to a CPU/Canvas2D solver automatically on any iPad without WebGPU.
- Built on a real verlet cloth (Jakobsen, 2001); the continuous-hand-bent pitch comes from the Ondes Martenot / Theremin lineage.

## How this cycle ran
**KIDS · DEEP** (3 parallel builders, one concept — *a stretchable singing membrane* — ship the strongest). All three dodged every jury ban and bent a continuous chord (no taps). Shipped the WebGPU one that's truest to "grab and pull."

## 2 more explored — banked (IDEAS §414)
- **580-silk-veil** — the same pull-the-silk piece in pure **Canvas2D**: the most bulletproof-on-any-iPad version, gorgeous and warm. Lost only because it doesn't revive WebGPU (your explicit ask).
- **581-silk-ripple** — a **flick/slap → traveling waves** variant: slap the sheet and ripples roll across it, bending the chord as they pass. The most *fun* for a 4-year-old; a softer bend than 579. Great fold-in for a cycle 2.

## Open questions for Karel
- **Love 579 → cycle 2?** I'd fold in 581's **flick-to-ripple** so the sheet does both (pull *and* splash), add a second chord you can "pull between" (real harmonic motion), or let two sheets meet as a duet. Want that?
- **Cycle 415 is adult** — the queue says ship **578-magnetosphere** next (live NOAA space-weather → WebGPU geomagnetic choir; revives WebGPU, warm, off the puzzle). Still good, now that this cycle wasn't a data piece? Or another embodied-spatial room?

— Build-verified (`npm run build` ✓ exit 0, 450/450 pages, `/dream/579-silk-choir` prerendered static); **not** browser-verified (no WebGPU/touch/audio in the sandbox) — the WebGPU solver + the feel of bending the chord are reasoned, not finger-checked. The hot-downgrade to CPU/Canvas2D + the silent auto-demo mean it always shows a living, singing sheet with zero setup.
