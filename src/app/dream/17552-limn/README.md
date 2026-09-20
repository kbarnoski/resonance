# 17552-limn — a gaze-steered spectral lens

Where you *look* — plus your face — conducts the dynamics and spectral focus of one of Karel's real piano recordings: the band you gaze at swells forward, the rest recedes.

**Status**: wip — audio graph + WebGL2 render path built and control path traceable; camera/gaze path untested headless (no webcam in the build environment).

## The idea

Karel's *Interplay* (default; a small track menu is offered) plays as a looping `AudioBufferSourceNode`. Its spectrum is laid out conceptually left→low, right→high across the frame. A resonant "focus lens" — literally a bandpass voice summed on top of a receded dry mix — sits wherever you look. Gaze becomes the conductor's baton: the frequency band under your attention blooms brighter and louder while everything else sinks back.

This is the lab's first face/gaze-driven conductor (no prior proto used `createFaceTracker`). It directly cashes the 14 Sept 2026 finding — **Frontiers in Psychology, "Eye gaze in live-electronic music performance"** — that in live-electronic performance, *gazing at an interface element actively shapes what a performer hears* ("where you look is where the sound originates"). The piece turns that passive looking–listening interplay into the actual control mechanism.

## Signal path

Karel's real catalog (`loadRealTrackBuffer`) → `BufferSource` (looping), split into:

- **dry** → `dryGain` (0.62, the receded rest) →
- **wet** → `bandpass` (the focus lens) → `wetGain` (~1.2, the boosted gazed band) →

both → `merge` → `highshelf` (air) → `peaking` (formant) → `lowpass` (whisper cap) → `level` (swell/duck) → **`createSafeMaster(ctx).input`** → speakers.

Nothing touches `ctx.destination`. Visuals are driven from `master.analyser` (`getByteFrequencyData`).

## Mapping — landmark → feature → parameter → effect

| Face signal | Feature | Audio parameter | Visual |
|---|---|---|---|
| Iris centers 468/473 + eye corners 33/133, 362/263 + head position (mirrored) | `gazeX` 0..1 | `bandpass.frequency` (log 110 Hz…7 kHz) via `setTargetAtTime(~0.12s)` | lens center X; magnifies + blooms the gazed column |
| Iris vertical + head pitch | `gazeY` 0..1 | (lens Q shaping) | lens center Y |
| Inter-iris distance | `lean` 0..1 (proximity) | `level.gain` swell + `bandpass.Q` (tighter focus) + `wetGain` | overall intensity; lean-in tightens the lens |
| `browInnerUp` / `browOuterUp*` | `brow` | `highshelf.gain` (0…+7 dB air) | brightens toward the light end of the palette |
| `jawOpen` | `jaw` | `peaking` formant (520→900 Hz, up to +9 dB) | adds to focus bloom |
| `eyeBlinkLeft/Right` | `eyeOpen` (1 − blink) | `lowpass.frequency` collapse (14 kHz→520 Hz) + level duck | everything softens to a whisper |

Detection runs on `requestAnimationFrame`; features are lerped (~0.1s) for visuals and pushed to audio via `setTargetAtTime` (~0.12s). No async in the control path — latency is the brief.

## Visual

Raw **WebGL2** (a full-screen triangle from `gl_VertexID`, no buffers; one fragment shader — **not** three.js, **not** Canvas2D). The live spectrum is uploaded each frame to an `R8` texture and rendered as a luminous cool field of spectral striations; a soft radial glow at the gaze point magnifies and brightens the band beneath it. Cool-luminous indigo→violet→light palette from `_shared/palette` (`PALETTE_GLSL`). No grain / noise pass.

## Graceful degradation

- **No camera / permission denied / model-load failure** → visible `text-destructive` status with an actionable hint; an autonomous **ghost gaze** slowly sweeps the lens across the spectrum so the idea is legible at a glance — always labeled `auto-demo — enable camera to conduct`, never indistinguishable from live tracking.
- **Pointer fallback**: moving the pointer over the field steers the lens manually (yields to live gaze when the camera is on).
- **Face lost** while camera is live → `face lost · face the camera`, holding the last-known feature so audio doesn't lurch.
- **WebGL2 unavailable** → visible notice; audio continues.
- Designed for a seated laptop/desk webcam (waist-up, ~60–150 cm, face centered). No gating on landmarks a seated person lacks.

## Reference

Frontiers in Psychology (14 Sept 2026), *"Eye gaze in live-electronic music performance"* — the looking–listening interplay: where a performer looks is where the sound originates.
