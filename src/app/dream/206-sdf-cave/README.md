# Cave — SDF Ray-Marching Audio-Reactive Space

**Route**: `/dream/206-sdf-cave`  
**Status**: `demoable`  
**Cycle**: 239

## What it does

A dark stone cave rendered entirely inside a WebGL fragment shader via SDF (signed-distance function) ray marching. The viewer is positioned *inside* the cave, not looking at it from outside. The cave breathes with sound:

- **Bass energy** → `smin` blend factor `k` (walls melt together and pull apart organically)
- **Treble energy** → Perlin-noise displacement on the SDF surface (smooth stone becomes rough and jagged)
- **Spectral centroid** → cave light color (warm amber-violet at low frequencies, ice-blue at high)
- **Onset transients** → brief camera shake

Demo mode: 6 incommensurable LFO oscillators animate all parameters. Mic mode: live audio via Web Audio AnalyserNode.

## Visual technique

Three SDF primitives combined with smooth-min blending (`smin`):
1. Rounded box (inverted — the cave room interior)
2. Torus (ceiling arch, subtracted from room)
3. Domain-repeated capsules (stalactite columns, positive shapes blended in)

The `smin` blend factor `k` is driven by bass energy — at rest `k=0.15` (hard transitions), at peak bass `k=0.70` (forms dissolve into each other organically).

Perlin-noise (`noise3`) displaces the SDF sample point when treble > 0.01 — the whole cave surface gains texture.

Soft shadow pass (12 march steps) + normal-based diffuse lighting + distance-squared attenuation + simple AO (SDF re-sample at `pos + nor*0.12`).

ACES filmic tone-mapping applied at the end. `mix-blend-mode` vignette.

## What makes this new

**205 prior prototypes produce visuals on the canvas. This one puts the viewer inside the space.** The camera is not looking at an object — it is positioned at `(camX, camY, camZ)` inside the cave room, looking forward. The cave walls, ceiling, and columns surround the viewer on all sides. On a large projector or curved screen, this would be immersive.

The SDF/ray-marching paradigm is also new to the sandbox. All prior WebGL prototypes use vertex geometry (meshes, point clouds, triangle strips for fluid quads). This one has no geometry at all — the scene exists only as math.

## Camera orbit

The camera drifts slowly: `camX = sin(t × 0.12) × 0.6`, `camZ = cos(t × 0.12) × 0.5 − 1.5`. This gives a slow pendulum left-right sway while moving forward into the cave. The cave loops seamlessly (domain-repeated stalactites along Z).

## Live performance fit

On a projector screen, this is the darkest and most architectural backdrop in the sandbox. Bass drops collapse the cave walls toward the viewer (`k` increase). A sustained tremolo passage roughens the stone. The cave light color shifting from violet to blue tracks the musical register — low piano notes = warm violet lantern glow; high arpeggios = cold blue wash.

## Polish ideas for future cycles

- Emission layer: make stalactite tips glow with the current spectral centroid color
- Water: a sine-wave floor plane at `y = -1.5` using SDF intersection
- Second camera mode: fixed front view (user can choose stationary vs. drifting)
- Fog density slider (currently fixed at `exp(-t × 0.09)`)
- Webcam-driven: face forward toward mic to move deeper into the cave (DeviceOrientation)
