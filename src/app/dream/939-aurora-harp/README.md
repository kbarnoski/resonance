# 939 · Aurora Harp

**What if you could HEAR space weather right now?**

The live solar wind streaming past Earth — its speed, density, and
interplanetary magnetic-field Bz — drives a shimmering WebGL2 aurora curtain you
watch, and audifies the magnetosphere's resonances the way NASA's HARP project
does. When the solar wind is calm you hear slow, steady ULF-style drones; when a
gust or a southward Bz hits, the aurora flares green-violet-crimson and the
sound thickens, beats and ripples. Music made from REAL external data and its
resonances — not from a pitch scale.

## Tags
- **INPUT** — live external real-world data: two NOAA SWPC real-time products
  fetched directly from the browser, polled every ~60s.
- **OUTPUT** — raw WebGL2 fragment shader: a full-screen aurora curtain
  (fbm-folded vertical light sheets, green→violet→crimson by activity, star
  field over a dark arctic horizon). No three.js, no Canvas2D for the visual.
- **TECHNIQUE** — space-weather data sonification in the spirit of NASA HARP:
  speed → gust tempo/energy; density → drone partial count/brightness; southward
  Bz → flares + added beating/dissonance + aurora intensity; Bt/turbulence →
  shimmer + beat rate. Detuned oscillator **pairs** create real *beating* whose
  rate tracks turbulence. Master compressor/limiter for safety. Not a scale.
- **PALETTE/VIBE** — atmospheric, cosmic, nocturnal aurora; awe and slow grandeur.

## How it works
- **Start** seeds an immediate synthetic solar wind (so sound + a moving sky
  appear within ~0.6s), resumes the AudioContext, then reaches for the live feed.
- **Data:** `plasma-5-minute.json` (time, density, speed, temp) and
  `mag-5-minute.json` (bx, by, **bz_gsm**, …, **bt**) from services.swpc.noaa.gov.
  Polled every 60s, each fetch wrapped in try/catch.
- **Fallback:** if the fetch fails (offline / CORS / feed gap), a smoothly
  varying synthetic solar-wind generator takes over (with periodic southward-Bz
  "substorm" gusts) and an amber notice appears. WebGL2 missing → audio-only +
  amber notice. AudioContext blocked → reported on the Start gesture.
- **Audio engine:** a sustained drone bed on inharmonic resonance *bands* (each a
  detuned oscillator pair → beating); density gates how many partials sing;
  turbulence (Bt) + southward Bz set the beat rate; gust swells retrigger faster
  as wind speed rises; a southward-Bz crossing fires a flare (sub-rumble +
  ripple of beating tones) and flashes the sky. Everything runs through a
  limiter/compressor.
- A live readout (speed km/s, density p/cm³, Bz nT, Bt nT) and a small
  "what am I hearing" panel explain the mapping; a pointer lets you look around.

## Citations
- **NASA HARP** — *Heliophysics Audified: Resonances in Plasmas* — citizen-science
  project sonifying ULF plasma waves / magnetosphere resonances from THEMIS data.
- **NOAA SWPC real-time solar wind** — ACE / DSCOVR at the Sun-Earth L1 point;
  `services.swpc.noaa.gov/products/solar-wind/{plasma,mag}-5-minute.json`.
- (framing) the OVATION aurora model / "harmony of the magnetosphere."

*Built 2026-06-25 for the Resonance dream lab. Data: NOAA SWPC (L1, ACE/DSCOVR).
Sonification approach after NASA HARP — Heliophysics Audified: Resonances in
Plasmas.*
