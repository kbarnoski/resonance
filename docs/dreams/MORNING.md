# Morning digest — last updated 2026-07-16 (cycle 794)

## New since yesterday
- **[1784-second-sight](https://getresonance.vercel.app/dream/1784-second-sight)** — *The Hallucination Machine: a real neural net actually **sees your live world**, and that machine perception decides where the hallucination grows.* Point your webcam at the room, press **Open the valve**, and as the "dose" climbs over ~55s the veridical feed dissolves — eyes, faces and paisley form-constants bloom exactly where the net found the most salient structure (faces, contours, warm skin), smearing into tracers. Sight and sound share **one** dose knob. No camera? It runs on a deterministic drifting proto-face self-demo, so it always shows you something.
  - *Why this one:* it stages the deepest theory of the psychedelic visual — the **predictive-processing "reducing valve"** (REBUS; Huxley): the trip isn't new content, it's your generative model **over-writing reality**. The literal instrument for that is DeepDream on a live camera (Suzuki & Seth's *Hallucination Machine*, Sci.Rep. 2017; now formalized in *Frontiers* 2026). It's the lab's **first real generative use of TensorFlow.js** (prior tfjs was only kids classifiers) and it renders on **three.js GPU**, straight off the Canvas2D your last jury banned.
  - *Honest caveat:* no pretrained face model is a dependency (I can't add deps), so the net is **untrained/seeded** — it follows contrast/edges/warm-skin, not literal face recognition. Real machine-perception *lever* steering procedural creatures, not learned imagery. Ships honest; upgrades cleanly the day a model package is allowed.

## In progress / partial
- None carried. 1784 is demoable; the two DEEP-race siblings are text seeds in IDEAS.md, not folders.

## Research findings worth a look
- **The psychedelic visual = your brain over-writing reality, and DeepDream literally reproduces it** — *Frontiers in Psychology* 2026, "Beyond the reducing valve," building on Seth's *Hallucination Machine* (Sci.Rep. 2017): a DeepDream feed over real scenes recreates the eye/face/creature apparitions AND raises entropic brain dynamics. This is what tonight's build cashes. (RESEARCH.md §794.)

## Explored but not shipped (banked in IDEAS.md, both built to demoable this cycle — DEEP race, same concept, 3 approaches)
- **⭐⭐ `1780-reducing-valve`** — the *literal* machine: **real DeepDream gradient-ascent** in TensorFlow.js on your live camera. The one approach with a novel technique the ship lacked — but it renders on the **jury-banned Canvas2D**, so it's benched until I port it to GPU. **My pick to ship next** (off Canvas2D).
- **⭐ `1782-eye-bloom`** — pure-GPU WebGL2 version, no ML: every high-contrast feature grows an eye/paisley whorl with LSD tracers. The guaranteed-spectacular baseline / fallback path.

## Open questions for Karel
- **The AI-pipeline chain (audio→image→video, ≥2 models)** is still the one genuinely-empty lane — blocked only on your go-ahead for a small per-prototype paid budget (rule #6). One word and it's next.
- **Heads-up (not blocking you):** the sandbox still hits a 4096 file-descriptor ceiling that stops a *local* full `npm run build` of the ~750-route lab (aborts with `EMFILE`). Verified environmental (reproduces on the untouched baseline; Vercel builds fine), shipped on a clean full-project typecheck + lint + compile-mode build instead. Nothing for you to do.
- Tonight I shipped the **hybrid** (ML-sees-world + GPU render) for completeness + diversity; the **real-DeepDream** version (1780) is arguably the purest idea but needs to come off Canvas2D. Want it shipped next, or should I go WIDE?
