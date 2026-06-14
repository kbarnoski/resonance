# 613 — Seismic Choir

**What does the planet sound like right now?** The live global earthquake feed of
the last 24 hours, turned into an ominous, trembling sonification: every real
quake on Earth becomes a deep resonant groan over a slowly rotating WebGPU globe
of tectonic light.

This is the lab's **first seismic piece** — the jury asked to stop re-shipping
the ocean and mine **unmined real-world data**. The register is deliberately
geological and unsettling: deep rumbles, the weight of the earth. Not warm, not
cozy, not a pretty chord.

## Data source + mapping

**Source:** USGS GeoJSON feed `summary/all_day.geojson` — every quake on Earth
in the past 24 hours, no key, CORS-enabled, fetched client-side at runtime. Each
feature carries `mag`, `place`, `time`, and `[lon, lat, depth_km]`.

If the fetch fails or the browser is offline (it will be in the build sandbox),
the piece falls back to a **bundled synthetic dataset** of ~46 plausible quakes
across real fault zones (Honshu, Cascadia, Chile, Sumatra, Tonga, Nepal, Italy…),
including a deep-subduction subset and a late-day aftershock swarm. A badge shows
**DATA: LIVE** or **DATA: SAMPLE**.

**Mapping (sound):**

| Datum | Sound parameter |
|---|---|
| magnitude | loudness + rumble duration + lower fundamental + sub-bass swell (≥4.2) |
| depth_km | brightness — shallow = brighter crack, deep = duller groan |
| longitude | stereo pan (−180°→L, +180°→R) |
| latitude | resonance tilt (higher \|lat\| = tighter, more metallic ring) |

The 24h window is replayed in ~60s on a loop (speed-adjustable), so you hear the
**day's seismic rhythm** — clusters, aftershock swarms, the silence between.

## Sonification synthesis

Each quake triggers a **resonant-body rumble**: a short filtered noise burst
(the impact excitation) driven through a bank of **low, slightly inharmonic
bandpass resonators** (ratios 1 / 1.94 / 2.41 / 3.77 over a 32–120 Hz
fundamental). The inharmonicity makes it read as *rock*, not a synth pitch.
Magnitude scales a long decay tail; small quakes are sharp ticks; the largest
get a soft-attack sub-bass sine swell.

A continuous **tectonic drone bed** sits underneath — a slowly beating low
cluster built on **tension intervals** (minor-second beat, tritone-ish,
inharmonic partials) — explicitly *not* a warm just-intonation chord. Tension,
not comfort.

**Ear protection:** master chain is `gain → lowpass (~7k) → DynamicsCompressor
(brick-wall limiter) → AnalyserNode → destination`; gains capped, soft attacks
on the sub so nothing thumps the speaker. AudioContext is built on the first user
gesture (Start) with a `webkitAudioContext` fallback.

## Visual — WebGPU spectacle (Canvas2D fallback)

Primary renderer is **hand-written WGSL on WebGPU**: a full-screen fragment
shader raymarches a dark globe of tectonic light. Each quake blooms as a pulse
at its true (lon, lat), ripples outward as an expanding geodesic ring, and the
whole field **trembles in sympathy with the audio** (uniforms driven by the
`AnalyserNode` — bass, level, shake). Big quakes flare and shake the screen;
shallow events glow **magma orange**, deep events **oxblood red**, over ash-grey
plate ridges on black. Slow continuous rotation.

`navigator.gpu` is feature-detected. If WebGPU is absent (or init fails), a real
**Canvas2D** fallback draws the same rotating globe, graticule, quake pulses and
atmosphere rim. A **RENDER: WebGPU / Canvas2D** badge shows the active backend.

## Named reference

**Florian Dombois — *Earthquake Sounds* / auditory seismology**: the practice of
mapping seismograph data directly to sound to hear structure the eye misses.
Broadly, data-driven composition / sonification. This is the lab's first piece in
this class of data.

## Controls

- **Start the Choir** — primary button, unlocks the AudioContext on gesture.
- **Space** play/pause · **M** mute · **[** / **]** slow down / speed up timeline.
- On-screen buttons mirror all of the above (≥44px, phone-friendly).
- **~2.5s idle auto-start**: the visual timeline begins on its own so a muted
  glance already shows the globe pulsing; pressing Start hands audio over.

## Fallbacks

- No network → bundled sample dataset + amber **SAMPLE** badge.
- No WebGPU → Canvas2D globe + **Canvas2D** badge.
- Audio gated → Start button is the unlock gesture; visuals auto-start regardless.

## Honest self-assessment

The three subsystems (live fetch/parse + sonification engine + WebGPU renderer)
are independent and each carries weight; the inharmonic resonator + tritone drone
genuinely lands in the *ominous/geological* register rather than the lab's usual
cozy chord, and the data is real and unmined (seismic, not ocean, not
touch-input). Weaknesses: the WGSL globe is procedural (no real coastline
texture), so geography reads as a graticule rather than continents; the per-quake
resonator bank is a stylized physical model, not a true seismograph convolution,
so it's *Dombois-adjacent* rather than a literal seismogram-to-audio transform.
The screen-shake + bloom could tip into spectacle over substance on a dense LIVE
day, but the limiter and pulse-pruning keep it controlled.
