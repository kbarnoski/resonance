# 17504-mirrorfold — Two bodies fold one take into unison or a canon

**Status:** Demoable. `tsc --noEmit` passes; `next lint` on this file is clean. Audio is Karel's real catalog (Welcome Home / Snowflake) via `loadRealTrackBuffer`, routed entirely through `createSafeMaster`. Two-person MediaPipe pose (`numPoses=2`) with ghost-demo, single-person, slider, and Canvas2D fallbacks.

## The one question

What if TWO people in front of ONE webcam share one of Karel's recordings, and their MIRROR-SYMMETRY is the instrument — when they move as each other's mirror image the take plays as one unified voice, and when they break symmetry it splits into a two-voice CANON distributed across their two bodies?

## What it does

One looping buffer of a single Karel solo take feeds **two** `AudioBufferSourceNode`s that start together (phase-locked). Voice A plays direct into a stereo panner; voice B runs through a `DelayNode` into its own panner. Both terminate in `createSafeMaster().input` — there is no path to `ctx.destination`. Two glowing three.js line-figures (additive lines + joint points + a braid of points) stand side by side: person **A** in deep indigo-violet, person **B** in pale lilac, with a central braid that fuses to shared amethyst at mirror-lock.

## The interaction (symmetric mirror / canon)

Both people perform the SAME conducting verb (raise/spread arms, sway). The control signal is their **mirror-synchrony ∈ [0,1]** — how closely B is the left-right mirror of A (arm-spread match + wrist heights matched *across* the body, A.left ↔ B.right + leaning toward each other).

- **High synchrony (mirror-lock → unison):** pan and delay both collapse to ~0, so the two identical phase-locked streams sum into ONE central voice — the take folded in half. The braid weaves tight and glows amethyst; brightness follows the shared level.
- **Low synchrony (break → canon):** the pan spreads voice A toward A's side and voice B toward B's side while B's delay opens — one monophonic take becomes a live two-voice round distributed across the two bodies. The **vertical gap / arm-height difference** between them sets the canon's delay (interval). The braid tears into two streams, each sliding back to its owner's hue.
- **Shared conducting motion** (average arm height + spread of both bodies) opens a lowpass on both voices, lifts the master gain, and nudges a gentle playback rate around 1.0 — applied equally so the voices stay phase-locked.

Latency is the craft: detection on `requestAnimationFrame`, no async in the control path, `setTargetAtTime` smoothing (~0.12s per param) plus a second exponential smoothing pass on the control signal itself.

### Robustness (works-when-shipped)
- **Gate on shoulders only** (visibility ≥ 0.3), hips synthesized below the shoulders — waist-up desk framing works (reuses 17408-bodycast's `readPose`).
- **Stable identity:** the up-to-two detected people are sorted by shoulder-mid X so "person A" (left) / "person B" (right) never swap frame-to-frame.
- **2 of 2 / 1 of 2 / lost** status line is always visible when the camera is on; the lost state uses `text-destructive` with an actionable hint.
- **Ghost demo:** on Play, two autonomous bodies (B mirrors A, drifting in and out of symmetry) animate immediately, clearly labelled "demo" — never mistakable for live tracking.
- **1 person** → drives voice A, voice B rides a gentle auto-canon, "waiting for a second person".
- **No camera / model-load fail** → pointer + on-screen sliders (mirror-synchrony, conducting intensity) drive both bodies, with a visible notice.
- **No WebGL** → Canvas2D fallback figures + braid. **Audio load fail** → `text-destructive` message.

## Named references

- **`canon`** and **`duetlink`** — the lab's loved two-hand / two-person conducting pieces this grows from.
- The musical **canon / round** form — one line played against a delayed copy of itself.
- **Vrengt** (arXiv:2010.03779) — a shared body–machine instrument for music-dance collaboration.
- Myron Krueger's **_Videoplace_** (1974) — two people responsive in one shared frame.
- It **inverts SoundMHPE** (arXiv:2609.04902, 2026-09-04), which predicts multi-person 3D pose FROM sound — here two poses SHAPE the sound.

## Deepen next

- Give the canon a true pitch interval (a second phase-locked source pair detuned by the gap that re-locks cleanly on return to unison, rather than delay-only).
- Add a third relationship beyond mirror: **translation-symmetry** (both doing the same motion in-phase, not mirrored) as a distinct "unison-in-motion" mode versus static mirror-lock.
- Per-person handedness cues in the figures (which wrist is driving which voice) so newcomers learn the mapping faster.
- A brief "you locked" bloom when synchrony crosses a high threshold, to reward finding the fold.
