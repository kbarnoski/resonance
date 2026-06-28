# Morning digest — last updated 2026-06-28 (cycle 585)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday — Cycle 585 (ADULT · DEEP, 3 approaches to one big concept, shipped 1)
- **`1019-echo-halls-tonnetz` — walk your body across the *Tonnetz*, the classical lattice of all 24 triads, and every threshold you cross is a real chord move (C → Em → Am…), while a GPU reaction-diffusion pattern blooms under the active chord and the whole sound re-pans around you in 3D.** This is the long-asked-for **extension of `977-echo-room-gpu`** (your only 5/5) into a *suite of harmonic rooms you physically move between*. **Why open this:** the harmony is real and deep — each step is a genuine single-voice neo-Riemannian P/L/R transform (I machine-checked the whole lattice: 58 edges, zero errors), not a no-wrong-notes scale — and the GPU **compute** simulation *is* the resonating body, the jury's most-repeated ask. Pose-driven (camera), but it auto-demos a P–L–R walk on load with zero permissions, and falls back to pointer + WebGL2/CPU so it always sounds.
- ⚠️ **Not heard yet:** no audio/WebGPU/camera in my box. Compile + lint + type-check are green (✓ Compiled successfully in 41s); the WebGPU-compute path, HRTF re-pan, and pose load are reasoned, not run — a minute on a real machine settles it (WebGL2/CPU + pointer + auto-demo are the always-sounding net).

## Also explored this fire (built complete, banked — not shipped) — 2 more, see IDEAS §585
- **`1018-echo-halls-walk`** ⭐ — **first-person, find-the-chord-BY-EAR:** six rooms float around you across the *full sphere* (above, below, behind); your head orientation updates the HRTF field so you can close your eyes and walk toward a chord. The most embodied of the three and the directest take on this fire's research (fresh 2026 full-sphere-localisation paper). Lost only because it renders in WebGL2 with no GPU-compute — my pick to resurrect with a compute body.
- **`1017-echo-halls-flock`** — **top-down plan; a 120k-particle WebGPU *compute* flock pools in whichever room you stand in**, and the field's density/energy drive the filter and shimmer — the cleanest "the simulation drives the sound" loop. Lost on being closest in form to 977.

## Why this shape (DEEP, adult, WebGPU-compute back)
- Your jury said it plainly: **extend 977 into a multi-cycle spatial instrument (#2)** and **bring real GPU-compute back as the resonating body (#3, 6×→1×).** Nothing had extended 977 across the last three fires, so I went DEEP — one big concept (*Echo Halls*), three technical attacks — and shipped the one that ALSO pays the verification debt (#4): it machine-verified its harmony engine. Today's research (a 24-Jun full-sphere sound-localisation paper) → today's build, a walkable HRTF architecture.

## Open questions for Karel
- Echo Halls is **cycle 1 of a thread** — next adult fire, deepen 1019 (wider lattice, smoother pose→cell, a committed Tonnetz-math test) or resurrect 1018 (full-sphere find-by-ear) with a compute body?
- Same honest gap as the kids GPU builds: I can't *hear* these or run WebGPU here. Worth a cycle that just hand-verifies 977 + 1019 + 960 on a real device to clear the unheard pile?
- Still-open doc-debt: RESEARCH.md dive paragraphs for cycles 579–582 were referenced but never appended (§583–§585 are clean). Backfill in a research lull?
