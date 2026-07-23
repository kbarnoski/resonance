# 2388 — Round

**The one question:** *What if your body were a live looper pedal — you move
for a few seconds, that gesture becomes a looping ghost that keeps replaying
forever, and you layer new gestures on top, until a whole round/canon of your
past selves is moving and singing at once?*

## The mechanic: accumulating independent loops (no master knob)

This piece has **no single "intensity" fader**. Its state variables are your
**past selves**. A record action captures the next ~7 seconds of your motion
into a **loop clip**; when the window closes the clip becomes a **persistent,
autonomously-replaying layer** with its own clock. You can lay down several,
and they all keep going — a growing polyphony, like a live vocal looper.

Each layer carries a tiny playback-rate detune, so the loops **drift out of
phase** against one another over minutes (Steve Reich phasing). What you hear
and see at minute five is the sum of every layer you left behind — it is a
genuine **long-form, stateful, accumulating** piece, nothing like minute one.

## Subsystems

- **Input — `flow.ts`.** Webcam via `getUserMedia`, frames drawn to a 160×120
  offscreen canvas, grayscale frame-differencing → a smoothed **motion
  centroid** (normalized `[-1,1]²`) + **energy** per frame. No MediaPipe, no
  npm deps.
- **Looper — `loops.ts`.** Arms a fixed record window, captures timestamped
  samples, resamples the closed clip to an even-time path, and replays it
  forever on a drifting clock (`performance.now()` throughout). Auto-arm fills
  continuously up to a 6-layer cap; `clearLast` / `clearAll` prune the state.
- **Output — `visual.ts` (three.js, `import * as THREE`).** Each layer is a
  faint closed ghost line (its whole recorded shape) plus a bright pale head
  retracing it; each sits at its own depth so accumulating loops become a
  visible canon of circling past selves. LIVE-you is the brightest figure — a
  cool-accent head trailing its recent motion. Gentle slow camera drift.
- **Audio — `audio.ts` (Web Audio).** One independent voice per layer forms a
  round/canon: centroid-Y → pitch quantized to a warm pentatonic scale,
  energy → amplitude, each on its own loop clock. LIVE-you plays the top voice.
  Shared synthesized-impulse convolution reverb + a soft compressor. Oscillators
  only — no samples, no external files.

## Palette

Ikeda near-monochrome — pale-grey / white figures (`#f4f6f8`, `#aeb6bd`) on
near-black (`#050607`), with one restrained cool accent (`#8fbfff`) for
LIVE-you. Deliberately not warm, not violet-to-gold. Raw hex lives only inside
the three.js art layer; all chrome uses semantic tokens.

## Degrades gracefully

- **No camera / permission denied:** a **seeded, deterministic auto-performer**
  (slow Lissajous of `performance.now()`, no `Math.random()`) drives the motion
  and auto-arm keeps laying down new layers, so the accumulating-canon idea
  fully self-demos with zero camera. An on-brand `text-destructive` note
  explains it. Complete and compelling on a phone with the camera denied.
- **No WebGL:** on-brand notice, audio keeps playing, no crash.

## Lifecycle / safety

AudioContext and camera are created only inside the user "Begin" gesture. On
unmount/stop everything is released: `cancelAnimationFrame`, all audio nodes
stopped and `ctx.close()`, every camera `MediaStreamTrack` stopped, all
three.js geometries / materials / renderer disposed. No strobe; all motion and
any flicker stay gentle (≤3 Hz).

## References

- *"Moving Contexts: How Culture, Context, and Movement Histories Shape
  Whole-Body Interaction in Aesthetic Environments"* — MOCO 2026 (10th Intl
  Conference on Movement and Computing), ACM DOI `10.1145/3802842.3802852` —
  for treating **movement history as material**.
- **Steve Reich's phase music** (*Piano Phase*, *It's Gonna Rain*) — for the
  accumulating-loops-drifting-out-of-phase structure.
- Live-looper practice — the piece is, in spirit, a **vocal looper for the
  body**.

## Honest caveats

- Frame-difference optical flow tracks *where motion is*, not a skeleton, so
  broad limb gestures read best; a still body simply lets the existing layers
  breathe. Busy or shifting-light backgrounds add noise to the centroid.
- Layers are capped at six (plus live) for audio/render headroom; beyond that,
  clear a layer to make room rather than piling on indefinitely.
- Phase drift is subtle by design — it reveals itself over minutes, not
  seconds, which is the point of a long-form piece.
