# Pulsemeter (6488)

**Hear the health of your own machine — a live, generative soundscape and visual that _is_ your browser's real-time performance telemetry, so a smooth 60fps feels like a calm drone and a jank spike rings like a struck bell.**

This is a real-world-data **sonification** where the data source is the visitor's own computer, in real time. It is not self-playing: it is driven by genuine live machine state — frame cadence, main-thread jank, memory pressure, event activity — plus how the visitor chooses to exercise the machine (there's a "Stress the machine" button that deliberately blocks the main thread so you can _cause_ the bell and hear the causality).

## The one question it answers

_What if Resonance could let you HEAR the health of your own machine — so smooth performance feels like a calm drone and a jank spike rings like a struck bell?_

## How it works

### INPUT — live system telemetry (browser Performance APIs)

- **`requestAnimationFrame` delta timing** — the always-available spine. Each frame's interval becomes instantaneous FPS and a smoothed jitter measure. Works with zero permission and zero interaction, so the canvas is alive from the moment the page loads.
- **`PerformanceObserver` for `longtask`** — main-thread blocks over 50ms. These are the "struck bell" events; severity comes from block duration.
- **`PerformanceObserver` for `event` timing** — adds a decaying activity texture.
- **`(performance as any).memory?.usedJSHeapSize / jsHeapSizeLimit`** (Chromium) — a slow "pressure" parameter. Guarded for undefined; where absent it falls back to a synthetic slow LFO.
- **`PerformanceObserver.supportedEntryTypes`** — one-time capability probe. Any missing source is announced in an on-brand corner note and replaced by a synthetic proxy (e.g. rAF-jitter-derived jank when `longtask` is unsupported).

### TECHNIQUE — continuous data → generative Web Audio

- Steady high FPS → a **calm consonant just-intonation drone** (partials at 1, 5/4, 3/2, 2 over ~98 Hz) through a lowpass filter.
- **Frame jitter** → subtle vibrato (a shared LFO whose depth in cents tracks jitter).
- A **longtask / jank spike** → a **struck resonant bell** with inharmonic metallic partials and an exponential decay envelope; pitch is chosen by severity (severe jank snaps low and long, mild jank rings high and bright), snapped to a just-intonation lattice.
- **Memory pressure** → a slow drone **detune downward** plus lowpass **darkening**.
- A small voice pool caps polyphony (6 bells) and everything passes through a `DynamicsCompressor` soft-limiter, so it never clips.
- Audio unlocks only on the **Start** gesture (autoplay policy); the drone fades in gently.

### OUTPUT — pure Canvas2D

- A living **ECG/seismograph** trace: a smooth breathing baseline with a damped ring-down deflection on every jank spike (the visual analog of the struck bell).
- A soft **radial breathing field** whose calm/agitation tracks running FPS — slow and wide when smooth, tighter and faster when struggling — with a pulsing core "heart."
- Motion-blur trails (a translucent wash, never a hard clear) keep it beautiful and legible as a still frame, with **no strobe or flicker**. `prefers-reduced-motion` damps motion amplitude.
- devicePixelRatio-aware for crispness; resizes to the viewport; works on mobile.

## Named reference + research anchor

- **Research anchor:** _"Real-time, EDM-inspired sonification of the activity of a supercomputer,"_ **arXiv:2605.21874 (2026)**. The transferable idea is sonifying a live running computing system as continuous, embodied _monitoring you listen to_. Pulsemeter brings that home to the visitor's own browser rather than a datacenter.
- **Tradition:** auditory display / sonification-as-monitoring, and William Gaver's **"auditory icons"** — everyday sounds that stand in for system events so state is _heard_, not read.

## Known limitations

- `performance.memory` is **Chromium-only**; Safari and Firefox lack it, so memory pressure there is a synthetic slow LFO (the corner note says so).
- `longtask` and `event`-timing observers are not universally supported; without `longtask`, jank is detected from large rAF deltas instead. Detection granularity is coarser in that fallback path.
- `performance.memory` is also coarse/quantized for privacy, so the "mem load" readout is indicative, not exact.
- rAF is throttled/paused in background tabs, so telemetry (correctly) goes quiet when the tab isn't foreground.

## Next-cycle deepening

- Add `layout-shift` and `paint` (LCP/FCP) entries as distinct timbres, so first paint and reflow each have their own voice.
- Use the Long Animation Frames (LoAF) API where available for attributed jank (which script caused the block), and let severe attributed blocks choose a different bell family.
- A "calibration" pass that learns this machine's baseline FPS/heap over the first few seconds, so the mapping is relative to _your_ hardware rather than an absolute 60fps target — the drone would then express deviation from your normal, not from an ideal.
