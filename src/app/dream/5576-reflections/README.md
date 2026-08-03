# Reflections (5576)

**The one question:** *What if you could walk into a room and HEAR its shape — every wall throwing the sound back at you, the echoes reshaping around you as you move?*

A navigable acoustic room where the reverberation is computed by real *geometric acoustics* — the **image-source method** — rendered binaurally over headphones, with every reflection path drawn live on a top-down architectural plan. Visuals are inline SVG only (no Canvas, no WebGL). Audio is built from scratch on the Web Audio API — no audio libraries.

## The technique — the image-source method (in plain language)

A specular reflection off a flat wall behaves *exactly* like a straight, unobstructed path arriving from a **mirror-image of the source**, reflected across that wall. So instead of tracing bouncing rays, you mirror the source across each wall to get the first-order reflections, mirror those images again for second-order, and so on. Because a rectangular ("shoebox") room is convex and axis-aligned, every image source corresponds to a physically valid path — no visibility test needed.

For this 2D shoebox room (`8 × 5 m`) we build the lattice up to **order 2**: mirroring across each of the 4 walls, then across the walls again (skipping the wall just used, which would be a no-op). That is a bounded **17 image sources per voice** (`1` direct + `4` first-order + `12` second-order). With 3 voices that is 51 image sources / audio taps total.

Each image source becomes one **audio tap**:

- **delay** = pathLength / 343 m/s (`DelayNode`)
- **gain** = reflectionCoeff^order / max(1, pathLength) — 1/r spreading plus per-bounce wall absorption (coeff `0.72`)
- **air-absorption low-pass** whose cutoff falls with path length (longer path → duller)
- **HRTF spatialization** — the tap is routed through its own `PannerNode` (`panningModel: "HRTF"`) positioned in the *direction of the image source relative to the head*, so the reflection genuinely arrives from the wall that threw it. The direct path is its own HRTF panner at the real source.

As the listener walks, `RoomAudio.update()` recomputes every distance, delay, gain, cutoff and panner position and re-ramps them with `setTargetAtTime` (no zipper noise). **This is the payoff: the acoustics re-render around you.**

## Subsystems

- **`acoustics.ts`** — pure math. Builds the image lattice (`buildImageSources`), and for a given listener computes each tap's path length, delay, gain, air-absorption cutoff, world direction, and the *folded bounce path* (source → bounce points → listener) by back-tracing the unfolded straight line to the image. No audio, no DOM — testable in isolation.
- **`audio.ts`** — the Web Audio graph. Three just-intoned voice-pads (major triad 1/1, 5/4, 3/2 over A2), each two detuned sawtooths → gentle low-pass, breathing on a slow deterministic LFO so the room is always ringing. Every tap: `pad → DelayNode → low-pass → gain → HRTF PannerNode → master`. Everything sums through a `DynamicsCompressor` limiter with master gain ≤ 0.2. The `AudioListener` is held at identity and the panners are moved instead (avoids cross-browser listener-orientation quirks).
- **`page.tsx`** — the client component: the rAF simulation loop (movement, seeded auto-tour, throttled audio re-render + throttled SVG snapshot), keyboard + click-to-move + device-orientation input, and the inline-SVG architectural plan.

## Visuals (SVG only)

A top-down plan draws: the room walls (violet hairlines), the **folded reflection path** to each source (bolder / more opaque = louder tap), dashed **ghost lines** out to the first-order **mirror images** beyond the walls (with dim image-source markers, which makes the whole method self-explanatory), the breathing sources, and the **listener head-marker** with its facing triangle. A mono readout shows room size, listener xy, active tap count, and the dominant reflection delay in ms. The full concept is legible from the SVG alone, in silence.

## Input

- **Navigate:** WASD / arrow keys (walk relative to facing), or **click a point on the plan** to walk there (click-to-move target — no drag gestures).
- **Head-turn:** `DeviceOrientationEvent` on mobile (iOS `requestPermission()` gated behind the Start button) rotates the binaural field; on desktop Q/E or ←/→ rotate facing. Full keyboard fallback; a `text-destructive` note appears if orientation is unavailable or denied.
- **Seeded auto-tour:** if you do nothing, a `mulberry32(0x5576)`-seeded loop walks the listener slowly around the room so the piece self-demos hands-free and the rays sweep. Any real input takes over.

## Determinism & safety

All randomness via a local `mulberry32` seeded `0x5576`; no bare `Math.random`, no argless `Date.now()` — timing from `performance.now()` (via rAF timestamps). AudioContext is created only after the Start gesture. Clean teardown of rAF, AudioContext, and the deviceorientation listener on unmount. No strobe/flicker — slow luminance drift only. Degrades gracefully: no headphones / no audio → the SVG plan + auto-tour still tell the whole story; orientation denied → keyboard nav still fully works.

## References

- **Allen, J. B. & Berkley, D. A.** "Image method for efficiently simulating small-room acoustics," *J. Acoust. Soc. Am.* 65(4), 1979 — the origin of this technique.
- Spatial-sound-installation lineage: **Max Neuhaus** (*Times Square*, the first permanent sound installation), **Bernhard Leitner** (sound architecture), **Maryanne Amacher**.
- **arXiv:2604.05545**, "Multimodal Deep Learning for Real-Time Spatial Room Impulse Response Computing" (April 2026) — keeps geometric early reflections as an explicit real-time module precisely because they are what learning can't approximate, validating this classical from-scratch core.

## What still needs a real review

The binaural directionality only lands **on headphones**, and head-turn only truly comes alive on a **real phone** with a tilt sensor. On speakers or a laptop the timing and the visual plan read clearly, but the full spatial reflection field — hearing a reflection swing to your left as you turn — needs the headphones + device combination to feel.

## Ambition-floor tally

- [x] Audio **and** visual — both, always (SVG plan self-demos silently; three ringing voices with live binaural reflections).
- [x] The substance — the image-source method implemented from scratch (order-2 lattice, 17 images/voice), no audio libraries.
- [x] Recomputes as the listener moves — delays, gains, cutoffs, panner positions all re-ramp on every move.
- [x] SVG/DOM only — no Canvas2D, no three.js, no WebGL.
- [x] Deterministic — `mulberry32(0x5576)`, `performance.now()` timing.
- [x] Degrades gracefully — no headphones / orientation denied both handled; no unhandled throws.
- [x] House style — semantic tokens, violet art ramp, ≥44px buttons, mono labels only for readouts, design-notes affordance.
