# 248 · Kids Stir Garden

**The one question:** _What if a 4-year-old could GROW a living, glowing garden of
organic patterns just by MOVING their body in front of the camera — and hear it bloom?_

A whole-body motion mirror where movement seeds a **Gray-Scott reaction-diffusion**
simulation running entirely on the GPU. Where the child moves, living coral/leopard-spot
Turing patterns bloom in glowing bioluminescent color, and the garden gently sings.

---

## What it is

- **Input:** webcam whole-body motion via **zero-dependency frame differencing**
  (no MediaPipe, no ML). Each frame the live video is drawn tiny (64×48) to a hidden
  offscreen 2D canvas, grayscaled, and compared to the previous frame. The per-pixel
  `|gray − prevGray|` is motion energy. The video is drawn **mirrored** so it feels like
  a mirror, and the offscreen canvas is cleared after each diff (nothing is stored).
- **Simulation:** raw **WebGL2** ping-pong fragment shaders (two framebuffers, render-to-
  texture) running Gray-Scott reaction-diffusion. No three.js.
- **Output:** a display shader maps the `v` chemical concentration to a glowing ramp
  (deep teal → green-teal → coral → gold on near-black) with edge-glow bloom and a slow
  breathing shimmer.
- **Sound:** an always-on ambient pad plus a C-major-pentatonic note per horizontal zone,
  rung gently when motion crosses a threshold — through a `DynamicsCompressor` limiter so
  nothing is ever harsh.

## The reaction-diffusion math

Gray-Scott models two chemicals `u` and `v`. `v` autocatalytically consumes `u`
(`u + 2v → 3v`), and `v` decays. Per simulation step:

```
u' = Du * ∇²u − u·v²  + feed·(1 − u)
v' = Dv * ∇²v + u·v²  − (kill + feed)·v
```

- The Laplacian `∇²` is a 3×3 neighbor stencil (orthogonal weight 0.2, diagonal 0.05,
  center −1.0) sampled from the state texture (`r = u`, `g = v`), with `REPEAT` wrap so the
  garden tiles seamlessly at the edges.
- **Parameters chosen:** `feed = 0.037`, `kill = 0.0603`, `Du = 0.16`, `Dv = 0.08`,
  `dt = 1.0`, **6 sim steps per displayed frame**.
- **Why these values:** this `(feed, kill)` neighborhood sits in the lively "growing spots /
  mitosis" region of the Gray-Scott parameter map — patterns keep dividing and spreading
  (organic, coral-like) rather than freezing into static stripes or dying out. `Dv ≈ Du/2`
  is the classic ratio that makes Turing instability happen at all. Running 6 sub-steps per
  frame lets patterns evolve visibly fast without using a large `dt` (large `dt` is what
  makes Gray-Scott explode / go NaN), and the shader `clamp`s `u,v` to `[0,1]` as a safety
  net.

## Motion → seed → sound mapping

1. **Seed:** motion energy is written into the alpha channel of a small (64×48) "seed"
   texture, mirrored horizontally. The RD update shader adds that alpha to `v` (and slightly
   depletes `u`) at the corresponding location — so moving literally injects new living
   pattern where the child is. The seed is injected on the first of the 6 sub-steps each
   frame, then cleared.
2. **Notes:** the frame is divided into 5 horizontal zones, each a pentatonic note
   (G3 → C4 → D4 → G4 → A4, low-left → high-right). When a zone's motion crosses a threshold
   (with a ~360 ms refractory window per zone so it's never a machine-gun) the note rings:
   sine + triangle octave, gentle 50 ms attack / ~1 s release, fed into a feedback-delay
   shimmer bus, all summed through the compressor/limiter. Velocity scales note loudness
   within a safe cap.
3. **Pad swell:** total motion gently raises the ambient pad gain (smoothed), so a dancing
   child makes the whole garden breathe louder.
4. **Auto-bloom:** after ~3 s of stillness a small seed is auto-injected on a slow cadence,
   so the garden keeps gently growing on its own and never looks dead.

## Degradation behavior

- **Camera denied / unavailable →** falls back to **pointer/touch "stir" mode**: dragging a
  finger injects seed and rings the zone note under the finger. The reason is shown in
  `text-rose-300`. (Pointer stir also works additively even when the camera is on.)
- **No WebGL2 →** the RD shaders are GLSL ES 3.00 and need WebGL2, so if it's unavailable a
  readable notice is shown and the ambient pad keeps playing.
- **No float color buffer →** tries `EXT_color_buffer_float`, then `..._half_float`, then
  falls back to 8-bit `RGBA`/`UNSIGNED_BYTE` state (lower precision, still runs).
- The state texture is initialized on the GPU (an init shader paints `u=1, v=0` plus a few
  starter blobs), which works identically for FLOAT / HALF_FLOAT / UNSIGNED_BYTE targets.

## Privacy

The video element is hidden (1px, opacity 0) and used only for diffing. Each frame's pixels
are discarded immediately (offscreen canvas cleared after the diff); nothing is recorded or
uploaded. All camera tracks are stopped and GL resources / rAF / AudioContext are disposed
on unmount.

## Kids design

No reading required (🌱 / ✨ icons, a color strip showing the zone notes); large tap targets
(start button ≥64px); immediate visual + audio response; no fail states; safe sounds only
(gentle envelopes, octave-limited, compressor/limiter, no sudden loud or shrill transients).

## Named references / lineage

- **Amanda Ghassaei** — Gray-Scott reaction-diffusion WebGL shader, and her directed
  vector-field RD variant (GPU ping-pong RD in the browser).
- **cake23.de** — "Turing pattern fluid" WebGL demo.
- **Karl Sims** — reaction-diffusion tutorial (the canonical Gray-Scott explanation +
  parameter map this prototype's feed/kill values are picked from).
- **Daniel Rozin** — motion-mirror lineage (the body-as-input, mirrored interaction).

Fresh from a 2026 research dive on interactive Gray-Scott shaders in the browser.

## Honest limitations

- **RD stability:** Gray-Scott is sensitive to `dt` and feed/kill. The chosen values are
  stable in testing, but extreme/continuous seeding can locally saturate `v`; the shader
  `clamp` keeps it from going NaN but very dense areas just plateau to gold rather than
  collapsing — acceptable visually, not physically exact.
- **Perf:** 320×240 grid × 6 sub-steps/frame is smooth on a recent iPad/desktop; very old
  mobile GPUs may drop frames (lower `SIM_W/H` or `SIM_STEPS_PER_FRAME` to recover).
- **Motion mapping is coarse:** 64×48 frame-diff is enough for "where did the body move"
  but won't distinguish a hand from a head; it's a whole-body energy field, by design.
- **8-bit fallback** quantizes the chemicals; patterns are blockier and may be less lively
  than the float path.

## Next-cycle deepening ideas

- Let total pattern *activity* (sampled back from the GPU via a tiny mipmap/readback) drive
  pad timbre, not just motion — so a busy garden actually sounds busier.
- Multiple feed/kill "biomes" the child can wipe between (spots ↔ stripes ↔ coral) by moving
  to different screen regions.
- Color the bloom by *which zone* seeded it, so each note has a matching living hue.
- A directed-vector-field variant (Ghassaei) so patterns flow in the direction of motion.
- Two-player: two bodies seed with two different palettes that interact at the boundary.
