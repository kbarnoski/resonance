# 568 · Conductor's Hands

**The one question:** *What if you conducted two incommensurable tempi with your
two hands — left hand beats one voice, right hand beats another, and because the
system locks each to an irrational tempo ratio, the two pulses can NEVER line
up: you feel metric dissonance in your own arms?*

This is **cycle 2 of the lab's polytempo spine.** Cycle 1
(`514-polytempo-loom`) plays five voices at fixed irrational tempo ratios — √2,
φ, e/2, π/2 — autonomously. Cycle 2 makes that idea **embodied**: the human's
conducting gestures set the tempi, and the only tension in the whole piece is
metric. Every pitch is consonant; nothing is ever harmonically "wrong." The
single thing that drifts and never resolves is the *beat*.

## The idea

You raise two hands to the camera and conduct. Your **left hand beats voice A**,
your **right hand beats voice B**. The bottom of each downward conducting stroke
is a downbeat; the time between strokes is that hand's tempo. But the system
does **not** play your two tapped tempi raw. Voice A's tempo is the base; voice
B is **snapped to voice A × an irrational ratio** chosen from {√2 ≈ 1.414,
φ ≈ 1.618, e/2 ≈ 1.359, π/2 ≈ 1.571} — whichever irrational value is *nearest*
to the ratio you actually gestured. So you choose *roughly* how far apart the
two pulses sit, and the system guarantees they are mathematically
incommensurable: they can never again share a downbeat. The screen shows the
chosen ratio and its name live.

## How the references drive the piece

- **Conlon Nancarrow — *Studies for Player Piano*.** Nancarrow's tempo canons
  set voices at irrational ratios (e.g. 2:√2, e:π) precisely so they never
  re-converge — a melody chases itself forever, the gap eternally changing.
  Our incommensurability lock *is* this device: the snap-to-irrational step is
  exactly what makes the two pulses non-periodic against each other. The
  never-closing Lissajous ribbon in the visual is the geometric signature of a
  Nancarrow tempo canon.
- **György Ligeti — *Continuum* / *Désordre*.** Ligeti built shimmering
  textures from fast, slightly mismatched pulse streams whose phase
  relationship is in constant flux. Here the two voices play the *same*
  pentatonic cell at mismatched tempi, so you hear a continuously evolving
  interference pattern rather than a fixed groove.
- **Steve Reich — phase pieces (*Piano Phase*, *Clapping Music*).** Reich's
  phasing slides one identical pattern against another. The crucial difference:
  Reich's two parts share a *rational* relationship and eventually re-align;
  ours are locked to an *irrational* ratio, so the phase never completes a
  cycle. This piece is "Reich phasing that can never close the loop."

## How beat-extraction works

Each hand's **wrist** vertical position (MediaPipe Hands landmark 0) is tracked
frame to frame. A **beat (downbeat)** is detected at the *bottom of a conducting
stroke*: a velocity zero-crossing from downward → upward motion (the apex at the
bottom), debounced ~150 ms. The inter-beat interval is averaged over the last 3
beats to give a stable tempo, clamped to 200–1600 ms (≈ 37–300 BPM). See
`tracking.ts` (`BeatTracker`).

## How the irrational lock works

`snapToIrrational(gesturedRatio)` (in `tracking.ts`) folds the gestured ratio to
≥ 1, then picks the irrational ratio nearest in *log* space (so the snap is
perceptually even across the set) and returns its exact value + name. Voice A
plays at the gestured base period; voice B is forced to `periodA / ratio`. The
human chooses the neighbourhood; the math guarantees incommensurability.

## Audio (`audio.ts`)

`PolytempoEngine` — two warm pluck voices (triangle fundamental + soft octave
sine partial, fast pluck envelope), both playing the same rising/falling D-major
pentatonic cell; voice B is transposed up a **perfect fifth** (×1.5) so the two
are distinguishable but consonant. Each voice has its own **look-ahead
scheduler**: a 25 ms `setInterval` pump schedules `osc.start(t)` ~120 ms ahead
(sample-accurate, never `setTimeout`-per-note). Master chain ends in a brick-wall
limiter: `gain → DynamicsCompressor(threshold −10, ratio 20:1) → destination`.
The `AudioContext` is built inside the Start click (iOS unlock;
`window.AudioContext || webkitAudioContext`).

## Visual (`render.ts`, three.js)

A Nancarrow-style **phase space**: two emissive markers orbit their rings, each
completing one revolution per beat-period; a **Lissajous ribbon** (x driven by
voice A's phase, y by voice B's) is traced from their combined phase. Because
the tempo ratio is irrational the figure **never closes** — that open, drifting
curve is the visible proof the two pulses can never realign. Each marker
flashes (emissive bump + halo) on its scheduled beat. Dark indigo field,
restrained palette: **violet for voice A, warm amber for voice B.** WebGL via
`WebGLRenderer` (not SVG / Canvas2D / WebGPU).

## Auto-demo & graceful degradation

- **Auto-demo:** from frame one — before any camera permission or Start click —
  the phase-space is already animating with two synthetic conductors at a
  default φ ratio. Audio stays silent until the Start gesture (autoplay rules);
  a 10-second hands-free glance always shows the two-pulse drift.
- **Degradation:** if the camera is denied or MediaPipe fails to load, a
  `text-rose-300` notice appears plus two on-screen tap pads ("Beat A" / "Beat
  B"). Tapping each pad sets that voice's tempo from the tap interval, so the
  piece is fully playable without a camera.

## Tags

- **INPUT:** camera hand-tracking (MediaPipe Hands, `HandLandmarker`, loaded
  from a CDN ESM URL at runtime — not an npm dependency).
- **OUTPUT:** three.js (WebGL).
- **TECHNIQUE:** conducting-gesture → tempo extraction → polytempo scheduler.
- **VIBE:** energetic / cerebral-rhythmic / Nancarrow.

## Privacy

The camera + landmark data is **local only** — never recorded, uploaded, or
networked. No API route, no secrets. Stated in the UI and here.

## Honest list of unverified surfaces

- **Not run in a real browser.** Verified by `tsc --noEmit` and `eslint`
  (both clean) only — no manual camera/audio test in this environment.
- **MediaPipe Hands handedness → user-hand mapping.** I map the result's
  `"Right"` label to the user's *left* hand (mirror). MediaPipe's handedness is
  reported from the camera's point of view and the un-mirrored input, so this is
  the expected convention, but it has not been confirmed live; the worst case is
  the two voices swap which hand drives them, which does not break the piece.
- **Beat-apex tuning.** The velocity-threshold (`0.002` normalized units/frame)
  and 150 ms debounce are reasonable defaults but untuned against real
  conducting gestures and varying frame rates; they may need adjustment for
  very fast or very small strokes.
- **GPU delegate fallback.** MediaPipe is requested with `delegate: "GPU"`; on
  devices without WebGL2 for the delegate it may throw, in which case we fall
  back to the tap pads rather than retrying with `"CPU"`.
- **Visual phase vs. audible beat drift.** The visual phase is integrated from
  the current beat period each frame (rAF clock) while audio is scheduled on the
  AudioContext clock; the beat *flashes* are driven from the scheduler so they
  stay aligned, but the continuously-orbiting markers can drift a few tens of ms
  from the exact audible onset over long sessions. Not corrected.
