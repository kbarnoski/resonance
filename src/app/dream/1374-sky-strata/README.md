# 1374 · Sky Strata

**The one question:** *What if the LIVE sky composed the piece right now — rendered not as a GPU glow but as clean, deterministic layered light-STRATA you can read like a score, and played over?*

This is the dream lab's first real **external-world-data sonification**. Current NOAA space-weather is the *primary composer* — it authors the piece's **key, tempo, palette, and mode**. You are the second voice: you *play* melodic notes on top, duetting with the sky.

Everything renders as a **deterministic inline SVG** — stacked translucent aurora-strata, a seeded starfield, a horizon glow, and a legible solar-wind time-series ribbon. No canvas, no WebGL. Because it's plain SVG, the render is eye-verifiable and reads like a score, in the spirit of the reference below.

## How to play

1. Press **Begin** — the sky's audio starts on your gesture (the strata already drift silently before then, so a cold glance still shows life).
2. The sky plays itself: a generative pentatonic arp over a cosmic pad, tuned live by the data.
3. **You** play over it:
   - **Tap / click** any strata band (or anywhere in the sky) to pluck a bright foreground note in the current key.
   - Press keys **A S D F G H J** to pluck the seven voices.
   - **Drag left↔right** to shift the played *emphasis* (register) — the faint vertical marker follows you.
   - Each play **flares** its band brighter for ~1 second, so the world reads as *played*, not watched.

## The data → music / visual mapping

| NOAA input | Source feed | → Music | → Visual |
|---|---|---|---|
| **Solar-wind speed** | `plasma-1-day` | Arp tempo (fast wind = brisk arp) | Horizontal band **drift speed** + the recent-history ribbon |
| **Proton density** | `plasma-1-day` | Chord density of the strata voices | **Number & thickness** of bands (4–9) |
| **Bz (GSM), southward** | `mag-1-day` | Major → **minor** pentatonic; tenser register | Bands ride **higher** & more **saturated** (aurora energy) |
| **Bt** | `mag-1-day` | Feeds pad drive / reverb wetness | (indirect, via energy) |
| **Kp index** | `noaa-planetary-k-index` | Overall **energy** + transposes the **key** | **Palette**: low = deep green/teal calm; high = reds/violets, more bands, more motion |

All pitches are pentatonic **scale-indices only**, so every note — sky or played — is always consonant. One pure function, `skyToDrivers()` in `mapping.ts`, drives both the audio and the SVG, so what you hear and what you see always agree.

## Files

- `data.ts` — three keyless NOAA SWPC feeds fetched **client-side** (no API route), each with a 5s `AbortController` timeout; refetched every 60s. Exposes a recent-history array for the ribbon. Falls back to a slowly-drifting `simulateSky()` on any failure.
- `mapping.ts` — the pure `skyToDrivers()` engine + `scaleFreq()` pentatonic helper.
- `audio.ts` — cosmic pad via shared `startDroneBank`, a self-scheduling generative arp through shared `createVoidReverb`, and a brighter played `pluck()` layer. Master ≤ 0.22, 2s fade-in, compressor limiter.
- `page.tsx` — the inline SVG render, live HUD, Begin gate, keyboard/pointer play, and full teardown.

## Reference

**Ryoji Ikeda — *datamatics*.** Data made luminous and legible: pure, clinical, scannable light rather than a blurry glow. Sky Strata aims for that clarity — the sky's numbers become bands you can read.

## Honest limitations

- **Synthetic-sky fallback.** If the NOAA feeds are unreachable (offline, CORS hiccup, headless with no network, or the 5s timeout fires), the piece runs on a deterministic `simulateSky()` that slowly drifts. The HUD badge then reads **simulated sky** (amber) instead of **LIVE** (emerald) — it is never blank or silent, but it is not the real sky.
- The mapping is legible, not scientific — it is tuned for musical/visual range, not physical accuracy.
- NOAA products update on the order of minutes; the 60s poll can show the same sample twice.
- SVG band motion is CSS-driven and honors `prefers-reduced-motion` (falls back to a very slow drift). All audio-linked luminance change is kept ≤3 Hz — no strobe.
