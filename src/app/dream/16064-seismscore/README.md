# 16064 · seismscore

**The one question it answers:** _What if the planet's live seismic pulse played
Karel's piano — every real earthquake happening right now sounding one grain of
his recording?_

The Earth conducts; his recording is the sounding body. Nothing is synthesized —
every sound you hear is a slice of a decoded real piano take.

## How it works

- **The feed.** The public, keyless, CORS-open USGS earthquake GeoJSON feed
  (`.../summary/{window}.geojson`) is polled every ~60 seconds. A feed-window
  selector switches between `all_hour`, `all_day`, `2.5_day`, and `4.5_day`.
- **Only new quakes sound.** A `Set<string>` of seen event ids is maintained. On
  first load (and whenever the feed window changes) the set is seeded silently
  from the initial batch and only the ~3 most-recent events sound, to avoid a
  burst; after that, each genuinely-new id sounds as it arrives. New arrivals in
  a batch are staggered (~130 ms apart) so they never crush together.
- **One grain per quake.** Each new quake triggers ONE `AudioBufferSourceNode`
  cut from Karel's decoded recording — never an oscillator:
  - **magnitude** (clamped ~0–7) → grain length (~0.15–1.2 s) + gain
  - **depth km** → playbackRate / pitch (shallow ≈ 1.3, deep ≈ 0.6)
  - **longitude** (−180…180) → `StereoPannerNode` pan (−1…+1)
  - **longitude** also chooses the slice offset in his buffer (proportional,
    with a little jitter), so where on Earth becomes where in the piece.
  - a Hann-style fade (attack ramp → decay ramp on the grain gain) windows each
    grain; concurrency is capped at 24 (oldest grain is stolen).
- **The safety bus.** Every node routes into `createSafeMaster(ctx).input` —
  never `ctx.destination` directly — and visuals are driven from
  `master.analyser` (`getByteTimeDomainData`).

## The visual

Raw **WebGL2** (no three.js). An analytic globe reconstructed in a fragment
shader: slow auto-rotation, a cold bone-white lat/lon graticule and a thin bone
rim + faint halo at the limb on near-black ground. Epicenters are projected onto
the front hemisphere as expanding **additive rings** (one instanced draw) whose
radius and brightness scale with magnitude and recency. A bottom seismogram
strip is driven by the master analyser's time-domain data.

**Palette — Ikeda black / bone-white / red (hard requirement).** Red
(oxblood/blood-red) is reserved for the largest and most-recent quakes and for
the seismogram's peaks. Everything else is black and bone-white. No warm-ember
gradients.

If WebGL2 is unavailable, an on-brand `text-destructive` notice is shown and the
audio still runs.

## Named reference

- **Alexandre Estrela, _RedSkyFalls_, Portuguese Pavilion, 2026 Venice
  Biennale** — a real-time global-seismic-feed → image + sound "operating
  system" (feed via the Euro-Mediterranean Seismological Center). This prototype
  is a browser-scale kin using Karel's piano as the sounding body.
- The seismic-sonification tradition — e.g. **Ben Holtzman / SeismoDome**.

## Graceful degrade

- **Feed blocked / offline.** If the USGS fetch fails, a **seeded synthetic
  seismic stream** takes over (plausible magnitude / depth / longitude at
  plausible intervals) and a `text-destructive` notice reads: _"USGS feed
  unavailable — synthetic seismic stream (audio is still Karel's recording)."_
  The audio is **always** his real recording, grain by grain.
- **Reduced motion.** `prefers-reduced-motion: reduce` freezes the globe's
  auto-rotation (rings and seismogram still respond to events).
- **Teardown.** On unmount every grain is stopped, the poll/synth timers are
  cleared, the rAF loop is cancelled, the safe-master is disconnected, the
  AudioContext is closed, and all GL programs/buffers/VAOs are deleted.

## Controls

- **Grain source** — which of Karel's 16 verified recordings the grains are cut
  from (changing it re-decodes live).
- **Feed window** — the USGS time/magnitude window (re-seeds silently).
- **Magnitude floor** — a slider that mutes quakes below a chosen magnitude.
- **Begin the seismscore** — the single primary action that opens the
  AudioContext (needs a user gesture), decodes his take, and starts polling.

---

_input: the live USGS earthquake feed (every real quake happening now) ·
output: one grain of Karel's real piano recording per quake, panned and pitched
by where and how deep it struck · technique: client-side GeoJSON polling →
granular sonification through an ear-safe master bus, with a raw-WebGL2 analytic
globe · palette: Ikeda black / bone-white / red._
