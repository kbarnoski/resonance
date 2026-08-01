# Orrery (4856)

## The one question

**"What if the whole planet AND its star played themselves as ONE instrument —
real earthquakes, the real geomagnetic field, and the real solar wind, fused
into a single evolving cosmic drone-instrument, right now?"**

## What it is

A deep multi-**source** extension of **Seismarium (4520)**, which sonified USGS
earthquakes *alone* into a WebGPU planetary wave-tank. Orrery fuses **three
genuinely heterogeneous real-time data streams** — solid-Earth seismicity, the
solar wind, and the geomagnetic field — into **one** accumulating planetary
energy field and **one** musical grammar, so an indefinite stream of indifferent
cosmic events reads as **music, not monitoring-noise**.

- **Visual:** one equirectangular world field simulated as a discretised 2D
  elastic wave equation (`u_next = 2u − u_prev + c²·∇²u`, damping ≈ 0.9994 so
  ripples *accumulate* = long-form memory) on a **WebGPU compute shader** with
  ping-pong storage buffers, rendered as an abstract violet height/energy ramp.
  A **Canvas2D CPU fallback** (coarser grid, same three forcings) always paints
  if WebGPU is unavailable. Badged GPU / CPU.
- **Audio:** three Web Audio voices under one rotating-pentatonic grammar,
  summed through a single `DynamicsCompressor` limiter.

The three streams enter the *same* field three *different* ways, and the three
voices share the *same* key — that fusion is the surprise, not any one stream.

## The three streams → one field, one grammar

| Stream | Live feed | Field injection | Voice | Musical mapping |
| --- | --- | --- | --- | --- |
| **Earthquakes** | USGS `all_hour` / `all_day` GeoJSON | sharp localized Gaussian impulse at the quake's (lon,lat) cell | struck **modal bells** (inharmonic partials + noise-click mallet) | mag → loudness + register (big = low/long); depth → timbre/decay; lat → stereo pan; fundamental snapped to the rotating pentatonic |
| **Solar wind** | NOAA SWPC `plasma-1-day.json` (`[time, density, speed, temp]`) | a slow **global undulation** that advects across the world and raises the energy floor (a sustained pressure, not a hit) | bowed **carrier** drone (the pad the bells sit over) | speed → pitch (snapped to a scale degree) + brightness (lowpass cutoff); density → amplitude |
| **Geomagnetic Kp** | NOAA SWPC `planetary_k_index_1m.json` (`kp` / `estimated_kp`) | a shimmering **polar-band bloom** near the top/bottom of the field | swelling **choir** pad (higher, shimmering "sky" voice) | Kp → bloom amplitude (squared, so quiet skies stay silent) + shimmer width |

### The grammar (why it's one instrument, not three alarms)

All three voices read the **same** slowly-rotating key: a root that walks a
lydian-tinted circle every ~21 s and a mode that alternates major/minor
pentatonic every ~63 s. Bells snap their fundamental to it; the wind carrier
glides only onto its scale degrees; the aurora choir voices a chord drawn from
it. Everything sums through one limiter. There are **no wrong notes** — only the
cosmos, quantised into an ensemble. This "impose a declarative grammar over the
data" principle is the load-bearing idea (see refs).

## How it degrades (always plays, always paints)

- **No WebGPU** → Canvas2D fallback field on a coarser grid, badged **CPU**.
- **Fetch blocked** (the headless review proxy may block all outbound GETs) →
  each stream independently falls back to a **deterministic seeded synthetic
  generator** (`mulberry32(0x4856)`):
  - quakes: a Gutenberg–Richter magnitude distribution over the last 24 h;
  - solar wind: a plausible speed/density sine + seeded-phase walk;
  - Kp: a Catmull–Rom-smoothed seeded random-walk.
  Each stream is badged **LIVE** or **SYNTH** independently, so a partial
  network still upgrades what it can.
- **No audio gesture yet** (autoplay policy) → the **visual self-demos silently
  on load** in ~1 s (synthetic quakes prime the basin, wind + Kp forcing paint
  immediately); a "Tap to enable sound" affordance starts the audio.
- Live feeds are polled on slow intervals (quakes 60 s, wind 45 s, Kp 60 s) and
  upgrade the piece in the background; genuinely-new quakes are struck the moment
  they land.

## Determinism

No `Math.random`, `Date.now`, or `new Date` in the render/sim/audio path. All
randomness is a seeded `mulberry32(0x4856)`; timing uses `performance.now()`;
wall-clock (`performance.timeOrigin`) is used **only** to place real feed epoch
timestamps on the 24 h → 90 s timeline. The self-demo is byte-for-byte
reproducible across loads.

## Named references

- **Florian Dombois, *Auditory Seismology* (2001)** — sonifying seismic data as
  an audible, interpretable instrument.
- **Erie: A Declarative Grammar for Data Sonification** (arXiv:2402.00156) — the
  "impose a grammar over the data" principle that turns an indifferent stream
  into music.
- **NOAA SWPC real-time Solar Wind Display Viewer** (experimental, May 2026) and
  **IMAP I-ALiRT real-time solar-wind broadcast** (2026) — the live
  multi-source space-weather frontier this piece cashes into art.

## Files

- `page.tsx` — `"use client"` orchestration: boot GPU/CPU field, self-demo with
  synthetic streams, background live upgrade + slow polls, the animation/audio
  loop, chrome + design-notes modal.
- `field.ts` — the shared `WaveField` / `FieldForcing` interface, grid
  constants, the violet ramp, and the forcing→shader-parameter mapping.
- `gpu.ts` — WebGPU compute field: wave integrator + all three forcings in one
  shader, plus the violet render pass.
- `cpu.ts` — Canvas2D fallback field with the identical three forcings.
- `streams.ts` — the three data streams: live fetch + deterministic seeded
  synthetic generators + normalisers + geometry helpers.
- `audio.ts` — the one-grammar synth: struck bells, bowed wind carrier,
  swelling aurora choir, shared rotating-pentatonic key, master limiter.

## Honest limitations

- The "advection" of the solar wind is a large-wavelength oscillatory forcing
  whose phase advances with plasma speed — it reads as a moving global pressure,
  not a physically-faithful MHD advection. Deliberately abstract (the brief
  steers away from a literal aurora aesthetic).
- Between live polls the sustained voices hold their last reading (the audio's
  own tremolo/vibrato keeps them breathing); they don't interpolate a live time
  series. On SYNTH they evolve continuously from `performance.now()`.
- `mag-1-day.json` (IMF) is listed in the brief but not wired in — speed +
  density already fully drive the carrier; adding Bz would mostly duplicate the
  Kp "sky" signal.
- Kp is a 3-hour planetary index sampled at 1 min; its live motion is slow by
  nature, so most of the choir's minute-to-minute life comes from the shimmer
  and the rotating key rather than the raw feed.
- One physics step per frame keeps it photosensitive-safe but means the field's
  evolution rate is tied to frame rate; on a very slow device ripples propagate
  more slowly (the piece still holds together).
