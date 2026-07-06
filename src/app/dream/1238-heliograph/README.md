# 1238 — Heliograph

**What if the live solar wind — the actual particles streaming off the Sun right
now — composed a slow cosmic-ambient drone AND plotted itself, in real time, onto
a self-inking paper observatory logbook?**

Heliograph is a flat, calm, paper-register instrument. It is not a 3D object you
rotate — it is a strip-chart magnetogram inked onto cream vellum, plus a
generative drone tuned by the same numbers the pens are drawing. Watch the Sun's
mood, and hear it.

## What it is

- A **self-inking logbook** (Canvas2D) on warm vellum with iron-gall dark-blue
  ink and a single emerald aurora accent. Three stacked pen traces scroll and
  ink leftward like an old chart recorder: **solar-wind speed**, **Bz** (the
  north/south magnetic component), and the **planetary Kp index**.
- A **current-reading panel** with big monospace numerals (speed, density, Bz,
  Kp) and a one-word state: **QUIET / UNSETTLED / STORM**.
- An **aurora band** across the top that greens and shimmers only when Bz turns
  southward or Kp climbs — the one saturated colour on the page.
- A **generative cosmic-ambient drone** (Web Audio API, no samples) that retunes
  smoothly every time fresh data inks in.

Audio requires a click (browser autoplay policy). The **"Listen to the Sun"**
button ramps the master gain up from silence. The logbook itself inks live data
immediately on mount, with or without audio.

## Data source

Fetched **client-side**, read-only, no auth, no cost — the same pattern as
plotting USGS earthquakes in the browser. Real-time products from
**NOAA SWPC** (Space Weather Prediction Center):

| Product | Endpoint | Fields used |
| --- | --- | --- |
| Plasma (1-day) | `services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json` | density, speed |
| Magnetic field (1-day) | `services.swpc.noaa.gov/products/solar-wind/mag-1-day.json` | Bz (GSM), Bt |
| Planetary K-index | `services.swpc.noaa.gov/products/noaa-planetary-k-index.json` | Kp |

Each product is a JSON array whose first row is a header of column names and
whose remaining rows are stringified values with a UTC `time_tag`. Parsing is
defensive: numbers arrive as strings, some cells are null/empty and are skipped.
The chart re-polls every ~60 s and re-inks.

### Mandatory offline fallback

If any fetch fails or CORS blocks it (common behind proxies), the piece falls
back to a **deterministic ~1-day synthetic-but-realistic series**: a quiet day
(speed ~350 km/s, density ~2 p/cm³, Bz wandering ±8 nT, Kp ~2) building through a
**CME-like shock** in its final third (speed → ~600 km/s, density → ~20 p/cm³, Bz
plunging southward, Kp → ~6). It never dead-screens and never goes silent. An
honest badge reports the source: **emerald "live NOAA data"** vs
**amber "offline sample — NOAA unreachable."**

## Sonification mapping (Web Audio, generative — no samples)

All parameters ramp over ~0.5–0.6 s (`setTargetAtTime`) so retuning never clicks.

| Reading | Range | Drives |
| --- | --- | --- |
| **Speed** | ~300–800 km/s | Fundamental pitch (55–85 Hz) and the rate of the slow amplitude LFO — the drone's breath. Faster wind = higher, more urgent. |
| **Density** | p/cm³ | Number and gain of active harmonic partials. Denser plasma = a thicker, richer pad. |
| **Bz** | nT, − = south | Southward Bz couples the magnetosphere: detuned **beating** between paired oscillators plus a rising **aurora shimmer** voice (tremolo sine an octave-and-a-fifth up). Northward Bz = consonant and calm. |
| **Kp** | 0–9 | Overall agitation: lowpass **brightness**, feedback-**delay tail length**, and wet mix. Kp ≥ 5 (storm) makes the piece audibly agitated. |

Signal chain: six harmonic partials (each two detuned oscillators) + an aurora
shimmer voice → bus → lowpass → dry + a feedback delay (reverb-ish tail) →
master. A slow sine LFO modulates the bus gain. Calm sun ⇒ a still, wide drone.

## References & lineage

- **NOAA SWPC** real-time solar-wind products (DSCOVR/ACE plasma & magnetometer
  at L1) and the **planetary K-index (Kp)** geomagnetic activity scale.
- **Bz southward coupling** — the long-standing space-weather principle that a
  southward interplanetary magnetic field reconnects with Earth's field and
  drives auroral / geomagnetic activity.
- The **heliograph / observatory logbook** — historically an instrument that
  photographs the Sun and a sunlight signalling mirror; here reimagined as a
  magnetogram-style chart recorder inking a paper register.
- Inspired by the 2026 **"Helioradar AV"** live space-weather sonification
  project, but deliberately differentiated: instead of a dark jewel-toned screen,
  Heliograph commits to a **paper-logbook register** — warm vellum, iron-gall
  ink, and a single restrained emerald aurora accent — a calm reading instrument
  rather than a spectacle.

## Notes

- Self-contained in this folder. No external prototype imports, no new npm
  dependencies. Web Audio API + Canvas2D only.
- Degrades gracefully: no data → offline sample + amber badge; Web Audio
  unavailable → a notice, and the logbook keeps inking silently.
- The paper texture, vignette, axes, gridlines, unit labels and UTC time ruler
  are baked once into an offscreen "board" and only rebuilt on resize or when the
  24-hour window shifts, so the animated pens stay cheap.
