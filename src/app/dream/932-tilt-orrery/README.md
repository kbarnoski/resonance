# 932 · Tilt Orrery

**What if you could TILT a little cosmos and the gravitational RHYTHM of orbiting bodies became the music?**

A field of glowing bodies orbits a central mass on a `<canvas>`. Tilting the
device (or dragging / auto-drift) tips the whole cosmos like a bowl, shifting
orbits and bunching bodies together. **Every time a body sweeps through
perihelion — its closest approach to the center — it fires one bell/thud.**
The composition is the emergent *polyrhythm* of all those orbital passes.

Pitch is held deliberately dumb (a low drone + a fixed pentatonic for the
bells) so the music lives in **rhythm, density and space**, not pitch theory.

## How to use it

1. Tap **Start**. Audio and the cosmos come up within ~0.6 s.
2. On a phone/tablet, **tilt the device** to tip the bowl. (On iOS the Start tap
   triggers the `DeviceOrientationEvent.requestPermission()` prompt — grant it.)
3. No sensor? It opens in **auto-drift** (a slow Lissajous tilt) so an unattended
   device is already moving + sounding. Switch to **drag/sliders** to steer the
   gravity-tilt vector yourself by dragging on the canvas or using the tilt x/y
   sliders.
4. Steeper tilt → orbits squash → more frequent perihelion passes → denser pulse.
   Listen for the steady, hypnotic sub-pulse riding inside the chaos: that is the
   resonance chain.
5. **Stop** tears everything down (closes the AudioContext, cancels rAF, removes
   listeners, destroys GPU resources).

## Mapping

- **Perihelion pass → one hit.** Timbre from radius + speed: close+fast = bright
  short bell (triangle + inharmonic 2.01× shimmer, bright lowpass); far+slow =
  soft low thud (sine, long decay, dark lowpass).
- **Stereo pan from the body's angular position** (`cos(angle)`), so you literally
  hear the cosmos rotate around you.
- **Tilt steepness → pulse rate / energy** — a steeper tilt squashes orbits
  (larger induced eccentricity), so perihelion passes get closer and more
  frequent. Clustering/density → natural layering of many simultaneous hits.
- Pitch: a fixed pentatonic degree bucketed from closeness, over a low sub-bass
  drone. Master gain ≈ 0.26 → `DynamicsCompressorNode` limiter → destination, so
  dense bursts never clip.

## Technique — raw WebGPU compute (no three.js)

- Inline **WGSL compute shader** integrates `GPU_BODIES = 3000` bodies stored in
  GPU storage buffers (`pos.xy, vel.xy` + bookkeeping). Semi-implicit Euler,
  central inverse-square gravity + a tilt acceleration vector (the "tipped
  bowl"). The body buffer is **double-buffered (ping-pong A/B)** so the render
  pass never reads a half-written buffer.
- **Perihelion detection on the GPU:** each body stores its previous two `1/r`
  values. A local *maximum* of `1/r` (= minimum radius) is a rising-then-falling
  edge; on that edge the shader writes `{radius, speed, pan, active}` into a flag
  buffer.
- **Non-blocking readback:** each frame the flag buffer is copied to a
  `MAP_READ` readback buffer, then cleared. The CPU calls `mapAsync` and reads
  *last* frame's flags off the render loop — the render loop never blocks — and
  turns active flags into Web Audio hits (per-body 90 ms gate so a body can't
  machine-gun; max 24 hits processed per readback to stay cheap).
- **Render:** instanced additive glowing quads (6 verts/body, `src=one,dst=one`
  blend). A full-screen translucent indigo quad each frame gives the motion-trail
  feel. Palette: deep indigo/violet field bodies, warm amber/gold for the
  resonant bodies.

### Resonant subset — the soul of the piece

Seven bodies are seeded in **mean-motion resonance ratios** drawn from the
**TRAPPIST-1** planetary chain. Its adjacent orbital-period ratios are
≈ **8:5, 5:3, 3:2, 3:2, 4:3, 3:2** (planets b–h), the longest near-resonant
chain known. Turned into cumulative period multipliers, these bodies lock into a
repeating, hypnotic polyrhythm against the chaotic gravity field — structured
resonance emerging from chaos. They are integrated on a clean analytic orbit
(fixed angular rate, tilt-induced eccentricity) so their periods stay locked and
audible, and are drawn larger / amber so you can see which ones are "singing."

This is **Kepler's 1619 *Harmonices Mundi* — the "harmony of the spheres"** made
literal, in the spirit of NASA's TRAPPIST-1 data sonification (Matt Russo /
*system sounds*, 2017), which mapped the same resonance chain to a musical pulse.

## Fallbacks (graceful degradation)

- If `navigator.gpu` is missing **or** any WebGPU init step throws → a **CPU
  N-body sim** (`CPU_BODIES = 360`, ≤ 400) runs the identical physics + perihelion
  detection and renders additive radial-gradient glow on a 2D `<canvas>`. It is
  still sounding and animating. A calm amber notice explains the fallback (never
  a crash).
- No motion sensor → auto-drift + drag + sliders cover it.

## References

- **Kepler, J. (1619).** *Harmonices Mundi* ("The Harmony of the World") — the
  original "music of the spheres," relating orbital motion to musical ratios.
- **Gillon, M. et al. (2017).** *Seven temperate terrestrial planets around the
  nearby ultracool dwarf star TRAPPIST-1*, **Nature 542, 456–460** — the resonant
  chain with adjacent period ratios ≈ 8:5, 5:3, 3:2, 3:2, 4:3, 3:2.
- **Russo, M. / SYSTEM Sounds (2017).** TRAPPIST-1 sonification — the resonance
  chain rendered as a hypnotic musical pulse; direct inspiration for seeding a
  locked subset here.
- **WebGPU / WGSL compute N-body.** WebGPU reached **~82% global browser support
  in 2026**, including **Safari 26 on iOS / iPadOS** — which is what makes a
  tilt-driven, GPU-integrated cosmos of thousands of bodies viable on the iPad
  this prototype targets. Compute shaders integrate the bodies and flag
  perihelion passes entirely on the GPU; only a tiny per-frame flag buffer is
  read back to the CPU for audio.

## Notes / known risks

- The WebGPU path (double-buffer ping-pong, flag readback, additive blend) is
  written against the standard API but has **not been run on a live GPU in this
  environment** — it is type-clean and lint-clean and falls back to the verified
  CPU path on any init error, so a failure degrades gracefully rather than
  crashing.
- First-frame trails use `loadOp: "load"` over the CSS-black canvas; harmless.
