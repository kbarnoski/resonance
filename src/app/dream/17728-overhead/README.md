# 17728-overhead — The Station Conducts a Take

**Status:** demoable.

## The one question

What if the one crewed outpost overhead — the International Space Station
crossing the sky right now — conducted one of Karel's real piano takes as it
passes, sounding present and bright in daylight and dark and distant when it
slips into Earth's shadow?

## How it works

**Feed.** The ISS's live latitude, longitude, altitude, velocity and day/night
`visibility` are polled every ~4.5 s from `api.wheretheiss.at` (keyless, CORS
`*`, `cache: "no-store"`, aborted on teardown). The marker eases between polls
so the fast-moving station glides.

**Position → day/night → sound.** One continuous voice reads Karel's real take
(default "Isolation", switchable) and the station's *place* performs it:

- **latitude → transpose** (`playbackRate`) — higher/brighter near the poles;
- **longitude → stereo pan** — the sound orbits your head as the ISS circles;
- **velocity → shimmer** — a gentle tremolo whose rate rides the ground speed;
- **altitude → subtle detune / reverb distance**;
- **daylight ↔ eclipsed → the poetic core** — crossing the terminator slowly
  (~3 s) crossfades a **bright, present, drier** timbre into a **dark,
  low-passed, reverb-wide, quieter** one. You *hear* the outpost pass into
  night.

If `navigator.geolocation` is granted, the level swells while the station's
footprint is overhead you; denied, it is skipped silently.

Signal path (every node terminates at `safeMaster.input`, never
`ctx.destination`): `source → tremolo → level → [bright LP + dark LP crossfade]
→ StereoPanner → dry + (send → decaying-noise-IR convolver → wet) → safeMaster`.
No oscillators, synths, or mic — the only sound is the one decoded real take;
the reverb is an effect, not a source.

**Globe.** A near-black three.js Earth with a faint violet graticule, lit by a
directional "sun" placed at the real subsolar point so a day/night terminator
reads. The ISS is a pale violet-white marker with a fading orbital trail —
bright in daylight, dim in eclipse, its glow pulsing with the master analyser.
The camera drifts slowly (still under `prefers-reduced-motion`). If WebGL is
unavailable the audio keeps playing and an on-brand notice explains the globe is
gone.

## Offline reviewability (the floor)

If the fetch is blocked or fails, a **synthetic 51.6°-inclination great-circle
orbit** takes over: it advances every frame, sweeps a full pass in ~80 s, and
flips daylight ↔ eclipsed across the **real subsolar terminator** — so the whole
daylight→eclipsed→daylight timbre crossfade is demonstrable on a cold phone with
zero network. The always-on mono status line states `ISS · live
(wheretheiss.at)` vs `sample orbit (offline)`, alongside lat/lon, altitude,
velocity, visibility and the source take. The piece always plays.

## Palette

Near-black / deep-charcoal globe, faint violet graticule, pale violet-white
station light — bright in daylight, dim in eclipse. Deliberately **not** a
cool-luminous indigo/cyan wash (a sibling owns that). UI chrome uses semantic
tokens only.

## Reference

Data / telemetry sonification and the auditory-display lineage — the
**International Conference on Auditory Display (ICAD)** — on mapping a live
real-world data stream onto continuous sound. Here the living sky overhead,
orbital telemetry read in real time, becomes a score the station performs as it
passes.
