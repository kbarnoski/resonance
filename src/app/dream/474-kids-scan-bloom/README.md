# 474-kids-scan-bloom

**Route:** `/dream/474-kids-scan-bloom`
**Status:** demoable
**For:** kids (4+)

---

## The Idea

What if a 4-year-old could squeeze a soft glowing flower — and **hear each petal's wobble** as the bloom's outline sings, then settles back into a calm round hum?

The flower's glowing outline **is** the waveform. The shape you see is the sound you hear. Tap a petal → it ripples, wobbles, and rings at a warm musical pitch. Let go → the bloom slowly breathes back to a gentle hum over a few seconds. Every tap is always in tune (C-major / Lydian pentatonic, C3–G4).

---

## Technique: Scanned Synthesis

> **Reference:**
> Max V. Mathews, Bill Verplank, Rob Shaw — *"Scanned Synthesis"*
> Proceedings of the International Computer Music Conference (ICMC), Berlin, 2000.
> [https://quod.lib.umich.edu/cgi/p/pod/dod-idx/scanned-synthesis.pdf?c=icmc;idno=bbp2372.2000.048](https://quod.lib.umich.edu/cgi/p/pod/dod-idx/scanned-synthesis.pdf?c=icmc;idno=bbp2372.2000.048)

**Scanned synthesis = a slowly-vibrating physical object whose shape is read at audio rate to generate sound.**

In the original work the object is an open string (a chain of masses and springs). Here it is a **closed circular loop** — the radial outline of a flower with N=128 points.

### How it works here

1. **The wavetable is a closed mass-spring ring.**
   `r[N]` (N=128) stores the radial deviation at each angular position around the flower.
   Each mass is coupled to its two circular neighbors (wrap-around: index 0 neighbours index N-1):
   ```
   accel[i] = Kn*(r[i-1]+r[i+1]-2*r[i]) - Kc*r[i] - damp*v[i]
   v[i]    += accel[i] * dt
   r[i]    += v[i]     * dt
   clamp |r[i]| ≤ 1
   ```
   Parameters: `Kn=0.25`, `Kc=0.002`, `damp=0.04`, `dt=1`.
   The damping causes a squeezed bloom to **resolve back to a calm near-sine hum in ~3–5 s** — this is intentional and beautiful.
   The ring is seeded with a quiet 5-petal sinusoid so it is **never fully silent**.

2. **The audio is the scan.**
   A phase accumulator advances `scanFreq / sampleRate` per audio sample.
   The output sample is a linear-interpolated circular read of `r[]` at `phase × N`.
   `scanFreq` is the **pitch** — you literally hear the bloom's outline, repeated at that frequency.

3. **Squeeze = a Gaussian bump.**
   Pointer down on a petal injects a smooth Gaussian velocity + displacement bump around the corresponding ring index. The wavefront travels around the ring, modulating all future output samples — the timbre morphs in real time.

4. **The physics runs in an AudioWorklet** (with a ScriptProcessorNode fallback).
   The worklet posts `r[]` to the main thread ~33 times/sec, which drives the WebGL renderer — so the **visual and auditory representations are always the same array**.

---

## Subsystems

| File | Role |
|---|---|
| `bloom-worklet-src.ts` | Inline AudioWorklet string — `BloomProcessor` owns `r[]`/`v[]`, physics, scan, reporting |
| `bloom-audio.ts` | Boots AudioWorklet (Blob URL) or ScriptProcessorNode fallback; `DynamicsCompressor` brick-wall limiter |
| `bloom-renderer.ts` | WebGL2 renderer: fill pass (triangle fan, radial glow) + rim pass (LINE_STRIP, additive bright rim); rebuilds outline geometry from `r[]` each frame |
| `page.tsx` | React shell — idle splash, start button, petal tap targets (≥72px), auto-demo, render loop, teardown |

---

## How a 4-year-old uses it

1. Tap the big **🌸 Start** button.
2. The glowing flower hums softly. After 3 seconds a friendly little tune plays automatically (hands-free demo).
3. Touch anywhere on the bloom — especially the glowing petal tips.
4. Each touch makes the bloom wiggle and sing a warm note.
5. Let go — the flower slowly breathes back to its gentle hum.
6. Multi-touch is supported: squeeze multiple petals at once for richer timbre.

No text to read, no score to hit, no failure states. Pure tactile audio-visual cause and effect.

---

## What's unverified

- **Worklet timing on iOS Safari:** Blob URL `addModule` works in Chrome/Firefox; iOS may fall back to ScriptProcessorNode (functional but ~10ms higher latency).
- **WebGL2 on older iPads:** iPads running iOS < 15 may not support WebGL2; the prototype shows a simplified DOM bloom fallback and audio continues.
- **Physics stability at extreme squeeze strengths:** Clamping at ±1 with velocity reversal is conservative; very rapid multi-finger input could briefly saturate the ring (limiter prevents audio clipping).
- **Auto-demo stop on second touch:** Currently stops on any pointer interaction; a repeat play after the sequence ends has not been tested on device.
