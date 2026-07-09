# Morning digest — last updated 2026-07-09 (cycle 719, PSYCHEDELIC · WIDE)

## Open this first
- **`/dream/1354-glyph-canon`** — **a psychedelic instrument that lives entirely inside a field of text.** Type on the keyboard (or tap the on-screen keys) and each note sounds a warm just-intonation tone AND blooms a ring of glyphs. The twist: its sense of *time* isn't a beat — it's a **Steve-Reich phase canon**. A violet copy of your phrase and a teal copy running a hair slower slowly drift apart, so you literally **see** the rhythm de-phase as two streams of characters separate. *Why:* it's the freshest render surface the lab has — a monospace **glyph-terminal**, not a canvas of pixels — and it plays itself if you just leave it. Works on any phone, no permissions.

## What this cycle did (WIDE — "Time Without a Drum": 3 explorers on 3 fresh surfaces, shipped the strongest)
Last jury cashed its loudest demand (get off Canvas2D) twice this fortnight — so this fire kept that momentum on the **two fresh surfaces that got zero follow-up** (glyph-terminal, three.js) and turned to the jury's next note: **"don't let the groove machine become the new bell — find TIME somewhere other than a drum grid."** All three explorers carry rhythm with **phasing**, not a step-sequencer. None uses the camera (rested this fire). Three orthogonal surfaces × three non-pointer inputs:
- **glyph-terminal** + keyboard + a **Reich phase canon** → `1354-glyph-canon` (**shipped** — hypnagogic, cosmic-ambient).
- **three.js 3D lattice** + mic-breath + **3/4/5 polymetric arpeggios** → `1356-breath-lattice` (banked ⭐⭐ — breathe a honeycomb into bloom).
- **WebGL2 120k point-cloud** + phone-tilt + **Shepard-Risset glide** → `1358-tilt-nebula` (banked ⭐ — gather a nebula into a core of light).

## Banked, ready to ship next (2 more explored — full specs in IDEAS §719)
- **⭐⭐ `1356-breath-lattice`** — the freshest 3D substrate (three.js) + the warm psilocybin pole the lab is thin on + a genuinely clean polymetric phase engine. Strongest single ship-next; wants a slot where its GPU render + mic can be eye/ear-tuned.
- **⭐ `1358-tilt-nebula`** — love-fit with your loved particle cluster (`130`/`236`/`321`/`262`), phone-native tilt, a real endless glide. Close cousin of the already-banked `1350-gpu-murmur` (same "tilt to gather the void" gesture).

## Open questions for Karel
- **The still-0× top rung:** a ≥4-subsystem **AI-pipeline** chain (audio→image→video, or music→narrative→TTS→score-follow). Fifth jury raising it — it needs a per-prototype **paid budget** and I won't spend your FAL/API budget unattended. Green-light one and I'll build it.
- **Does the phasing read?** 1354 is build-green + code-verified, but I can't eye/ear-verify in a headless box — whether the two glyph-streams *visibly* drift apart and the canon sounds like Reich want your browser. Tell me if the drift is too slow/fast and I'll tune it.
- **fd-ceiling (infra):** local `npm run build` still EMFILEs at ~670 routes (box cap 4096) — worked around via compile-mode (EXIT 0); Vercel is uncapped and deploys fine.
