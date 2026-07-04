# 1173 — Solar Wind Choir

**The one question:** *What if you could hear the sun's weather hitting Earth right now — the real, live solar wind sung as a choir?*

A real-world-data sonification. Three live, keyless NOAA Space Weather Prediction Center (SWPC) JSON feeds are fetched **client-side** (no API route) every ~60 seconds, mapped onto an eight-voice just-intonation choir, and drawn as a **bright, daylit** Canvas2D scene of the solar wind streaming from the sun to Earth.

## How to use

1. Open the piece. The daylight scene draws and animates immediately (idle/live) — it never starts blank.
2. Press **▶ Begin** (one gesture) to start the choir. Press **■ Stop** to silence it.
3. Watch the top-left readout: `● live · <UTC time>` in emerald when NOAA responds, `○ using sample data` in amber when it falls back.

The scene keeps polling and re-tuning on its own. Numbers, palette, chord, and streaks all shift as real space weather changes.

## Live feeds (fetched directly from the browser)

All three are public, keyless, CORS-open, and return a JSON array whose row `[0]` is a header of column names, with the most-recent sample **last**:

- **Plasma** — `solar-wind/plasma-5-minute.json` → `speed` (km/s), `density` (p/cm³)
- **Magnetic field** — `solar-wind/mag-5-minute.json` → `bz_gsm` (nT), `bt` (nT)
- **Planetary K index** — `noaa-planetary-k-index.json` → `kp` (0–9)

Every field is coerced with `Number` and NaN-guarded; the parser scans from the newest row backward for the first fully-valid row. Each request has its own 4.5 s abort timeout.

## Data → music/visual mapping

| Input | Range | Audio | Visual |
| --- | --- | --- | --- |
| **wind speed** | 250–800 km/s | choir register (132→174 Hz base) + vibrato depth | streak flow speed + brightness |
| **density** | 0–30 p/cm³ | active voice count / chord richness (3→8 voices) | number of visible streaks + line weight |
| **Bz (GSM)** | −20..+20 nT | consonant↔tense JI cross-fade (negative = tense) | sky palette shifts toward violet; bow-shock glow |
| **Bt** | 0–30 nT | high-shelf shimmer / brightness (−3..+9 dB) | — |
| **Kp** | 0–9 | shimmer/aurora voices on the top of the chord | aurora ribbon brightness + sparkle |

`computeTargets(data)` in `mapping.ts` is the single pure engine both the audio graph and the renderer read from.

## Audio graph (`audio.ts`)

Eight just-intonation voices over a warm base (ratios `1/1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2/1`, cross-fading toward a 7-limit tense set as Bz goes negative). Each voice = detuned **sine + triangle** oscillators → a **peaking (formant) BiquadFilter** → a per-voice gain. A shared **vibrato LFO** feeds every oscillator's detune. The summed bus passes a **high-shelf "shimmer" filter** → a **DynamicsCompressor** limiter → **master gain ~0.2** → destination. All parameter changes ramp with `setTargetAtTime` (no clicks); voices fade in/out as density changes. **Stop/unmount** does a full teardown: RAF cancelled, oscillators + LFO stopped, poll interval cleared, AudioContext closed.

## Visual (`render.ts`)

High-key daytime sky, a warm sun disc on the left, Earth (with a faint magnetosphere bow shock) on the right, wind streaks flowing sun→Earth, and a Kp-driven aurora ribbon near Earth. Live numbers are overlaid in a translucent dark panel for contrast against the bright canvas.

**Safety:** brightness only *drifts* on a smooth ~0.35 Hz sub-audio oscillation — never a flash or strobe (photosensitive-epilepsy safe). `prefers-reduced-motion` slows particle motion and freezes the drift.

## Named references

- **Helioradar AV** (av.helioradar.com, 2026) — real-time NOAA space-weather sonification.
- **Andrea Polli** — *Atmospherics / Weather Works*, data sonification of atmospheric data.

## Honest limitations

- The NOAA products are lightly cached upstream (~1–5 min cadence); "live" means "latest published sample," not instantaneous.
- Feeds occasionally publish placeholder/blank rows; the parser walks back to the newest fully-numeric row, so a stale-but-valid value may briefly persist.
- Bz/Bt come from the mag product independently of plasma timing, so the two can be a few minutes apart.
- The choir is a stylised sonification, not a calibrated instrument — mappings are chosen for musical legibility, not scientific precision.
- If only some feeds fail, missing fields are filled from the embedded snapshot while the badge can still read "live" (plasma is the primary driver).
