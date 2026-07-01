# 1084 — Magnetostorm

**Route:** `/dream/1084-magnetostorm`

> *What does the solar wind actually hitting Earth right now sound and look like?*

A real-world-data sonification. The **live** solar-wind + geomagnetic state,
streamed from NASA/NOAA spacecraft, drives an intense auroral-substorm
audio-visual instrument. This is REAL space-weather data, not synthesized noise.
A vast luminous sheet of GPU particles — auroral curtains that ripple, fold and
redden as the interplanetary field turns southward — with a matched sonification
of the same drivers.

## The hook (2026)

As of 2026, NASA's **IMAP (Interstellar Mapping and Acceleration Probe)
I-ALiRT** real-time telemetry has joined NOAA SWPC's public
real-time-solar-wind (RTSW) stream alongside the long-serving **DSCOVR** and
**ACE** spacecraft. June 2026 saw real **G1–G3** geomagnetic storms. This piece
reads whatever the wind is doing *right now* and turns it into sight and sound.

Sonification lineage: **"Listening to the magnetosphere: how best to make ULF
waves audible"** — Archer, Hartinger, Redmon, Angelopoulos et al.,
**arXiv:2206.04279**. Mapping magnetospheric/solar-wind parameters to audible
sound is an established science-communication and analysis technique; this piece
follows it with the live RTSW feeds.

## Live data — the exact endpoints

All three are public, CORS-open, key-less `GET` products from NOAA SWPC, fetched
directly from the client (no API route, no secrets, no side-effects):

| Feed | URL | Fields used |
| --- | --- | --- |
| Plasma | `https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json` | density, **speed**, temperature |
| Magnetic field | `https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json` | **bz_gsm**, bt (\|B\|) |
| Planetary K-index | `https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json` | **Kp** |

The first row of each solar-wind product is a header; values are strings and may
be null — they are parsed to `Number` with sane fallbacks. The newest
non-degenerate row is used as the current snapshot. Live data is re-polled every
~60 s while mounted, and each poll aborts any in-flight fetch.

## Data → sight & sound mapping

| Driver | Range | → Visual (three.js aurora) | → Sound (Web Audio) |
| --- | --- | --- | --- |
| **speed** | ~300–800 km/s | advection / drift velocity, energy | drone drive + master brightness |
| **Bz (GSM)** | southward = negative = geoeffective | **curtains ERUPT** — brighten, fold hard, redden | **the storm opens** — swelling pad, reverb wet rises, filter opens |
| **density** | /cm³ | curtain thickness / active particle fraction | shimmer-partial density |
| **bt / \|B\|** | nT | curl-noise turbulence amplitude | pad detune spread + noisy "air" |
| **Kp** | 0–9 | global intensity, glow, color shift (green → magenta/red) | overall loudness + brightness ceiling |
| **substorm onset** | Bz crossing strongly southward | (implicit in the fold/brighten) | discrete **sub-boom + shimmer** gesture |

The key dramatic variable is **southward Bz**: strong negative Bz = storm onset =
the aurora erupts and the audio opens up. Aurora reads green/teal when the wind
is quiet, shifting to magenta/red as coupling and Kp rise.

## Offline fallback (mandatory)

If any live fetch fails (network down / CORS / offline review), the piece falls
back to a **bundled, modeled ~60-sample G2 substorm arc** in `fallback.ts` —
speed climbs 400 → 650 km/s, density spikes, Bz turns strongly southward, and Kp
rises from ~2 to ~6. The offline arc advances one sample per poll, so it audibly
and visibly *builds* like a live storm. A status badge shows:

- emerald **● live — NOAA SWPC** (with the newest timestamp) when the live fetch
  succeeded, or
- amber **● offline sample (modeled storm)** when using the fallback.

Both look and sound great. The instrument always runs.

## Files

- `page.tsx` — client page: idle poster, Start gate, render loop, live poll, live
  readout panel, teardown.
- `data.ts` — NOAA SWPC endpoints, fetch + parse, `Drivers` + normalised `Params`.
- `fallback.ts` — bundled modeled-storm arc used when offline.
- `aurora.ts` — three.js particle aurora (BufferGeometry + additive points,
  data-driven curl/flow advection, OrbitControls).
- `audio.ts` — Web Audio sonification (shared `droneBank` + `convolutionVoid`,
  storm pad, shimmer, turbulence air, substorm onset), compressor → master.

## Graceful degradation

- **WebGL unavailable / init fails** → a readable `text-rose-300` notice; the
  sonification still runs.
- **AudioContext blocked** → visuals still run, silent, with an amber note.
- **Fetch fails** → the modeled-storm fallback (above).

## Next-cycle deepening ideas

- Use the full 1-day time series (not just the newest sample) to scrub the storm
  as a timeline / show a mini Bz sparkline.
- GPU compute the particle advection in a real ShaderMaterial / GPGPU feedback
  for millions of points and true curl noise.
- Add the OVATION auroral-oval and hemispheric-power products to place the
  curtains at their real magnetic latitude.
- Fold in IMAP I-ALiRT ion-flux channels for genuine spectral texture.
- Stereo-spatialise curtains east/west by lon_gsm so you can *hear* where the
  field is pointing.
