# 233 · Earth Pulse

**The last 24 hours of global earthquakes, played as music.**

A live external-data sonification. We pull the USGS "all earthquakes, past day"
GeoJSON feed (public, keyless, CORS-open) and turn each seismic event into a
sounding gesture, sequenced in compressed real time over a pulsing wireframe
globe.

This is the lab's **first prototype that sonifies a real external API** — every
prior prototype synthesizes its own audio or reacts to the mic/a file. Here the
*world* is the score. Open it twice on different days and it's a different piece,
because the Earth wrote it.

---

## The sonification

Each earthquake → one event:

| Seismic property | Sound parameter | Why |
| --- | --- | --- |
| **Magnitude** | loudness + fundamental pitch (bigger = lower) | A great quake should land as a deep, loud boom; a micro-quake as a faint high tick. `freq = 320·2^(−M/2.1)` → M2≈170 Hz, M5≈60 Hz, M7≈30 Hz. |
| **Depth** | low-pass cutoff + crack amount | Shallow quakes are felt as a sharp surface crack (bright, lots of noise transient); deep quakes are muffled rumbles (cutoff collapses toward 240 Hz, no crack). |
| **Longitude** | stereo pan | A literal map of the sound stage: quakes off the Pacific Rim sweep across the stereo field as the day plays. |
| **Time** | sequence position | The 24h window is time-compressed (Slow 4 min / Normal 2.5 min / Fast 1.25 min). Aftershock swarms — dozens of events in minutes of real time — become audible *flurries*. |

Each event is a sine + sub-triangle through a per-event low-pass and stereo
panner, with a short filtered-noise transient for the crack. Everything runs
through a shared convolution reverb (synthetic 3 s impulse) and a compressor so
a swarm of big quakes glues rather than clips. No samples, no server, no key.

## The globe

- A wireframe `SphereGeometry` (the graticule) over a near-black solid core that
  gives real depth occlusion — far-side quakes dim behind the Earth.
- All quakes are plotted as a single `THREE.Points` cloud at their lat/lon. A
  custom `ShaderMaterial` colors each by depth (**warm amber = shallow → violet
  = deep**) and scales its point size by a per-point *activation* value.
- When a quake sounds, its activation snaps to 1 and decays exponentially —
  a frame-rate-independent pulse. Additive blending + Bloom makes each pulse
  flare. The globe auto-rotates; OrbitControls let you grab it.

The audio scheduler, the activation decay, and the transport all live in one
`useFrame` loop so sound and light fire on the same tick.

## Subsystems (ambition: ≥3 distinct subsystems + named reference)

1. **Live USGS GeoJSON fetch** (real external API) + deterministic offline fallback.
2. **Web Audio sonification engine** — per-event synth graph, convolution reverb, compressor bus.
3. **react-three-fiber 3D globe** — wireframe + Points shader + Bloom postprocessing.
4. **Time-compression transport** — 24h → minutes, play/pause/restart, 3 speeds.

## References

- **"Earthquake Pulse Map"** — the WebGL/WebGPU globe that plots 1900–2026 USGS
  seismicity as silent pulses (webgpu.com showcase). Earth Pulse is the inverse
  experiment: same data source, but the dimension that map omits — *sound* — is
  the whole point. We borrow its pulse-on-a-globe visual language and add the score.
- **"Sounds of Seismic" (SOS)** and **IRIS SeisSound** — the seismology
  community's tradition of time-compressing seismograms into the audible band.
  We extend it from a single station's waveform to the *global event catalog as
  a sequenced composition*.
- Ties to Resonance's **Earth Grounding** journey — a grounding piece whose
  ground is literally moving.

## Honest limitations

- Pitch/loudness mappings are tuned for musicality, not geophysical accuracy
  (real released energy is ~32× per magnitude step; we compress that hard so a
  quiet day is still audible).
- A truly quiet 24h (few quakes) plays sparse — that's honest, not broken. The
  fallback synthetic set guarantees a lively demo if the live feed is blocked.
- No coastline texture yet — the globe is a graticule, not a map. A next cycle
  could add a coastline line-geometry or a dark equirectangular texture so you
  can read *where* on Earth each pulse is.

## Next-cycle ideas

- Coastline geometry / continent outlines so location is legible.
- Switch feed to `all_week` (M2.5+) and let the user pick the window.
- A "swarm detector" that thickens the reverb during aftershock clusters.
- Tie the camera to follow the most recent significant quake.
- Sonify *depth bands* as separate timbral layers (a 3-voice texture: crust /
  mantle / deep-focus).
