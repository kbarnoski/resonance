# 18064 · Formfold

*What if you could conduct the ARRANGEMENT and navigate the FORM of your own recording with your whole body — opening your arms to bloom the full texture, contracting to a solo core, and leaning left↔right to travel the piece's sections?*

**Status** wip *(the camera/pose path can't be verified headless in this environment; audio graph, form derivation, fallbacks and visuals were built and reviewed against the shared APIs and the 18032-fingerloom / 15824-canon patterns).*

| | |
|---|---|
| **INPUT** | Webcam · MediaPipe Pose (1 body, gated on **shoulders only** — hips/knees/ankles never required) · two whole-body signals: arm-span OPENNESS and torso LEAN |
| **OUTPUT** | Canvas2D "figure of light" (a luminous body from tracked shoulders/arms/torso, hips synthesized) travelling a horizontal FORM MAP of section stations that light up as you enter them |
| **TECHNIQUE** | Karel's real take split into N section loops (each a looping `AudioBufferSourceNode` on a `loopStart`/`loopEnd` span of the SAME buffer); lean = equal-power crossfade between the two nearest loops; openness = low-shelf + high-shelf + density gain over a parallel always-on midrange core |
| **PALETTE** | Prismatic / spectral — deep violet → cyan → green → gold → red, one hue per section, on a graphite/near-black ground |
| **POLE** | Embodied / conducting — the body is the baton for BOTH arrangement density and formal navigation |

## How it works

**Audio is always Karel's real recording** (`loadRealTrackBuffer` from the shared Welcome Home catalog). The body only *transforms* it — no oscillators or synthesized tone anywhere. Every audible node terminates in `createSafeMaster(ctx).input`; the visualizer's reactive glow is driven by `safeMaster.analyser`.

### Signal 1 — OPENNESS → arrangement density

`leftWrist ↔ rightWrist` span normalized by shoulder width → `openness ∈ [0,1]` (falls back to arm-elevation = wrist/elbow height above the shoulders when the wrists drop out of frame). Openness drives, all via `setTargetAtTime(target, ctx.currentTime, 0.14)`:

- **low-shelf** (220 Hz) `−7 … +4 dB` — bass body swells as you open up,
- **high-shelf** (4200 Hz) `−9 … +4 dB` — air/brightness opens,
- **full-bloom gain** `0.05 … 0.9` — overall density,
- a parallel **midrange bandpass core** (~900 Hz) whose gain *rises* as you close (`0.5 … 0.34`), so arms-in gives a thin, quiet solo core that is always alive, and arms-wide blooms the full arrangement.

### Signal 2 — LEAN → travel the form

`leanRaw = 1 − mean(nose.x, shoulder-centre.x)` (mirrored). Auto-calibrated to a neutral centre on the first live frame, with a **Recenter** button. `position = clamp(0.5 + (leanRaw − neutral) · 2.6)`. Position 0→1 travels start→end. Each section is a separate looping source on its own `loopStart`/`loopEnd` span of the one buffer; leaning does an **equal-power crossfade** between the two nearest section loops (`cos`/`sin` of the fractional position) — no buffer scrubbing, no clicks. On screen the figure of light slides between the section stations and the crossfading pair glows brightest.

### Deriving the sections (Foote-style novelty)

Section boundaries are **derived from musical density**, not divided into equal zones. From `loadTrackAnalysis(id)` we bin `notes[]` and `chords[]` into ~0.5 s frames with features `[onset-density, mean-pitch, mean-velocity, chord-change]`, min-max normalize the columns, then compute a **novelty curve**: the feature distance between the mean of the window *before* and the window *after* each frame (a simplified checkerboard). The strongest novelty peaks (min-separated) become boundaries, and the boundary count is snapped to the number of `summary.sections` so each derived span carries the human section label in order (falling back to `Section I…` names).

**Fallback:** if the analysis is null/empty (or too sparse), the buffer is divided into equal zones, an `approximate` flag is set, and an on-screen note ("form map approximate · analysis unavailable · equal zones") plus this README say the form map is approximate.

### Works-when-shipped & graceful degradation

- A mono **tracking-status line** is always visible while running: `tracking · live · section n/N`, or a `text-destructive` lost-state ("body lost · face the camera, shoulders in frame").
- With no body detected the piece runs a **slow auto-travel demo**, explicitly labelled "demo — no body detected" (never indistinguishable from live tracking).
- No camera / permission denied / model-load failure → a **pointer fallback** (mouse-x = lean/travel, mouse-y = openness) with a visible destructive notice.
- No 2D canvas → a visible notice on the start screen.

## Reference

J. Foote, **"Automatic Audio Segmentation Using a Measure of Audio Novelty,"** *IEEE International Conference on Multimedia and Expo (ICME) 2000* — the self-similarity-matrix + checkerboard-kernel novelty method that this form map's lightweight frame-diff novelty curve approximates.
