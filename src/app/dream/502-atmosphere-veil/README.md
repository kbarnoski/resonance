# 502 · Atmosphere — Veil

> *What if the entire planet's live weather were one slowly-breathing chord — sustained, unresolved harmonic tension that only the real sky can resolve?*

Cycle 3 of the dream lab's **Living Earth** spine:

1. `463-terra-gamelan` — live earthquakes as a gamelan.
2. `471-helios-orbit` — live space-weather as an EDM build/drop.
3. **`502-atmosphere-veil`** — the atmosphere: a long-form (8+ minute), ever-evolving adult ambient piece whose harmonic tension is driven by real global weather and relaxes **only** when the real sky calms.

## What it is

A dark, full-screen audio-visual instrument. Press **Start** once (a user gesture, required for the AudioContext) and it runs hands-free. A sustained spectral drone breathes underneath a WebGPU compute-driven particle field of ~60,000 points advected by a global wind/pressure vector field. Both the sound's dissonance and the field's turbulence track the same scalar: **global atmospheric instability**.

## How to use

- Open the page. The synthetic evolving sky starts immediately so there is always sound + motion (HUD shows `CONNECTING`, then `DEMO DATA` or `LIVE`).
- Press **Start** to enable audio (browsers block audio before a gesture).
- After that, do nothing. The piece evolves on its own for as long as you leave it open.
- **Read the design notes** (`<details>` in the footer) for an in-app summary.

## The data

Open-Meteo current weather (no API key, CORS-enabled, free), batched into **one** request for **12 globe-spanning cities** (London, New York, Tokyo, Sydney, Moscow, Singapore, São Paulo, Mexico City, Delhi, Nairobi, Reykjavík, Ushuaia). Polled every **75 s**, fetched directly from the client (no API route, no server, no secret).

Per city we read `temperature_2m`, `wind_speed_10m`, `surface_pressure`, `cloud_cover` and derive an **instability scalar** (0..1):

| Signal | Mapping | Weight |
|---|---|---|
| Wind speed | 0 → 20 m/s (gale) | 0.40 |
| Surface pressure | 1015 hPa (fair) → 985 hPa (deep low) | 0.35 |
| Cloud cover | 0 → 100 % | 0.25 |
| **Falling** pressure | drop vs previous poll (~4 hPa = strong) | +0.25 bonus |

We keep the previous poll's pressures in memory so a **falling barometer** — the classic tell of a building storm — adds tension on top of the static reading.

**Global tension** = `0.6 · mean(instability) + 0.4 · peak(instability)` across all cities, so a single violent storm is audible against an otherwise calm planet.

### Auto-demo fallback (hands-free review)

Before the first fetch resolves, and on any fetch failure (network / CORS), everything is driven by a **synthetic evolving weather model**: per-city slow sinusoids + a smoothed random walk + a single low-pressure system that slowly drifts across the planet and wraps around. This builds and releases tension organically over minutes, so the prototype always shows evolving sound + light with zero interaction. The HUD label switches `LIVE` ↔ `DEMO DATA` honestly.

## The tension design (the whole point)

The brief demanded **genuine, sustained harmonic ambiguity that resolves only when the data calms — never on a timer, never on a tap.** Implementation:

- **At rest** (tension → 0): a stack of detuned sine voices in open fifths + octaves over a low drone root (just-intonation-ish ratios 1, 3/2, 2, 3, 4). Detune ≈ 0, so it is consonant — but it simply *opens*, it is not a warm V–I cadence.
- **As tension rises** (driven only by live instability):
  - **(a) Beating** — consonant partials detune by up to ±14 cents (alternating sign), producing audible beating intervals.
  - **(b) Tension tones** — minor 2nd (16/15), tritone (45/32) and a flat 9 fade in with a quadratic curve on tension, so they stay hidden when calm and color (never dominate) when tense.
  - **(c) Roughness** — a tremolo LFO's depth and rate climb with tension.
- **Relaxation** is asymmetric: tension rises a little faster than it falls, so a building storm is felt promptly but calm returns slowly and sustained. The audio smoother only ever moves *toward the data's value* — there is no scheduled cadence anywhere in the code.
- **Long-form memory / no looping**: the tonal center drifts ±70 cents on a very slow sinusoid, and a "voicing mutation" phase slowly re-weights which partials are loud. So minute 8 sounds different from minute 1 even at identical tension.
- Each of the 12 cities also contributes a faint high partial **panned by longitude** (StereoPanner), so the planet is spread across the stereo field.

All audio routes through a master `DynamicsCompressor` brick-wall limiter (threshold −6 dB, ratio 12, knee 2) → master gain (≤ 0.5, 4 s fade-in). It can never clip or blast; this is a calm/tense adult ambient piece, intentionally quiet.

### Named reference

**Éliane Radigue** — her ARP-2500 works (e.g. *Trilogie de la Mort*, *Adnos*) are built from extremely slow, sustained tones whose beating interference patterns *are* the music. This piece borrows that beating-as-tension language. Harmonic-spectral thinking — consonance/dissonance as a continuous, instability-driven axis rather than chord changes — follows the spectral tradition of **Gérard Grisey** (*Partiels*).

## The visuals (assigned renderer: WebGPU)

A WebGPU **compute shader** integrates ~60,000 particles each frame. The wind field is the superposition of 12 city "vortices" placed by lon/lat on a unit map and weighted by each city's instability (rotational swirl ∝ instability), plus value-noise turbulence whose amplitude scales with global tension. Particle **speed**, **turbulence** and **color-temperature** (cool indigo at rest → warm amber/rose under tension) all rise together. Particles respawn when they age out or leave the field, keeping it full. Additive blending gives a soft atmospheric veil.

### Graceful degradation

- `navigator.gpu` / adapter / device / context unavailable → a readable `text-rose-300` notice **and** a Canvas2D dot field driven by the same city-vortex wind model, so the piece is never dead. Audio always keeps running regardless.

## Constraints honored

- Audio-visual only; self-contained in this folder; no cross-prototype imports.
- Web Audio API + WebGPU, zero npm deps (everything from browser APIs; `@webgpu/types` is dev-only typings already present in the repo).
- AudioContext created/resumed inside the Start gesture.
- No API route — Open-Meteo fetched directly from the client.
- Typography / button / palette rules followed (serif `text-2xl`+ title, `text-base` body, `text-rose-300` for the WebGPU notice, 44px+ buttons, dark Resonance palette).

## Honest caveats — NOT browser-verified

- This was **not** run in a real browser in this session. It passes the repo's `tsc --noEmit` typecheck and `eslint` (0 errors, 0 warnings) for this folder, but runtime behavior is unverified.
- The WGSL compute/render pipelines are written to spec but have not been executed on a real WebGPU device; shader/pipeline-layout details (binding layouts, vertex strides) may need a tweak on first run.
- Open-Meteo's response shape was assumed from the documented API; we explicitly request `wind_speed_unit=ms` so the m/s-based instability thresholds match, but those thresholds may still want recalibration against live values.
- The 8-minute "feels different at minute 8" claim is by design (drifting center + mutating voicing) but has not been listened to end-to-end.
- Particle count (60k) is a guess at a safe load; lower it if a target device struggles.
