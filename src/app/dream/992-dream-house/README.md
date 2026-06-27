# 992 — Dream House

## The one question

**What if you could walk through La Monte Young's _Dream House_ in a browser — a
room of sustained just-intoned sine DRONES where moving your body even slightly
makes some partials bloom and others fade, so the music is pure standing-wave
timbre that you sculpt with your position, with no notes and no wrong notes?**

This is a deliberate port of the real **La Monte Young & Marian Zazeela _Dream
House_** sound-and-light environment: a continuous just-intoned sine-wave
composition where the sound literally changes depending on where you stand —
move your head six inches and one frequency gets louder while another fades; step
forward and new overtones emerge — paired with Zazeela's magenta light field. It
extends the lab's `977-echo-room-gpu` (a single chord field) toward PURE TIMBRE /
DRONE PRESENCE: explicitly **not** a music-theory explainer, **not**
chord-looping. It is the jury's "spatial presence" answer.

## The just-intonation ratio set (and why)

Fundamental: **~72.6 Hz** — a low, felt-in-the-body drone root.

Eight partials, all small-integer just ratios over the fundamental:

| ratio | ≈ Hz  | note role                                              |
| ----- | ----- | ------------------------------------------------------ |
| 1/1   | 72.6  | the ever-present root, always faintly sounding         |
| 9/8   | 81.7  | just whole tone                                        |
| 5/4   | 90.8  | just major third (pure 5-limit)                        |
| 4/3   | 96.8  | just perfect fourth                                    |
| 3/2   | 108.9 | just perfect fifth                                     |
| 7/4   | 127.1 | the natural seventh — Young's beloved 7th partial      |
| 2/1   | 145.2 | the octave                                             |
| 9/4   | 163.4 | octave + just whole tone                               |

**Why these:** the set is drawn from the low harmonic series and from Young's
own harmonic vocabulary. He famously dwells on the prime **7** (the 7/4 natural
seventh is a signature of his tunings) and on the 9/8, 3/2, 4/3 relations. Every
interval here is a pure-ratio beatless interval, so any subset that sounds
together is consonant by construction — there are no wrong notes because there
are no tempered notes. The frequencies stay between ~72 and ~163 Hz so the
cluster reads as warm chest-tone timbre rather than a shrill high pile-up (a
master lowpass at 6 kHz guards the top regardless).

## Position → spectrum sculpting (the core mechanic)

Each partial owns a **spatial well** at a fixed point in the normalized room. On
every frame the engine computes, for your current position, a Gaussian-falloff
proximity weight to each well (with a small floor so every partial is always at
least faintly present — this is a true continuous drone, never silence). The
weights are normalized to sum to 1 and mapped to each partial's gain. So:

- moving even slightly re-balances which overtones dominate;
- crossing between wells **smoothly morphs** the spectral balance (the wells are
  wide and overlapping);
- the partials **never stop** — they are continuously-running `OscillatorNode`s.
  This is a drone you sculpt, not notes you trigger.

Each partial also carries a faint, slightly-detuned **twin oscillator**. The
detune amount is position-dependent (~0.06–1.4 Hz), so walking changes the beat
rate between each partial and its twin — producing the shifting, shimmering
standing-wave beats that are the hallmark Dream House effect. All gain and
frequency changes use `setTargetAtTime`, so there are zero clicks.

## HRTF spatialization

One `AudioContext`. The performer is the `AudioListener`. Each partial is placed
at its fixed 3D room position via a `PannerNode` with `panningModel: "HRTF"`. As
you move, the listener moves and the whole drone field re-pans around you — you
walk _among_ the sine sources, as in the installation. Signal chain:

```
osc (sine) ─┐
            ├─ per-partial gain ─ HRTF panner ─┐
beat twin ──┘                                   ├─ bus ─ lowpass(6kHz) ─ compressor/limiter ─ master(fade-in) ─ destination
```

The bus → lowpass → compressor → master chain keeps the full eight-voice cluster
from ever clipping or getting harsh; the master gain fades in over ~1.6 s so the
drone arrives without a click.

## The Zazeela light field

The visuals are a luminous, slowly-shifting **magenta/violet** light environment
(not parchment, not a starfield): each partial is a symmetric, calligraphic glow
bloom centered on its well, whose brightness and size track that partial's
current amplitude. A slow per-partial "breathing" oscillation keeps it
meditative and alive. A bright still point marks the listener; left "resonances"
appear as soft persistent pink markers. This is the visual half of the Dream
House — Marian Zazeela's coloured-light counterpart to Young's sound.

## Leave a resonance

The primary action freezes your current spectral position as a soft persistent
glowing marker you can walk back to (recalling that exact timbre). Kept minimal —
a light nod to the looper idea; the drone presence is the point, not loops.

## Renderer fallback chain

1. **WebGPU** — hand-written WGSL (no three.js). A storage buffer of glowing
   particles expanded to quads in the vertex shader, additive blending; particle
   count and spread per bloom are driven by partial amplitudes.
2. **WebGL2** — `gl_Points` point-sprite glow, same amplitude response.
3. **Canvas2D** — radial-gradient magenta bloom field (last resort).

Always lands on something; fully demoable on Canvas2D alone. The active renderer
is shown in the HUD (`render webgpu/webgl2/canvas2d`).

## Input + graceful degradation

- **Pointer/touch** is the reliable default — the pointer is your body in the
  room.
- **Optional full-body camera**: a "Start camera" button dynamically `import()`s
  `@mediapipe/tasks-vision` (pose_landmarker_lite, VIDEO mode) from CDN inside a
  try/catch; position = torso/shoulder+hip centroid, x mirrored. Any failure
  (no camera, denied, offline, load error) falls back silently to pointer with a
  readable rose notice.
- **Cold load**: after a ~1.5 s delay the drone fades in automatically and a slow
  Lissajous auto-drift moves your position, so the page is alive and sounding at
  a glance. If browser autoplay policy blocks audio, the `AudioContext` stays
  suspended until the first gesture (pointer move/down or any button) resumes it
  — iOS-safe.

## Teardown

On unmount: cancel the rAF loop, stop and disconnect all oscillators (main +
beat twins), disconnect the full bus chain, close the `AudioContext`, destroy
GPU/GL resources, close the MediaPipe landmarker, stop all camera tracks, and
remove the resize listener. No leaks.

## Research lineage

- **La Monte Young & Marian Zazeela, _Dream House_** (MELA Foundation, 275 Church
  St, TriBeCa, NYC; the long-running sound-and-light installation, exhibiting
  through 2026-06-21) — the primary reference. A continuous just-intoned sine
  composition in Zazeela's magenta light field where the perceived sound changes
  with the listener's exact position in the room.
- **Janet Cardiff, _The Forty Part Motet_** — a spatial-audio installation of 40
  individually-speakered voices you physically walk among; the model for "the
  mix is your position in the room."

## Status — what is / isn't device-verified

- **Written and type-checked** against the repo's TS/ESLint config. Logic,
  audio-graph construction, and the renderer fallback chain are all in place.
- **Canvas2D** path is straightforward and expected to work everywhere.
- **WebGPU / WebGL2** paths follow the proven `977-echo-room-gpu` pattern but
  **cannot be hardware-verified in this build environment** — they are best-effort
  and degrade to Canvas2D if adapter/context creation fails.
- **HRTF panning, just-intonation beating, and the position→spectrum sculpt**
  are implemented per spec but have **not been listened to on a real device**
  here; tuning of well width, beat depth, and master level may want adjustment on
  hardware.
- **MediaPipe camera** path loads from CDN at runtime and is untested offline;
  it is wrapped to fail silently to pointer.
