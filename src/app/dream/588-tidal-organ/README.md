# 588 · Tidal Organ

**What if Resonance were a tidal organ — a warm, breathing instrument tuned by the live state of a real ocean right now?**

A visitor picks (or geolocates) a coastline. The piece fetches the *real* current
marine swell and lets it *play* a slow, warm just-intonation drone-organ over a
luminous ocean-energy field. The tension lives in the actual sea, not a synth
knob — music **about** the real ocean this minute. Warm, oceanic, meditative.

## How to use

1. Open the page. After ~3s with no interaction it auto-starts on a synthetic
   demo swell so a silent glance still sounds and moves. (Browsers may gate audio
   until a user gesture; the visual field starts regardless.)
2. Tap **Listen to the sea** to create/resume the AudioContext inside the gesture
   (required on iOS).
3. Pick a coastline preset (Monterey Bay · Big Sur · Oahu North Shore · Nazaré /
   Lisbon · Bay of Biscay · Iceland S Coast), or **Use my location** to snap to
   the nearest preset ocean point.
4. The source chip shows **emerald `live · <coast>`** when real data loaded, or
   **amber `demo swell (offline)`** on fallback.

## Data source + fallback

- **Open-Meteo Marine API** — free, no key, CORS-enabled, fetched directly
  client-side (no API route):
  `https://marine-api.open-meteo.com/v1/marine?latitude=…&longitude=…&current=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction`
- **Robust fallback (critical):** if the fetch fails (offline / CORS / sandbox)
  *or* nobody interacts within ~3s, a synthetic **demo swell** generator runs —
  slowly drifting wave height (~0.5–4 m), period (~6–16 s) and direction
  (~0–360°) — so the piece *always* sounds and moves. Live data also refreshes
  every 5 minutes while a real feed is loaded.

## Just-intonation mapping

A warm harmonium / sea-organ chord, **not** a bright synth wash.

- **Chord:** just-intonation ratios `1/1, 9/8, 5/4, 3/2, 7/4, 2/1` over a low
  root (~55–110 Hz). Soft sine/triangle partials, gentle lowpass, long
  attack/release, subtle detune for chorus warmth, soft limiter.
- **wave_period → the breath:** a master LFO (amplitude + filter) runs at roughly
  one cycle per wave period. Longer period = slower, grander breaths.
- **wave_height → fullness:** more stacked drone voices (always ≥ 2) and a more
  open lowpass / higher master level. Bigger seas = a fuller, more powerful chord.
- **swell_wave_period → the root:** longer-period groundswell = deeper
  fundamental.
- **wave_direction → space:** voices pan around a compass centre with a spread
  that widens as seas build — a compass of sound.

## The visual field

A luminous ocean-energy field that breathes with the audio. **Jury-banned this
cycle: three.js and SVG — neither is used.**

- **Preferred: WebGPU** — a fullscreen fragment shader of three interfering swell
  wavefronts + caustic-sharpened crests + drifting surface noise. Wavelength,
  speed and flow angle come from the real wave_period / height / direction; the
  whole field brightens with the live drone level; deep teal/indigo base → aqua
  mids → warm gold on crests. Selected at runtime via `navigator.gpu` + adapter
  request, with try/catch so it never crashes.
- **Canvas2D fallback** — same idea in layered sine-band waves with additive glow
  and gold crest highlights, used when WebGPU is unavailable or the adapter
  request fails. The active path is shown in the UI ("WebGPU field" /
  "Canvas2D field").

## References / lineage

- **Zadar Sea Organ** (Nikola Bašić) — architecture that lets the sea play tuned
  pipes.
- **Annea Lockwood**, *A Sound Map of the Hudson River*.
- The **“Pulse of an Ocean”** buoy-sonification lineage.
- **arXiv 2602.14560**, “sonification of ENSO using gamelan scales” (Feb 2026).

## Unverified surface (honest note)

- **arXiv 2602.14560** and the exact framing of the “Pulse of an Ocean” work are
  cited from the brief and were **not independently verified** in this build.
- Open-Meteo's marine model is a *forecast/analysis* product, not a buoy reading:
  "live" here means the model's current-hour value for the chosen point, which is
  an approximation of the real sea state, not a direct sensor measurement.
- The preset coordinates sit slightly offshore to return swell values; "use my
  location" snaps to the nearest preset rather than querying an arbitrary point.
- Auto-start audio depends on browser autoplay policy; the visual + demo swell
  always run, but sound may require the Start tap on some browsers.

## Files

- `page.tsx` — client component: UI, lifecycle, renderer selection, rAF loop.
- `audio.ts` — `runOrgan(ctx)`: the just-intonation drone-organ (Web Audio).
- `ocean.ts` — presets, live fetch, nearest-coast snap, demo-swell generator.
- `field.ts` — WebGPU + Canvas2D field builders and the swell→visual mapping.
