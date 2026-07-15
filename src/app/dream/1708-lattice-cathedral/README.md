# 1708 · Lattice Cathedral

**One question:** What if the NDE / ketamine "void" were built from *real 3-D
architecture* — a receding cathedral-lattice of luminous wireframe girders and
arches you fly through — and each structure *sang from its true 3-D position* via
HRTF spatial audio?

State: ketamine / NDE-void · Pole: cosmic-ambient (vast, sacred, boundless).

## What it is

An endless nave of semicircular **portal arches** plus continuous floor,
springer, and ridge **rails** marching toward a vanishing point, with five larger
**landmark structures** interspersed (a great double-arch, a ring-portal, a
saddle-vault, a girder pylon, and a rose-gate). It is genuine geometry — not a
raymarched SDF — drawn as additive `gl.LINES` in cold violet fading to cool
neutral and then to black fog.

## Controls

- **Drag** the canvas to swing your gaze (yaw + pitch) with smoothed inertia.
  Release and it auto **re-centers**.
- A slow **forward drift** always carries you deeper through the lattice.
- Left untouched, an automatic **ghost flight** sweeps and drifts on its own
  (the piece is never blank or silent without a user).
- **Enter the cathedral** starts audio (browser autoplay policy needs one gesture).
- **Luminance drift** is an opt-in, ≤ 3 Hz soft brightness drift (off by default).
- 🎧 Best with headphones; still reads on laptop stereo speakers (HRTF degrades
  to L/R panning + distance gain).

## Technique — real geometry + per-structure HRTF

**Geometry / rendering.** Vertices for each structure are generated
deterministically as `gl.LINES` pairs. A hand-built **perspective** matrix and a
**lookAt** view matrix (from the camera position, and a forward vector derived
from yaw/pitch) are multiplied on the CPU into a view-projection matrix; every
vertex is transformed by it in the vertex shader. Nave bays are drawn at integer
multiples of the bay spacing around the camera, so the corridor is endless and
the rails connect seamlessly toward the vanishing point. Additive blending makes
overlapping girders bloom; a second `gl.POINTS` pass adds a soft radial glow at
the joints (a cheap fake bloom). Distance is fogged `exp(-depth·density)` and the
edge color drifts violet → cool neutral with depth.

**Spatial audio.** Each of the five landmark structures owns exactly one
`PannerNode` with `panningModel="HRTF"` and `distanceModel="inverse"`. The
`AudioListener` position and orientation are set from the same camera the visuals
use (feature-detecting the `positionX`/`forwardX` AudioParams vs. legacy
`setPosition`/`setOrientation`), and each panner is placed at its structure's
true world coordinate every frame. Because both the view matrix and the listener
derive "right" from `cross(forward, up)`, **sight and sound read the identical
geometry** — the arch you see on your right is heard on your right, and flying
through it sweeps front → back. Beacons are soft, slightly inharmonic sustained
pads (fundamentals 58.3 / 77.8 / 92.5 / 116.5 / 138.6 Hz, each with a slow
breathing LFO) routed → long `createVoidReverb` cavern tail → `DynamicsCompressor`
→ master gain ~0.12.

## Determinism & safety

- No `Math.random`, `Date.now`, `new Date`, or `performance.now` in the state
  path. Everything is driven by an integer **frame counter**; procedural jitter
  comes from a seeded `mulberry32` LCG. The audio clock (`ctx.currentTime`) is
  used only to schedule `setTargetAtTime` glides.
- No strobe. The only luminance modulation is opt-in and gated through the shared
  `safeFlicker` engine (≤ 3 Hz soft sine, honors `prefers-reduced-motion`).
- Web Audio + WebGL2 only, zero new npm deps, no network. WebGL2 absence shows an
  on-brand `text-destructive` notice and still lets audio start.

## Named references

- van Lommel NDE tunnel phenomenology
- ketamine k-hole / "the void"
- Klüver tunnel/spiral form-constant
- gothic-nave / Sol-LeWitt-lattice architectural inspiration
- Web Audio `PannerNode` HRTF (KEMAR)
- 2026 spatial-audio surge (arXiv 2605.30940; HRTFformer 2510.01891)

## Honest knocks

- Line width is effectively 1 px in modern WebGL2, so the "girder" heft comes
  from additive overlap + the point-glow pass rather than truly thick beams.
- When a beacon recycles from just-behind to far-ahead it teleports along z; both
  endpoints are low-gain (distance rolloff) and the position glides over ~50 ms,
  but a faint swoop can be audible under headphones on the closest passes.
- HRTF quality is entirely the browser's built-in KEMAR set; elevation cues
  (the saddle-vault / rose-gate being *above* you) are weaker than azimuth.
- The nave sway and beacon layout are deliberately sparse; it reads as sacred and
  boundless rather than dense — by design for the cosmic-ambient pole.
