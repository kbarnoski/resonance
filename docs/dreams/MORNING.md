# Morning digest — last updated 2026-06-29 ~14:30 UTC (cycle 599)

> **Answering yesterday's jury head-on.** The verdict said: stop shipping full-screen shaders-you-watch — build one you can actually *play*. So tonight is an **instrument**, not a field: you rotate it with your hands.

## New since yesterday
- **`/dream/1051-hand-hyperspace`** ⭐ — **reach into hyperspace and turn a 4-dimensional jewel with your bare hands.** Raise your hands to the webcam: left-hand height, right-hand sweep, and the spread between your palms each rotate the polytope through a different one of its six 4D planes, and the spin of each plane plays one note of a just-intonation chord — so a gesture is literally a shifting neon chord. The lab's **first hand-tracking input** and **first you-*play*-it psychedelic piece**. *Why open it:* after seven lean-back shaders in a row, this is the first one that puts the controls in your hands. (No webcam? Just drag on the canvas — it still plays.)

## How this cycle ran
- **WIDE mode** — 3 parallel builders, three *different* interactive instruments (none a screensaver, none a passive-mic field, none the banned fragment-shader form). Shipped the strongest; the other two are built, clean, and banked to re-drop:
  - **`1052-piano-bloom`** ⭐ (banked, resurrect-first) — touch a living **WebGPU-compute** field into bloom over **your own Welcome Home piano** as the carrier wave. This is the one that finally discharges the jury's two big asks (real piano + WebGPU compute back) — I want to ship it next with a real track id wired in.
  - **`1053-skin-membrane`** (banked) — press, pull and *tear* a physical elastic membrane with multi-touch; it rings like a drum-skin. The lab's first physics sim in the psych lane.

## Research finding worth a look (RESEARCH §599)
- A **Jan-2026 paper** (IJFMR) turns a webcam + MediaPipe into a 32-gesture in-browser instrument — concrete proof the "play sound with your hands, no hardware" pipeline is now routine. Paired with the **Pardesco 4D Polytope Viewer** (interactive 4D rotation, but watch-only), the hook was obvious: make the 4D viewer something you *play*. That's tonight's build.

## Open questions for Karel
- **Same standing build-gate note** (unchanged from yesterday, no action lost): local `npm run build` compiles + lints + type-checks clean every cycle, then dies on the container's 4096 open-file cap during static-gen of 1000+ routes. Vercel deploys fine. Still your call: raise the fd ceiling, or bless `next build --experimental-build-mode compile` as the gate.
- **`1052-piano-bloom` wants a real track id** — to make the piano carrier *actually* your recording (not the felt-piano fallback), I need a valid Welcome Home track id / `/api/audio/[id]` example. Drop me one and I'll ship 1052 next.
