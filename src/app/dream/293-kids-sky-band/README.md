**For**: kids (4+)

# Kids' Sky Band — `293-kids-sky-band`

**Pitch:** A four-year-old's quiet bedtime music, made by the *real sky outside their window right now* — so the band sounds a little different every day, because the weather is real.

Press **Start the sky band** and the piece looks up: it asks for your location (with a 3-second timeout), fetches the live weather, and turns it into both a self-playing pentatonic lullaby and a living WebGL2 sky. No touch needed — the jury banned touch for this kids cycle, so it plays itself hands-free.

## What's novel

- **First kids real-world-data piece in the lab.** Input is neither touch, tilt, mic, nor camera — it's the actual weather (`navigator.geolocation` + a keyless public API).
- **First weather source.** Live data from Open-Meteo (keyless, CORS-open, side-effect-free GET — no API route, no server, no secrets).
- **Hands-free by design.** The ensemble is a self-evolving generative loop scheduled with `audioCtx.currentTime` look-ahead; it is never silent once started. Touch is an *optional bonus* (tap a sky-friend to make it sing louder), not the primary interaction.
- **Raw WebGL2 sky.** A single full-screen quad and one fragment shader paint the entire scene — no three.js, no Canvas2D.

## How the weather becomes music (Web Audio API, all synthesized)

Four "sky-friends" play in **C major pentatonic** (no wrong notes ever), through a master `DynamicsCompressor` limiter + a gentle 9 kHz lowpass so the sounds stay safe — no sudden loud transients, no harsh highs.

| Friend | Voice | Driven by |
| --- | --- | --- |
| **Sun** | warm bell (triangle + soft 2nd partial) | `temperature_2m` + `is_day` → register & brightness; day = higher/brighter, night = lower/softer |
| **Cloud** | soft sine pad (open fifth) | `cloud_cover` → pad level up, lowpass cutoff down (more cloud = thicker & darker) |
| **Wind** | filtered noise whoosh on a slow LFO | `wind_speed_10m` → amplitude, filter brightness, LFO rate |
| **Rain** | gentle pentatonic droplet plinks | `precipitation` → droplet density; zero rain still gives sparse plinks (~every 3.5 s) so it's never dead |

The whole ensemble's **pulse** is nudged by `temperature_2m` (warmer = a touch livelier, still lullaby-slow). A ~12-minute exponential **lullaby fade-out** is wired up (`fadeOut()`), and a quick fade-in on start.

## How the weather becomes the sky (WebGL2 fragment shader)

One `#version 300 es` program, one full-screen quad, uniforms updated per frame via `requestAnimationFrame` (smoothed so weather updates never jump):

- **Vertical gradient sky** from `is_day` + `temperature_2m` (warm dawn/day blues & golds; cool indigo dusk/night).
- **Drifting procedural clouds** (fbm value-noise) whose coverage threshold = `cloud_cover`; drift speed tied to `wind_speed_10m`.
- **Sun or moon disc** (depending on `is_day`) with a tiny friendly face — two eye dots + a smile, all distance fields — plus a soft glow halo and a night crescent.
- **Rain streaks** when `precipitation > 0`.
- **Stars twinkle** at night (`is_day == 0`).

## Graceful degradation (always demoable)

1. **No geolocation / denied / 3-second timeout** → falls back to a fixed location (San Francisco, 37.77 / -122.42) and shows a small `text-emerald-300/95` notice.
2. **Fetch fails / offline** → uses a bundled `SAMPLE_WEATHER` constant; the full band still plays with zero network, with a `text-amber-300/95` notice ("Showing a sample sky — couldn't reach the weather.").
3. **No WebGL2** → a readable `text-rose-300` notice appears and the audio still plays ("Close your eyes and listen.").

The band and sky both start from the sample immediately on the button press, then swap to live data when it arrives — so there is sound and motion within a frame of pressing Start.

## Named references

- **John Luther Adams, *The Place Where You Go to Listen*** (Museum of the North, Fairbanks) — a real-time installation turning live geophysical data into sound and light. The direct conceptual ancestor.
- **Open-Meteo** — the keyless, CORS-open weather API used as the live data source.
- **RIT "Data Sonification Weather Chimes" (2026)** — the recent lineage of turning live weather into ambient sound.
- **DATASONICA (2026)** — contemporary data-sonification practice this piece sits alongside.

## Next-cycle deepen

- **Moon phase** → crescent shape + a cooler/warmer moon palette.
- **Sunrise / sunset transitions** animated across a single session (true solar elevation).
- **Multi-city tour** — gently drift between several cities' live skies.
- **`weather_code` → fog / storm motifs** — distinct fog pads, thunder swells, and snow textures keyed off the WMO code.
