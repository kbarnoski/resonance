# 262 · Aurora Particle

**"What if Resonance's score were written by the Sun?"**

On Start, this prototype fetches real-time NOAA Space Weather Prediction Center
(SWPC) feeds — the solar wind plasma, interplanetary magnetic field, and the
planetary Kp index hitting Earth *right now* — and turns them into **both** a
generative ambient drone (Web Audio) **and** a flowing aurora built from
thousands of additive `THREE.Points` curtains. The Sun writes the data live, so
every session sounds and looks different. Feeds re-poll every ~60s and all
driving values are EMA-smoothed so audio and visuals glide rather than jump.

## Data → sound → visual mapping

| Solar wind input | Range | Sound | Visual |
|---|---|---|---|
| **Wind speed** | ~300–800 km/s | Drone root pitch (C2–C3) + arp/bell tempo (fast wind = faster bells) | Aurora hue base: slow = green → fast = violet |
| **Plasma density** | ~0–20 p/cm³ | Number of detuned partials in the drone (2–5) | (indirect — feeds drone texture behind curtains) |
| **Bz GSM** | ~ −20..+20 nT | Major (Bz ≥ 0) vs minor (Bz < 0) pentatonic third — negative Bz = storm coupling = minor | Curtain height + sway agitation: negative Bz = taller, more active |
| **Bt (total field)** | ~0–30 nT | Master amplitude | Overall brightness / point luminance |
| **Kp index** | 0–9 | Lowpass cutoff (calm dark → storm bright), voice loudness | Curtain count (1–2 calm → 5+ storm) + shimmer/twinkle + state badge |

State badge from Kp: **CALM** (<3, emerald) · **UNSETTLED** (3–5, amber) ·
**ACTIVE** (5–7, rose) · **STORM** (≥7, rose).

## Subsystems (≥3)

1. **NOAA fetch + parse** — `runFetchWind` pulls three SWPC JSON
   array-of-arrays feeds (plasma, mag, Kp) client-side, no API route, no guard.
   All values are strings; parsing is defensive (`parseFloat`, scan backward for
   the last finite row, `Promise.allSettled` so one dead feed never blanks the
   others). Whatever succeeds is merged onto the previous reading.
2. **Web Audio sonification** (`AuroraAudio`) — an always-on drone the instant
   Start is pressed: 2–5 detuned saw/triangle oscillators (count from density) →
   lowpass (cutoff from Kp) → feedback delay → convolution reverb → master gain
   → `DynamicsCompressor` limiter → destination. The reverb impulse response is
   **synthesized in code** (exponentially-decaying noise filling an
   `AudioBuffer`) — no IR file is fetched. A pentatonic bell arpeggio follows
   wind speed for tempo and Bz sign for major/minor. Gentle fade-in, no clipping.
3. **three.js particle-curtain renderer** (`AuroraField`) — ~9,800 additive
   points (1,400 × up to 7 curtains) in one imperative `BufferGeometry`
   (`useMemo` + `dispose()` on unmount). A custom `ShaderMaterial` animates every
   point in the vertex shader from a `uTime` uniform: vertical drift, per-curtain
   sway, shimmer twinkle, HSL hue from speed, brightness from Bt. EMA-smoothed
   wind is pushed into uniforms each frame. Cheap `@react-three/postprocessing`
   Bloom adds the glow over a deep-night gradient + a faint star Points cloud.
4. **Sim-fallback transport** — if any/all fetches fail, a bounded random walk
   (`runSimStep`) over realistic ranges steps every poll and a `text-rose-300`
   notice appears; sound + visuals stay fully alive.

## References

- **NOAA SWPC real-time solar-wind products** —
  `services.swpc.noaa.gov/products/solar-wind/` and the planetary K-index feed.
- **Sibling `233-earth-pulse`** — the lab's first live-external-API sonification
  (USGS quakes → music + globe). This piece extends that lineage from a discrete
  event stream to a *continuous* environmental field, and adds a generative drone
  rather than one-shot events.
- **Refik Anadol, *Machine Hallucinations*** — the glowing-particle,
  data-as-luminous-sculpture language the curtains aim for.

## Degradation

- **Any fetch fails** (CORS/offline) → simulated solar-wind random walk; rose
  notice "Live feed unavailable — simulating solar wind." Audio + visuals persist.
- **WebGL unavailable** → rose notice; canvas is skipped but the drone still plays.
- **Audio blocked** → caught silently; visuals still run (and a user gesture
  already triggered Start, so this is rare).

## Honest limitations

- NOAA real-time plasma/mag feeds occasionally carry gaps or stale tails; we take
  the last finite row, which can briefly lag a fast event.
- Curtains are stylized aurora, not a physically-accurate ovation model — hue is
  driven by wind speed for legibility, not true emission-line physics.
- Bloom + ~9.8k additive points is GPU-light but not free on integrated graphics;
  particle count is fixed (curtain *visibility* scales with Kp, not the buffer).
- The 60s poll cadence means within a session the data evolves slowly; most of the
  motion you hear/see is the generative engine, modulated by the live values.

## Next-cycle deepening ideas

- **Real emission-line color physics** (from the banked DEEP sibling `aurora-raymarch`):
  color particles by their height up the curtain using true auroral emission lines —
  atomic-oxygen green (557.7 nm) low, oxygen red (630.0 nm) high, nitrogen blue/violet
  at the fringe — so the palette *teaches the geophysics* instead of mapping hue to
  speed for legibility. Storms (high Kp / negative Bz) would then push taller curtains
  that redden and violet at the top, the way real aurora does.
- Use the full 1-day history (not just the last row) as an evolving *timeline*
  you can scrub, time-compressing 24h of solar wind like 233 does for quakes.
- Drive curtain *geometry* from real magnetometer Bx/By for directional shear.
- Add a hemispheric power / OVATION aurora-probability feed to gate where on a
  globe the curtains appear.
- Spatialize the drone partials (PannerNodes) so storm coupling sweeps across the
  stereo field as Bz flips.
