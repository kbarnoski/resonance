# Orbit Transit

**Route:** `/dream/2046-orbit-transit`

## The one question

What if the satellites and the ISS passing overhead **right now** became sustained
voices in an evolving Doppler-swept chord — music about real traffic in the sky?

## What it is

A hemispherical sky dome (minimal SVG-DOM, off-GPU) over an audio-forward piece.
A seeded constellation of fourteen satellites is propagated as circular orbits, and
every currently-visible pass becomes one sustained voice. The current sky **is**
the current chord; it re-voices continuously as passes rise and set.

Audio is the primary medium — the dome is a quiet accompaniment.

## The model — seeded circular-orbit propagation

- Deterministic PRNG: **mulberry32, constant seed `0x2046`**. No `Math.random`,
  no `Date.now`; the wall-clock drift comes from `performance.now()`.
- Fourteen satellites in a simplified ECI frame from classical elements
  (altitude, inclination, RAAN, phase). Index 0 is the ISS (51.6°, ~420 km);
  the rest span 380–1400 km at realistic inclinations (Starlink-like 53°,
  sun-synchronous ~98°, Molniya-ish 63°, etc.).
- A **co-rotating observer at ~42°N** (Earth sidereal rotation `7.29e-5 rad/s`)
  converts each satellite to **topocentric range, range-rate, elevation and
  azimuth** every frame via a local East/North/Up basis.
- Physics run in **real orbital seconds**; the page advances that clock at
  `TIME_SCALE = 140×` wall-clock, so a ~93-minute orbit becomes a ~40-second
  pass and the chord audibly evolves. Range-rate is a genuine ±km/s quantity
  (finite-difference of range), so the Doppler is physically grounded.
- For the headless 06:30 review, the first ten satellites are greedily *phased*
  (only phase — altitude/inclination/node stay seeded) to fill the least-covered
  moments of the opening ~30 wall-seconds, so the chord is continuously voiced
  from the first frame. Beyond that window, passes are honestly intermittent —
  real sky traffic comes and goes, and the chord thins to near-silence and
  returns as it should.

## The sonification — parameter-mapping Doppler

One voice per visible pass:

| Orbital quantity | Sound parameter |
| --- | --- |
| **Altitude** | Base register (log-interpolated). Low orbit = higher/brighter tension; high orbit = lower. |
| **Range-rate** | **Doppler pitch-bend** as continuous portamento — approaching passes rise, departing passes fall (`freq = base · C/(C+ṙ)`, `C = 90 km/s`). |
| **Elevation** | Loudness + brightness (lowpass cutoff), peaking at the zenith, fading at the horizon. |
| **Azimuth** | Stereo pan via a real `StereoPannerNode`. |

Voice architecture: 2 detuned oscillators (saw + triangle) → lowpass → gain
envelope → `StereoPanner`, split to dry + a synthesized **convolution reverb**
bed, summed through a glue `DynamicsCompressor` and a hard limiter to a master
gain capped at **0.14**. Pool capped at 10 voices with **elevation-based
voice-stealing** (the lowest, quietest pass is released first).

**Harmony is deliberately non-JI:** continuous glide between physically derived
frequencies — no fixed scale, no ratio lattice, no pentatonic, no `[1, 9/8, …, 2]`
stack. Pitch is portamento, not a grid.

## Robustness — offline sim first

The seeded simulation **always plays with zero network**. On mount the piece makes
**one** abortable, best-effort `fetch` of the public read-only endpoint
`https://api.wheretheiss.at/v1/satellites/25544` (3.5s timeout, wrapped in
try/catch → null on any failure). If it answers, the live ISS altitude is folded
into the ISS voice's register and the status chip reads **live**; any failure
(offline, blocked, timeout) silently falls back to **sim**. No API route — the
call is direct from the client. Geometry stays seeded either way.

Degradation: offline → sim; audio blocked → the dome keeps animating. Full
teardown on unmount aborts the fetch, stops all audio, and cancels the rAF.

## Palette & house style

Graphite + cold starlight on near-black (not violet-cosmic). Art hex lives only
in the SVG layer; all chrome uses semantic tokens (`text-foreground`,
`text-muted-foreground`, `border-border`, `bg-primary`).

## References

- **Andrea Polli** — *Quiet Skies* and *Sky Score* (atmospheric/sky data as sound).
- **Voyager** — *Symphonies of the Planets* (space plasma-wave recordings).
- **Parameter-mapping sonification** — data dimensions mapped to sound parameters.
- **The Doppler effect** — frequency shift from relative radial motion.

## Honest ambition claim

The synthesis, dome, and voice-stealing are careful but conventional Web Audio /
SVG craft. **The genuine novelty is the data source** — real-world orbital
mechanics (satellite/ISS transits, topocentric range-rate), a lane this ~800-piece
lab had never sonified — turned into a continuous Doppler chord that evolves with
zero input.

## Files

- `page.tsx` — client component: dome, refs, self-driving rAF loop, live fetch, UI.
- `orbit.ts` — mulberry32 PRNG, constellation, circular-orbit propagation, topocentric conversion.
- `audio.ts` — Web Audio voice pool, Doppler portamento, reverb bed, compressor/limiter.
