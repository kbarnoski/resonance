# 1042 · Hyperspace Bloom

A drug-free fall toward the DMT **"breakthrough"** — hyperdimensional geometry
with more axes than physical reality allows. This is the lab's first 4D /
hyperdimensional raymarch: a regular **24-cell** polytope rotated through all
six planes of four-dimensional space, **stereographically projected** from 4D
into 3D, and rendered as glowing neon-iridescent structure you drift through.

## Altered state & pole

- **State:** DMT-breakthrough
- **Pole:** INTENSE

The journey is an auto-played ~75s arc: a slow build-up, a surge into the
**breakthrough plateau** where rotation speed, color saturation, neon
brightness and the stereographic "balloon" all peak together, then a gentle
settle — and it loops. The phenomenology evoked (from psychedelic
phenomenology research, *not* a medical claim): "hyperdimensional
bedsheets," negatively-curved / saddle-like space, ultra-saturated
neon-jeweled iridescence, the "more real than real" quality, and continuous
4D rotation that the eye is forced to read as impossible morphing.

## The 4D technique

**Approach B — projected polytope frame (true 4D rotation + stereographic
projection):**

1. The **24-cell** (24 vertices = all permutations of (±1,±1,0,0); 96 edges)
   is generated once on the CPU (`polytope.ts`). The 24-cell is chosen over
   a tesseract for a richer frame while staying tiny and numerically
   bulletproof; a tesseract builder is included as a fallback shape.
2. Every frame, all 24 vertices are rotated by **all six 4D rotation planes**
   — `xy, xz, xw, yz, yw, zw`. The three **w-planes** (`xw, yw, zw`) are the
   "hyper" rotations: they continuously change which 3D slice of the 4D object
   we see, so flat edges bloom, balloon, and turn inside-out. That is the
   hyperdimensional read.
3. The rotated 4D points are **stereographically projected** 4D→3D from a
   pole at `w = +d`. As a vertex's `w` nears the pole it scales toward
   infinity, so near-pole edges explode outward — the classic hyperdimensional
   look. The scale is clamped so the raymarch never sees a degenerate capsule.
4. The 96 projected 3D edges (192 endpoints) are uploaded as a uniform array
   and the **WebGL2 fragment shader** (`shaders.ts`) raymarches a smooth
   (`smin`) union of glowing **capsules** along them, with thin-film
   iridescence, a cosine "jeweled" palette, a volumetric neon halo,
   chromatic aberration toward the rim, and a soft vignette.

This rotate-in-4D-then-stereographic-project pipeline is the standard 4D
raymarch lineage (e.g. the classic Shadertoy 4D hypercube / polytope shaders).

## Audio

Pure Web Audio, synthesized locally (`audio.ts`), no network. A detuned
oscillator stack (saw chord + sine detune partners) feeds a **resonant
low-pass filter that sweeps open** toward the breakthrough, plus a separate
**shimmer** bus. An `AnalyserNode` FFT-analyses our own output and exposes
three bands that feed the visuals:

- **bass → global rotation speed / flow**
- **highs → fine detail / saturation**
- **loudness → neon emissive gain** (mirrors the neural-gain finding)

The master chain ends in a `DynamicsCompressor` acting as a limiter, so the
intense pole never clips or gets harsh. Audio starts only on the user gesture
(the Begin descent button) and is fully torn down on unmount.

## Controls

- **Begin descent** — starts audio + visuals together (required user gesture).
- **Pause / Resume** — freezes motion and suspends audio.
- **Device tilt (optional)** — on phones, tilt nudges the camera. On iOS it
  is gated behind the same Begin button (permission tap); if denied or
  unavailable, the auto-journey silently drives everything. **No pointer is
  used** — pointer-as-primary-instrument is intentionally banned here.

## Safety

This piece does **not** strobe or flicker. All luminance and rotation change
is slow and continuous; there is no high-contrast full-screen flashing in the
3–30 Hz band (photosensitive-epilepsy risk). The Canvas2D fallback uses a
translucent fill for motion trails rather than hard clears, also flicker-free.

## Graceful degradation

- **No WebGL2** → a readable `text-rose-300` notice plus a **Canvas2D
  fallback** (`fallback.ts`) that still shows the same rotating, 4D-projected
  24-cell as an additive glowing wireframe, with audio playing. Never a blank
  screen.
- **No DeviceOrientation (desktop)** → the auto-journey drives everything;
  tilt is purely optional.

## Named references

- **"The Hyperbolic Geometry of DMT Experiences"** — QRI / Andrés
  Gómez-Emilsson (the hyperbolic / negatively-curved geometry thesis of
  high-dose psychedelic phenomenology).
- **Bressloff & Cowan et al.** — geometric visual hallucinations and cortical
  **form-constants** (the math of how spontaneous cortical activity maps to
  perceived geometric form).
- The standard **4D-rotation-then-stereographic-projection raymarch** technique
  (the classic Shadertoy 4D hypercube / polytope shader lineage).

All framing here is **phenomenology**, never a medical or therapeutic claim.

## Known limitations

- The neon halo + iridescence are tuned for a laptop GPU; on very weak
  integrated GPUs the raymarch step cap (88) may show slight banding in the
  volumetric glow.
- The 24-cell's 96 edges are uploaded as a fixed `u_edges[192]` uniform array.
  Larger polytopes (120-cell, 600-cell) would exceed typical fragment uniform
  limits and would need a data-texture path instead.
- Stereographic balloon is clamped to keep capsules finite, so the very
  extreme near-pole "infinite" blow-up is bounded for robustness.
- Device-tilt steering is a gentle nudge layered on the auto-orbit, not full
  free-look.

## Files

- `page.tsx` — client component: UI, GL rig, render loop, audio/tilt wiring,
  teardown, Canvas2D fallback selection.
- `polytope.ts` — 24-cell / tesseract generation, 6-plane 4D rotation,
  stereographic 4D→3D projection.
- `shaders.ts` — WebGL2 vertex + raymarch fragment shaders.
- `timeline.ts` — the ~75s auto-journey breakthrough envelope.
- `audio.ts` — synthesized breakthrough drone + FFT self-analysis + limiter.
- `fallback.ts` — Canvas2D rotating-wireframe fallback.
