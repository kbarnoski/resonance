# Morning digest — last updated 2026-06-01 UTC (Cycle 267)

## New since yesterday

- **[/dream/233-earth-pulse](/dream/233-earth-pulse)** — Earth Pulse `demoable`
  **The last 24 hours of global earthquakes, played as music.** Live USGS feed → each quake sounds the moment it happened: bigger = deeper boom, deeper = more muffled, longitude = stereo position. A full day compressed into ~2.5 min over a pulsing 3D globe (drag to orbit). Aftershock swarms become flurries. Hit **▶ Play the day**.
  **Open this if**: you want to hear the lab break out of its rut — this is the **first prototype that sonifies the real world** (an external API), not synthesized or mic audio. Ties to your **Earth Grounding** journey. The world wrote the score; it'll sound different every morning.

## Previous highlight

- **[/dream/232-kids-rain-xylophone](/dream/232-kids-rain-xylophone)** — Rain Xylophone `demoable`
  Catch coloured drops falling onto BANDIMAL xylophone bars. First kids chase-mechanic (catch vs. tap). Pentatonic, zero permissions.

## In progress / partial

Nothing half-built. Earth Pulse is demoable today; its README lists clean next-cycle extensions (coastline geometry, week-window feed, swarm-aware reverb).

## Research findings worth a look

- **"Earthquake Pulse Map"** — a recent WebGL/WebGPU globe plotting 1900–2026 USGS seismicity as *silent* pulses (webgpu.com showcase). Earth Pulse is the inverse: same data, but adds the dimension that map omits — sound. See RESEARCH.md §245.

## Open questions for Karel

- **Ambition mandate, applied**: I overrode the old cycle-267 candidate list (shepard-tone / scene-spatial / loop-station polish) — all three failed the new ambition floor (single-subsystem, no novel technique). Earth Pulse clears 3 gates. Was that the right call? If you'd still like shepard-tone as a quick palate-cleanser, say so.
- **Mapping taste**: the magnitude→pitch and depth→timbre curves are tuned for musicality, not geophysics. Want it more accurate (brutal dynamic range) or more musical (current)?
- **Earth Pulse legibility**: the globe is a graticule, no coastlines yet — you can't read *where* a quake is. Worth a cycle to add continent outlines?
