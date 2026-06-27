# Echo Room — GPU (`977-echo-room-gpu`)

Route: `/dream/977-echo-room-gpu`

## The one question

**What if you could build music from your own past selves in space — move your body through an
invisible harmonic field, and your motion is recorded as a "ghost body" that loops forever,
re-tracing your path and re-singing its harmony, so you stand among up to ~6 of your past selves
rendered as a living particle field, conducting a self-ensemble?**

This is a live-looper where each loop is *a body you used to be*, spatialized in an HRTF field you
walk among.

## Position → harmony (a real tonal layout, not a no-wrong-notes scale)

The room is a 2D field. Your body position `(x, y)` (normalized 0..1) selects a chord and a voicing:

- **x-axis = a voice-led diatonic neighbourhood in C major**, swept left → right across six
  columns: **I · vi · IV · ii · V · iii** (C, Am, F, Dm, G, Em). These are functional, common-tone
  heavy regions of one key (a Tonnetz-flavoured neighbourhood) — moving horizontally walks real
  harmonic motion, and because every region lives inside C major and is heavily common-toned, a
  full 6-ghost stack stays consonant and voice-led. This deliberately avoids the jury-banned
  "pentatonic / no-wrong-notes" safety net: there *is* harmonic meaning and you *can* hear tension
  and resolution as you move.
- **y-axis = voicing / inversion + register.** Vertical position picks which chord tone is the
  sounding voice and which octave; the top third jumps an octave to act as a lead voice. So moving
  up/down re-voices the same harmony.

Each region also carries a warm hue (amber → terracotta → honey → rust → gold → ember) used to
colour that ghost's particle cloud.

Mapping lives in `harmonyAt()` and the `FIELD` table in `page.tsx`.

## Loop / ghost mechanic

- **Primary action: "Start a loop"** arms recording. While armed, the performer's path
  (`x, y, freq, hue`) is sampled at ~30 Hz over a fixed **7 s bar**.
- On bar close, that path becomes a **permanent ghost** that replays forever, re-triggering its
  harmony at its moving position. Recording **auto-arms the next** loop until the cap is reached.
- Cap is **6 ghosts**; the oldest drops when a 7th is added. **"Clear all"** removes everyone.
- Global loop phase is shared, so all ghosts stay phase-locked to one bar grid (Reich-style
  phasing emerges naturally if paths differ in shape).

## HRTF spatialization

- One `AudioContext`; the **live performer's position is the `AudioListener`** position.
- **Each ghost owns its own `PannerNode` (`panningModel: 'HRTF'`)** whose 3D position tracks the
  ghost's current path point. As you move, the listener moves and the whole ensemble **re-pans
  around you** — you walk among the voices.
- Voice chain per ghost: `saw + sub sine → lowpass → gain → HRTF panner → bus`.
- **Loudness safety:** bus gain is `~1/√(n+1)` normalized, then master bus → **lowpass (5.2k)** →
  **compressor/limiter** → destination, so a 6-ghost stack never clips or gets harsh.

## WebGPU particle approach + fallback chain

Renderer chain (tries best first, always lands on something):

1. **WebGPU** — hand-written **WGSL** (no three.js, no library). A storage buffer of particles is
   expanded to quads in the vertex shader (6 verts/particle) and drawn with additive blending; the
   fragment shader makes soft round sprites. Each ghost is a particle cloud: a fading trail along
   its recent path plus a dense blooming head cluster. The **live performer is the brightest
   cloud**.
2. **WebGL2** — GLSL `gl_Points` point-sprite renderer with the same trail+bloom mechanics.
3. **Canvas2D** — radial-gradient bloom + trail dots, same mechanics, last resort.

The active renderer is shown in the HUD (`render webgpu / webgl2 / canvas2d`).

## Input + graceful degradation

- **MediaPipe Pose (full body)** loaded from CDN at runtime via dynamic `import()` of
  `@mediapipe/tasks-vision` (pose_landmarker_lite, VIDEO mode), wrapped in try/catch. Position =
  **torso/hip centroid** of shoulders (11,12) + hips (23,24), x mirrored for selfie view.
- If camera is denied/unavailable or MediaPipe fails to load (offline), it falls back to
  **pointer = body position** with a readable notice (`text-rose-300` on error).
- On cold load with no hardware/interaction, a **~1.5 s-delayed auto-demo** records a couple of
  figure-8 ghosts automatically, so the page is **sounding and moving at a glance** with zero
  permissions. Clicking/moving or pressing **"Start camera"** takes over and upgrades input.
- Audio is created/resumed on first user gesture (and attempted on auto-demo); browsers that block
  autoplay will start sounding on the first click.

## Teardown

On unmount: cancel rAF, close `AudioContext`, destroy GPU/GL resources, close the MediaPipe
landmarker, stop camera tracks, remove resize listener — no leaks.

## Research lineage

- **DanXeReflect** (CHI 2026) — re-materializing your spatio-temporal past movements as
  interactive avatars.
- **Janet Cardiff, *The Forty Part Motet*** — walking among fixed spatial voices.
- **Steve Reich phase-looping** / the live-loop-pedal tradition — layering loops into polyphony.

## Honest status

**Not yet device-verified.** Verified: the route compiles and serves HTTP 200 under `next dev`,
passes `eslint` and `tsc` clean. The WebGPU/WGSL path, the MediaPipe Pose CDN load, and the HRTF
re-panning have **not** been run on real GPU/camera hardware in this environment; the WebGL2 and
Canvas2D fallbacks and the pointer + auto-demo paths are the safest bets for the morning review.
WGSL std140-style struct padding and the WebGPU bind-group wiring are the most likely places to
need a small fix on first real-GPU run.
