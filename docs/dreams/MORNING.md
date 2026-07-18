# Morning digest — last updated 2026-07-18 (cycle 821, WIDE)

> **You asked "camera or breath next?" last night — I built both, plus a notation piece, and shipped the breath one.** Harmonices is closed at III (the jury's discipline note: pick the one thread, ship it, then rotate — done). Tonight rotates to fresh: three non-touch inputs on three non-WebGL2 substrates, all about *memory*. The winner is the one that dodges last cycle's groove hardest.

**Open this first:** https://getresonance.vercel.app/dream/1934-breath-fresco — press **Start — breathe**, allow the mic, and breathe slowly. Each exhale trowels a **permanent glowing stratum** into wet plaster. The wall's left→right axis is **time**, so after a couple of minutes the whole wall is a readable record of your session — where you breathed hard, where you rested. A soft Radigue-style drone thickens as it fills. No mic? A ghost-breath demo paints it on its own.

## New since yesterday
- **`/dream/1934-breath-fresco`** — **your breath as a spatial autobiography.** Breath *envelope* (loudness, never pitch) → each exhale deposits a permanent horizontal stratum at the current time-column; nothing fades, it only oxidizes with age. This is the jury's #1 + #4 in one build: a **non-touch input (breath)** on the **thinnest substrate (WebGPU compute, 1× in the lab)**, and compositional **memory** as a cumulative timeline — deliberately *not* 1930's decaying chord.
- **Why it matters:** it's the sharpest break yet from the two grooves the jury flagged (touch-input 6×, WebGL2 7×), and the third memory piece in a row (1930 crystallize → 1932 canon → 1934 fresco) — the lab is answering "give a piece real memory of what you did" well. Full Canvas2D fallback, so it renders even if your iPhone's WebGPU path bails.
- **2 more explored, banked (see IDEAS §821):** **`1938-manuscript`** — MIDI/keyboard notes get *engraved as real sheet music* that re-performs itself as a growing round (gorgeous, best self-demo — held back only because it's too close to last cycle's canon-loom to ship two nights running). **`1936-gait-loop`** — dance a phrase on camera, it loops back and stacks into polymeter (fixed the old pentatonic bug → real JI harmony).

## Honest caveats
- Headless container = **no mic, no GPU, no display, no speakers.** I lint-clean + project-wide typecheck-clean + ran the authoritative compile build (route emitted, no loser leak) — but I **can't hear or see it run.** Open feel-questions: do the strata read as a legible *timeline* vs a smear, does the drone thicken *musically*, and does your iPhone Safari actually run the `rgba16float` WebGPU write or fall to the Canvas2D path (works either way — never blank). Your phone + breath settle it.
- The trowel parks at the right edge once the ~5-min wall fills; further breaths pile at the last column rather than scrolling. A known edge, not a bug.

## Open questions for Karel
- **Next fresh DEEP?** Harmonices is closed, so a DEEP now means a *new* big concept, not a cycle-4. My strongest fresh seed: a **depth-camera spatial-memory room** — a plain webcam → in-browser depth (Depth-Anything-V2 on WebGPU) → a 3D point cloud where *where you stood* leaves a durable resonant deposit you can walk back through. Cashes the depth/spatial menu lane (0× ever) + WebGPU + memory. Only gate: confirming the model loads in the Vercel env. Want it?
- **Resurrect order for the banked pair?** `1938-manuscript` (notation-as-memory) once canon-loom ages out of the window, and `1936-gait-loop` (camera) — preference?
- **The AI-pipeline chain (audio→image→video, ≥2 models)** is still **0×** across ~19 juries — the one genuinely-absent frontier — gated only on your go-ahead for a small paid per-prototype budget (rule #6). One yes unblocks it.
