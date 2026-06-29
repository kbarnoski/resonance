# 1057 — Face Bloom

**The one question:** *What if your FACE is the psychedelic instrument — your
expressions sculpt an altered-state visual field and its sound, with no drug?*

Face Bloom turns your webcam into an expression controller. There is no preset
to watch; the visual field and the organ underneath it are quiet and near-still
until *you* emote. Open your jaw and the kaleidoscope blooms; raise your brows
and it heats up and densifies; turn your head and you tour the geometry. The
face is the instrument — you play it by feeling something.

## How to play (the expression → parameter map)

The MediaPipe **Face Landmarker** task emits **52 ARKit-style blendshape
coefficients** in `[0,1]` every frame, plus a **4×4 head-pose matrix**. Those
are distilled in `mapping.ts` and fed to both the Canvas2D renderer
(`render.ts`) and the Web Audio organ (`audio.ts`) through one shared
`deriveDrive()` — so a smile *sounds* like it *looks*.

| Expression (blendshape / pose) | Parameter | Effect |
| --- | --- | --- |
| `jawOpen` | fold-count + master swell | Blooms the N-fold kaleidoscope (chrysanthemum opening, **2 → ~12**) and swells gain + opens a lowpass. |
| `browInnerUp` (+ outer brows) | form-constant `freq` + warmth | Denser rings/spokes; hotter, more saturated palette; brighter organ. |
| eye-aspect (inverted `eyeBlinkLeft/Right`) | entropy / detail | Narrowing your eyes thins the gate so more fine petals appear. |
| `mouthSmileLeft/Right` | bloom radius + shimmer voice | Smiling pushes the palette toward gold and adds a high shimmer voice. |
| head **yaw / roll** (from the pose matrix) | handedness + come-up drift + form tour | Yaw sets spiral handedness and inward `phase` drift; yaw+roll continuously morph across **tunnel → spoke → spiral → honeycomb**. |
| deliberate slow **squint/blink** (held) | opt-in phosphene shimmer | Only when the shimmer toggle is ON: a soft luminance shimmer, routed through `safeFlicker` (≤3 Hz, off by default). |

**Idle = quiet.** No face (or a neutral one) collapses every parameter toward
the resting field: master gain ducks, partials drop to a breath, and the
kaleidoscope nearly stops. It comes alive only as you express.

**No camera / blocked / CDN fails?** It degrades gracefully — a `text-rose-300`
notice appears and **sliders** for `jawOpen / browUp / entropy / yaw` let you
play the same instrument. It is never a dead screen.

## How it works

- **Geometry engine (composed, not re-derived):** imported from
  `../_shared/psych/logpolar` — `screenToCortex` / `cortexToScreen`,
  `formConstant`, `honeycomb`, `FORM_PHI`, `FORM_CONSTANTS`. The renderer lays
  kaleidoscope petals out in **cortical `(u = log r, v = θ)`** space, modulates
  them with the form-constant field, and places each on screen via the inverse
  `exp()` warp. This is genuinely one stripe/hex pattern seen through the
  log-polar warp — the renderer just folds it N-fold and reflects alternate
  wedges into a kaleidoscope.
- **Output is Canvas2D**, deliberately — *not* a WebGL fragment shader (banned
  this cycle). Petals are drawn as additive (`lighter`) glowing arcs with a
  warm trailing fade for bloom persistence.
- **Audio** is a self-contained Web Audio organ: a just-intonation
  stacked-fifths voice bank (`1, 3/2, 9/8, 5/4, 15/8, 3` over ~D2) of detuned
  sine/triangle oscillators + a soft sub pad + a smile-gated shimmer voice, run
  through a **synthesized convolution reverb** (the IR is rendered in an
  `OfflineAudioContext` — no external file) and a `DynamicsCompressor` limiter
  on the master. `jawOpen` swells gain and opens the lowpass; brow raises a
  high-shelf brightness. Audio starts only on the **Start** tap (gesture-gated)
  and is fully torn down on unmount.

## References

- **MediaPipe Face Landmarker / blendshapes** — Google MediaPipe Tasks-Vision;
  52 ARKit-style facial blendshape coefficients + a facial-transformation
  (head-pose) matrix, loaded here from the jsDelivr CDN at runtime (no npm dep).
- **Bressloff & Cowan et al., 2001** — *"Geometric visual hallucinations,
  Euclidean symmetry and the functional architecture of striate cortex"* — the
  retina→V1 complex-logarithm (log-polar) map: concentric rings ↔ vertical
  cortical stripes, spokes ↔ horizontal, spirals ↔ diagonals, lattices ↔
  hexagons. This is the warp the renderer uses.
- **Heinrich Klüver's four form constants** — lattices/honeycombs, cobwebs,
  tunnels/funnels/cones, and spirals — the recurring vocabulary of
  hallucinatory geometry across psychedelics, migraine, hypnagogia and flicker;
  a property of visual cortex, not any drug.
- **Psilocybin open-eye phenomenology** — reports of fractal-enhanced, warm
  "breathing" geometry that intensifies with emotional engagement; the
  palette here (deep ember → rust → amber → gold, never cold) and the
  emote-to-bloom coupling are reaching for that *intense-warm* pole.

## What's unverified

This was built in a container with **no camera and no audio output**, so the
following are *reasoned, not yet seen or heard*:

- **Expression-coupling feel.** The blendshape → parameter gains (e.g. how much
  `jawOpen` should bloom the fold-count, the smoothing time constants) are
  tuned by intuition; whether emoting feels expressive vs. twitchy needs a real
  face in front of a real camera.
- **Organ balance.** The just-intonation partial levels, reverb wet/dry, and
  the jaw→lowpass sweep were chosen by ear-in-the-head; the actual mix and
  whether the limiter is doing the right thing are unheard.
- **Blink-shimmer.** The deliberate-squint detection threshold and the
  `safeFlicker` shimmer have not been observed live; the squint heuristic may
  need a longer hold to avoid triggering on normal blinks.
- **MediaPipe head-pose Euler extraction.** The yaw/roll/pitch sign and range
  normalization from the 4×4 matrix are derived from the documented
  column-major layout but not confirmed against a live pose.

## Safety

Any luminance flicker is routed through `../_shared/psych/safeFlicker`:
**off by default**, opt-in via the shimmer toggle, **hard-clamped to ≤3 Hz**
(well below the photosensitive danger band), a *soft sine* with a luminance
floor (never a hard 0↔1 strobe), with an instant kill and `prefers-reduced-
motion` honored (downgraded to a sub-perceptual drift, and the loop smooths
more slowly). A photosensitivity note is shown whenever the shimmer toggle is
exposed. With shimmer off, the field uses only slow luminance drift.
