# Faultline

**Status**: demoable — fully playable and audible with the pointer alone; webcam hand control is an untested-in-headless enhancement layered on top.

## The question

*What if the planet's LIVE earthquakes reached into one of Karel's piano recordings and froze it — each real tremor blooming his take into a spectral cloud you fly your hand across?*

This is the dream lab's first real-world-data **sonification** piece, crossed with embodied camera conducting. It is not a filter-bank piece and not a scrubber: it listens to the Earth and uses it to *freeze* Karel's playing.

## The live data

The USGS public summary feed is fetched **client-side** (CORS-open, no key, no API route):

```
https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson
```

Each feature gives `properties.mag`, `properties.place`, `properties.time` (ms epoch), and `geometry.coordinates = [lon, lat, depthKm]`. The feed is re-polled every ~60 s. Every quake is a point on a dark equirectangular world map: `x = (lon+180)/360`, `y = (90-lat)/180`, sized by magnitude, brightness by recency (newer = brighter bone-white core, older = dim violet).

## The spectral-freeze engine — and why it is NOT a bandpass bank

`SpectralFreeze` is a genuine **overlap-add granular freeze**. A read-head is held frozen inside Karel's decoded `AudioBuffer`, and a lookahead scheduler keeps firing many short, Hann-windowed grains (via per-grain `GainNode` ramps) read from positions **jittered around that frozen head**, each with a small random `playbackRate` detune. At ~4× overlap those randomized-offset grains sum into a sustained, shimmering, *smeared* rendering of the frozen spectral snapshot — the piano stops moving forward in time and instead blooms and hovers.

This is explicitly **not** a bandpass-filter bank: there are no parallel biquad bandpasses tuned to a chord sitting over a dry take. The sustain and timbre come entirely from the granular overlap-add of Karel's own audio; the only filtering is a *single* depth-driven lowpass + high-shelf **tilt** on the whole frozen bus (to make deep quakes dark and shallow ones bright), not a resonant comb or chord. Dwelling on a quake is what triggers and steers the freeze; letting go lets it fall back to a soft idle hover.

## Many-to-many data → audio mapping

Several data dimensions each touch several audio parameters:

- **magnitude** → bloom size + overall level + spectral spread (the grain jitter-window width, so a bigger quake makes a bigger, denser cloud) + grain length
- **depth (km)** → spectral tilt: deep quakes → darker/muffled (low lowpass cutoff, negative shelf), shallow → bright
- **longitude** → stereo pan (`StereoPannerNode`, left ↔ right)
- **recency** → shimmer: per-grain detune amount + grain-interval jitter (and visual brightness)
- each quake also freezes a **different moment** of the take (a deterministic hash of its place+time picks the read-head position)

Every node that reaches the speakers terminates in the shared `createSafeMaster` bus (grains → bus → tilt lowpass → tilt high-shelf → stereo panner → `master.input`), and the visuals are driven from `master.analyser`.

## Camera + pointer control

The cursor flying over the planet is driven by the shared `createHandTracker` / `startCamera` MediaPipe loaders: per frame, the index-finger tip of the first detected hand becomes the cursor (x mirrored, since the camera is user-facing). Detection runs on `requestAnimationFrame`; audio params are smoothed with `setTargetAtTime(..., 0.12)`.

The **pointer is the real, exact, always-available control** — `pointermove` over the canvas sets the identical cursor that drives the identical freeze chain, so the piece is fully playable and audible with the mouse alone. Camera is strictly an enhancement. A small mono status line always says which control is live: `tracking · live` when a hand is found, a `text-destructive` lost/denied state with a hint ("show one hand, or just move your mouse") otherwise. Autonomous/pointer mode is never visually indistinguishable from live tracking — it is labelled.

## Graceful degradation

If the USGS fetch fails (offline / CORS / error) the piece falls back to a small embedded snapshot of ~12 plausible quakes hardcoded in `page.tsx`, so it always works and always sounds. The status line reads `live feed · N quakes` vs `offline snapshot · demo data`. There is never a blank or broken screen; the idle map stays alive with slow tremor pulses rippling across stylised fault lines, and audio load failure surfaces a `text-destructive` notice instead of crashing.

## Reference

**Sounds of Seismic** — [sos.allshookup.org](https://sos.allshookup.org) — a browser-based project that turns live global seismic data into music. Faultline shares its spirit (the Earth as a live score) but binds the data to *freezing* a specific human recording rather than general synthesis.

## Honest caveats

- The webcam path cannot be tested in a headless build environment; it follows the proven shared-loader pattern but is unverified here. The **pointer path is exact and fully wired** and is the guaranteed experience.
- MediaPipe modules + WASM + model are fetched at runtime from a CDN only when you start the camera; on a slow or blocked network the camera simply falls back to pointer with a visible notice.
- The USGS all-day feed's quake count varies hour to hour; with few recent quakes the map is sparse but still playable, and the embedded snapshot guarantees a populated demo offline.
