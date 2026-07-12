# 1492 · Pulsar Clock

> *"What if the night sky were a clock you could hear — every visible pulsar sweeping its beam past Earth firing its own real metronomic tick, so the cosmos becomes a vast slowly-phasing polyrhythm?"*

A three.js scene-graph sky of real neutron stars, each sonified at its true rotation period. Deep indigo→violet→cold-white, X-ray/radio-telescope cosmic. Self-playing: the sky drifts and the beams sweep on load; audio starts after you click **Start listening**, then the cosmos ticks on its own — flying just changes what is near and loud.

## How it works

Fifteen pulsars sit on a great celestial sphere (radius 320) at their **real sky positions** — each coordinate is read straight off the pulsar's designation. `PSR B1919+21` → RA 19h19m, Dec +21°; the Crab (`B0531+21`) sits up near the ecliptic; Vela (`B0833−45`) hangs low in the south. Each spins at its measured rotation period, sweeping a thin cool-violet lighthouse beam about a deterministic tilted spin axis.

Behaviour is chosen by the real period (`catalog.ts › classify`):

| Class | Period | Sound |
|---|---|---|
| **pitched** | ≤ 45 ms | Continuous tone at `1/period`. B1937+21 (1.558 ms → ~642 Hz), B1957+20 (~622 Hz — beats against B1937 at ~20 Hz), J0437−4715 (~174 Hz), Crab (33.5 ms → ~30 Hz low buzz). Together: a slowly-beating chord. |
| **click** | 45 ms – 10 s | Discrete spatialised woodblock clicks. Vela ~11/s, Geminga, B0329+54, Bell Burnell's B1919+21 (1.337 s), plus fill-ins. |
| **bell** | ≥ 10 s | A single vast toll. J0901−4046 (75.9 s) is the cathedral bell. |

Each pulsar owns an HRTF `PannerNode` fixed at its sky position, so its tick arrives from where the star is. Underneath sits a just-intonation perfect-fifth drone bed (`_shared/psych/droneBank`), and the ticks bloom into a code-generated convolution void (`_shared/psych/convolutionVoid`). As you fly, the listener translates through the sphere, more pulsars fall inside earshot, and the drone's `drive` rises — the polyrhythm **builds** and phases in and out of alignment.

### Subsystems
- **`catalog.ts`** — embedded real-data catalog + period→behaviour mapper + mulberry32 PRNG (9 real + 6 deterministic fill-ins, names formatted from their assigned coordinates).
- **`audio.ts`** — polyrhythmic lookahead scheduler, per-pulsar HRTF panner, pitched-chord oscillators, JI drone bed, void reverb, limiter.
- **`scene.ts`** — three.js scene graph: Milky-Way starfield + per-pulsar core/halo/sweeping double-beam with smooth per-tick glow envelopes.
- **`flight.ts`** — arrow/WASD + device-tilt flight camera with a self-drift baseline.

### Controls
Arrow keys / WASD steer (turn) and thrust; on a phone, tilt to steer (permission requested on Start). No input needed — it self-drifts.

## Named reference
- **Jocelyn Bell Burnell's 1967 discovery** of pulsars — the "scruff" / "LGM-1" signal, **PSR B1919+21**, which is present in this sky and tolls at its real 1.337 s period.
- **NASA / Chandra "A Universe of Sound"** pulsar sonifications (Crab, Vela).
- **Ryoji Ikeda, *supersymmetry*** — the X-ray / data-scan cosmic aesthetic.

## Ambition floor
Clears **#2** (≥3 subsystems — four, listed above) and **#3** (named reference — cited above).

## Safety
No strobe: beam brightness is a smooth glow envelope on small local objects, fast pulsars are near-constant (their visual spin is clamped, never literal), and `prefers-reduced-motion` softens drift and pulses. Audio resumes only after the Start gesture; master ramps silence→0.22 over 0.6 s through a `DynamicsCompressor` limiter; concurrent tick voices are capped at 6 (4 pitched + 4 drone partials + 6 ticks ≤ 14). Full teardown on unmount (nodes stopped, ctx closed, rAF cancelled, three.js geometries/materials/textures/renderer disposed, listeners removed). Deterministic throughout: mulberry32 from constant seeds, no `Math.random` / `Date.now`.

## Not yet verified
HRTF spatialisation and device-tilt were not tested on real headphones/hardware in this build. The phasing "alignment" moments are emergent — I have not confirmed they are audibly striking. The fastest pulsars' visual spin is clamped for strobe safety, so the on-screen rotation is evocative, not literally 642 rev/s.
