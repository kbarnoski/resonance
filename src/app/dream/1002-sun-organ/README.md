# 1002 · Sun Organ

**Route:** `/dream/1002-sun-organ`

## The question

> What if Resonance played the Sun — an endless, non-looping ambient piece composed in real time from **live space-weather data**, so the music is literally different every minute because it tracks the actual state of the solar wind and Earth's magnetic field right now?

On Start (or after ~2s idle, auto), the piece fetches live data from NOAA's Space Weather Prediction Center (SWPC) and turns the numbers into an evolving generative drone + aurora curtain. It polls every 60 seconds to keep the Sun's state current, and never loops.

## Data → sound/visual mapping

| Data (source) | Range | → Sound | → Visual |
|---|---|---|---|
| **Solar wind speed** (`plasma-1-day.json`, `speed`) | ~300–800 km/s | overall agitation: filter brightness, breath rate, wander bias | aurora flow rate + curtain frequency |
| **Bz GSM** (`mag-1-day.json`, `bz_gsm`) | −15..+15 nT | southward (negative) = tension: darker centre, wider detune beating, higher filter Q; northward = calm/consonant | hue shifts green/violet → **rose** when active |
| **Density** (`plasma-1-day.json`, `density`) | ~0.5–20 p/cm³ | number of audible drone voices (2–6) | (indirect via voice fullness) |
| **Kp index** (`noaa-planetary-k-index.json`, `Kp`) | 0–9 | high-register shimmer voice level + register lift | aurora band height + intensity + streaks |

A safe, consonant just-intonation ratio set (`1, 9/8, 5/4, 4/3, 3/2, 5/3, 16/9, 2, 9/4`) is used for all voices, so no combination produces a "wrong note" — it is pure ambient presence, not a chord lecture. Audio is a small set of always-on sine/triangle oscillators through a lowpass filter + a feedback-delay smear; voices 2+ have a detuned partner for shimmering beats.

## How the long-form evolving state works (memory)

The defining quality is that **minute 5 differs from minute 1** even if the data is steady:

- A **wandering tonal centre** (`baseHz`) drifts continuously. Each frame it re-targets toward a data-biased value (speed pushes it up, Bz tension pulls it down) plus a slow breath offset, then approaches that target *slowly*. Because the target itself is computed from the current `baseTarget`, the centre carries memory of where it has been — it does not snap to the data.
- A **slow breath LFO** (`breath`, ~0.03–0.08 Hz) modulates voice swells, filter cutoff, detune width, and shimmer on per-voice offset phases, so the texture keeps moving with zero data change.
- The Sun's data is **heavily smoothed** toward, never jumped to, so live updates are felt as drift rather than edits.

Net effect: an always-on, never-silent, non-repeating drone whose long-term shape is nudged — not dictated — by the real Sun.

## Graceful degradation

If the NOAA fetch fails (offline / CORS / proxy / partial parse), the piece falls back to a built-in **synthetic solar-wind generator** (summed slow sines + bounded random walks producing plausible speed/Bz/Kp/density) and shows a `text-amber-300/95` notice. Audio and visual run with **zero network**. WebGL2 falls back to a Canvas2D aurora if WebGL2 is unavailable. A ~2s idle auto-start means an untouched page begins playing.

## Named references

- **Helioradar AV** — live NOAA SWPC → infinite non-looping ambient soundscape (operational 2026). Direct lineage for the live-data-to-endless-drone idea.
- **NASA Scientific Visualization Studio, "Helio Big Year" sonifications** — heliophysics data turned to sound; informed the data→pitch/brightness mappings.
- **DATASONICA** — 2026 Data Sonification Award winner (environmental-data audiovisual installation); reference for the "legible, calm data sonification as installation" vibe.

## Honest caveats — verified vs reasoned

**Verified:**
- All three NOAA SWPC endpoints were dry-run from this environment and returned HTTP 200 with parseable JSON. Sample live values at build time (2026-06-28): solar wind **505.2 km/s**, Bz **+0.35 nT**, Kp **2**, density **4.48 p/cm³**.
- `plasma` and `mag` are array-of-arrays with a string header row (e.g. `["time_tag","density","speed","temperature"]`). The Kp feed is **array-of-objects** (`{ time_tag, Kp, ... }`) — parsed separately. Parsing is defensive against both shapes and bad cells.
- `npx tsc --noEmit` is clean and `eslint` reports no problems for this file. No `:any`, `@ts-ignore`, `@ts-nocheck`, no `use*`-named helpers, no new deps, no three.js.

**Reasoned (not exhaustively verified):**
- The audio/visual were not run in a browser from this headless environment; oscillator levels, filter ranges, and the perceived "never loops / evolves over minutes" quality are reasoned from the maths and standard Web Audio behaviour, not listened to. The mix gains are conservative to avoid clipping but may want taste-tuning.
- **Live-feed dependency:** in a browser the fetch relies on NOAA SWPC keeping permissive CORS and being reachable; if a corporate proxy strips it or the service is down, the synthetic fallback engages (this path is implemented but, like the live path, not browser-tested here).
- WebGL2 shader compiles are validated by the GL link/compile checks at runtime only; the GLSL was not rendered in this environment.

**Biggest wart:** the visual and audio are unauditioned in a real browser, so the central claim ("genuinely different at minute 5") is architecturally true but not perceptually confirmed by me.
