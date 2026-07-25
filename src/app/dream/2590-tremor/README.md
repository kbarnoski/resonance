# 2590-tremor — Tremor

**Route:** `/dream/2590-tremor`

## The question

> What if you were the glottis and your hands were the vocal tract — a body
> tracked by the camera that becomes a continuous, dissonance-capable voice you
> play by moving?

## The inversion

2026's frontier runs the arrow **audio → body**: real-time full-body motion
*generated from* streaming audio. **EchoAvatar** (arXiv:2605.28272) and
**DiscoForcing** (arXiv:2605.28491), both SIGGRAPH '26, are the canonical
examples — avatars puppeted by sound.

Tremor runs the arrow the other way: **sound from motion.** The human moves; the
machine sings what the motion means. Instead of an avatar dancing to a track, a
body *becomes* a voice. That reversal is the whole point of the piece.

## How motion tracking works

Three sources, each producing the same normalized `MotionState`
(`{ cx, cy, energy, spread, velocity }`), so the voice and the visuals never know
which one is driving them:

1. **MediaPipe HandLandmarker (preferred).** Loaded at runtime from an ESM CDN
   (`@mediapipe/tasks-vision`, `webpackIgnore`) — no npm dependency, same pattern
   the lab established in `2410-facesong`. 21 landmarks per hand (up to two
   hands): centroid = mean landmark position; `spread` = bounding-box size (hand
   openness); `velocity` = centroid delta; `energy` derived from both. The CDN
   load is raced against a 12 s timeout so a blocked network can never hang.
2. **Optical-flow fallback.** If the CDN import fails, we compute a
   frame-difference motion field ourselves: each camera frame is drawn into a
   64×48 **offscreen** canvas (pixel read for analysis only — never a visible
   drawing surface), thresholded against the previous frame, and reduced to a
   diff-weighted centroid, spread (weighted std-dev), and energy.
3. **Seeded auto-demo.** If the camera is denied or unavailable, a deterministic
   gesture plays itself: rise → open → accelerate → still, looping every ~13 s,
   generated from a `mulberry32(0x2590)` PRNG (keyframes + seeded value-noise). No
   `Math.random`, no `Date.now` — `performance.now()` is the only clock.

The demo runs on load with zero interaction, so the whole idea is legible
immediately.

## How motion → voice works

A source–filter vocal synth (Web Audio). Mapping is **dissonance-capable with no
safety net** — pitch is continuous Hz and is *never* snapped to a scale, chord,
pentatonic, or JI lattice.

| Motion | Voice |
| --- | --- |
| centroid height (`1 - cy`) | continuous **f0**, log scale ~90–880 Hz, + a ±2-semitone microtonal drift from horizontal position |
| `spread` / openness | **formant sweep** — two bandpass resonances (+ a fixed third) morph from a closed "oo" toward an open "ah" |
| `energy` | **gain** — still hands settle the voice toward rest |
| `velocity` + `spread` | **roughness** — two glottal sawtooths beat against each other (detune), an inharmonic growl partial (×2.76) grows, and tremolo amplitude-jitter deepens and quickens |

The glottal source is two detuned saws + a sub sine, filtered by three parallel
bandpass formants, through a tremolo gain, into a limiter. Fast, wide motion
genuinely roughens and clashes — that's the point.

## The visible renderer

**WebGL2** ping-pong feedback trail (`glfield.ts`): each frame fades and drifts
the previous accumulation buffer, then adds a splat at the motion centroid,
stretched by energy and jittered/hue-shifted by roughness along the
violet→magenta art ramp; a present pass tone-maps with a vignette. The body's
path becomes a glowing continuous mark — the sonic gesture made visible. No
visible Canvas2D anywhere. If WebGL2 is unavailable it degrades to an **SVG**
tract figure (an ellipse that opens with the hand + a polyline trail).

## What's rough / honest limits

- **Least-tested paths:** the MediaPipe and camera paths were not exercised in a
  headless build. The seeded auto-demo, the WebGL2 field, the audio graph, and
  the SVG fallback were the paths I could reason about end-to-end.
- Hand tracking and optical flow are noisy, so everything is EMA-smoothed — very
  fast gestures blur.
- Two-formant morphing approximates vowels rather than modelling a full tract.
- Browsers hold audio until a user gesture; the auto-demo is silent until the
  first click/tap (the synth resumes itself on that first interaction). The
  visuals always animate.

## Next-cycle deepening

- Per-hand independent voices (a two-hand duet, dissonant on purpose).
- A real advected fluid for the field instead of a directional-fade trail.
- A breath / onset term from motion *acceleration* (attack transients).
- Depth (`z`) from hand landmarks → a second, sub-octave resonator.

## Constraints honored

Self-contained in this folder; `"use client"`; WebGL2/SVG only (no visible
Canvas2D, no three.js); no new npm deps (MediaPipe via runtime CDN import only,
degrading to optical flow then the demo); deterministic `mulberry32(0x2590)`, no
`Math.random`/`Date.now`; audio nodes, rAF, camera stream, and GL context are all
torn down on unmount.
