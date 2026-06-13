**For**: kids (4+)

Today's REAL current weather writes a child a little song — a living, slowly-evolving "sky song" the child performs by touching a dreamy aurora field, always in today's key.

## What it is

The piece fetches the **live current weather** for the child's location (Open-Meteo, no key, direct client-side `fetch` — geolocation with a 3s timeout, silent fallback to NYC `40.71,-74.01`; if the fetch fails entirely it plays a lively *baked example sky* and keeps singing). That real weather is the **composer**: it picks the key, mode, tempo, instruments, and the slowly-evolving generative ostinato. The child is the **performer**: touching the aurora adds their own glowing voice on top — always in today's key, so nothing is ever "wrong". No reading, no fail state, no scary or loud sounds.

The song is genuinely **alive**: a Chris-Wilson look-ahead scheduler (25ms `setInterval` pump scheduling notes ~120ms ahead on the AudioContext clock — never `setTimeout`-per-note) plays an evolving pattern that mutates and re-seeds over time (Eno-style recombination), so a silent glance both **looks** like a living sky and **reads** as music being made (each scheduled note blooms in the field).

## Weather → song mapping

| Live weather field | Musical / visual result |
|---|---|
| `weather_code` + `is_day` | **Key, mode & instrument palette** — clear day → bright lydian/major celesta-ish triangle; partly → warm major; overcast → soft suspended pads (no 3rd); fog → low open-fifth drone (dropped an octave); rain → gentle minor-pentatonic plucks; snow → high glassy maj7 bells (lifted register); showers → restless minor; thunder → hushed dorian (never scary). **Night** drops the whole register an octave and hushes the brightness. |
| `wind_speed_10m` | **Tempo** — still air ≈ slow (0.46s/step), breezy ≈ brisk (0.16s/step). Also the aurora drift speed. |
| `cloud_cover` | **Density / voicing thickness** of the auto-generated pattern (more cloud → more notes sound), and a cloud veil over the aurora. |
| `temperature_2m` | **Timbral warmth** — colder opens the top of the low-pass (brighter), warmer rounds it; also tints the aurora toward amber. |
| `precipitation` | An **overlaid rain/snow droplet voice** layer (snowy = higher, glassier). |
| `relative_humidity_2m`, `wind_direction_10m` | shown in the readout; part of the live data fetched. |

**Child touch** → a glowing voice snapped to today's scale: vertical position picks the pitch (higher up = higher note, with an octave lift near the top), and a bloom ripples in the aurora at the touch point. Instant (<50ms) visual response even before audio unlocks.

## Audio safety (kids)

Master chain: `gain → BiquadFilter lowpass (≤7600 Hz) → DynamicsCompressor (threshold −10, ratio 20) → destination`. All gain changes use `setTargetAtTime` (no sudden transients). An always-on soft ambient drone bed (root + fifth, slow tremolo) means it's never silent once started. AudioContext is created inside the first touch (iOS unlock).

## Visual

Raw **WebGL2 GLSL** aurora/field (no three.js, no SVG): layered drifting fbm curtains that breathe with the weather and pulse with every scheduled note and every touch; warm horizon glow, cloud veil from cloud cover, drifting twinkling stars at night. Alive from frame one, before audio. If WebGL2 is unavailable it falls back to a Canvas2D field that still drifts and blooms (with a `text-rose-300` notice).

## Files

- `weather.ts` — live Open-Meteo fetch, geolocation, WMO classification, baked fallback sky.
- `audio.ts` — Web Audio generative engine + look-ahead scheduler + kids-safe master chain.
- `render.ts` — WebGL2 aurora renderer + Canvas2D fallback; note/touch blooms.
- `page.tsx` — wiring, gesture unlock, touch performance, UI.

## References

- **Andrea Polli** — climate-data sonification (turning real atmospheric data into sound).
- **Natalie Miebach** — woven sculptures that are literally weather-data musical scores.
- **Brian Eno** — generative / ambient music (*Music for Airports*); the evolving ostinato uses Eno-style generative recombination so the piece never loops flat.
