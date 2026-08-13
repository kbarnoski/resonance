# 11408-tiltglide

**What if you tilted your phone to fly an endless canyon of singing crystal, where your altitude is the melody?**

A real three.js perspective flight down a boundless chasm. The camera hangs at the
origin looking into the dark while a ring-buffer of 44 crystalline **gates** scrolls
toward it out of `THREE.FogExp2` and recycles behind. Tilt the phone to steer and
dive; your altitude is quantised to a minor-pentatonic lead that sings over a
Shepard–Risset endless-descent drone, so the whole piece feels like perpetual falling.

## What it is

- **Endless procedural corridor.** Two `THREE.InstancedMesh` (a solid crystal core +
  an additive-blended halo, 44 × 16 = 704 shards each) form the gates. When a gate
  passes the camera it is re-seeded from a fresh `string→int hash` + `mulberry32`
  PRNG, so the descent is deterministic yet never obviously repeats. Fog fades gates
  in from the deep to sell the infinite tunnel.
- **Snaking centreline.** The canyon follows a sum of three sines on each of X and Y;
  the camera banks (rolls) into the turns from the centreline curvature and your steer.
- **Altitude is the melody.** Camera altitude is quantised into 15 bands mapped to a
  minor-pentatonic scale (base B3). Each band crossing retriggers a crystalline pluck
  (three sine partials). Higher = higher note. Under it, a **Shepard–Risset**
  endless-descent drone (`dir: -1`) glides down forever.
- **Palette.** Cool aqua / ice-blue crystal on near-black; cosmic-ambient.

## How to use

- Press **Start flight** to unlock audio (and, on iOS, request motion permission —
  this must happen inside the button's click handler by browser policy).
- **Tilt** the phone left/right to steer, forward/back to dive. Hold it ~45° forward
  as neutral; tilt further to descend faster.
- No sensor? **Drag** anywhere (or use the **Arrow keys**) to fly. The active input
  mode is shown in the mono caption (`tilt` / `drag` / `keys` / `auto`).
- A seeded **auto-pilot** drifts the controls from mount, so a muted phone with no
  tilt sensor still sees + hears an endless descent within ~1s. Real input takes over
  instantly and the auto-pilot resumes after a few idle seconds.

## Tilt-fallback behaviour

`DeviceOrientationEvent` → `gamma` sets heading, `beta` sets dive. On iOS 13+ the
`DeviceOrientationEvent.requestPermission()` call is fired from the Start button.
If tilt is denied or unavailable, the pointer-drag and Arrow-key paths cover the same
control space, and the auto-pilot fills any idle gap — the piece is never static or
silent.

## Accessibility / safety

- **Strobe-safe:** smooth motion only; nothing flickers above ~3 Hz.
- Honours `prefers-reduced-motion: reduce` by halving fly speed and damping steer,
  altitude, and roll.
- **Graceful WebGL fallback:** if a `WebGLRenderer` can't be created, an on-brand
  notice replaces the canvas instead of throwing.
- All audio is routed through the shared safe-master limiter — never `ctx.destination`.
- Full teardown cancels the RAF, removes every listener, stops the oscillators,
  disconnects the master, closes the AudioContext, and disposes all three.js
  geometry / materials / renderer.

## Citation

- R. N. Shepard, "Circularity in Judgments of Relative Pitch," *Journal of the
  Acoustical Society of America* 36 (1964) — octave-spaced partials under a fixed
  log-frequency Gaussian envelope produce the endless-pitch illusion.
- J.-C. Risset turned Shepard's discrete steps into a continuous glissando (the
  Shepard–Risset glissando used here for the endless descent).

## Deepen next

- Map the analyser tap on the safe master back into the shards' emissive brightness
  so the crystal visibly *pulses* with the lead you play.
- Add a second harmony voice a fifth below the lead, gated by dive energy, for a
  richer chord as you plunge.
- Vary gate density and shard count by depth "biome" (re-seeded per recycle already
  makes this cheap) so the canyon has slow-evolving movements over minutes.
