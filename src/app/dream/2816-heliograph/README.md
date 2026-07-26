# 2816-heliograph

**What if you could hear the actual weather on the Sun right now — the live solar wind blowing past Earth as an evolving cosmic drone, its dissonance rising and falling with the real interplanetary magnetic field?**

A live real-world-data sonification. The browser fetches NOAA's real-time
space-weather telemetry and turns it into a slow cosmic-ambient drone plus a
WebGL2 auroral-curtain shader. The centerpiece is the north–south magnetic
field, Bz: when it turns southward — the physics of geomagnetic storms — you
literally _hear_ the drone curdle from near-harmonic calm into beating,
noisy roughness, while the aurora reddens and roils.

## Data feeds (client-side, no API route)

Fetched directly from the browser (these NOAA SWPC products are CORS-open),
re-polled every 45 s, parsed defensively:

- `products/summary/solar-wind-speed.json` → `proton_speed` (km/s, ~250–800)
- `products/summary/solar-wind-mag-field.json` → `bt` (total field, nT) and
  `bz_gsm` (north–south component, nT; negative = southward = storm coupling)
- `products/noaa-planetary-k-index.json` → most recent `Kp` (0–9)

**Fallback:** if any fetch fails, the browser is offline, or a feed returns an
unexpected shape, the piece swaps in a fully **deterministic seeded
"geomagnetic storm day" simulator** (`mulberry32(0x2816)`) that evolves
speed / Bt / Bz / Kp on a slow storm arc from the moment the page mounts — zero
network required. A status line reads `LIVE · solar wind 512 km/s · Kp 1` on
real data, or `SIMULATED (offline)` on the fallback. Live data swaps in cleanly
on the next successful poll.

## Sonification mappings

- **Solar-wind speed → base drone pitch.** Continuous log map, 250 km/s → 70 Hz,
  800 km/s → 140 Hz. Glides smoothly between polls via `setTargetAtTime`; never
  quantized to any scale.
- **Bt (total field) → harmonic richness / brightness.** A stronger field lifts
  the upper partials, so the drone reads darker/softer when weak and
  richer/brighter when strong.
- **Bz (north–south IMF) → consonance ↔ roughness.** Northward (positive) Bz
  keeps partial ratios integer and the twin oscillators in tune → a calm,
  near-harmonic drone. Southward (negative) Bz bends the partials off-integer,
  splits each partial's twin oscillators apart into audible beating, and raises
  a band-passed noise bed. This is the emotional core — the field turning stormy
  is something you hear.
- **Kp index → intensity / event density.** Higher Kp deepens slow shimmer
  swells on the top partials and shortens the interval between sparse "substorm"
  bell events (kept ambient, not busy).

Master chain: partials + noise + bells → `DynamicsCompressor` → master gain
`0.15` → output. Audio unlocks on the "Begin" gesture (autoplay policy); the
aurora animates silently before that.

## Visual

A WebGL2 fragment shader paints vertical auroral curtains built from fbm noise.
Curtain height/brightness track wind speed and Kp; color and turbulence track
Bz — calm green→violet drift when northward, roiling reddened churn when
southward. Motion is slow **luminance drift** (all oscillation ≤ ~0.3 Hz), never
strobe. If WebGL2 is unavailable, a Canvas2D curtain fallback renders instead
(with a notice in the legend). Live speed / Bt / Bz / Kp readouts and a mapping
legend sit in the corners.

## References

- **NOAA SWPC real-time products** — the live space-weather source.
- **NASA HARP** — Heliophysics Audified Resonances in Plasmas,
  `listen.spacescience.org`.
- **Heliophysics data sonification** — Parker Solar Probe / Wind / MMS
  magnetometer data via CDAWeb.

## What I'd deepen next cycle

Right now the simulator is a single scripted storm arc. Next I'd cache a rolling
buffer of real NOAA samples and let the user **scrub the last ~24 hours** of
actual Sun–Earth weather — replaying a real storm's onset and recovery as a
timeline you can drag — plus interpolate between successive polls so the pitch
glide follows the true measured trajectory rather than jumping sample-to-sample.
