# 14224-skyflock

**The one question:** _What if your whole catalog played itself according to the
real sky — arranging and cross-blending your 16 recordings by the actual
position of the sun right now?_

Skyflock is a long-form, self-playing, generative orchestration of Karel's
entire verified catalog (13 Welcome Home pieces + 3 Snowflake improvisations),
driven by real-world solar time. Press **Begin** and it reads the sky and starts
turning; leave it running and it keeps evolving on its own.

## How the sun drives the arrangement

1. **Solar position (NOAA / standard algorithm).** From the device's local time
   and geolocation we compute the *fractional year* → *equation of time* and
   *solar declination*, then the *true solar time* → *hour angle*, and finally
   the **solar elevation** and **azimuth**. This is the same declination +
   hour-angle chain the NOAA Solar Calculator uses (`computeSolarPosition`).
   Location falls back to a mid-latitude (40°) with a longitude estimated from
   your timezone if geolocation is denied or unavailable.

2. **Arrangement engine over the whole corpus.** Each of the 16 tracks gets a
   stable "brightness" rank. The sun's elevation sets a moving **cursor** on that
   brightness axis and a **window width** (fullness):
   - **Deep night** → narrow window, low/warm voices only — minimal.
   - **Dawn** → window rides high & sparse (morning bias leans bright/high).
   - **Noon** → widest window, fuller and bright.
   - **Dusk** → warm (evening bias leans low/warm), azimuth in the west.
   Active voices are blended **equal-power**, kept to ~3–6 at once, and always
   ramped with `setTargetAtTime` (a ~2.6s slow crossfade) — never cut abruptly.

3. **Memory / evolution.** A slow two-term sine **drift** plus the morning/evening
   bias rotate the active set continuously, so minute 5 is genuinely a different
   blend than minute 1, even if the sun has barely moved. Tracks are
   **lazy-loaded** the first time the arrangement wants them, then cached.

## Output (Canvas 2D) & palette

Full-sky vertical gradient painted for the current elevation, in the **real
daylight spectrum**: deep-night indigo → pre-dawn violet → dawn peach/rose →
high-key noon blue-white → golden dusk amber → night. Horizon hue shifts
morning↔evening (rose/peach vs amber/gold) by azimuth. A sun/moon disc is placed
by the true azimuth (x) and elevation (y); stars fade in under twilight. A
**flock of drifting light-motes** rises from the horizon — count and height track
the live `safeMaster.analyser` energy of whatever is currently blooming.

## Input

The **primary driver is the real clock + sun** — autonomous/ambient, not a
pointer surface. A **"sweep the day"** slider is offered only as a *secondary*
control to scrub elevation across a 24h day; leave it off and the real sun runs
the piece.

## Audio

Every sound is one of Karel's **real recordings** via the shared helpers
(`REAL_TRACKS`, `loadRealTrackBuffer`), routed through one `createSafeMaster`
ear-safety bus (`src → trackGain → safeMaster.input`). No synths, no oscillators,
no generated tones.

## Named lineage

- **Brian Eno — _Reflection_ (2017):** generative ambient that modulates by time
  of day.
- **_Sonaur_ (2026):** the "world-shaped ambient" app that scores the real world
  around you.

## Honest limits

- Per-track "brightness" is a **heuristic** hash ranking, **not ear-verified** —
  it produces a coherent low→high axis but doesn't know each piece's true
  register.
- Longitude is estimated from timezone when geolocation is denied, so azimuth may
  be off by up to a timezone-width in that fallback.
- Built and type/lint-checked headless; the **mix was not ear-checked** here.
- Never names or alludes to any recreational substance — states are described as
  ambient / meditative only.
