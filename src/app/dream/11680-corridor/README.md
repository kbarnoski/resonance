# 11680-corridor

**What if the near-death tunnel of light were an actual TUNNEL — a glowing
corridor of cloud you fly down toward the light at the end, faster on every
beat?**

The most literal reading of the near-death tunnel-of-light. Where
[`11600-cloudveil`](../11600-cloudveil) dissolved you into an **open** cloud
drifting toward a distant sun, this deepens the same participating-medium physics
into **navigable geometry**: a volumetric TUBE. A full-screen WebGL2 fragment
shader ray-marches a density field that is highest in a cylindrical shell around
a gently curving flight-path axis and thins to nothing on the axis — so you fly
straight down the throat of a glowing corridor, walls swirling past, a bone-white
sun burning at the vanishing point.

## How to use it

- **On load**, with no sound at all, you are already flying slowly down the
  corridor and surging forward on a (silent) beat. This is the muted-phone
  contract: a deterministic seeded envelope (`demo.ts` `silentEnvelope`) drives
  the walls, the end-light, and the flythrough surge from `performance.now()`
  until you start audio. The full experience reads within a second, no tap.
- **Enter the tunnel** creates the `AudioContext` (on your click — autoplay-safe)
  and starts a slow, seeded piano-ish **chorale** (Am → F → C → G, forever). Now
  the live analyser drives the flythrough.
- **Drop in your own audio** decodes any file you pick (`FileReader` →
  `decodeAudioData`) and flies you down the tunnel to *your* recording instead.
  If a file fails to decode, it says so and falls back to the seeded chorale.
- **Design notes** opens a summary of the technique.

All audio is routed through the shared safe master bus (`createSafeMaster`, gain
≤ 0.3 after its internal trims) with a `createVoidReverb` tail for the cavernous
depth — never straight to `ctx.destination`. The visuals read `master.analyser`.

## The technique (the reason this piece exists)

The lab has volumetric cloud drift (cloudveil). This makes the tunnel **literal,
navigable geometry** (`gl.ts`):

1. **Corridor density field.** The flight-path axis is a slow `sin/cos` curve of
   the along-tunnel coordinate `z`. At each sample, `r` is the distance to that
   axis; density is a **radial shell** profile — a gaussian ring peaking at target
   radius `R`, ~0 on the axis and outside the wall — TIMES a twisted,
   domain-warped fbm so the walls curdle. The camera rides the axis at world-`z`
   `= uCamZ`, which JS advances each frame; the tube endlessly recedes as you fly.
2. **Beer-Lambert transport.** Transmittance along the view ray decays as
   `exp(-density · absorption · step)`; a short secondary march **down-tunnel**
   toward the light gives each sample its self-shadow.
3. **Multi-octave Henyey-Greenstein multiple scattering.** Three octaves sum,
   scaling extinction by `a^i`, contribution by `b^i`, and phase eccentricity by
   `c^i` (a≈b≈c≈0.5 — Hillaire's approximation). Higher octaves see less shadow
   (`pow(lt, a^i) → 1`) and softer anisotropy, so light seeps deep into the walls
   and **glows the corridor from inside**, forward-biased toward the end via
   `hg(cosθ, g) = (1 - g²) / (4π · (1 + g² - 2g·cosθ)^{3/2})`.
4. **Beat-locked flythrough.** `audio.ts` detects onsets by gated spectral flux
   (positive bin-to-bin change over an adaptive floor, with a refractory window).
   An onset adds an impulse to a forward velocity that eases back to a slow
   baseline drift — you **accelerate down the tunnel on the music's hits**, never
   frozen (a slow constant advance when quiet).

**Audio → light:** loudness thickens the walls + lifts scatter gain; the low band
swells the end-light + wall density and breathes the tube's radius; the high band
sharpens the forward-scatter anisotropy `g`; and the spectral centroid tints the
end-light candle-amber ↔ dawn-gold — so a different recording paints a different
light. Palette lives only inside the shader: candle-amber / dawn-gold walls under
a bone-white sun. No cyan, no violet, no green.

### Reference

The multiple-scattering approximation follows **Sébastien Hillaire**, *"Physically
Based Sky, Atmosphere and Cloud Rendering in Frostbite"* — the multi-octave trick
that scales extinction, scattering, and phase eccentricity per octave to fake
multiple scattering cheaply — over the **Henyey-Greenstein** phase function from
atmospheric light scattering. The phenomenology is the classic near-death
**tunnel of light**: a dark passage with a brilliant light at its end that one
moves toward. This is volumetric light-transport through path-guided corridor
geometry, deliberately *not* SDF raymarching.

## Determinism & safety

- No `Math.random()`, no `Date.now()`, no argless `new Date()` anywhere — all
  randomness is `mulberry32(SEED)` (`prng.ts`), all time is `performance.now()`.
  Every flythrough (and the replay harness) traces the same path.
- **Photosensitive safety** (extra care given the fast forward motion): no
  strobe or flicker; luminance is a slow (~0.03 Hz) sine drift, far below the
  danger band. The surge acceleration is capped so it reads as immersive speed,
  not a flash. `prefersReducedMotion()` caps the top speed and damps the surge
  hard, and slows the wall swirl.
- Full teardown on unmount: cancel rAF, stop the chorale voices and any decoded
  file source, `master.disconnect()`, `ctx.close()`, and delete every GL program,
  buffer, and VAO.
- Degrades gracefully: no WebGL2 → an on-brand notice, no throw; blocked audio →
  the flythrough keeps going silently. No network calls, no new dependencies, no
  API route.

## Files

- `page.tsx` — React glue, chrome, the always-on flythrough loop (camera-z +
  surge envelope), gesture handling.
- `gl.ts` — the WebGL2 corridor volumetric raymarcher (tube-shell density around
  a curving axis + Beer-Lambert + multi-octave Henyey-Greenstein MS + flythrough).
- `audio.ts` — `CorridorAudio`: safe-master routing, seeded chorale scheduler,
  file decode, analyser features (loudness / low / high / centroid + spectral-flux
  onset), teardown.
- `demo.ts` — the seeded chorale progression + the deterministic silent envelope
  (including the per-beat onset pulse that surges the silent flythrough).
- `prng.ts` — `mulberry32`, seed, math helpers.

## What a next cycle could deepen

- **Branching corridors** — a junction the flight-path axis can bank into on a
  strong downbeat, so the tunnel forks on the music.
- **Temporal reprojection / blue-noise jitter** to raise the step count for
  crisper wall detail without banding or cost.
- **Doppler-ish audio coupling** — pitch-shift the void tail with the flythrough
  velocity so the surge is felt in the ear as well as the eye.
- **Chromatic end-light aberration** at the vanishing point that widens with the
  surge, so the fastest passages bloom the light apart.
