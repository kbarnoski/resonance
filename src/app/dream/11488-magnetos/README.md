# Magnetos — `11488-magnetos`

**The Sun and Earth's magnetosphere, right now — as a living field of light and
sound that builds toward breakthrough.**

Real space-weather data from NOAA's Space Weather Prediction Center drives a
full-viewport WebGL2 field of magnetic **field lines / flow-field streaklines**
(iron-filings-around-a-magnet, but alive and cosmic) that curl, fold, and
reconnect. Calm conditions read as sparse, slow, cool teal-green lines drifting;
as the storm builds the field densifies and reconnects violently, pushing teal
→ gold → magenta → white toward a dense shimmering peak lattice.

## What it is

- **Visuals** — a WebGL2 fragment shader with a **ping-pong feedback texture**.
  Each frame a SIM pass advects the previous field along a curl-noise flow field
  shaped by a cosmic dipole, decays it, and injects thin iso-contour field
  lines; a DISPLAY pass colourises intensity + accumulated memory and blooms it.
- **Audio** — an evolving Web Audio drone (detuned partials, granular noise bed,
  Kp shimmer, a slow Shepard-ish rising layer, and a soft bright bell on
  flares). The root note glides up a fixed minor scale as the storm builds.
- **Always alive** — the scene self-starts with a quiet snapshot within ~1s,
  before any fetch or audio. Because real conditions are usually quiet, the
  primary CTA **Summon storm** runs a scripted ~112s escalation to a G3 storm
  with a mid-sequence M5 flare, then eases back.

## NOAA data sources (fetched client-side, CORS-open)

| Feed | URL | Used for |
| --- | --- | --- |
| Solar wind (RTSW) | `…/json/rtsw/rtsw_wind_1m.json` | last `proton_speed`, `proton_density` |
| Magnetic field (RTSW) | `…/json/rtsw/rtsw_mag_1m.json` | last `bt`, `bz_gse` (neg = southward) |
| Planetary K | `…/json/planetary_k_index_1m.json` | last `estimated_kp` |
| GOES X-rays | `…/json/goes/primary/xrays-1-day.json` | last `flux` for `0.1-0.8nm` → flare class |

Base host: `https://services.swpc.noaa.gov`. Polled every ~60s with a ~6s
`AbortController` timeout; each feed degrades independently to the embedded
`QUIET` snapshot. Status pill shows `LIVE · <hh:mm>Z` or `REPLAY · scripted`.

## Mapping

| Physics | Field | Sound |
| --- | --- | --- |
| Solar-wind speed | flow velocity of the streaklines | filter cutoff opens, root glides |
| Proton density | line count + thickness | granular noise bed |
| Southward Bz | reconnection tension / folding | downward detune (harmonic tension) |
| Kp | overall build, density, up the palette | shimmer + upper partials |
| X-ray flare | reconnection bursts (bright arcs) | soft bright bell swell |

A master `level` (0–1) blends Kp, southward Bz, wind speed, and density into the
felt intensity that both the field and the audio ride.

## Long-form accumulation

A slow **memory** accumulator (CPU-side, mirrored by the shader's G channel)
deposits a persistent lattice while a storm is active and bleeds away over
minutes. This is the long-form idea: the field remembers where it has been, so
three minutes into a storm it looks meaningfully denser and more folded than at
the storm's start — not just tracking the instantaneous value. The scripted
storm builds slowly (an ~8→62s ramp) precisely so this structure has time to
grow.

## Safety

- **Audio** — every voice routes through a `DynamicsCompressor` limiter and a
  calm master gain before `ctx.destination`; nothing touches the destination
  raw. Full teardown stops all oscillators/sources, disconnects the chain, and
  closes the context.
- **Photosensitivity** — no hard strobe: luminance drifts smoothly and
  reconnection bursts ramp over ≥300 ms (both the visual arc envelope and the
  audio bell). `prefers-reduced-motion` slows the flow and damps
  feedback-accumulation flashiness.
- **Graceful degradation** — no WebGL2 → on-brand notice (no throw). Feedback
  prefers `RGBA16F` (feature-detected via `EXT_color_buffer_float`) and falls
  back to `RGBA8`. NOAA blocked/failed → embedded snapshot + scripted storm.
- **Determinism** — a seeded mulberry32 PRNG (not `Math.random`) seeds the
  field structure and the noise bed for repeatable results.

## Prior art

**Helioradar AV** (av.helioradar.com, Feb 2026) — real-time SWPC sonification.
Magnetos shares the live-SWPC-as-instrument premise but pushes toward the most
abstract/visionary rendering: an accumulating magnetic-field-line field that
builds toward a breakthrough peak rather than a readout or a literal aurora.

## Files

- `page.tsx` — client component: loop, NOAA intake, storm scripting, UI chrome.
- `render.ts` — WebGL2 ping-pong field renderer (+ RGBA8 fallback, no-WebGL2 stub).
- `audio.ts` — `MagnetoAudio` Web Audio engine with master limiter.
- `noaa.ts` — SWPC fetch, embedded `QUIET`, scripted storm, flare-class helper.
- `mapping.ts` — physics → normalised drive params, mulberry32 PRNG, memory.
