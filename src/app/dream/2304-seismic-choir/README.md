# 2304 · Seismic Choir

**What if Resonance's carrier wave were the living Earth — its real, in-the-last-hour earthquakes sung as a spatial cosmic-ambient choir?**

Every earthquake currently on the USGS real-time feed becomes **one sustained voice** in an additive choir, and a glowing marker on a slowly rotating three.js globe.

## Mapping

| Quake property | Sound | Visual |
| --- | --- | --- |
| magnitude | loudness + fundamental pitch (bigger = deeper, louder) | marker size + pulse depth |
| depth (km) | lowpass cutoff / timbre (deeper = darker) | color: amber (shallow) → ember (deep) |
| longitude | stereo pan (planet spread across the field) | true lon position on globe |
| latitude | slight detune + harmonic shimmer | true lat position on globe |

There is **no master calm→peak knob** — the Earth's real multi-event stream _is_ the score. Newly-entering quakes fade in over ~1.5 s.

## Interaction

- **Start** resumes the AudioContext (silent until then) and fades the master in over 1 s.
- **Drag** to orbit the globe; auto-rotation resumes after a short idle.
- **Click a marker** to SOLO that quake — its voice is foregrounded, it is spotlit, and its stats (magnitude, place, depth, time) appear. Click again (or empty space) to clear.

## Data path

USGS `all_hour.geojson` is keyless and CORS-open, fetched **client-side** (no API route, no guard, no secret). It widens to `all_day.geojson` if the hour is empty, and falls back to a bundled ~14-quake snapshot if the network is unavailable — so the piece works with **zero network**. A status line notes when cached sample data is in use.

## Safety & robustness

- Voices capped to the **24 loudest** quakes.
- Master routed through a `DynamicsCompressor` limiter at low gain (**≤ 0.2**), 1 s fade-in.
- SSR-safe: `window` / three / AudioContext touched only inside effects and handlers.
- If WebGL is unavailable, an on-brand notice shows but **the choir still plays** (audio never depends on WebGL).
- Full teardown on unmount: renderer / geometries / materials disposed, RAF cancelled, AudioContext closed, listeners removed.

## Tags

input = **external-data (USGS live)** · output = **three.js / WebGL globe** · technique = **real external-API sonification + additive spatial synthesis** · palette = **tectonic** (abyssal teal/slate → magma amber on near-black) · pole = **cosmic-ambient**.

## Lineage

The seismic-sonification tradition — IRIS "Seismic Sound Lab" and Ben Holtzman (Lamont-Doherty Earth Observatory) — hearing the Earth's seismograms as sound.
