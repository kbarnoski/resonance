# 1251 · borealis

**What it is.** A >5-minute, single-take, never-repeating raymarched passage that
flies you *bodily into* a receding volumetric tunnel of light, driven by Karel's
real solo-piano recording. Not a pattern on a wall — actual perceived 3D depth:
you feel yourself moving forward through luminous white-gold fog toward a growing
radiance, the way near-death-experience survivors describe it.

## The question it answers

> What if Karel's real piano flew you bodily INTO a receding volumetric tunnel of
> light — a >5-minute, single-take, never-repeating raymarched passage where you
> feel yourself moving forward through luminous fog toward a growing radiance?

## The volumetric mechanism (the distinguishing axis: DEPTH via raymarching)

The full-screen WebGL2 fragment shader (`render.ts`, `FRAG_SRC`) raymarches ~64
steps through a **volume**, accumulating emission and absorbing transmittance
along each ray — classic volumetric fog/raymarching (Íñigo Quílez technique):

- **Forward transport.** The camera origin translates along `+z` every frame
  (`uZ` grows without bound). Because the fog's ring pattern is a function of the
  *absolute* world-`z` of each sample, advancing the camera makes the tunnel
  walls **stream toward you** — the embodied sense of flying in, with parallax
  between near and far fog, not a flat warped field.
- **Log-polar tunnel walls.** The cross-section `(x, y)` of each march sample is
  mapped to cortical coordinates `(log r, θ)` via `screenToCortex`, and the
  **tunnel form constant** — `formConstant(cc, phi=0, …)`, Klüver's concentric
  rings — is evaluated with the log-radius warped by depth (`c.x + p.z·0.55`) so
  the rings ripple *along* the tunnel and flow past as you advance. A faint
  `honeycomb` lattice adds wall texture. This is the shared
  `_shared/psych/logpolar` engine (`LOGPOLAR_GLSL`) spliced straight into the
  shader prelude.
- **The growing core.** A bright axial term (`exp(-r²·tight)`) is the radiance at
  the tunnel's end. Its brightness and width grow with `uApproach`, and its color
  ramps from gold toward white as you near — the NDE white-out — through a gentle
  Reinhard tonemap that blooms highlights to white without clipping.
- **The clear throat.** Fog density rises with radius (`smoothstep` on `r`) so the
  axis stays clear and the light shines through the middle of the passage.

## How the real piano drives the march

`audio.ts` loads Karel's recording through the existing read-only route
(`/api/audio/549fc519-…`, `fetchPianoBuffer`), with a mandatory offline
`renderFallbackBuffer` (OfflineAudioContext pentatonic piano) if the fetch fails.

Graph:

```
BufferSource(loop) → VoidReverb(cavernous) → pianoGain → AnalyserNode
      → masterGain(0.45) → DynamicsCompressor(limiter) → destination
Shepard(endless rise) + DroneBank(pad) → bedGain → masterGain
```

The `AnalyserNode` energy (50–5000 Hz, smoothed) becomes the journey drive:

- **loud passages surge you forward** (higher `speed`, integrated into `uZ`) and
  brighten/whiten the core (`uEnergy`);
- **quiet passages let the light settle** (slower drift, dimmer core).

The **Shepard–Risset endless-rising tone** is the auditory analog of endless
forward motion into the tunnel (`step(dt)` each frame); the **drone bank**
sustains the cavern; the **convolution void reverb** places the piano in the
tunnel space. Master gain sits at a modest 0.45 behind the limiter.

## Why minute 5 ≠ minute 1

- `uZ` grows monotonically, and the ring pattern depends on absolute depth, so the
  content is *always* new — it can never loop.
- Long ramps deepen the journey: `uApproach` (0→~1 over ~330 s) brightens and
  **widens** the core; `uThin` (0→1 over ~360 s) **thins the fog** (lower
  absorption); `uRingFreq` slowly wanders on two incommensurate sines. By minute 5
  the passage is thinner, faster, whiter and more open than at the mouth.

## Palette / vibe

Luminous white-gold NDE tunnel-to-light: warm dark amber at the mouth, gold on the
fog walls, a growing white core in the depth. Not pale-print, not jewel-on-dark —
awe, boundlessness, embodied transport.

## Safety (photosensitive epilepsy)

- The forward motion is **smooth continuous translation** (≪3 Hz), never a strobe;
  the core brightens over *seconds*.
- The only optional luminance pulse routes through the shared
  `createSafeFlicker({ maxHz: 3, defaultHz: 1.2, floor: 0.6 })` — **off by
  default**, soft sine with a 0.6 floor (never a blackout strobe), instant `kill`.
- `prefers-reduced-motion` is honored: the flicker degrades to a sub-perceptual
  drift and the forward speed is slowed to ~45%.
- Audio is gesture-gated behind a **Begin** button; before Begin the shader draws
  the dark resting tunnel mouth (never blank).

## Performance

- Single full-screen triangle; 64 march steps; `low-power` context; DPR capped at
  1.6; early `transmittance < 0.02` ray termination. Comfortable on a laptop GPU.
- Full teardown on unmount: `cancelAnimationFrame`, audio nodes stopped and the
  context closed, `WEBGL_lose_context`, flicker killed.

## Named references

- **Karolina Halatek, *Terminal*** — a walk-through cylindrical LED light-tunnel
  built from near-death-experience survivor testimony ("perspectives warp, shadows
  disappear").
- **Heinrich Klüver's form constants** — the tunnel/funnel constant (phi = 0
  concentric rings) is the geometry of this tunnel.
- **Bressloff–Cowan** retino-cortical log map — the reason the log-polar warp
  produces perceptual tunnels.
- **Íñigo Quílez** — volumetric fog / raymarching accumulation technique.
