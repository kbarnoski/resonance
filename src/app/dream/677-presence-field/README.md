# Presence Field

**Route:** `/dream/677-presence-field`

> What if your whole body, tracked as a luminous skeleton, conducted a SPATIAL
> ensemble — each limb a voice placed in 3D around you, so raising and spreading
> your arms literally moves the music through the room?

## What it is

A meditative, installation-scale audio-visual instrument. Your webcam tracks
your full body as a 33-point pose skeleton (MediaPipe Pose). That skeleton is
rendered as a glowing constellation inside a dark 3D room (three.js), and — the
whole point — **each tracked joint drives a sustained voice whose position in 3D
space follows that joint.** Move your body and the voices physically sweep
around your ears.

- **INPUT:** webcam full-body pose / skeleton (MediaPipe Tasks-Vision
  `PoseLandmarker`, loaded from a CDN at runtime).
- **OUTPUT:** three.js — a luminous body-constellation + soft skeleton lines +
  a glowing marker at each voice's spatial position, in a foggy dark room.
- **CORE TECHNIQUE:** pose landmarks → Web-Audio `PannerNode` with
  `panningModel = "HRTF"`. **Spatialization is the instrument.** One
  `AudioListener` at the origin (your ears); each voice has its own HRTF panner
  positioned at its mapped joint's 3D location.
- **VIBE:** adult, meditative, installation, awe (luminous, Anadol-like).

## How to use

1. Press **Start** (this creates/resumes the `AudioContext` inside the gesture,
   for iOS, with a ~0.7s master fade-in).
2. Allow camera access. Stand back so your torso and arms are in frame.
3. **Spread your arms** → voices widen across the room and reverb opens.
   **Raise your hands** → register lifts and the field brightens.
   **Move** → brightness/voice levels swell. **Be still** → the field eases
   back into a soft enveloping drone.
4. No camera, or pose model fails to load, or you step out of frame for ~2.5s →
   a **self-playing auto-demo** takes over: a synthetic drifting virtual body
   whose limbs sweep the voices around the room on their own.

The camera stream is analysed entirely **on-device, in the browser**. Nothing is
stored or sent. There is no API route and no server call (only the MediaPipe
model/wasm files are fetched from a public CDN).

## The design idea

- **Spatialization as instrument.** The body's position maps to the sound's
  position. Left wrist → a voice panned to the wrist's x/y/depth; right wrist →
  another; head → a centred lead; torso → a mid anchor; hips → a low anchor;
  elbows → two more mid voices. Seven HRTF-spatialized voices in total.
- **Harmony (no pentatonic scale-snap — banned this cycle).** A real adult modal
  field: a slow drifting chord progression in **D Dorian**
  (Dm7 → G7 → Am7 → Fmaj7 → Dm7, homeward gravity, changing every ~9–13s with a
  ~2.2s glide for gentle voice-leading). Sine + detuned triangle per voice for
  warmth. Soft attacks throughout.
- **Ear-safe master chain:** per-voice gain → HRTF panner → (dry + wet send) →
  master `GainNode` (≤0.32) → `DynamicsCompressor` → destination. Shared
  convolution reverb whose level opens with arm spread.
- **Visuals animate before audio unlocks** — an idle preview runs the auto-demo
  body the moment the page mounts.

## Named references

- **arXiv:2601.22082** (Jan 2026) — placing sound in 3D around the listener
  raises the felt sense of *presence*. This is the thesis the piece dramatizes.
- **"Sounding Bodies" (arXiv:2311.06285)** — generating 3D spatial sound from
  body pose.
- **Myron Krueger, _Videoplace_ (1974)** — the body as the interface; full-body
  responsive environments.

## What's unverified / risks

- **MediaPipe CDN load is a runtime risk, not a build risk.** The landmarker is
  imported via an indirect `new Function('return import("…cdn…")')()` so the
  bundler never statically resolves the remote URL. **The production build does
  NOT depend on MediaPipe resolving at compile time.** If the CDN is blocked or
  slow at runtime, the piece degrades gracefully to the auto-demo (a `text-rose-300`
  notice is shown) — sound and visuals still play with zero hardware.
- HRTF spatial impression depends on headphones; over laptop speakers the sweep
  is subtler (panning + level are still audible).
- Pose depth (`z`) from a single camera is coarse, so the front/back sweep is an
  approximation; left/right and up/down placement are the strong cues.
- Tuned by ear against the reference patterns in this repo; exact level balance
  on every device is unverified.
- WebGL failure shows a Canvas-free `text-rose-300` notice and the audio still
  plays.
