# Body Choir — 14480-bodychoir

## The one question

**What if your WHOLE BODY conducted your whole catalog — raise and spread your
arms to swell and open each half of your recordings, lean to tilt the spectrum —
and then RECORD a conducting pass so a translucent "ghost body" keeps performing
it while you layer another movement on top?**

## What it is

A near-black three.js space in which all 16 of Karel's real recordings hang as
two facing wings of flowing particle streams. The **lower half** of the catalog
is the left/low wing; the **upper half** is the right/high wing. Each stream
carries a **distinct hue evenly spaced around the full colour wheel**
(`hue = i/16 · 360`) — the whole chromatic spectrum on near-black, not a warm or
cool tint. A stream's turbulence and brightness track that recording's own live
analyser energy.

## How the whole-body conducting works

Your body is tracked by webcam with **MediaPipe Pose** (33 landmarks, loaded from
the jsdelivr CDN at runtime). Four controls are read every frame:

- **Left-arm elevation** (wrist height vs. shoulder) → **swell (gain) of the
  LOWER half** of the catalog.
- **Right-arm elevation** → **swell of the UPPER half.** Raise an arm and that
  wing of the music rises.
- **Two-arm spread** (wrist-to-wrist span) → **ensemble width + openness**: the
  global lowpass opens as you spread wide, and the wings push apart in the
  stereo field.
- **Torso lean** (shoulder tilt) → **spectral tilt**: leaning re-weights the
  ladder so one side is darker/bassier and the other brighter (a per-track gain
  balance across the 16 streams).

The streams visually **bend toward the raised arm** so the picture reads as "you
are conducting light."

## Ghost body (the signature feature)

**Record conducting (⦿)** captures ~10 seconds of your control values (and
skeleton) into a loop. While it loops, a **translucent, dim wireframe ghost body**
replays that captured movement, and **its mix contribution SUMS with your live
body** — so you build an ensemble of your own conducting passes. Up to **two ghost
layers** are supported, each clearable with "Clear ghosts." Swell stacks toward a
safe ceiling (`1 − e^(−Σ elevation)`) as passes accumulate. This cashes the loved
`172-loop-station`.

## Audio — Karel's real catalog only, zero synth

Every sound is Karel's real recorded catalog: 13 *Welcome Home* piano pieces + 3
*Snowflake* improvisations (`REAL_TRACKS` / `loadRealTrackBuffer` from
`_shared/welcomeHome`). All 16 load lazily and loop simultaneously. Per track the
graph is:

```
BufferSource(loop) → gain → StereoPanner → lowpass(BiquadFilter) → safe.input
```

Everything sums into a single `createSafeMaster` ear-safety bus
(`_shared/visionary/safeMaster`) before the speakers. **No oscillators, no synth,
no generated tones.** The AudioContext is resumed inside the Begin click handler
to satisfy the autoplay policy.

## Graceful degradation

The piece is alive with no camera. If `getUserMedia` is denied/unavailable, or
MediaPipe fails to load, a `text-destructive`/muted notice appears and an
**autonomous drifting "ghost conductor"** (slowly oscillating arms) drives the
mix, so the choir is immediately audible and moving. WebGL-unavailable shows a
graceful notice instead of the scene. Teardown stops all sources, closes the
AudioContext, disposes the renderer/geometries/materials, closes the pose
landmarker, and stops the camera tracks.

## Named references

- **Theremin "Ghost Hands" MR add-on** (Meta Quest, launched July 1 2026) —
  record motion-loops and perform in ensemble with clones of yourself.
- **Gesture Synth** webcam gesture instrument (updated Aug 4 2026).
- The tradition of the **orchestral conductor**.
- **Imogen Heap's mi.mu gloves.**
- **"Beyond Faders: Understanding 6DoF Gesture Ecologies in Music Mixing"**
  (arXiv:2602.23090).

## Files

- `page.tsx` — the scene, audio engine, whole-body conducting map, and ghost
  record/replay.
- `poseLoader.ts` — runtime CDN loader for MediaPipe Pose (build-safe indirect
  import), the four-control extraction, and the autonomous demo conductor.
