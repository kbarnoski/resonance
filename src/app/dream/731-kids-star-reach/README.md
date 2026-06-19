**For**: kids (4+)

# 731 · Star Reach

> "What if a 4-year-old could reach UP into a deep night sky with their BARE
> HANDS — no screen to touch — and scoop handfuls of glowing stars that chime?"

Star Reach is an **off-glass, embodied** instrument. There is nothing to tap.
A child stands in front of the front camera, lifts their hands into the air,
and a deep field of ~2,600 glowing stars responds. **Close a hand into a fist**
and the nearest stars are scooped into your palm, each one ringing a soft
pentatonic bell — a little cluster. **Open your hand wide** and they spill back
out in a rising sparkle of an arc. **Raise your hands higher** for brighter,
higher tones; keep them low for warm, low ones. There is no beat, no loop, no
"wrong" note — only cause, effect, and luminous wonder.

## How it works

- **Input — MediaPipe Hands (off-glass).** The front camera feeds Google's
  HandLandmarker. It is **analysis-only**: we read 21 landmark points per hand
  and immediately discard the frame. Nothing is ever drawn from the camera,
  recorded, or transmitted. Openness is derived from the mean fingertip spread
  normalised by hand size (wrist→palm distance), so it is robust to how close
  the child stands. A fist→open transition fires a discrete *spill*; an
  open→fist transition fires a *gather*, with hysteresis so each gesture rings
  once, cleanly.

- **Output — raw WebGL2 (GLSL ES 3.00).** The star field is hand-written WebGL2
  — **not three.js, not Canvas2D-primary.** A full-screen quad paints a deep
  night-sky gradient with a faint drifting nebula; ~2,600 stars are drawn as
  `gl_PointSize` point sprites with a radial-glow fragment shader and
  **additive blending** (`SRC_ALPHA, ONE`), depth-faded and slowly parallaxing.
  Physics (gather / spill / spring-home drift) runs on the CPU so the behaviour
  is identical across render paths.

- **Audio — Web Audio API.** An always-on **open-fifth drone bed** (root + fifth
  + soft octave, gently detuned) means the sky is never silent. Gather rings a
  small **bell cluster**; spill plays a **rising glissando arc**. Everything is
  drawn from a justly-tuned **major-pentatonic ladder**, so nothing can sound
  wrong. Bells use a slow attack and long decay — no loud transients.

- **Kids-safe master chain (as specified):**
  `voices → masterGain (0.26) → lowpass (≤7200 Hz) → DynamicsCompressor
  (threshold −10, ratio 20:1) → destination`.

## Degrades gracefully (first-class)

- **Camera denied / MediaPipe fails →** two **ghost hands** keep reaching up,
  scooping and spilling, so the piece is always alive and singing. A notice
  appears in `text-rose-300`. If real hands vanish for ~3.5 s, the ghost demo
  resumes automatically.
- **WebGL2 unavailable →** an inline **Canvas2D** fallback reproduces the exact
  same gather/spill glow-dot physics (additive `lighter` compositing) and still
  rings the bells. A small badge shows which path is live (`WebGL2 ◈` /
  `Canvas2D ◇`).
- **Alive on load (~within 2 s):** the moment you tap Begin, the drone fades in
  and the ghost hands start scooping stars — a silent glance already reads as
  music.

iOS: the AudioContext and `getUserMedia` are both requested **inside the first
tap** (the big START button) and the context is resumed there. Full teardown on
unmount stops camera tracks, deletes WebGL programs/buffers/VAOs and loses the
context, closes the AudioContext, cancels the rAF loop, and disconnects the
ResizeObserver.

## Tags (held)

- MediaPipe-hands camera **INPUT** — off-glass, analysis-only.
- raw-WebGL2 GLSL **OUTPUT** — NOT Canvas2D-primary, NOT three.js.
- gesture particle-gathering + spatial bell-cluster **TECH** — NOT loop/groove.
- awe / wonder **VIBE**.

## Named references

- **MediaPipe Hands** (Google) — the off-glass hand-landmark input.
- **Journey** (thatgamecompany) — wordless, awe-first, "every gesture is
  beautiful, nothing is wrong" design ethos.
- **Inigo Quilez** — additive point-glow / GLSL field lineage informing the
  radial-glow star shader and the deep-space backdrop.

## Ambition self-assessment

Ambition is **high** for the renderer-scarce, iOS-reliability angle: a fully
hand-written WebGL2/GLSL additive point-glow field with no three.js and no CDN
renderer dependency, paired with embodied hand gestures and a never-silent
pentatonic bell instrument — plus a genuinely first-class Canvas2D fallback
that shares the same physics. Where it is deliberately **modest**: the
gather/spill simulation runs on the CPU (clear, debuggable, identical across
paths) rather than as a GPU compute pass, and the star count (~2,600) is tuned
for smooth mobile framerates over spectacle. The core bet — that a 4-year-old
scooping handfuls of singing stars out of the air needs *legibility and
reliability* more than particle volume — is the build's strongest and most
testable claim.
