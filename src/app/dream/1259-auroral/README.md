# 1259 · Auroral

**The one question:** *What if the cosmic-ambient void you dissolve into was the
REAL aurora happening on Earth RIGHT NOW — the live global auroral oval, sonified
and made into a slow luminous curtain-field?*

Auroral is a drug-free **cosmic-ambient / boundless-void** experience whose
structure and intensity are driven by **live real-world space-weather data** —
the actual current state of Earth's aurora this minute. It is "music about the
world, not about music." Pole: **cosmic-ambient**, but it spikes toward *intense*
during a real geomagnetic storm — the piece is literally more overwhelming when
the planet's aurora is more active. It is the aurora sibling of the lab's own
[`1193-tremor-core`](../1193-tremor-core) (which rang live USGS earthquakes as a
metal gong) — same spirit, a different planet-scale live signal.

`state: aurora / boundless-luminous-void · pole: cosmic-ambient (spikes intense at high Kp)`

## The live input — two CORS-open NOAA SWPC feeds

Both are keyless and send `Access-Control-Allow-Origin: *`, so `feeds.ts` fetches
them directly from the browser (client-side, no API route, no proxy, no guard),
with a shared `AbortController` + ~5s timeout.

1. **Global auroral oval (the star input) — OVATION Aurora model**
   `https://services.swpc.noaa.gov/json/ovation_aurora_latest.json`
   Shape: `{ "Observation Time": "…Z", "Forecast Time": "…Z", coordinates: [[lon (0..359), lat (-90..90), auroraProbability (0..100)], …] }`
   — a ~1°×1° global grid (~65,160 cells); each entry is the live probability of
   visible aurora at that point on Earth. We fold the **northern oval** (lat
   55–80°) into a 96-bucket longitude band (max prob per bucket = the oval crest),
   track the peak probability anywhere, and collect the brightest cells as
   **hotspots** for the chimes.

2. **Planetary Kp index (geomagnetic activity 0..9)**
   `https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json`
   We take the most-recent **observed** Kp. Higher Kp = more intense → brighter,
   faster, more-violet curtains and a rising audio drive.
   *Shape note:* SWPC has served this product both as a header-row-plus-array-rows
   table **and** (currently) as an array of `{ time_tag, kp, observed, noaa_scale }`
   objects. `reduceKp` defends against **both** so live Kp never silently
   degrades to the fallback (an early version did exactly that).

### Data → experience mapping

- **Kp + oval activity + peak → one 0..1 `intensity`** (`deriveIntensity`, Kp
  dominant). This single drive scales curtain count, brightness, drift speed,
  violet-crown bloom, drone filter opening, and Shepard ascent rate. At Kp 0–2
  it's a faint calm shimmer; at a real Kp 6+ storm the whole sky comes alive.
- **band[] (the real northern oval across longitude) → curtain structure.** Each
  curtain samples its local brightness from the true oval crest at its longitude,
  so the shape you watch is literally the aurora's shape right now.
- **brightest grid cells → sparse bell "pings"** (a just-intonation pentatonic;
  brighter cell → higher note), each blooming the nearest curtain — the aurora
  quietly chiming.

### Graceful degradation (mandatory)

If either fetch fails / is offline / times out, `feeds.ts` returns a
**deterministic simulated aurora**: a seeded-LCG (never `Math.random`) quiet
**Kp ≈ 3** state with a smooth northern oval of a few Gaussian arcs. The page
shows a `text-rose-300` "using offline sample — live NOAA data unavailable"
notice. The piece is fully beautiful and demoable with no network, and the sky +
a baseline shimmer draw immediately on mount, before audio — the canvas is never
blank.

## Files

- **`feeds.ts`** — the data layer: fetch + fold both NOAA feeds into one guarded
  `AuroraState`, plus the seeded offline fallback. Never throws.
- **`curtains.ts`** — `CurtainField`, the Canvas2D luminous curtain renderer
  (pre-tinted additive ray sprites, seeded star/void backdrop, parallax layers).
- **`audio.ts`** — `AuroraAudio`, the generative cosmic-ambient bed.
- **`page.tsx`** — the client component: mounts the field immediately, polls the
  feeds every 120s, gesture-gates the audio, and schedules the chimes.

## The visuals

Slow vertical shimmering auroral curtains drift across a deep near-black sky over
a faint seeded star field, all drawn additively (`globalCompositeOperation =
"lighter"`). Each curtain is a stack of pre-tinted luminous ray sprites (baked
once, tinted **green → teal** via `source-in`) with a **violet/magenta crown**
that blooms only at the tops when energy is high — the classic desaturated-
luminous aurora register, deliberately not a saturated jewel-on-dark object and
not a flat pale print. Curtain count, brightness, drift, and violet all scale
with the live intensity. devicePixelRatio is capped at 1.6.

## The audio (shared psych toolkit)

Master chain: `masterGain (~0.4, faded in over 3s)` → `DynamicsCompressor`
limiter → `destination`. Everything routes through a vast code-generated void:

- **`droneBank`** — sustained just-intonation drone; `setDrive(intensity)` opens
  its filter so it brightens as the aurora strengthens.
- **`shepard`** — an endless-ascent Shepard–Risset shimmer; `setDrive` +
  per-frame `step(dt)` tie its ascent rate/brightness to activity.
- **`convolutionVoid`** — a 6s cistern reverb (wet 0.65) the whole bed sits in.
- **aurora chimes** — sparse bell-like sine pings from the grid's brightest cells
  (the tremor-core "ring the live event" idea, made gentle and boundless).

Gesture-gated (audio only after the "Begin" click), everything fades in, and
full teardown stops the Shepard + drone, aborts polling, and closes the context.

## Safety

No strobe, no flashing, no flicker feature. All shimmer is smooth sinusoidal
motion well under 3 Hz (ray breathing ~0.4–0.8 Hz, sway ~0.03–0.1 Hz, twinkle
~0.08 Hz) and luminance eases toward targets. Honors `prefers-reduced-motion` by
slowing all drift/shimmer to ~0.35×.

## Named references

- **NOAA SWPC OVATION Aurora** model — the live global auroral-oval grid:
  <https://services.swpc.noaa.gov/json/ovation_aurora_latest.json>
- **NOAA SWPC planetary Kp index** — live geomagnetic activity:
  <https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json>
- **`1193-tremor-core`** — the lab's own live-real-world-data sonification (live
  USGS quakes → gong); Auroral is its aurora sibling.
- The NDE / cosmic **"boundless luminous void"** phenomenology — the state this
  evokes: dissolving upward into a slow, weightless field of light.

## Honest notes on what's rough

- **The live piece is faithful, which means it can be quiet.** At the current
  real Kp (~0–1) the visuals are a genuinely faint shimmer and chimes are sparse
  — that's the point (fidelity over spectacle), but a first-glance demo lands
  harder on the offline Kp≈3 sample or during an actual storm. There is no
  "demo boost" that would falsify the data.
- **Chimes on quiet days** fall back to band-peak buckets so something still
  rings; on a dead-flat grid they'd be very sparse.
- **Canvas2D only** — no WebGL path. The additive ray-sprite curtains are robust
  and cheap but are stylized bands, not a physically-modeled magnetospheric
  simulation; the mapping from oval → curtain longitude is illustrative.
- The northern oval only drives the visuals; the southern oval contributes to
  chimes but isn't drawn.
- Poll interval is 120s; OVATION updates ~every minute, so the readout can lag
  the true "this minute" by up to two.
