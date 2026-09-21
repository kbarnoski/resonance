# 17616-tremor — The Earth's Tremors Play His Piano

**Status:** demoable. Fetches the live public USGS earthquake feed and voices each
quake as a transformed fragment of one of Karel's real piano takes; falls back to
bundled sample quakes when the network is unavailable, so it always plays.

## Concept

What if the living pulse of the whole planet — every earthquake happening around
the world right now — conducted one of Karel's piano takes? The keyless,
CORS-open USGS `all_day` GeoJSON feed is fetched (and refreshed every few
minutes). Each quake voices ONE transformed fragment of a decoded real take
(default: **"Isolation"**) through its own `AudioBufferSourceNode` with a
per-voice low-pass filter, stereo pan, reverb send and a gentle swell envelope.
Events are metered out on a calm rolling cadence — largest / most-recent first —
never a burst, so the piece stays beautiful rather than becoming a wall of noise.
The Earth is the score; his recording is the sounding body. Nothing is
synthesized — every sound you hear is his piano.

## Sonification mapping

| Real-world quantity | Musical parameter | Mapping |
| --- | --- | --- |
| Magnitude (M) | Loudness + duration + phrase swell | Bigger quake → louder peak (0.07–0.57), longer fragment (0.5–4.1 s), fuller swell |
| Depth (km) | Timbre + space | Deeper → darker low-pass (cutoff ~5.5 kHz shallow → ~320 Hz deep) and more reverb send (more distant) |
| Longitude | Stereo pan | West → left, east → right (`lon/180`) |
| Latitude | Register / segment | Chooses which segment of the take is sliced, plus a gentle transpose (−5…+5 semitones); higher latitude → higher register / later in the take |
| Recency | Brightness + priority | Newest quakes are scheduled first, voiced brighter, and drawn boldest on the map |

Voices are capped (10 simultaneous, oldest stolen). When nothing new arrives, the
scheduler occasionally re-breathes a few known events so the instrument keeps
playing gently instead of falling silent.

## Tags

- **INPUT** = real-world data (live USGS earthquake feed)
- **OUTPUT** = audio-forward + minimal SVG world map (equirectangular graticule +
  lat/lon dot field, pulsing epicenters sized by magnitude — no Canvas2D, no WebGL2)
- **TECHNIQUE** = event-driven sonification (each quake → a transformed fragment
  of Karel's take)
- **PALETTE** = cool-luminous (indigo `#6366f1` / lilac `#a78bfa` / cyan `#22d3ee`
  over ink)

## Reference

Data-driven audio / auditory display, as gathered at the **International
Conference on Auditory Display (ICAD)** and its **Data Sonification Award
(2025/26)**, and the 2026 turn toward "sonifying" live, real-time feeds.

## Audio source

Karel's real catalog only, via `loadRealTrackBuffer` / `REAL_TRACKS` from
`_shared/welcomeHome`. Default take: **"Isolation"**
(`dad56bd6-8e53-442f-bb19-75ce4cc3e11c`); any Welcome Home / Snowflake take can be
swapped in from the selector. Every audio node terminates at
`createSafeMaster(ctx).input`; the map's breathing glow is driven from the safe
master's analyser.

## Data source

USGS Earthquake Hazards Program public feed (no key, CORS-enabled):
`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`.
Each feature supplies `properties.mag`, `properties.place`, `properties.time`,
and `geometry.coordinates` `[lon, lat, depth]`. If the fetch fails or is blocked,
a bundled array of ~14 realistic sample quakes takes over and the status line
switches from "USGS live feed" to "sample data (offline)".

## Next-cycle deepening

1. Cross-fade a second take so shallow crustal quakes and deep-focus quakes draw
   fragments from different recordings (a two-instrument planet).
2. Add a slow orbital sweep / auto-rotate to the map and per-region reverb tails,
   so tectonic clusters read spatially as well as sonically.
3. Layer aftershock detection: when several quakes share a place within minutes,
   voice them as a decaying rhythmic phrase rather than independent grains.
