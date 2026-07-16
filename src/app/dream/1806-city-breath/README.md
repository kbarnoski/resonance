# City Breath (1806)

**Route:** `/dream/1806-city-breath`

## The one question

> What if you could HEAR a whole city breathing — its live bike-share system
> emptying and filling, in real time, as a warm generative instrument?

A live shared-mobility feed turned into a warm, civic audio-visual piece. As
bikes are borrowed and returned across the city over the day, stations empty and
fill; that living tidal flux becomes music. This is a piece **about a city** —
its grounded, civic rhythm — explicitly **not** an inner / consciousness piece.

## Data source + fallback

- **LIVE:** the **Citybikes** aggregator API — CORS-open, no-auth — which wraps
  the **GBFS (General Bikeshare Feed Specification)** open-mobility standard.
  `https://api.citybik.es/v2/networks/citi-bike-nyc` returns
  `network.stations[]`, each with `latitude`, `longitude`, `free_bikes`,
  `empty_slots`, `name`. Fetched **directly from the client** (no API route — the
  feed is CORS-open), polled every ~25s. Successive snapshots are **diffed**: a
  station whose `free_bikes` dropped = a bike UNDOCKED (someone rode off); a rise
  = a bike RETURNED.
- **SIMULATED (mandatory fallback):** if the fetch fails (offline sandbox, CORS,
  abort) the piece runs a fully deterministic synthetic city — 120 seeded
  stations (mulberry32, seed `0x1806`) with plausible NYC-ish coordinates and
  capacities, driven by a seeded "day" simulator that borrows and returns bikes
  on a 2.2s interval with a slow tidal target-fullness so the city breathes with
  **zero network**. A status line shows **LIVE (network name)** vs **SIMULATED**.

## Audio → sound mapping

| Signal                                    | Sound                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------- |
| overall system fullness (docks occupied)  | **aggregate drone**: pitch + lowpass brightness track fullness, slow tidal LFO — thins at morning rush, warms in the evening |
| a bike UNDOCKED at a station              | **Karplus-Strong plucked string** — tuned pentatonic by longitude, panned by latitude, warm and short |
| a bike RETURNED at a station              | softer, lower **resonant triangle tone** an octave down               |
| many changes at once                      | events ranked by delta magnitude; **rate-limited to 7 audible events / poll** so a busy minute never becomes a wall of plucks |

Master chain: `DynamicsCompressor` → master gain (0.16, ≤ 0.18). Audio starts
only after the **Begin** gesture.

## Visual → mapping (SVG-DOM substrate)

- Stations plotted lat/long into a responsive `viewBox` (`xMidYMid slice`); each
  is a `<circle>` whose radius encodes capacity, whose fill encodes fullness on a
  **violet ramp** (empty = dim violet, full = bright violet), opacity by
  fullness.
- Each undock animates a brief **ripple `<circle>`** at that station (a
  pre-allocated pool of 64 circles is reused — attributes mutated, never
  rebuilt). Returns bloom softer/smaller.
- The DOM is **built once**; a single `requestAnimationFrame` loop mutates pulse
  attributes and poll steps mutate station attributes — the tree is never
  rebuilt per frame. A thin readout shows bikes docked, system fullness %, bikes
  in motion, and events/min.

## Named reference + the gap

Built on the **GBFS / General Bikeshare Feed Specification** open-data standard
(accessed via the CORS-friendly **Citybikes** aggregator). Where financial-tick
and Wikipedia-edit sonification are well-trodden, **urban-mobility sonification**
is a near-empty space — a whole living city's tidal flux, largely unheard. This
piece is a small step into it.

## Ambition criteria

- **Aim #2 — ≥3 subsystems (5 here):** (1) live mobility-feed ingestion with
  live/simulated failover, (2) snapshot-diff event model (undock/return with
  magnitude ranking + rate limiting), (3) Karplus-Strong pluck synth, (4)
  aggregate fullness-tracking drone, (5) SVG-DOM station map with a reused
  ripple-pulse pool.
- **Aim #3 — named reference:** GBFS via Citybikes; the urban-mobility
  sonification gap.
- **Research chain (this cycle):** GBFS open standard → Citybikes CORS aggregator
  → snapshot diffing as an event stream → geography-tuned Karplus-Strong voices
  over a fullness-driven drone.

## Determinism (headless / 06:30 review)

No `Math.random()`, `Date.now()`, or `performance.now()` on the render/audio
value path. The synthetic city and its day simulator draw entirely from
mulberry32 (seed `0x1806`); animation is driven by an **integer frame counter**
and integer poll ticks; events/min is computed from poll cadence, not the wall
clock. `Date.now()` is used **only** to display a real feed's `last_updated`
time, never to drive animation. The piece renders a living, breathing city with
zero network.

## Safety

No strobe or full-screen luminance flashing. Pulses bloom softly; peak fill
opacity 0.5 and peak brightness stays below pure white (violet at ≤ 78%
lightness). `prefers-reduced-motion` slows the ripple decay and the drone LFO.
Nothing throws unhandled — a failed feed degrades to the simulated city and an
audio-start failure shows a `text-destructive` notice.
