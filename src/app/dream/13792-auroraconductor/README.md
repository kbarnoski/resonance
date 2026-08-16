# 13792 · auroraconductor

**Conduct Karel's OWN piano recording with your whole body.** Move a hand in
front of the webcam and the *quantity of your motion* — read from live, in-browser
optical flow — drives the tempo and intensity of his music. No baton, no mouse.
The direction of your motion bends a full-viewport WebGL2 aurora curtain.

Route: `/dream/13792-auroraconductor`

## The one question

> What if you could conduct your own recording with your whole body — move your
> hand in front of the webcam and its optical flow drives the tempo and intensity
> of the music, no baton, no mouse?

## How it works

1. **Track picker + "Start — allow camera".** Pick any track from Karel's
   verified catalog (Welcome Home + Snowflake, grouped by album). Start requests
   `getUserMedia({ video: true })` and decodes the chosen real recording.

2. **Live webcam optical flow (the baton, secondary control layer).** Each
   animation frame the webcam image is drawn to a hidden `<canvas>` downsampled to
   96×72 grayscale. A dense flow field is estimated on a **32×24 grid** with a
   **Lucas–Kanade-lite** scheme: per pixel we compute the spatial brightness
   gradients `Ix, Iy` (central differences) and the temporal difference `It`, and
   for each grid cell we solve the 2×2 least-squares normal equations for a flow
   vector `(u, v)`. Two signals fall out:
   - **Overall quantity of motion** = the mean absolute frame-difference
     `mean(|It|)` across the image. This is exactly the "overall quantity of user
     motion" the referenced installation conducts by. It maps to the **conducted
     tempo** (still = slow/hold, sweep = rush) clamped to a musical **0.4×–1.6×**,
     and to **intensity** (master gain + aurora brightness).
   - **Direction field** `(u, v)` per cell → uploaded as an RGBA8 texture that
     **bends the aurora ribbons** where you move.

3. **Pitch-preserving granular time-stretch (audio source = his recording).** A
   read-head walks his decoded buffer; every ~45 ms of output we emit a ~110 ms
   grain played at `playbackRate = 1` (so pitch is exactly his) through a Hann
   envelope, overlap-added back to continuous sound. The read-head advances at the
   **conducted rate**, decoupled from the constant grain-emission rate — that is
   what stretches time while the pitch stays nailed to his piano. The whole mix is
   routed through the shared **safeMaster** ear-safety bus; visuals read its
   analyser.

4. **WebGL2 aurora curtain.** A fullscreen fragment shader draws several vertical
   light-curtains (fbm noise, hanging vertical profile) in a cool
   **violet → cyan → ice** palette on near-black. They are advected and bent by the
   flow texture, their filaments stream faster where you move faster, and the whole
   sheet pulses in brightness with the tamed analyser + conducted intensity.

5. **Graceful degradation.** No camera permission / no webcam → **pointer motion**
   fallback (mouse/touch velocity as the quantity of motion), with an on-brand
   notice, so it stays demoable. No WebGL2 → a short notice; you still hear his
   piano conducted by ear.

6. **Seeded self-demo.** A `mulberry32` PRNG (seeded once — never `Math.random`)
   drives a gentle synthetic motion oscillation so the piece is alive and sounding
   within ~1 second of Start. The moment real motion crosses a floor, control
   hands over to you (a smoothly-rising real-vs-demo blend weight).

## Reference

This is the literal webcam-optical-flow realization of:

> **"Real-Time Control of a Virtual Orchestra by Recognition of Conducting
> Gestures"**, arXiv:2604.27957 (2026) — a Swedish museum dome where visitors
> conduct a pre-recorded orchestra purely by camera motion, deriving tempo and
> expression from the overall quantity of user motion.

Here that idea is turned on Karel's *own* recording: his piano is the orchestra,
your body in front of the lens is the baton. It is the webcam successor to the
pointer-driven **13536-conductorwell**. The time-stretch engine sits in the
granular overlap-add lineage (PhaVoRIT; Karrer, Lee & Borchers 2006).

## Honest limitations

- **Optical-flow noise.** Uneven lighting, webcam auto-exposure and rolling
  shutter inject phantom motion, so the quantity signal is heavily smoothed and
  gated with a floor before it reaches the tempo.
- **Latency.** That smoothing (plus the granular scheduler lookahead) puts a small
  lag between a gesture and the music — a deliberate trade for stability.
- **Coarse.** Flow is estimated on a small downsampled grid for real-time speed,
  so it reads gross body motion, not fingers. Low-texture / aperture regions leave
  Lucas–Kanade under-determined, so direction is a soft hint, not a precise field.
- **Fallback fidelity.** The pointer fallback conveys the idea but only carries one
  moving point of motion rather than a whole body's flow field.

## Constraints honored

- All audio is Karel's real catalog via `loadRealTrackBuffer` + `REAL_TRACKS` /
  `COLLECTIONS`; the entire mix goes through `createSafeMaster` — no oscillators,
  no synth, never `ctx.destination` directly.
- Self-contained; cross-prototype imports only from `../_shared/`. No npm deps
  (raw WebGL2), no ML/model libraries, no API route.
- Deterministic: seeded `mulberry32` only; timing from `performance.now()` /
  `ctx.currentTime`; no `Math.random` / `Date.now` / `new Date`.
- Full teardown on unmount: stops audio + granular scheduler, `safe.disconnect()`,
  `ctx.close()`, stops all `MediaStream` tracks (camera light off), cancels rAF,
  deletes GL resources.
