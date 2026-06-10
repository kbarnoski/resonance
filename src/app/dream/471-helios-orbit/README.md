# Helios — Orbit

**Dream lab #471 · Living Earth spine, cycle 2**

> "What if you watched the real Sun-Earth system from orbit — a dark Earth whose magnetic poles light up with auroral ovals as a live geomagnetic storm builds, the music dropping the instant the storm peaks?"

---

## Premise

Live NOAA space-weather data streams into an EDM build-and-drop arc. A geomagnetic storm is the drop. The visual payoff is auroral ovals igniting around the Earth's magnetic poles and the magnetosphere blooming on cue. No user input required; the piece evolves hands-free from the moment you press **Begin**.

---

## How it works

### Data pipeline

Three public NOAA SWPC JSON endpoints are polled every 60 seconds client-side (no API route, no server, no secrets):

| Endpoint | Parameters extracted |
|---|---|
| `solar-wind/plasma-5-minute.json` | Wind speed (km/s), density (p/cm³) |
| `solar-wind/mag-5-minute.json` | Bz (nT, southward component), Bt (nT, total field) |
| `noaa-planetary-k-index.json` | Kp index (0–9) |

Each feed returns an array-of-arrays; the last row (skipping the header) is the current reading. All three values are exponentially glided (rate ≈ 0.92/s) so transitions are smooth rather than steppy.

**Synthetic fallback:** When the network is unavailable (CORS block, timeout after 8 s, or any fetch error), a random-walk generator takes over silently. It runs a scripted storm arc:

- 0–22 s: quiet solar wind (Kp ~1–2, small Bz fluctuations)
- 22–34 s: storm **building** phase (Kp ramps toward 6.5, Bz goes strongly negative, wind speed climbs toward 760 km/s)
- 34–44 s: **drop** phase (Kp ≥ 6.5, peak Bz ~ −20 nT)
- 44–66 s: **decay** back to quiet

The **"Simulate storm now"** button teleports synthetic time to the build phase regardless of network state.

---

## Audio engine — EDM build-and-drop arc

Basis: **arXiv 2605.21874** (Alunno & Bientinesi, *Real-time, EDM-inspired sonification*, May 2026) for the build-and-drop structure; **NASA HARP + NASA/Chandra aurora sonifications** (March 2026) for the space-weather grammar of mapping solar-wind parameters to layered timbres.

### Parameter → audio mappings

| Space weather | Audio response |
|---|---|
| Wind **speed** (300–800 km/s) | Master filter cutoff (300–3200 Hz) — higher speed = brighter |
| Wind **density** | Pad shimmer / volume (thicker plasma = louder pad) |
| IMF **Bz negative** (0 to −20 nT) | Harmonic tension: pad drifts from A-major to A-minor / suspended |
| **Kp 2–4** (pre-storm) | Hi-hat noise bursts quicken; sawtooth riser sweeps up in frequency |
| **Kp ≥ 5 — THE DROP** | Sub-bass swell (A1, 55 Hz); 4-on-the-floor kick at 128 BPM; harmony snaps back to A-major (minor → major resolution); aurora bloom chord (high A-major shimmer) |
| Storm **decay** | Kick fades; sub retreats; pad settles back to ambient bed |

The chain is always: sources → master gain → DynamicsCompressor → brick-wall limiter (ratio 20:1, threshold −1 dBFS) → destination. Nothing clips; nothing is silent.

### Warm-resolves design intent

This is explicitly a **warm-structured-resolves** piece, not cold or clinical. The EDM resolution metaphor (minor → major on the drop) mirrors the auroral visual payoff. The storm is not threatening; it is spectacular.

---

## Visual — Dark Earth from orbit

### Globe continuity with cycle 1 (Terra Gamelan)

The Fibonacci dot-sphere, solid dark core, and additive-blending atmosphere halo are carried forward from dream #463. The upgrade: instead of seismic embers, the globe carries **auroral ovals** and a **magnetosphere bloom shell**.

### Auroral ovals

Two rings of particles (1 200 per hemisphere) are placed around the IGRF approximate magnetic north pole (~80.7 °N, 72 °W) and magnetic south pole (~64.5 °S, 136 °E):

- **Colatitude** (angular distance of the oval from the pole): expands from ~25° at quiet conditions to ~40° at Kp 9, so the oval visibly migrates toward lower latitudes during a storm — matching observed auroral zone expansion.
- **Brightness / intensity**: 0 at Kp < 0.5, rises to full glow at storm peak. Driven jointly by Kp (70 %) and Bz southward (30 %).
- **Hue**: green (RGB 0, 1, 0.4) at quiet/mid conditions; shifts through to magenta/red (1, 0.2, 0.6) at high Kp — matching the observed spectral shift from oxygen 557.7 nm (green) to lower-altitude oxygen 630 nm / nitrogen reds at severe storms.
- **Shimmer**: per-particle sinusoidal pulse at speed 1 + 3.5 × auroraDriver — gives the curtain-flicker texture without needing a particle physics sim.

### Magnetosphere bloom

A large additive BackSide sphere (radius 2.8 × globe) and inner corona (1.55 ×) sit outside the rotating world group. On the drop (Kp just crossed ≥ 5), `triggerBloom()` sets both to peak opacity and lets the render loop decay them exponentially. This gives a one-frame flash that blooms then fades — the "aurora arrives" visual moment that aligns with the sub-bass drop.

### Visual lineage

Aesthetic reference: **Refik Anadol** (data-as-light, luminous field rendering) and **Ryoji Ikeda** (precision data-to-color mapping), but executed warm rather than clinical. **NOAA SWPC Aurora Dashboard (Experimental)** provided the auroral oval visual lineage and the lat/lon colatitude expansion model.

---

## Graceful degradation

| Condition | Behaviour |
|---|---|
| No network / CORS block | Synthetic data starts immediately; full experience |
| WebGL unavailable | Readable notice shown; audio still runs (AudioContext does not require WebGL) |
| iOS (AudioContext suspended) | AudioContext created and resumed **only** inside the `handleBegin` gesture callback |
| `AnalyserNode` typed arrays | Uses `Float32Array` (cast as needed) — TS 5.7 strict |

---

## The "Living Earth" spine

| Cycle | Dream # | Input | Output renderer | Technique |
|---|---|---|---|---|
| 1 | 463 | USGS earthquakes (live) | Luminous dot-sphere, quake embers | Gamelan bell sonification |
| **2** | **471** | **NOAA space weather (live)** | **Dark Earth, auroral ovals, magnetosphere** | **EDM build-and-drop** |
| 3 (planned) | — | Both feeds | Two-layer Earth (seismic + geomagnetic) | Layered sonification |

---

## References

1. **arXiv 2605.21874** — Alunno & Bientinesi, *Real-time, EDM-inspired sonification* (May 21 2026). Basis for the build-and-drop arc and the parameter-to-intensity mapping structure.
2. **NASA HARP** (Heliophysics Audified: Resonances in Plasmas) + **NASA/Chandra Aurora Sonifications** (March 2026). Space-weather sonification grammar; solar-wind parameter layering.
3. **NOAA SWPC Aurora Dashboard (Experimental)** — live data source and auroral-oval visual lineage (colatitude expansion with Kp).
4. **Refik Anadol** — data-as-light aesthetic (warm luminous fields over dark space).
5. **Ryoji Ikeda** — precision data-to-color / data-to-frequency mapping grammar.
6. **IGRF (International Geomagnetic Reference Field)** — magnetic pole coordinates used for oval placement (~80.7 °N 72 °W, ~64.5 °S 136 °E).

---

## Unverified surface (honest caveats)

- The IGRF pole coordinates are approximate (2020-epoch); the real magnetic poles drift ~50–60 km/year and are not updated dynamically in this prototype.
- The auroral oval colatitude–Kp expansion (25°→40°) is a linear approximation of a non-linear relationship; real auroras show hysteresis and hemispheric asymmetry not modelled here.
- The hue mapping (green→magenta at high Kp) is qualitatively correct (oxygen green + nitrogen/red at lower altitudes in strong storms) but not spectrally accurate.
- The NOAA Kp feed's last row may sometimes be a "nowcast" estimate rather than a final 3-hour value; this prototype treats them identically.
- The EDM "128 BPM" drop is a creative choice, not a sonification of any physical frequency.
- The `mag-5-minute.json` column indices for Bz (index 3) and Bt (index 6) are based on the documented SWPC format; if NOAA changes the schema the parse will silently return NaN (which triggers synthetic fallback via the NaN check).
