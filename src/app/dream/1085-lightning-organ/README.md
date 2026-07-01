# 1085 — Lightning Organ

**Route:** `/dream/1085-lightning-organ`
**State:** dielectric-storm / electric-terror · **pole:** intense

> _What if your two hands were electrodes, and every branch of lightning that
> cracks into existence between them rang a note — a real dielectric-breakdown
> discharge you conduct with your body?_

Two charged terminals. Between them, a fractal discharge grows the way real
lightning does — not drawn, but **simulated** by relaxing the Laplace equation
and letting the field decide where the arc forks next. Every branch that snaps
into existence rings a note; a downward-forking strike sweeps a descending
pentatonic arpeggio, high at the top of the frame, low at the floor.

## The one question it answers

Can a genuine physical growth model — the same equation used to predict the
fractal dimension of dielectric breakdown — be played like an instrument with
your bare hands?

## How it works

### Technique — Dielectric Breakdown Model / Laplacian growth (`dbm.ts`)

After **Niemeyer, Pietronero & Wiesmann, "Fractal Dimension of Dielectric
Breakdown," _Physical Review Letters_ 52, 1033 (1984)** — the canonical DBM /
Laplacian-growth model.

On a coarse **128×72** potential grid:

1. The two terminals are **Dirichlet sources** held at φ = 1; the growing
   discharge cluster is held at φ = 0.
2. Each frame we run a handful of Gauss–Seidel sweeps of **∇²φ = 0** so the
   potential field relaxes around the current cluster shape.
3. We pick a **frontier cell** (empty, adjacent to the cluster) with probability
   **∝ |φ|^η** via roulette selection, add it to the cluster, and emit a branch
   segment + a note.
4. When the discharge **bridges** the two terminals (or the field is exhausted),
   we flash bright, fire a sub-boom, and **re-seed** — the storm is continuous.

The **η slider** (1 → 6) is the signature control:

- **η ≈ 1** → bushy, DLA-like growth (many short stubby branches).
- **η ≈ 3–6** → sharp, sparse, forked lightning (the field's high-potential
  tips dominate).

### Output — raw WebGL2 (`gl.ts`)

Hand-written `#version 300 es` shaders, **not three.js, not Canvas2D-as-primary**:

- A ping-pong **accumulation FBO** (RGBA16F when `EXT_color_buffer_float` is
  present, else RGBA8). Each frame the previous buffer is **decayed** and the new
  hot arcs are drawn on top with **additive blending** (`SRC_ALPHA, ONE`), so
  arcs leave a fading incandescent trail.
- A present pass with a cheap 5-tap **bloom**, a filmic **tone-map**, a
  **vignette**, and a global luminance multiplier.
- **Fallback chain:** WebGL2 → Canvas2D (same simulation, `lighter` compositing
  with a per-frame fade) → a `text-rose-300` notice.

### Audio (`audio.ts`) — composed from the shared engines

- `startDroneBank` (`_shared/psych/droneBank.ts`) — a just-intonation drone bed
  whose drive is pushed by **branch density**.
- `createVoidReverb` (`_shared/psych/convolutionVoid.ts`) — a cavernous
  convolution tail everything lands in.
- Per branch: a short **FM pluck**, **pitch ∝ height** (quantized to a minor
  pentatonic scale), plus **band-passed noise crackle**.
- A bridging connection: a **low sub-boom** + high **shimmer**.
- Everything routes through a `DynamicsCompressor`. Polyphony is capped at 14
  voices with **voice-stealing** and self-cleaning nodes (no leaks). Audio only
  starts after a user gesture.

### Input — MediaPipe HandLandmarker (`hands.ts`)

Loaded from CDN ESM at runtime (**not an npm dep**):
`@mediapipe/tasks-vision@0.10.14`, `HandLandmarker`, 2 hands, 21 3D keypoints
each (Google MediaPipe).

**hands → terminals → notes:**

- Each hand's **palm centroid** (mean of wrist, index-MCP, pinky-MCP) → one
  terminal position (x mirrored, so it feels like a mirror).
- **Hand separation** + **finger openness** → **field voltage**, which scales
  the relax speed, the growth cadence, and the note energy: bring your hands
  close and open your fingers to make the gap arc fiercely.
- One hand only → it becomes one electrode while the other terminal drifts to
  meet it.

If the CDN import fails, the camera is denied, or no hands are seen, the piece
**seamlessly stays in the autonomous performance** — it never throws or blanks.
A status badge reads emerald `● hands tracked` or amber
`● autonomous — enable camera to conduct`.

## The autonomous fallback (the important part)

This ships as an embodied piece, but it must be **fully demoable with zero
permissions**. With no camera and no input, two terminals orbit on gentle
Lissajous paths, the voltage breathes, lightning cracks between them
continuously, notes ring, and strikes flash and re-seed. The autonomous storm is
the finished performance; hand-tracking is the **upgrade**.

## Safety (photosensitive epilepsy)

The background is a stable near-black; only the thin arcs are bright, and the
accumulation-FBO afterglow means the frame is always a **slowly-fading
accumulation** — it can never full-frame strobe. The optional luminance pulse is
gated through the shared `createSafeFlicker` engine (soft sine, **≤ 3 Hz**,
respects `prefers-reduced-motion`) and is **off by default**.

## Files

- `page.tsx` — the client page: sim/render loop, autonomous drifters, hand-poll
  loop, audio gesture-start, UI (η slider, camera/sound/pulse controls, status
  badge, design-notes modal).
- `dbm.ts` — the pure-TS Dielectric Breakdown Model / Laplacian-growth engine.
- `gl.ts` — the hand-written WebGL2 renderer (accumulation FBO + bloom present).
- `audio.ts` — the Web Audio voice, composed from the shared psych engines.
- `hands.ts` — the MediaPipe HandLandmarker wrapper (CDN ESM, autonomous-safe).

## References

- H. J. Niemeyer, L. Pietronero, H. J. Wiesmann. "Fractal Dimension of
  Dielectric Breakdown." _Physical Review Letters_ **52**, 1033 (1984).
- Google MediaPipe — HandLandmarker (Tasks-Vision), 21 3D keypoints per hand.
