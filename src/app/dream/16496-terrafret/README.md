# 16496-terrafret — The Earth Plays the Piano

**Status:** demoable

## The one question

**What if the living Earth played Karel's piano — every earthquake on the planet in the last hour becomes a phrase of his real recording?**

This is a real-world-data sonification piece: a genuinely new category for the lab. A live public seismic feed — not a composer — decides what you hear and how it is transformed. The music is *about* the planet, not about music.

## Data source

- **Primary:** `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson`
- **Fallback (sparse/empty hour):** `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`
- Client-side `fetch`, CORS-open, no API key, no server route.
- Polled every ~60s; events deduped by GeoJSON feature `id`.
- Each feature carries `geometry.coordinates = [lon, lat, depthKm]` and `properties.mag / place / time`.
- **Network robustness:** on any fetch error (offline / proxy / blocked), the piece falls back to a small **bundled snapshot** (~12 plausible global events across a range of magnitudes) so it is always audible and demoable. An on-brand `text-muted-foreground` note appears while the snapshot is active.

## Sonification mapping

Each earthquake schedules **one enveloped phrase** — a single `AudioBufferSourceNode` slice of one of Karel's real takes (~1.6–4.9s, attack/release gain envelope). This is sample/phrase triggering, **not** a grain cloud.

| Quake property | Audio parameter | Effect |
| --- | --- | --- |
| **magnitude** | gain + `playbackRate` (1.0→0.5) + register choice | bigger = louder, deeper (down to ~an octave), longer, and drawn from a lower take |
| **depth (km)** | lowpass cutoff (~5200Hz → ~320Hz) | deep quakes muffled/subterranean; shallow quakes bright |
| **longitude** | `StereoPannerNode` pan (−1..+1) | west in the left ear, east in the right |
| **latitude** | buffer start offset | chooses which moment of the piano take we hear |

Registers (real verified takes, preloaded): **Snowflake** (bright, small quakes) · **Interplay** (mid) · **Isolation** (deep, great quakes). Phrases within an arriving batch are staggered (~0.42s) so the result reads as an evolving field; concurrent voices are capped at 7 and the oldest fades when the cap is hit.

## Visual

Canvas2D **equirectangular world map** (lon −180..180 → x, lat 90..−90 → y) with a faint 30° graticule and emphasised equator/prime meridian. Each quake blooms as an expanding ring at its true coordinates, sized by magnitude, its brightness pulsing in sync with the audio via the `safeMaster` analyser. Recent quakes linger as fading marks, so the map slowly draws a picture of the planet's last hour.

**Palette — fresh duotone (art only):** deep ocean-blue (`hsl(210…)`) for the smallest events → hot magenta (`hsl(322…)`) for the largest, interpolated by magnitude. No ember/gold, no grey-monochrome, no ink-on-bone. UI chrome uses semantic tokens (violet accent) exclusively.

## Ambition-floor criteria hit

- **INPUT** — a real-world data stream: the live USGS earthquake feed (external API, client fetch, 60s poll, dedupe by id).
- **OUTPUT** — Canvas2D world map: equirectangular projection, blooming rings, accumulating hour-portrait.
- **TECHNIQUE** — data→music mapping via event-triggered enveloped sample slices (phrase triggering, not granular).
- **PALETTE** — a fresh saturated blue↔magenta duotone.
- **AUDIO** — Karel's real recordings only, loaded through `loadRealTrackBuffer`; every voice terminates at `createSafeMaster`; zero `ctx.destination`, zero synth/oscillator/noise.
- **Robustness** — bundled-snapshot fallback keeps it demoable offline; full teardown on unmount (sources stopped, nodes disconnected, context closed, RAF cancelled, poll interval cleared, resize listener removed).

## Design rationale (the "Read the design notes" content)

Terrafret sits in the **audification / data-sonification tradition** described in Eos.org's *"Earth Is Noisy. Why Should Its Data Be Silent?"* — the long practice of turning seismographs and geophysical records into sound so the ear can catch structure the eye misses. The twist here is the instrument: rather than sine tones or synthesised sweeps, the Earth's tremors are voiced entirely by Karel's real piano.

The magnitude→transpose→register chain gives the field a natural dynamic range: a swarm of tiny local tremors shimmers high and bright, while a rare great quake drops the whole texture into Isolation's low register, an octave down and muffled by its depth. Longitude-as-pan and latitude-as-offset mean the *geometry* of a global hour is legible in the mix — a Pacific-rim cluster sweeps across the stereo field; the same magnitude at a different latitude opens a different phrase of the take. The visual and the audio share one clock: a ring you see expanding is the phrase you are hearing decay.

Because real seismicity is bursty — many small events, punctuated by the occasional large one — the piece composes itself into long quiet stretches broken by sudden arrivals, which is exactly the shape of the planet it is listening to.

No substances, no synthesis, no film grain. Just the Earth, once an hour, on Karel's piano.
