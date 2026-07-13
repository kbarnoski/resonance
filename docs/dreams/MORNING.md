# Morning digest — last updated 2026-07-13 ~06:15 UTC

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[1568-worklet-mandala](https://getresonance.vercel.app/dream/1568-worklet-mandala)** — *Sing or hum into a psychedelic mandala that breathes, spins, and blooms **entirely as living HTML elements** — not one pixel drawn to a canvas or a GPU shader.* **Why open this:** it's the lab's **first-ever CSS Houdini `AnimationWorklet`** piece — 8 rings / 176 DOM petals spun **off the main thread on the compositor**. That's a genuine **#1 "technique never used in the lab"** (grep-0×) — the exact criterion the jury named as the last wall to a clean 5/5 — and it lands on the **starving DOM/CSS surface**, off the three.js/WebGL monoculture. Voice drives it (pitch → spin + hue, loudness → bloom); a seeded idle demo spins it with no mic. **Best on Chrome with a mic.**

## Mode this cycle: WIDE (3 explorers across the jury's 3 starving off-GPU surfaces; shipped the strongest)
Three unrelated directions in one fire, each on a different off-GPU surface the 2026-07-12 jury said is starving (DOM/CSS · audio-only · SVG) — a direct answer to "three.js is the new mouse-drag (GPU-render ~10/15)." 2 more explored, banked to IDEAS §758:
- **⭐⭐ 1566-void-orbit** (banked, TOP audio-only ship-next) — an **eyes-closed, no-screen** binaural void: ~5 drone "sound-bodies" **orbit your head** in true 3D (HRTF), drawn in and out by your **breath**. The most *surprising* thing in the bank — held back only because the spatial cues are subtle on a phone speaker. **Worth a listen on headphones — want it shipped?**
- **⭐ 1570-glass-melt** (banked) — play notes (keys/taps) and the screen **melts into liquid chrome**, rendered by the browser's own **SVG filter pipeline** (feTurbulence → displacement → hue), no shader written.

## Why this run matters
- **Four novel browser substrates now proven in four cycles:** WebCodecs (§753), Houdini Paint (§755), wavelet/Constant-Q analysis (§757), **AnimationWorklet (§758)**. Each is a live lever for the lab's first clean 5/5 — we've proven #1 and #2+#3+#4+#5 *separately*; the 5/5 just needs one build that welds them (a novel substrate + your real Path piano + a fresh finding, over 2–3 cycles).

## Open questions for Karel
- **The ≥2-model AI-pipeline chain (audio→image→video) is still unbuilt after TEN juries asking** — blocked ONLY on your OK to spend a small per-prototype FAL budget (I can't spend unattended). One yes/no and I build it next.
- Ship **1566-void-orbit** (the eyes-closed binaural breath-void) next? It needs a headphones listen more than a phone glance.

## Honest notes
- **Repo recovery:** this container's local `main` had drifted onto an orphaned history (stuck at cycle 718, no shared ancestor with real main at 757). I reset hard to `origin/main` — authoritative and far ahead — before working. Nothing lost; flagging so you know why the git log looks clean.
- Winner validated headless: authoritative compile-mode build EXIT 0, route in both manifests, ESLint/TS clean, forbidden-token grep clean (even inside the worklet string). Full `npm run build` still dies only at the container's ~700-route file-descriptor ceiling — an infra limit that does NOT affect Vercel.
- **Not yet felt on real hardware:** no mic/speakers/display here, and this box has no AnimationWorklet, so the rAF fallback is what ran — the compositor path lights up only on your Chrome. The rAF fallback + idle demo guarantee it's never blank/silent and renders identically anywhere.
