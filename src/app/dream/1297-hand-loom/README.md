# 1297 · Hand Loom

**What if you could PLAY a rhythmic groove in the air with your bare hands, tracked by the webcam?**

A hands-in-the-air **groove machine**. A steady 16-step transport runs at ~110 BPM — kick, clap, hat and an offbeat rolling bass interlock into a UV black-light rave groove. It is a *played, pulsing instrument* — there is an audible beat — not a drone and not a "strike it once for a consonant chord" bell piece. Two hands conduct the groove in front of your webcam.

## How to play it

1. On load the piece is already alive: the step-lane sweeps and the demo groove is drawn, pulsing.
2. Press **Begin the groove** — this is the gesture gate that starts audio (browsers can't autoplay sound), and the autonomous demo groove begins.
3. Press **Enable camera to play with your hands** to grant the webcam and start hand tracking.
4. With hands live:
   - **Raise a hand (height / Y)** → opens the filter / register (higher = brighter).
   - **Move a hand left↔right (X)** → selects which lane your gestures target (KICK · CLAP · HAT · BASS across the screen width).
   - **Pinch (thumb-tip to index-tip)** → a discrete gesture, **quantised to the nearest step** so the hit lands ON the beat. Pinch toggles that step in the lane your hand is over — build up a pattern or clear one out.
   - **Spread your fingers** → adds swing to the offbeat sixteenths.
   - **Distance between your two hands** → adds density (ghost hats sprinkle in between the written hits).
5. Fingertips leave luminous magenta / cyan / lime trails, and a bright sweep line crosses the step-lane so you can *see* the groove.

## The MediaPipe technique

Real-time **MediaPipe Tasks-Vision `HandLandmarker`**, loaded at **runtime from a CDN** — no npm dependency is added and `package.json` is untouched. `handLoader.ts` does a dynamic `import()` with a `/* webpackIgnore: true */` magic comment so `next build` never tries to resolve the external URL, then builds a two-hand (`numHands: 2`) landmarker in `VIDEO` mode against a hidden `<video>` fed by `getUserMedia({ video: { facingMode: "user" } })`. Each animation frame calls `detectForVideo(video, performance.now())` (timestamps forced monotonic). All browser globals are behind effects/handlers — the module is SSR-safe and server-renders without throwing.

From the 21 landmarks per hand we read: wrist Y (height → cutoff), index-tip X (lane), thumb-to-index distance (pinch), index-to-pinky distance (spread), and the gap between the two wrists (density).

## Reference — Imogen Heap's MiMU gloves

This is a camera-based, **glove-free cousin of [Imogen Heap's MiMU gloves](https://mimugloves.com/)** — the real gestural-music instrument where hand motion and pinch gestures map to live musical control. MiMU uses sensor-laden gloves; Hand Loom does the same idea of "hands in the air conducting music" with nothing but a webcam and MediaPipe.

## Audio design — the rhythm engine

Pure Web Audio, in `audio.ts`. A transport with a 16-step clock scheduled via the classic look-ahead pattern (a 25 ms `setInterval` books each step into the sample-accurate `AudioContext` clock ~120 ms ahead), so timing stays rock-steady independent of frame rate.

Voices, all synthesised (no samples):
- **Kick** — sine with a fast pitch drop (150→45 Hz) and a punchy amp envelope.
- **Clap** — three quick band-passed white-noise bursts for the smear.
- **Hat** — high-passed noise, very short; its brightness follows the hand-height cutoff.
- **Bass** — sawtooth + sine sub through a resonant low-pass whose cutoff opens with hand height; an offbeat rolling line interlocked with the four-on-the-floor kick.

Signal path: voices → drum/bass buses → **`DynamicsCompressor` limiter** → **master gain (≤ 0.30, 1.2 s fade-in)** → destination. Audio is gesture-gated (starts on the Begin click) and fully torn down on unmount (interval cleared, master faded, context closed).

## Graceful degradation

The visual and the demo groove run **before and without any camera**. If the camera is denied or unavailable, the demo keeps grooving and a `text-rose-300` notice explains why — never a blank screen. The Begin and Enable-camera steps are separate so the piece is audible even where the webcam or WASM/WebGL isn't.

## Safety

**No strobe.** Trails and the lane-sweep are smooth, continuous motion. `prefers-reduced-motion` is honoured: fewer trail points (index tip only), faster trail decay, and a denser background wash so nothing accumulates. Master level is capped at 0.30 behind a limiter.

## Honest gaps

- MediaPipe pulls the vision bundle, WASM and the hand model from a CDN on first camera enable — a few hundred KB; the very first `Enable camera` has a short spin, and it needs network + WebGL/WASM.
- Hand identity is tracked by detection-array index (0/1), not by MediaPipe handedness, so if hands cross or one drops out the pinch-latch bookkeeping can briefly reassign — fine for play, not frame-perfect.
- BPM is fixed at 110 (swing and density vary, tempo doesn't). The loop-position readout assumes a constant tempo.
- Pinch threshold is a fixed normalized distance; very close/far hands or unusual lighting can shift how easily a pinch registers.
- No mic (that's a sibling piece); output only.
