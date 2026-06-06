# 347 · The Place Where You Go to Listen

**Route:** `/dream/347-the-place`

> "What if Resonance scored a long-form piece from the REAL local sky — the
> actual clock hour, the sun's position, the moon's phase, the season — so the
> music is genuinely different at 3am than at noon, and slowly evolves as real
> time passes?"

A contemplative, place-based drone. It reads your device clock and (optionally)
your geolocation, computes where the sun and moon actually are in your sky right
now, and turns that into an evolving just-intonation choir over a raw-WebGL2
horizon. Nothing repeats on a timer — the score is the sky.

## Named reference

After **John Luther Adams, _The Place Where You Go to Listen_** — his permanent
installation at the Museum of the North in Fairbanks, Alaska, which sonifies the
local sun, moon, aurora, and seismic activity in real time so the room sounds
different every hour of every day. This prototype borrows that core idea (the
sky as the score) at toy scale. It also sits in **Brian Eno's generative-ambient
lineage**: a system left running that is always different and never arrives.

## How to use it

- **Just open it.** Audio and visuals start on load. If the browser blocks
  autoplay, a single **Begin** button appears — one tap and it is alive. It is
  designed to be playable at a 06:30 phone review with zero interaction beyond
  that one tap.
- **Geolocation is optional.** It is requested with a 3-second timeout. Allow it
  for your real sky; deny/ignore it and it silently falls back to a fixed
  high-latitude place (lat 61.2, lon -149.9 — Anchorage-ish, a nod to Fairbanks)
  so the sun-arc is dramatic.
- **Time scrubber (for review).** Two sliders at the bottom let you fast-forward
  through the **hour of day** and the **day of year**. Drag them to hear the
  whole dawn → noon → dusk → night arc (and winter ↔ summer color shift) in a
  few seconds without waiting. While untouched, the piece tracks **real
  wall-clock time**; press **return to now** to release it back to live.

## The mapping (sky → sound)

All astronomy is computed **locally, no network** (NOAA-style solar-position
approximation; simple synodic-month moon). See `astronomy.ts`.

| Sky quantity | Musical / visual response |
|---|---|
| **Solar altitude** (−90°..+90°) | Overall register + brightness. Deep night = a low warm cellar drone (A1 root). Civil twilight near the horizon = a slow blooming mid cluster. Midday = bright high just-intonation partials added on top. |
| **Solar azimuth** (0°..360°) | Slow stereo-pan drift of the lead voice across the day (sun east → left, west → right); the moon shimmer pans gently opposite. |
| **Moon illumination** (0..1) | A high shimmering harmonic voice whose level waxes with the lit fraction — full moon present, new moon silent. |
| **Season** (day-of-year) | The just-intonation scale color morphs: winter leans toward a darker minor set (and a slightly lower root), summer toward a brighter major set. |
| **Solar altitude / azimuth** | Sun-disc glow position and warm twilight band on the WebGL2 horizon. |
| **Moon phase** | Moon disc size/terminator shading; halo scaled by illumination. |
| **1 − dayness** | Star density on the sky field rises as the sun sets. |

A `DynamicsCompressor` sits on the master bus as a **brick-wall limiter**, and
the master gain ramps in over a few seconds, so it never blasts or clicks.

## Files

- `page.tsx` — client component: autoplay/gesture handling, geolocation,
  the render/audio loop, readouts, and the time scrubber.
- `astronomy.ts` — local sun position, moon phase, season helpers (no network).
- `audioEngine.ts` — Web Audio just-intonation drone/choir + limiter.
- `skyRenderer.ts` — raw WebGL2 (hand-written GLSL ES 3.00) horizon/sky field.
- `README.md` — this file.

Self-contained: no cross-prototype imports, no new npm dependencies, no API
route, no mic/camera/network.

## Graceful degradation

- **No WebGL2** → a `text-rose-300` notice is shown and the **audio keeps
  playing** and tracking the real sky.
- **Geolocation denied or slow** (>3s) → the fixed fallback place is used
  silently and the piece plays immediately; the readout shows it used the
  fallback.
- **Autoplay blocked** → a single **Begin** button satisfies the gesture; the
  AudioContext is resumed on tap.
- Audio nodes are stopped/closed and the `requestAnimationFrame` loop is
  cancelled on unmount.

## Honest verification note

- **Build-verified:** Yes. `npx tsc --noEmit` is clean for this folder,
  `npx eslint src/app/dream/347-the-place/` passes with 0 errors/warnings, and
  `npm run build` (full Next production build) succeeds with the route emitted
  as static (`/dream/347-the-place`, ~7.4 kB).
- **Browser-verified:** Not in this environment (headless). The audio graph,
  autoplay-gesture fallback, geolocation timeout, WebGL2 rendering, and the
  scrubber are written to spec but have not been audibly/visually confirmed in a
  live browser. The solar/lunar math is an intentional approximation suitable
  for a contemplative prototype, not an ephemeris.
