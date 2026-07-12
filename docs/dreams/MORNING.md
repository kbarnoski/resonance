# Morning digest — last updated 2026-07-12 ~14:30 UTC (cycle 750)

> **Following the jury to the letter**: it said three.js is the new mouse-drag (5/15, GPU-render-primary ~10/15) and named the three starving off-GPU surfaces — DOM/CSS-3D, WebGPU-compute, audio-only (1× each). So tonight's WIDE fire put **one explorer on each**, and shipped the one on the surface the jury also called a *highlight*: **audio-only.** See `docs/dreams/JURY.md`.

## New since yesterday — 🎧 **wear headphones for this one**
- **[1520-click-cathedral](/dream/1520-click-cathedral)** — *Can you SEE a vast space you cannot see — by clicking into the dark and listening to it answer?* A drug-free **human-echolocation** instrument, **audio-only**. The screen is near-black; press **Space** (or tap, or a real tongue-click into the mic) to fire a click into an invisible cathedral, and each surface answers with a **binaural echo** — near soft walls quick and dull, a far stone vault late, bright, reverberant. Switch **chamber / corridor / vast vault** to feel the size change. `WIDE-winner · self-clicks → audio-only/binaural · cosmic-ambient (active, not void)`

## Why this one matters
- It **embodies real, recent neuroscience**: Garcia-Lazaro et al., *eNeuro, April 2026* (Smith-Kettlewell + Cardiff) found expert echolocators build their spatial map by **"summation" — accuracy grows ~linearly with each click.** So here, **every click sharpens the world**: a surface's "belief" rises with each aimed click → its echo gets louder + brighter + blooms on the faint map, and a vague space resolves into a confident one only by *keeping clicking*. The paper's mechanism, made playable.
- It's the piece that most cleanly did **everything the jury asked** — off-GPU (audio-only, the starving *and* highlighted surface), and **active/building, not a dissolving void** (it rests the breathing-field lane you flagged twice). Honest **2/5** on the ambition floor (#2 four subsystems + #3 named refs; #1 unreachable in a 1500-deep lab, #5 anchor is ~3mo not <14-day — logged straight).

## Also explored tonight (WIDE fire — 2 banked, full code saved, seeds in IDEAS §750)
- **⭐⭐ 1518-tesseract-organ** — **play a 4D hypercube with the keyboard** in *pure DOM/CSS-3D* (no canvas/WebGL); six drone voices swell with the six rotation planes so you hear the plane you see fold inside-out. The **lowest-risk** of the three (renders anywhere with certainty) — de-selected only for the winner's research grounding + surprise. Ship-ready for a zero-GPU night.
- **⭐⭐ 1522-fluid-conductor** — **tilt a real fluid into song**: a WGSL WebGPU-compute Jos Stam *Stable Fluids* solver you stir with gravity, sonified as a drone (locked vortex → sustained tone), with a full CPU/Canvas2D fallback. Banked because its GPU path is *written-but-not-run* headless — needs an in-browser GPU pass before shipping.

## Open questions for Karel
- **1520 wants your ears + headphones**: does the room read as *spatial* (can you point yourself at a wall and find it), and does the "image forming %" sharpen satisfyingly as you click? Which space lands best — the intimate chamber or the vast vault?
- **You now have 3 banked WebGPU pieces** (1522 fluid + 1514 spiral-lattice + 1510 plasma-aurora). Worth a dedicated **WebGPU night** to verify one on your GPU and ship it, or keep them as ballast?
- **Oldest unmet ask, 5 juries running** (raising it by name as the jury told me to): the **audio → image → video AI-pipeline chain** (0×). It's blocked ONLY on your **per-prototype paid-budget go** — one yes/no and I can build it. Yes?
