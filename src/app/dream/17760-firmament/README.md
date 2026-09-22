# 17760-firmament — the sky's clock conducts a piano take

**Status:** demoable

## The one question

What if the sky's own clock over you right now — where the sun and moon sit
above your horizon — conducted one of Karel's real piano takes, so it sounds
like daylight where you are and slowly turns to a night-voice as the sun sets
and the moon rises?

## What it does

A non-embodied, real-world-data piece — no camera, no microphone. Computed
astronomy (always available, always correct) reads the diurnal and lunar clock
of the observer's place and performs **one decoded take of Karel's real
recording** (default "Welcome Home"). Sun altitude crossfades three sustained
readings of that single buffer — a day voice, a night voice an octave down, and
a moon overlay an octave up — so the recording sounds like daylight and slowly
becomes a night-voice as the sun sets, with a silver moon line fading in when
the moon is up. An optional live-weather layer veils the sound with cloud and
wind. The sky is drawn as minimal inline SVG on a near-black ground: a graded
sky band, a horizon line, an arcing sun disc, a phase-rendered silver-violet
moon, night stars, and a soft glow that breathes off the audio.

Everything works fully offline with geolocation denied and the network blocked.
A **Demo day** toggle (default on) sweeps a full 24 hours in ~90 seconds so the
entire day → dusk → night → moonrise morph, and the audible crossfade, is
unmistakable within seconds. A mono status line always states the data source.

## Data sources

- **Primary — self-contained computed astronomy (no network):**
  - **Sun altitude** for the observer's lat/long + current UTC, from solar
    declination (day-of-year), the equation of time, and local solar time via
    hour angle: `alt = asin(sin φ·sin δ + cos φ·cos δ·cos H)`.
  - **Moon phase** exact, from the new-moon epoch JD 2451550.1 and synodic
    period 29.530588853 d; illuminated fraction `(1 − cos 2πp)/2`.
  - **Moon altitude** from an **approximate** low-order ecliptic-longitude model
    (documented as approximate in the source) — only precise enough to gate the
    moon voice to roughly-correct moon-up nighttime.
  - Geolocation is requested with a ~6 s timeout; on denial/timeout it falls
    back to **San Francisco (37.77, −122.42)** and never blocks.
- **Live layer (optional, fail-safe):** open-meteo current conditions
  (keyless, CORS-open), `current=is_day,cloud_cover,wind_speed_10m`, wrapped in
  an AbortController ~4 s timeout and refetched every ~5 min. Any failure is
  treated as **clear (offline)**.

## Mapping

| Data | Musical / visual response |
| --- | --- |
| Sun altitude (high) | **Day voice** — playbackRate 1.0, presence high-shelf, drier; bright sky band, arcing pale sun disc high overhead |
| Sun altitude (below horizon) | **Night voice** — octave down (rate 0.5), reverb-wet, lowpass ~820 Hz, quieter; near-black sky, stars fade in |
| Sun altitude −6°…+12° | Dawn/dusk crossfade band (smoothstep) between day and night voices; restrained twilight warmth at the horizon |
| Moon up at real night × illuminated fraction | **Moon overlay** — octave up (rate 2.0), quiet, reverb-wet silver line; near-silent at new moon, clear near full |
| Moon phase | Phase-rendered silver-violet moon (correct illuminated crescent/gibbous via an SVG arc path) |
| `cloud_cover` 0…100 | Shared cloud-veil lowpass drops ~16 kHz → ~1 kHz; ambient glow dims |
| `wind_speed_10m` | Faint air/detune across the three readings (±~11 cents) |
| Audio RMS (safeMaster.analyser) | Soft glow breathes; stilled under `prefers-reduced-motion` |

## Audio architecture

The only sound is Karel's decoded recording, transformed — no oscillators, no
synths, no noise-as-instrument, no microphone. Three looping `BufferSource`s of
the **same** buffer (day / night / moon) run through per-voice filters and gains
glided with `gain.setTargetAtTime`. One `ConvolverNode` fed by a runtime
decaying-noise impulse response is the shared reverb (an effect, not a voice);
per-voice send levels keep the day voice driest. A shared cloud-veil lowpass
sees the whole mix. Every audible path terminates at `safeMaster.input` — never
`ctx.destination` — and visuals are driven from `safeMaster.analyser`.

## References

- Kramer, G. et al., *Sonification Report: Status of the Field and Research
  Agenda* (ICAD / NSF) — the auditory-display foundation for mapping data to
  sound.
- **ICAD**, the International Conference on Auditory Display — the ongoing
  lineage of data sonification and real-time auditory display of live data
  streams.
- Hermann, T., Hunt, A., Neuhoff, J. (eds.), *The Sonification Handbook* (2011)
  — parameter-mapping sonification and continuous data-to-sound design.
- Diurnal / circadian and lunar-phase sonification of place and time: rendering
  the daily solar cycle and the moon's phase as an evolving voice tied to a
  specific location's sky clock.
