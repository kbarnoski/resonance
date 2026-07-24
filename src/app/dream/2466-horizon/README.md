# 2466 · Horizon

**Route:** `/dream/2466-horizon`

## The question

> If I stood outside right now and looked up, what would the sky be singing?

A from-the-ground planetarium. A wide panoramic view of the sky dome above the
viewer's real location, with the Sun, Moon and the five naked-eye planets
(Mercury, Venus, Mars, Jupiter, Saturn) plotted at their **true altitude and
azimuth for the live wall clock** — each sounding a sustained, just-intoned
voice. This is an outward-facing piece about the real physical sky over your
head, now.

## How the astronomy works (and its fidelity)

Positions are computed entirely offline (zero network) from **Paul Schlyter's
low-precision planetary-position algorithm** — simple Keplerian orbital elements
(N, i, w, a, e, M) that are linear in a day-number `d`. See `astro.ts`.

Pipeline, per body:

1. **Day number** `d = 367·Y − ⌊7·(Y + ⌊(M+9)/12⌋)/4⌋ + ⌊275·M/9⌋ + D − 730530`
   with `UT/24` (hours) added as a fraction, from the JS `Date`'s UTC fields.
2. **Sun** → its ecliptic longitude (latitude 0). **Moon** and each **planet** →
   rectangular orbital coords → ecliptic x/y/z. Planets are heliocentric, so the
   Sun's rectangular coords are added to get geocentric positions; the Moon is
   already geocentric. Kepler's equation is solved iteratively for the eccentric
   anomaly.
3. **Ecliptic → equatorial (RA/Dec)** using obliquity `ecl = 23.4393° − 3.563e-7·d`.
4. **RA/Dec → altitude / azimuth** via **Local Sidereal Time**: `GMST0 = Ls + 180°`
   (`Ls` = the Sun's mean longitude); `LST = GMST0 + UT·15° + lon_observer`;
   hour angle `HA = LST − RA`; then the standard spherical alt/az formulas with
   the observer's latitude. Azimuth is 0 = N, 90 = E, 180 = S, 270 = W.

**Fidelity caveat:** ecliptic lon/lat are good to roughly **1–2°**; the Moon's
finer perturbations are omitted (a couple of degrees of error is expected). This
is deliberately enough to know *where a body is over your head right now* — it is
for **sonifying, not navigation**. The pitches use the **real** sidereal orbital
periods (not Kepler's idealised ratios).

**Self-check** (`runSelfCheck`, dev-only, runs once in a browser effect):
`console.assert`s that at the SF fallback location the Sun's altitude is positive
around local noon and negative around local midnight.

## Observer location

Tries `navigator.geolocation.getCurrentPosition` with a short timeout. On success
it uses your real coordinates; on denial / timeout / unavailable it falls back
**silently to lat 37.77, lon −122.42 (San Francisco)** with a small muted note.
The panorama renders immediately with the fallback and upgrades live if a
permission arrives — it never blocks on the prompt.

## The sound — Web Audio, just intonation, after Kepler

One sustained **oscillator voice per body** (a sine plus a gently detuned
triangle for warmth) → GainNode → StereoPannerNode → a shared warm lowpass →
master → destination. A calm drone, no percussion. See `audio.ts`.

- **Pitch = f(orbital period).** Kepler's *Harmonices Mundi* (1619) tied
  planetary period to musical pitch. Each body's **real sidereal period** is
  log-mapped and then **snapped to a just-intonation grid** — ratios
  `1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8` over a ~55 Hz root across four octaves.
  Faster body = higher voice. Pitch is **period-fixed**: it never changes as
  time scrubs, so the chord stays legible.
- **Altitude → loudness.** A body below the horizon (altitude < 0) fades to
  silence — you can't see it. A smoothstep over −10°→+30° maps altitude to gain;
  high in the sky is full.
- **Azimuth → stereo pan.** `pan = sin(azimuth)`: east → right, west → left,
  south and north → centre.

As the real sky turns (or you scrub time), bodies rise and set and the chord
**breathes** — that is the whole point.

## The visual — SVG panorama

A wide SVG sky dome seen from the ground. Horizontal axis is azimuth across the
full compass (N / E / S / W ticks); vertical axis is altitude, with the horizon
line near the bottom and zenith at the top, plus a ground band below the horizon
for set bodies. A faint sky gradient shifts warmer near a rising/setting Sun and
deep-dark at true night, driven by the Sun's altitude. The Sun is a glowing
disc, the Moon carries a simple lit-phase terminator, planets are labelled dots
sized by magnitude. Below-horizon bodies sit below the horizon line, dimmed. A
readout lists each body's altitude, note and whether it's up — legible at a
silent glance.

## Controls (one expressive control)

A **time-scrub slider** spanning −12h … +12h from now (the current mapped local
time is labelled), a **Now** reset, and a **4-second idle autopilot** that turns
the sky unattended so the piece self-demos on load. Positions, gain, pan and sky
colour update live as you scrub; **pitches stay fixed**. The only audio gate is
the **Play the sky** Start button (Web Audio autoplay policy).

## Graceful degradation

- `AudioContext` is created/resumed only on the Start gesture. If it fails, a
  `text-destructive` notice appears and the visuals keep running silently.
- Geolocation failure falls back to SF silently; the sky renders regardless.
- No strobe/flicker — only slow, smooth motion and luminance drift.

## Named references

- **Paul Schlyter**, *Computing planetary positions — a tutorial with worked
  examples* — the low-precision Keplerian algorithm implemented in `astro.ts`.
- **Johannes Kepler**, *Harmonices Mundi* (1619) — period-to-pitch mapping.
- **Jean Meeus**, *Astronomical Algorithms* — the standard reference for the
  coordinate transforms (ecliptic ↔ equatorial ↔ horizontal, sidereal time).
