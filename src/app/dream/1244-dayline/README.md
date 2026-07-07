# 1244-dayline

**What if the Earth's rotation were a music sequencer — the day/night terminator sweeping a flat world map, and every city it crosses at dawn or dusk ringing a note?**

A flat (equirectangular) world map drawn in Canvas2D. Fully offline solar astronomy computes where the sun is and which half of the Earth is lit, in real time or sped up. The day/night **terminator** (the dawn/dusk line) sweeps across the map. As it crosses each of ~44 world cities, that city **rings a note** — dawn crossings (entering daylight) and dusk crossings (entering night) both trigger. A continuous **drone** tracks the total sunlit landmass: more land in daylight makes it fuller and brighter. The result is a self-composing sequencer driven by real planetary geometry.

Route: `/dream/1244-dayline`

## The astronomy (offline engine — `astro.ts`)

All geometry is computed locally; there are **no network calls**.

- **Day-of-year** `N` (1..366) from the chosen UTC date.
- **Solar declination:** `δ = -23.44° · cos( 360/365 · (N + 10) )` (degrees).
- **Subsolar longitude:** `subLon = -15° · (UTChours - 12)`, where `UTChours` is fractional UTC hours (the sun is overhead at local noon).
- **Subsolar latitude** = `δ`.
- **Solar altitude** at a city `(lat, lon)`:

  `sin(alt) = sin(lat)·sin(δ) + cos(lat)·cos(δ)·cos(lon − subLon)`

  The city is **lit** when `alt ≥ 0`.
- **Dawn** = an up-crossing of `alt` through 0 (was `< 0`, now `≥ 0`); **dusk** = a down-crossing (was `≥ 0`, now `< 0`). Each city's previous altitude is tracked between frames to detect the crossing; a note rings on each.
- **Terminator drawing:** the renderer samples a coarse lit/unlit grid (every 8px) and shades the night side with a translucent cool overlay — the boundary reads as the terminator. A luminous band is added where `|alt| < 4°`, amber on the **dawn** side (west of the subsolar longitude, i.e. local morning) and rose on the **dusk** side (east, local afternoon).
- **Sunlit landmass:** a precomputed coarse grid of land sample points (from the continent polygons, every 4° of lat/lon) is tested each frame; the lit fraction (0..1) drives the drone's cutoff and gain.

## Geography (`cities.ts`)

- **44 cities** spread across every continent and a latitude range of roughly -55° (Ushuaia) to +64° (Reykjavík / Nuuk): Tokyo, Sydney, Mumbai, Cairo, Lagos, Nairobi, Moscow, London, Paris, Berlin, Reykjavík, New York, Chicago, Mexico City, Bogotá, Lima, Santiago, São Paulo, Buenos Aires, Los Angeles, Anchorage, Honolulu, Auckland, Jakarta, Beijing, Seoul, Bangkok, Delhi, Tehran, Istanbul, Cape Town, Casablanca, Dakar, Toronto, Vancouver, Helsinki, Athens, Dubai, Perth, Vladivostok, Ushuaia, Nuuk, Johannesburg, Kinshasa.
- **Coarse continent polygons** — rough hand-authored silhouettes for North America, Greenland, South America, Africa, Europe, Asia and Australia, in `[lon, lat]`. They exist only for the pale "printed atlas" landmass fill and the sunlit-land estimate. They are **not accurate coastlines**.

## Audio (`audio.ts` — Web Audio API, pure synthesis)

No samples, no network. On a city crossing, a soft **bell/pluck**:

- **Pitch ← latitude** — mapped to a pentatonic scale; poleward = higher.
- **Stereo pan ← longitude** — west = left, east = right, via a `StereoPannerNode`.
- **Northern cities** get brighter partials (more upper harmonics and a higher voice filter).
- **Dawn** crossings are warmer with a softer attack and longer tail; **dusk** crossings are slightly darker.
- Each voice runs through a gentle **convolver reverb** (offline exponential-decay impulse) → a **limiter** (`DynamicsCompressor`) → master gain (~0.2).

A **drone** — two detuned sawtooth oscillators plus a sine sub around a D root — sits under everything; its lowpass cutoff and gain track the normalized sunlit-landmass value, smoothed with `setTargetAtTime` so it drifts and never jumps. All envelopes are smoothed; no clicks or strobing.

## Visuals (`map-canvas.ts` + `page.tsx`)

- **Pale printed-atlas palette:** warm-paper land (`#efe6d2`), slate seas (`#cdd6da`), dark-ink coasts and labels (`#2b2a24`), a faint graticule, translucent cool night overlay, and the amber-dawn / rose-dusk terminator band.
- Retina-aware canvas (scaled by `devicePixelRatio`).
- Cities are small ink dots; a city **blooms** softly (a low-alpha radial halo, ≤ ~24px, smoothly decaying — no harsh flash) when it rings.
- A subsolar sun glyph with a soft glow marks the zenith point.
- The clock readout shows current UTC time, date, and the sunlit-land percentage.

## Controls

- **Begin** — creates the `AudioContext` on a user gesture (autoplay policy) and starts the drone.
- **Play / Pause** — pauses the advancing clock; the map keeps rendering.
- **Time speed** — a logarithmic slider from real time (1×) up to a full day per ~40s (2160×).
- **Scrub time of day** — jump to any UTC hour of the current date.
- **Now** — jump to the real current time.

**Jump-suppression:** whenever the user scrubs, presses Now, resumes from pause, unlocks audio, or makes a large speed change, every city's previous-altitude sign is silently re-baselined for one frame. Only crossings the terminator *organically sweeps over* ring — scrubbing never machine-guns notes.

The map and terminator animate immediately on load, before audio is unlocked; sound engages after **Begin**. If the `AudioContext` fails, the visuals keep running and a legible notice is shown.

## Honest gaps

- The continent polygons are **coarse** — a dozen-ish vertices each. Islands, precise coastlines and Antarctica are omitted, so the landmass fill and the sunlit-land estimate are approximate.
- The solar model omits the **equation of time** (mean vs. apparent solar time) and **atmospheric refraction** (the horizon is a hard `alt = 0`). Crossing times can be off by up to ~15 minutes of real solar time and a fraction of a degree at the horizon. Fine for a musical sequencer; wrong for navigation.

## References

- Refik Anadol, *Machine Dreams: Rainforest* (Dataland, opened 2026-06-20) — data-driven immersive environments.
- Ryoji Ikeda, *data.tron* — data as austere audio-visual material.
- Classic day/night **terminator maps** (the "grayline" familiar to radio operators and cartographers).
