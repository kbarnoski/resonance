# 11600-cloudveil

**What if your music dissolved you into a boundless, glowing cloud of light you
drift through toward a distant sun?**

A cosmic-ambient, near-death-tunnel-of-light experience rendered as **real
volumetric light transport** — not a painted surface. A full-screen WebGL2
fragment shader ray-marches a 3D density field and accumulates *scattered light*
along the view ray, so the cloud is genuinely lit from within by a bone-white
sun you are drifting toward.

## How to use it

- **On load**, with no sound at all, the cloud is already breathing and drifting
  toward the sun. This is the muted-phone contract: a deterministic seeded
  envelope (`demo.ts` `silentEnvelope`) drives the visuals from
  `performance.now()` until you start audio.
- **Begin the drift** creates the `AudioContext` (on your click — autoplay-safe)
  and starts a slow, seeded piano-ish **chorale** (Am → F → C → G, forever). Now
  the live analyser drives the cloud.
- **Drop in your own audio** decodes any file you pick (`FileReader` →
  `decodeAudioData`) and transports the cloud with *your* recording instead.
  This honors the standing directive to build around real recorded music. If a
  file fails to decode, it says so and falls back to the seeded chorale.
- **Design notes** opens a summary of the technique.

All audio is routed through the shared safe master bus (`createSafeMaster`) with
a `createVoidReverb` tail for boundless depth — never straight to
`ctx.destination`. The visuals read `master.analyser`.

## The technique (the reason this piece exists)

65 files in the lab ray-march **signed-distance fields** into hard surfaces.
**Zero** transport light through a *participating medium*. Cloudveil does the
latter — it ports real atmospheric single-scattering into the fragment shader
(`gl.ts`):

1. **Ray-march the volume.** A ray from the eye steps through a domain-warped
   fbm density field — the cloud.
2. **Beer-Lambert absorption.** Along the view ray, transmittance decays as
   `transmittance *= exp(-density * absorption * stepSize)`. Everything behind
   thick cloud is occluded exactly as light in a real medium would be.
3. **Secondary light march.** At every dense sample, a short march *toward the
   sun* accumulates that sample's light transmittance (Beer-Lambert again) — the
   self-shadowing that gives the cloud its curdled, three-dimensional body.
4. **Henyey-Greenstein phase function.** The scattered light is weighted by
   `hg(cosθ, g) = (1 - g²) / (4π · (1 + g² - 2g·cosθ)^{3/2})`, an anisotropic
   phase that biases scattering **forward** toward the sun — so the cloud rim
   blooms brilliantly as you drift into the light.

**Audio → light:** overall loudness thickens the veil and lifts the scatter gain;
the low band swells the sun and the medium's density; the high band sharpens the
forward-scatter anisotropy `g` (a glassier glint). Palette lives only inside the
shader: warm dawn-gold / candle-amber medium under a bone-white sun. No cyan, no
violet.

### Reference

Ported from Maxime Heckel, *"Real-time dreamy Cloudscapes with Volumetric
Raymarching"* (blog.maximeheckel.com), together with the **Henyey-Greenstein
phase function** from atmospheric light-scattering physics. This is volumetric
light-transport, deliberately *not* SDF raymarching.

## Determinism & safety

- No `Math.random()`, no `Date.now()`, no argless `new Date()` anywhere — all
  randomness is `mulberry32(SEED)` (`prng.ts`), all time is `performance.now()`.
  Every drift replays identically.
- No flicker: luminance is a slow (~0.03 Hz) sine drift, far below any
  photosensitive band. `prefersReducedMotion()` further damps the fly-through and
  the drift.
- Full teardown on unmount: cancel rAF, stop the chorale voices and any decoded
  file source, `master.disconnect()`, `ctx.close()`, and delete every GL program,
  buffer, and VAO.
- Degrades gracefully: no WebGL2 → an on-brand notice, no throw; blocked audio →
  the cloud keeps drifting silently. No network calls, no new dependencies, no
  API route.

## Files

- `page.tsx` — React glue, chrome, the always-on render loop, gesture handling.
- `gl.ts` — the WebGL2 volumetric raymarcher (Beer-Lambert + Henyey-Greenstein).
- `audio.ts` — `CloudAudio`: safe-master routing, seeded chorale scheduler, file
  decode, analyser feature extraction, teardown.
- `demo.ts` — the seeded chorale progression + the deterministic silent envelope.
- `prng.ts` — `mulberry32`, seed, math helpers.

## What a next cycle could deepen

- **Multiple scattering / ambient occlusion** approximation for softer, deeper
  interiors instead of the single-scatter + flat ambient fill.
- **Blue-noise / temporal reprojection** on the ray jitter to raise step counts
  (crisper detail) without banding or cost.
- A **beat-locked camera** that surges forward on onsets so the tunnel-of-light
  pulls you in on the music rather than drifting at constant speed.
- **Spectral tint**: map the file's brightness/centroid onto the dawn-gold ↔
  candle-amber balance so different recordings paint different suns.
