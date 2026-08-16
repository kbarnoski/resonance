# 13840 · Hall of Songs

**"Walk inside your own catalog — and where you stand IS the mix."**

A first-person 3D hall built from Karel's real piano recordings. Eight of his
pieces (the first eight of the verified *Welcome Home* catalog) stand as luminous
violet monoliths ringed around one dark room. Every track plays **at the same
time**, each spatialized with a Web Audio HRTF `PannerNode` fixed at its pillar's
position. Walk through the hall and his whole catalog continuously re-mixes in 3D
around your head.

## What it is

- **Input** — first-person spatial navigation. Desktop: `WASD` to walk,
  mouse-look via Pointer Lock (click the hall to capture the mouse, `Esc` to
  release). Mobile / touch: twin on-screen joysticks (left walks, right looks).
- **Output** — a full-viewport three.js first-person scene: an architectural
  floor grid receding into fog, glowing monoliths, additive halos, drifting dust.
- **Palette** — cool violet / indigo / ice on near-black. No warm tones, no
  tunnel-of-light.

## How to use it

1. Put on headphones (HRTF is dramatically more convincing than on speakers).
2. Press **Enter the hall**. The subset loads track-by-track and each fades in.
3. Walk. Step toward a pillar and its song blooms loud and close; leave it behind
   and it fades to a whisper. Stand between two and you hear both, balanced by how
   near each one is. The nearest, loudest song floats its title above its body.

Before you enter, the hall renders and slowly self-drifts so it is alive on load.

## The technique

- **Per-track HRTF spatialization.** Each track's graph is
  `AudioBufferSourceNode(loop) → PannerNode(panningModel="HRTF") → GainNode →
  safeMaster.input`, plus a passive `AnalyserNode` tapped off the source for that
  track's own amplitude. The panner sits at the pillar's world position.
- **Listener tracking.** The single `AudioContext.listener` is driven every frame
  from the camera — position and forward/up orientation — using the
  `positionX`/`forwardX` AudioParam form with a `setPosition`/`setOrientation`
  fallback (feature-detected).
- **Equal-power proximity mixing.** `distanceModel="inverse"` with a small
  `refDistance`, firm `rolloffFactor`, and a `maxDistance` cap makes proximity
  dramatic while keeping a floor whisper — distant songs never fully vanish. The
  same inverse curve is mirrored in JS to drive each body's glow so the eye reads
  what the ear hears.
- **Performance.** A curated 8-track subset is decoded sequentially (capping peak
  memory), each buffer loops forever (no re-fetch), and everything runs through
  the shared ear-safety master bus. All timing uses `performance.now` /
  `ctx.currentTime`; incidental placement uses a seeded `mulberry32` PRNG.

## Audio source

All audio is Karel's real recordings, loaded via the shared helpers
(`../_shared/welcomeHome` → `REAL_TRACKS`, `loadRealTrackBuffer`) and routed
through `../_shared/visionary/safeMaster`. No synthesis, no oscillators, no
generated tones.

## Named reference

This piece sits in the lineage of the spatial **sound-walk** — **Janet Cardiff &
George Bures Miller's** audio walks, in which recorded sound is bound to physical
places you move through, and **Bernhard Leitner's sound architecture**, which
treats sound as a material you inhabit and walk among. It is also a direct
expression of the **2026 turn toward object-based immersive spatial audio**:
sound authored as discrete objects positioned in a scene and rendered to the
listener's own position and head orientation — exactly what per-track HRTF
panners plus a camera-locked listener do here. The twist is that the objects are
Karel's own songs, and the room is his catalog.

## Limitations

- HRTF uses a generic head model: left/right localization is strong, front/back
  and elevation weaker; headphones strongly recommended.
- Eight simultaneous looping buffers is the smooth-laptop ceiling, so this walks a
  curated slice, not all sixteen tracks at once.
- A failed track is skipped and the rest play on. No WebGL → a clear notice, no
  crash.
