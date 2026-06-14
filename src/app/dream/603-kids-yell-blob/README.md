# 603 · Kids Yell Blob

**Route:** `/dream/603-kids-yell-blob`

## What it is

A deliberately silly, loud-but-friendly toy: a giant wobbly cartoon blob with
googly eyes that you **YELL** at. The louder you are, the bigger, bouncier, and
goofier it gets — and it **HONKS your own voice back**, exaggerated like a
rubber duck or a kazoo. Think Toca Boca meets a whoopee cushion, not a
meditation app. Built for a 4-year-old to roar at.

One question it answers: *"What if a kid could yell at a giant blob and it
squashes, stretches, inflates, and honks their voice back — louder = bigger and
goofier?"*

## How to play

1. Tap **START YELLING**. The browser asks for the microphone.
2. Roar, sing, shout, or make any silly noise. Watch the blob inflate, wobble,
   and overshoot — and listen for the **HONK** coming back, pitched by your voice.
3. **High voice** tints it cyan and makes a high honk; **low voice** tints it
   pink and honks low.
4. **No microphone?** No problem. A `text-rose-300` notice appears, and you can
   **hold the screen** or **mash any key** to "fake-yell" — the blob still
   bounces and honks.
5. Leave it alone for ~2.5 seconds and it **auto-demos**: it yells at itself in
   a scripted loop so a silent glance still shows it alive. Real input takes
   over instantly; the demo resumes after ~5s of quiet.

## Subsystems

- **`blob.ts` — soft-body physics.** A closed ring of 40 spring-mass points
  orbiting a center. Each point has a radial spring toward a "rest radius" plus
  neighbor-coupling springs that keep the outline smooth and gooey. Loud audio
  raises the rest radius (inflation) and `popBlob` kicks the rim outward so it
  **overshoots and jiggles back** — that's the squash-and-stretch. A separate
  per-axis squash spring flattens-then-stretches the whole body on a loud onset
  and settles back, cartoon-style.
- **`gl.ts` — raw WebGL2 renderer.** Hand-written GLSL ES 3.00. The blob is a
  triangle fan (center vertex + the physics ring), drawn each frame in clip
  space. Googly eyes, pupils, and shine dots are separate fans on top; a brighter
  inner "belly" circle adds depth. No three.js, no CDN, no libraries.
- **`audio.ts` — mic analysis + comic honk DSP.**
  - *Analysis:* an `AnalyserNode` gives RMS loudness (time-domain) and a rough
    pitch via spectral centroid (capped at 4 kHz to ignore hiss).
  - *Honk-back:* NOT a clean replay. Two detuned oscillators (saw + square) →
    **ring modulator** → **WaveShaper** (gentle cartoon clip) → **swept
    bandpass** → output. The honk's base pitch and the bandpass sweep are bent
    by the kid's voice; the envelope droops then rises for a goofy "HONK." A
    quiet, distorted echo of the live voice is mixed in for a "talkie" feel.
  - *Kid-safe master chain:* `gain → lowpass (7 kHz) → DynamicsCompressor
    (threshold −10, knee 0, ratio 20, attack 0.003, release 0.25, brick-wall
    limiter) → destination`. Master ramps up on start (no click). Nothing gets
    painfully loud or shrill. Nodes are pre-created so honks fire in well under
    50 ms.
- **`page.tsx` — glue.** Mic permission with graceful fallback, the rAF
  physics+render loop, onset→honk gating ("honk... honk..." not a buzz), idle
  auto-demo, pointer/keyboard fake-yell, hue smoothing from pitch, and the
  house-style UI (big Start button, loudness meter, error notices).

## Named references

- **Disney's squash-and-stretch principle** — Preston Blair, *Cartoon
  Animation*. The blob inflates, overshoots, flattens, and springs back instead
  of merely scaling; volume is loosely conserved for a rubbery read.
- **holtsetio (Niklas Niehus), WebGPU `softbodies` engine / Softbody Tetris
  (2026).** Inspiration for the gooey soft-body feel — neighbor-coupled points
  with overshoot are what sell "squish" over "scale." (Our version is a much
  simpler CPU spring-mass ring, not the full tetrahedral solver.)
- **Classic cartoon foley — Carl Stalling / Treg Brown honks.** The comic
  vocal DSP aims for that exaggerated honk/boing/kazoo register, not a warm pad.

## Constraints honored

- `"use client"` at the top of `page.tsx`; fully self-contained in this folder.
- Web Audio API + WebGL2 only. No new npm deps, no CDN, no three.js — GLSL is
  hand-written. No API route; nothing is recorded or sent.
- Graceful degradation: visible `text-rose-300` notice + pointer/keyboard
  fallback if the mic is denied; a `text-rose-300` notice if WebGL2 is missing.
- Idle auto-demo after ~2.5s; real input preempts instantly.

## Honest notes / unverified surface

- **Not verified in a live browser with a real mic** in this build environment.
  The audio graph, physics, and render path compile and type-check, and the
  logic is straightforward, but loudness scaling (`rms * 6`) and the
  centroid→hue mapping are tuned by eye and may want adjustment on real voices /
  noisy rooms. The mic input has `autoGainControl: false`, so very quiet rooms
  may need a louder yell.
- **Pitch is rough.** It's a spectral centroid, not true f0 (no autocorrelation).
  It tracks "bright vs. dark" voice well enough for tinting and honk-bending but
  is not a real pitch tracker. This was a deliberate keep-it-robust choice.
- **Latency** depends on the browser's audio buffer; honks should feel instant
  since all nodes are pre-created, but this hasn't been measured here.
- **Canvas2D fallback** for missing WebGL2 was not implemented (it's a bonus in
  the brief) — instead a clear notice is shown.
- The live-voice echo bus is intentionally quiet (0.18 gain) to avoid feedback
  if a kid is on speakers; on a loud setup it could still be reduced further.
