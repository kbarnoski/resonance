**For**: kids (4+)

# Ball Pit — design notes

**Route**: `/dream/460-kids-ball-pit`
**Status**: demoable

What if a 4-year-old could tip the phone and pour a thousand singing marbles that pile, slosh, and chime as they collide? This prototype fills the screen with ~900 glowing balls that respond to device tilt (or finger-drag as fallback) — tip left and the whole pile slides to that corner; tip right and it sloshes back. Every ball-ball collision whose impact speed exceeds 60 px/s rings a soft bell pitched to a D-major just-intonation hexachord. A cascade of balls tumbling into a corner becomes a sparkling arpeggio; a gentle slosh is a few soft chimes. Tap anywhere to pour in a fresh handful; a two-finger fast swipe scrambles the pile into a glittery run.

---

## The idea

The pitch is physical: the sound comes from the collision, not from a sequencer. The child is the composer — the instrument is gravity. Color is the language: each ball has a hue (continuously distributed around 360°) that maps visually without any reading required.

---

## Collision technique

**Broad phase:** uniform-grid spatial hash. Each frame, every ball is bucketed by `floor(x / cellSize)`, `floor(y / cellSize)`. The cell size is 2.2× the maximum ball radius, so any overlapping pair shares at least one of the 9 neighbourhood cells. This reduces O(n²) pair checks to approximately O(n) amortised.

**Narrow phase:** for each candidate pair, compute the penetration overlap `minDist - actualDist`. If overlapping, apply a positional correction split by mass ratio (heavier ball moves less), then apply a velocity impulse along the collision normal proportional to `(1 + restitution) × relativeVelocity` — the standard rigid-body contact model.

**Reference:** Müller, M., Heidelberger, B., Hennix, M. & Ratcliff, J. (2007). *Position Based Dynamics*. Journal of Visual Communication and Image Representation, 18(2), 109–118. The positional correction step is the PBD constraint formulation; the velocity impulse is the complementary velocity update for non-penetration.

---

## Audio design

**Scale:** D-major just-intonation hexachord: D E F♯ A B D′ — 6 pitches × 2 octaves = 12 discrete pitches anchored on D3 (146.83 Hz). The just ratios 1 : 9/8 : 5/4 : 3/2 : 5/3 : 2 eliminate beating; every pair of simultaneously triggered bells is consonant.

**Bell voice:** sine fundamental + inharmonic partial at ×2.756 (approximates a real bell's third partial) + a 12 ms noise burst band-passed near the fundamental. Attack 8 ms, exponential decay to silence over ~1.1 s.

**Ambient pad:** a soft D3–F♯3–A3 triad at very low level (≈−35 dBFS) with gentle LFO tremolo keeps the experience sonically alive even when no collisions are happening. Required by the brief: "never silent."

**Safety chain:** all voices route through a dynamics compressor (threshold −18 dBFS, ratio 4:1) and then a brick-wall limiter (threshold −2 dBFS, ratio 20:1). Peak output is strictly bounded — no transient can pierce.

**Named reference:** *Party: A WebGPU Particle Physics Playground* (webgpu.com, Jan 23 2026) — thousands of GPU-collided particles as a musical instrument; inspired the "collision as instrument" framing here. This prototype uses CPU physics and WebGL2 rendering rather than WebGPU for broader compatibility.

---

## Renderer

WebGL2 instanced quads. One `drawArraysInstanced` call per frame draws all balls regardless of count (~900–1400). Each instance carries: center position (2 floats), radius (1), hue in [0,1] (1), flash intensity (1). The fragment shader computes the ball core + glow ring from `length(vUV)` and additively blends. Background clear colour is a deep dark blue (`#090a12`). Premultiplied alpha, additive blending for glow.

---

## Controls

| Gesture | Action |
|---|---|
| First tap | Boots AudioContext + requests DeviceOrientation permission (iOS 13+) |
| Device tilt | Gravity follows phone orientation (gamma = left/right, beta = front/back) |
| Single-finger drag | Pointer fallback — steers gravity direction |
| Tap (short, no drag) | Drop ~24 fresh balls at tap point, with a cascade of 7 chimes |
| Two-finger fast swipe | Scramble all balls + sparkle run |
| Auto-demo | If no input for 4 s, gravity gently rocks the pit so it self-demos |

---

## Graceful degradation

- **No DeviceOrientation / iOS denied:** gravity defaults to pointer-drag control.
- **No WebGL2:** a clear readable error screen (no crash).
- **AudioContext suspended (iOS):** `bootAudio()` is called only inside the first pointer-down gesture; `resume()` is called if the context is already open but suspended.

---

## Known limitations / honest notes

- **Unverified on real GPU/sensor hardware** beyond desktop Chrome on Linux. Physics performance at 1400 balls has not been profiled on low-end Android or older iOS.
- The spatial hash `processed` pair set uses `id` integers packed as `lo * 1048576 + hi`; this saturates if ball ids exceed ~1M (not reachable in a session).
- DeviceOrientation beta/gamma values vary by device orientation lock setting; no quaternion correction is applied.
- Two-finger shake relies on `pointerCount >= 2` via a simple counter; on some devices all touch points may share a single pointer event stream.
