# 1430 · Echo Void

**"What if you could only see a space by listening to your own echoes — navigate a hidden cathedral-void by pinging it, like biosonar?"**

The screen is nearly black. There is a cathedral around you — a ring of marble pillars, a flagstone floor, a barrel vault overhead, a great curved apse far down the nave, a few iron monoliths — but none of it is lit until you make it answer. You are the source and the receiver.

## How to use it

1. **Begin — enter the void** (headphones recommended; the echoes are spatial). This unlocks audio from your gesture.
2. **Tap anywhere / press Space to PING.** An expanding spherical wavefront leaves you at a fixed speed of sound. Wherever it crosses a hidden surface, that surface briefly glows as a cluster of points **and** returns an audible echo.
3. **Drag / arrow keys to steer your heading** (which way you face). The echoes re-pan around your head as you turn, and the point cloud re-projects.
4. Until you ping for the first time, the void **auto-pings itself every ~4–6 s** so it is never born silent or black.

Over ~30 s of pinging, the shape of the unseen space assembles itself in your ear and eye.

## The technique

- **Echolocation wavefront reveal.** A ping is a sphere of radius `r = SPEED · (t − t₀)`. Each frame, every point whose distance-from-you is within a thin shell of `r` flares up, then decays back toward darkness. The listener never moves — only turns — so per-point distances are precomputed once.
- **Echo returns spatialized in true 3D.** For each surface, an echo is scheduled at `t₀ + 2·dist/SPEED` (round trip) — near walls answer first, the far apse last. **Time emerges from the geometry, not a scheduler.** Each return is panned through a `PannerNode({panningModel:"HRTF"})` placed at the surface's real bearing relative to your current heading, with level ∝ 1/dist, fed into a cavernous convolution void reverb over a low drone bed.
- **Inharmonic material resonance (NOT a consonant scale).** Every surface is a struck resonator: a material base frequency plus 2–3 **stretched, inharmonic** partials (bell/plate ratios such as ×2.76, ×5.40, ×8.93; plate ratios ×2.31, ×3.83; vault ×1.98, ×3.12). Distance also dulls the timbre via a per-echo lowpass. The field is free to sound eerie and unresolved — it never fuses into a sweet chord.
- **Rendering.** Primary path is WebGL2 `gl.POINTS` with additive round-glow and a per-point brightness attribute streamed each frame. If no WebGL2 context is available it falls back to a Canvas2D "sonar sweep" of the same projected points; a badge shows **WebGL2** (emerald) or **Canvas** (amber).

## Named references

- **Biosonar** — bat and dolphin echolocation: perceiving a space by emitting and timing your own returns.
- **Alvin Lucier, _I Am Sitting in a Room_** — a space made audible by its own acoustic response.
- **James Turrell** — perceiving light and space with no object present.

## Key tuning constants (retune on a real device)

| Constant | Where | Value | Meaning |
| --- | --- | --- | --- |
| `SPEED` | `geometry.ts` | `22` (u/s) | Sim speed of sound. Lower = slower reveal, later apse. Reduced-motion scales it ×0.62. |
| `SHELL` | `geometry.ts` | `1.7` (u) | Half-width of the glowing reveal shell. Wider = softer/smeared. |
| brightness half-life | `renderer.ts` | `0.85 s` (`1.35` reduced) | How fast a lit surface fades back to dark. |
| `MASTER_TARGET` | `audio.ts` | `0.72` | Post-limiter master gain the 2 s ramp climbs to. |
| `MASTER_RAMP` | `audio.ts` | `2.0 s` | Silence → full; never a full-volume cold start. |
| `VOICE_CAP` | `audio.ts` | `14` | Max echo returns scheduled per ping. |
| `MIN_SPACING` | `audio.ts` | `0.09 s` | Minimum gap between returns; thins dense clusters. |
| material `decay` / `ratios` | `geometry.ts` | per-material | Ring time and inharmonic partial set per surface material. |
| seed | `rng.ts` | `0x1430ec0` | Deterministic cathedral + idle-ping jitter. No `Math.random`/`Date`. |

## Files

- `rng.ts` — `mulberry32` deterministic PRNG + the constant seed.
- `geometry.ts` — seeds the cathedral point cloud grouped into ~37 surfaces, each with centroid, material, and inharmonic base frequency; exports `SPEED`, `SHELL`.
- `camera.ts` — pure column-major mat4 math (perspective/lookAt/multiply, clip z ∈ [−1,1]) + point projection for the fallback.
- `renderer.ts` — `EchoRenderer`: WebGL2 `gl.POINTS` additive-glow with Canvas2D fallback and a `tier` badge value.
- `audio.ts` — `EchoAudio`: HRTF-panned inharmonic echo returns, drone bed, void reverb, limiter, ramped master, full `close()` teardown.
- `page.tsx` — the client page: gesture gate, ping/steer input, idle auto-ping, tier badge, reduced-motion aware, design-notes affordance, full cleanup on unmount.

## Known limitations (could not verify headless)

- **Audio was never actually heard.** HRTF panning direction, the 1/dist balance, drone/reverb mix, and whether the 2 s master ramp feels right are all untested by ear — most likely to need retuning on a real device.
- **WebGL point sizing is device-dependent.** `gl_PointSize` and `u_scale` (`height·0.09`) were tuned by reasoning, not seen; points may read too large near the camera or too small at the apse on some GPUs/DPRs. If the space renders faint, raise the resting-glow floor (`0.04` in the fragment shader) or `u_scale`.
- **Empty-look black frames are possible.** If your heading points entirely away from all geometry between pings, the view is (intentionally) near-black; this is the concept, not a crash — ping or turn to bring surfaces back.
- **Canvas2D fallback** path was not exercised in a real no-WebGL2 browser.
- HRTF `PannerNode` behavior and `positionX` AudioParam automation vary across browsers; a legacy `setPosition` fallback is included but unverified.
