# Morning digest — last updated 2026-07-16 (cycle 793)

## New since yesterday
- **[1778-gradient-lotus](https://getresonance.vercel.app/dream/1778-gradient-lotus)** — *a warm, breathing psilocybin/LSD mandala rendered with **no canvas and no WebGL at all** — only the browser's CSS compositor.* Every petal is a stacked, counter-rotating `repeating-conic-gradient` fused with `mix-blend-mode` + `mask` and mirrored for kaleidoscope symmetry; a single rAF loop writes a handful of CSS custom properties from a live audio FFT, so the six frequency bands literally open and close the flower. Press **Begin** — it plays and turns on its own (drop your own track to drive it, or just watch).
  - *Why this one:* it's the sharpest answer yet to your "too similar / get off Canvas2D" note. Nearly every trippy piece in the lab is a GPU shader or a Canvas2D loop — this proves a **third render substrate** (the CSS compositor, grep-confirmed never used as a primary render across 1500 prototypes). It's also the most robust to open cold on any device — no camera, no downloads, no GPU quirks.
  - *Pole:* warm-organic **psilocybin/LSD**, not the cosmic-ambient/void the lab had over-run — a deliberate swing to the fresh pole.

## In progress / partial
- None carried. 1778 is demoable; the two WIDE siblings are text seeds in IDEAS.md, not folders.

## Research findings worth a look
- **High-dose psilocybin makes gaze *less* entropic, not more** — the eye *dwells* on local detail instead of scanning (Sci. Reports 2025, s41598-025-10206-8). It inverts the naive "trip = restless eyes." Seeded a piece where slow hand-*dwell* blooms a fractal and fast motion collapses it. (RESEARCH.md 2026-07-16.)

## Explored but not shipped (banked in IDEAS.md, both built to demoable this cycle)
- **⭐⭐ `1776-spore-gaze`** — wave/hold your hand at the **webcam**; slow dwell blooms a warm psilocybin fractal *there*, restless motion flattens it. The literal build of today's research; **highest-ambition of the three (4/5) — my pick to ship next.**
- **⭐ `1780-dejong-swarm`** — 260k points on a **de Jong strange attractor** (a lab first) leaving LSD tracer-trails; gorgeous and alive.

## Open questions for Karel
- **Heads-up (not blocking you):** this session's sandbox hit a file-descriptor ceiling (4096) that stops a *local* full `npm run build` of the ~750-route lab — it aborts with `EMFILE`. Verified it's environmental (reproduces without my change; Vercel built fine 2h ago) and shipped on a clean full-project typecheck + lint instead. Nothing for you to do; just so you know why STATE.md talks about it.
- **The AI-pipeline chain (audio→image→video, ≥2 models)** is still the one genuinely-empty lane — blocked only on your go-ahead for a small per-prototype paid budget (rule #6). One word and it's next.
- Of the three tonight, **1778 shipped for diversity + reliability, but 1780 (the de Jong swarm) may be the prettiest** — want me to ship it next, or push 1776 (the webcam dwell-bloom) first?
