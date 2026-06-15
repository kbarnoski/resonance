# Morning digest — last updated 2026-06-15 (UTC) · cycle 428

**Open this first:** [/dream/617-kids-shadow-monster](https://getresonance.vercel.app/dream/617-kids-shadow-monster) 👹🎭

## New since yesterday
- **👹🎭 [617-kids-shadow-monster](/dream/617-kids-shadow-monster)** — "Shadow Monster Stage" (kids 4+). **Stand in front of the camera and your whole BODY becomes a giant glowing googly shadow-monster on a lit stage — wave and the air WHOOSHES, jump and it BOINGs, get big and it ROARs.** Why open it: it's the **biggest, most magical kids swing** of the fortnight, and the directest answer to two things the jury keeps asking for — a **full WebGPU spectacle** (off the over-used Canvas2D) AND **embodied-spatial** (whole-body, off the glass) — in a 4-year-old's funny register. Body **segmentation mask** (MediaPipe ImageSegmenter via CDN, no npm dep) → a hand-written WGSL creature; Canvas2D fallback. **No camera? It still plays + self-demos:** rose notice + big ROAR/WHOOSH/BOING buttons + A/S/D keys, and a ~2.5s idle ghost-silhouette performs on its own — so a silent glance still sees + hears the monster.

## Also explored (banked, not shipped — see IDEAS §428)
- **615-kids-face-monster** — make silly faces → a googly monster mirrors + exaggerates them (FaceLandmarker blendshapes → WebGL2). The most legible cause→effect; lost because WebGL2 ≠ the demanded WebGPU and face-puppet overlaps the lab's existing face pieces.
- **616-kids-tilt-zoo** — tilt the tablet, googly creatures roll + BONK with cartoon honks (device-tilt → WebGPU, **camera-free**). The most reliable at-a-glance; **banked as the fast revive if 617's camera path proves flaky on your review.**

## How this cycle was chosen
- KIDS cycle (428 even), **WIDE** mode (3 parallel builders, ship the best). Gates: research-first (MediaPipe segmentation-mask is grep-distinct from the lab's landmark vision lane); diversity (camera/vision was 0× in the last 10 — cleared; all three dodge the banned Canvas2D/touch/warm-JI/cozy); ambition floor (≥3 subsystems + named refs: shadow-puppet theatre, Daniel Rozin, Tex Avery, MediaPipe ImageSegmenter).

## Caveats
- **Build-verified, not browser-verified** (no camera/GPU/audio in the sandbox). The segmentation-mask legibility and the whoosh/boing/roar feel are reasoned, not eyes-on. The idle ghost-demo + no-camera buttons guarantee it does *something* delightful even with no camera.

## Open questions for Karel
- 617 vs 616: do you prefer the **camera "become a monster"** magic, or the **camera-free tilt toy** reliability? Your answer steers the next kids fire.
- Three funny-ish kids pieces in a row (603 yell, 609 blow, 617 monster). Want the next kids cycle to stay funny, or swing back to calm/contemplative?
