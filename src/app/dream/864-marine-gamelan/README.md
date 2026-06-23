# Marine Gamelan

*The real, live state of the world's oceans plays a bronze gamelan — and heavy
seas audibly roughen the metal into a beating, detuned clang while calm seas
stay sparse, high and sweet.*

## What it is

A self-contained audio-visual prototype. Live sea-state from four contrasting
ocean locations is fetched directly in the browser and mapped onto a
**modal physical-modeling bronze gamelan** (Web Audio) and a **hand-written
WebGL2 caustic water-light shader**. Both subsystems read the **same** normalized
`SeaDrive` signal, so the sound and the image can never disagree.

## How to use it

1. Tap **Start the sea** (creates the `AudioContext` inside the gesture, for iOS,
   and begins the render loop). A gentle 2-second fade-in starts the gamelan.
2. **Sea A** buttons pick the primary ocean: *Oahu North Shore*, *Bay of Biscay*,
   *Drake Passage* (big seas), *Maldives* (calm).
3. **Sea B & crossfade** — pick a second ocean and use the slider to listen to
   two seas at once (0 = A only, 1 = B only, middle = both layered). Try
   **Drake Passage** against the **Maldives** to hear a storm beating against a
   calm.
4. **Tuning** toggles slendro ↔ pelög. **Snap to groove** quantizes strikes to a
   tempo grid derived from the wave period (an ocean-driven groove) vs. free
   Poisson-ish arrhythmic pings. **Panic mute** silences instantly.
5. The two live meters show wave height / period / direction / roughness, plus a
   **live** or **simulated** badge per sea.

## How the consequence works (the point)

A single `roughness` value (clamp of `wave_height / 6`) drives four audible
things at once on every strike:

- **(a) density** — rough seas strike far more often (free mode ~0.8 → ~7
  strikes/s; in groove mode roughness raises the per-slot hit probability);
- **(b) register** — rough seas pull the whole scale lower;
- **(c) timbre** — resonator **Q** drops from ~38 (calm, *sings*) to ~6 (rough,
  *clangs*);
- **(d) detune** — each inharmonic bronze partial is detuned by up to **±35
  cents**, so heavy seas beat and shimmer out of tune.

`period` sets the base tempo / wave speed, `direction` sets stereo pan and the
shader drift vector, and `swell` swells an underlying low drone and the
large-scale visual undulation.

### Audio architecture

Each "key" is a struck bronze metallophone: a short filtered **noise exciter**
feeds a bank of **high-Q BiquadFilter bandpass resonators** at inharmonic
partial ratios `[1, 2.76, 5.4, 8.93]`, tuned to slendro/pelög scale degrees. Two
independent sea voices (A and B) are equal-power crossfaded. The master runs
through a compressor → brick-wall limiter; an `AnalyserNode` only **taps** the
master for the violet strike-bloom (never routed to output).

### Visual architecture

Raw WebGL2 + GLSL ES 3.00 full-screen fragment shader: domain-warped value-noise
interference forms caustic veins; foam highlights appear on rough crests; a
violet strike-bloom flashes with the live audio level. Palette: deep ocean
indigo → teal → bronze/gold caustics → violet blooms. A small text HUD (React,
not the main viz) shows the numbers and badges.

## Data source

[Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api) —
keyless and CORS-enabled, so it is called **directly client-side** (no Next.js
API route, no server code). Fields used:
`wave_height, wave_period, wave_direction, swell_wave_height, swell_wave_period`.
Re-polled every 5 minutes (abortable).

If the fetch fails / is blocked / offline, a **synthetic evolving sea** per
preset (different roughness baselines so Drake stays stormy and the Maldives
stay calm) keeps the piece sounding and animating within ~1s, and the HUD shows a
`text-rose-300` "(live feed unavailable — simulated sea)" notice.

## Named references / lineage

- **Gamelan slendro & pelög tunings** — the inharmonic bronze spectrum and the
  two scale systems are the musical material.
- **Ryoji Ikeda — *datamatics*** — the clinical, data-as-music stance: let the
  real measurement *be* the composition.
- **Bob Sturm — *Music from the Ocean*** — wave-undulation → music data-mappings;
  the direct precedent for turning sea-state into sound.

## Known limits / unverified

- Built without a browser/audio/GPU available, so the exact loudness balance,
  resonator decay tails, and shader appearance are **untested in situ** and may
  need tuning (Q range, strike gains, bloom threshold).
- The Open-Meteo Marine model has coarse spatial/temporal resolution; "live"
  values update slowly (the 5-min re-poll is generous).
- The README link in the corner points at the static file path; it is a
  developer-facing convenience, not a styled in-app panel.
- Strike scheduling allocates Web Audio nodes per strike; in a sustained storm
  with both seas at full crossfade the node count is bounded by the limiter and
  cleanup timers, but very long sessions on weak hardware may want a voice cap.
