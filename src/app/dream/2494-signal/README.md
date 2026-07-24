# Signal (2494)

**The one question:** *What does humanity talking to its robots across the solar system, right now, actually sound like?*

A live sonification and visualization of NASA's **Deep Space Network (DSN)** — the three giant antenna complexes (Goldstone, California · Madrid, Spain · Canberra, Australia) that, at this very moment, are sending and receiving radio with spacecraft scattered across the solar system: Voyager 1 & 2, Perseverance, JWST, Mars orbiters, Parker Solar Probe, and more.

Each active radio link becomes one **sustained musical voice**. The visitor doesn't play it — the real configuration of the network is the score. You only shape the listening. It's outward-facing and factual: awe at real cosmos and real engineering, not trance.

## Data source

`https://eyes.nasa.gov/dsn/data/dsn.xml` — NASA's public DSN Now feed (XML). Because the browser can't fetch it directly (CORS), it is proxied server-side by `api/route.ts`, which fetches the XML with a cache-buster, parses it **without a DOM** (small regex pass — Node has no `DOMParser`), and returns clean JSON. The client POSTs every 10 s.

Concept, data, and imagery courtesy **NASA / JPL-Caltech**. This is an independent art piece, not a NASA product.

## Sonification mapping

| DSN datum | Musical / sonic result |
|---|---|
| **Radio band** (L / S / X / Ka) | Base register — L lowest, Ka highest — snapped to one warm Lydian-pentatonic scale so the network is always a consonant chord |
| **Spacecraft identity** | Stable scale degree (hashed) — a given craft always sings the same note |
| **Direction** (downlink / uplink) | Timbre — downlink = pure breathing pad from deep space (sine); uplink = brighter Earth-sourced tone (triangle + saw) |
| **Data rate** (bits/sec) | Tremolo / shimmer rate + filter brightness — fast data fizzes, slow telemetry pulses |
| **Light-time** (one-way, from `rtlt` or range) | Reverb + long-echo depth — nearby craft dry & present; Voyager (a full light-day out) drenched, arriving from impossibly far. *The emotional core: you can hear distance.* |
| **Station** (Goldstone / Madrid / Canberra) | Stereo pan across the field (they're spread ~120° around Earth) |
| **Link goes active / drops** | Voice fades in (2.2 s) / releases (3.5 s) — the chord breathes as the network reconfigures |
| **Signal strength** (downlink power dBm) | Voice level + beam brightness/thickness in the visuals |

Polyphony is capped to the strongest ~11 links (by power × data-rate) so a busy network never roars.

## Visuals (Canvas2D)

A live mission-control diagram: an Earth arc with three station nodes at the bottom, each firing a **beam** out to its spacecraft. Beam brightness/thickness tracks signal strength; animated dashes flow in the data direction (down = toward Earth, up = away). Spacecraft are placed by hashed azimuth and by light-time radius (Moon near, Voyager at the far edge), labelled with name, band, and "signal age" (one-way light time). A readout panel lists the strongest active links.

## Graceful degradation

If the API route errors or returns no active signals (feed offline, network down), the piece drops to a **deterministic synthetic DSN** — a plausible built-in slice: a Moon relay (dry & present), Mars Reconnaissance Orbiter, Parker Solar Probe, JWST at L2, and Voyager 1 with an enormous light-time (drenched). It always sounds and looks alive with zero network. The readout flags synthetic mode in the destructive/error color. No Web Audio starts until the user clicks **Begin listening** (autoplay policy).

## What a next cycle could deepen

- **Doppler**: nudge each voice's pitch by the craft's real radial velocity (range rate) — a true redshift you can hear.
- **Per-craft orbital positions**: place nodes at real ephemeris coordinates instead of hashed azimuths for a genuine orrery.
- **Event stings**: an accent when a link newly acquires or loses lock, or when a very distant craft (Voyager, New Horizons) appears.
- **Band-specific timbres**: distinct oscillator families per band rather than only register shifts.
- **History trail**: a slow spectrogram of the last few minutes so you can see the network breathe over time.
