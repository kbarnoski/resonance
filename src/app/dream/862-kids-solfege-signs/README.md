**For**: kids (4+)

# Sing With Your Hand — Curwen / Kodály solfège signs

## The one idea

What if a four-year-old could **sing a melody with their bare hand**? You make
the classic Curwen / Kodály solfège hand-signs in the air — the same shapes
music teachers use with children all over the world — and a little choir of
glowing creatures sings the matching scale degree back to you. Hold a shape and
it rings; change shapes to build a tune; go still and the choir echoes your
melody back (the Kodály "echo" game). Real music pedagogy, made playable by a
toddler — not just "wave your hand."

## The mapping (7 signs → 7 scale degrees, C major)

| Sign | Gesture (Curwen) | Degree | Pitch |
| --- | --- | --- | --- |
| ✊ | closed fist (thumb on top) | **do** | C |
| ↗️ | flat hand slanting diagonally **up** | **re** | D |
| ✋ | flat hand held **horizontal**, palm down | **mi** | E |
| 👎 | fist with the **thumb pointing down** | **fa** | F |
| 🖐️ | open flat hand, fingers **up**, palm forward | **sol** | G |
| ↘️ | relaxed hand **drooping** down | **la** | A |
| ☝️ | index finger pointing **up** | **ti** | B |

- **Hand height** in the camera frame shifts the **octave and brightness** (lift
  your hand to sing higher and shinier).
- A **~250 ms dwell** means a shape must be *held* before it rings, so jittery
  flicker never triggers a note.
- The choir runs an always-on **soft open-fifth drone (C + G)**, so it is never
  silent and every note you make is consonant — there are **no wrong notes**.
- After **~2 s of stillness or no hand**, the choir replays your **last ~6
  notes** as a gentle little tune (Kodály echo). Any real input restarts it.

## How it works

- **Input**: front-camera **MediaPipe HandLandmarker**, loaded from CDN at
  runtime (never bundled by webpack — see `handLoader.ts`, pinned to
  `tasks-vision@0.10.14`, zero new npm deps).
- **Classifier** (`classify.ts`): from the 21 landmarks we derive per-finger
  extended/curled booleans + a coarse hand orientation (pointing up / down /
  sideways, diagonal, thumb up / down) and map to one of the 7 signs with a
  small confidence/orientation tolerance.
- **Choir** (`audio.ts`): one warm triangle+sine voice per degree with a gentle
  vowel formant. Mandatory **kids-safe master chain**:
  `voices → masterGain (≤0.26) → lowpass (6.5 kHz) → DynamicsCompressor(-10,
  20:1) → destination`. The analyser only taps the master; it never routes to
  output. Gentle ≥40 ms attack/release, no loud transients.
- **Scene** (`scene.ts`): **three.js** (`three@0.182`) — 7 additive-glow
  creature-orbs in a warm rising arc, color-coded by a consistent pitch→hue
  palette. The signed orb blooms (scale + brightness) and lifts with hand
  height. Fake bloom via **additive halo shells** (no UnrealBloomPass, for build
  robustness). A faint starfield keeps the scene breathing.
- A tiny **Canvas2D HUD** in the corner draws the live hand skeleton so the
  child can see their hand is "seen" — this is the only 2D surface.

## Degrades gracefully (no camera in the build/review sandbox)

- **No camera / permission denied / MediaPipe fails to load** → a `text-rose-300`
  notice **and** a **ghost-hand auto-demo** that cycles a pretty phrase
  (do-re-mi-sol-mi-re-do…) through the *identical* classifier→choir→scene
  pipeline, so a hands-free glance both sees the choir bloom and hears the tune
  within ~1 s. Plus a row of **big (≥72 px) tap-sign buttons** — emoji + color,
  no reading required — that drive the same pipeline, so it is fully playable
  with zero camera on a desktop. Never a dead screen, never silent.
- **No WebGL** → `text-rose-300` notice, the choir keeps singing.
- **iOS**: the AudioContext is created/resumed and `getUserMedia` is called
  inside the first user tap (the ≥72 px "Start singing" button).

## Named references

- **John Curwen** (1870) — the Tonic Sol-fa hand-signs this prototype recreates.
- **Zoltán Kodály method** — the pedagogy that uses these signs (and the "echo"
  call-and-response game) to teach pitch through the body.
- **arXiv 2604.27957** (April 2026), *"Real-Time Control of a Virtual Orchestra
  by Recognition of Conducting Gestures"* — conducting as a musical sign-language
  recognized in real time, museum-robust; the spiritual sibling of reading
  solfège signs in real time.

## Honest caveat

The hand-sign classifier is **build- and lint-verified, not camera-verified** —
there is no camera in the build/review sandbox. The geometric thresholds in
`classify.ts` are designed to make the 7 signs reliably *distinguishable* for a
4-year-old (distinct shapes over clinical accuracy), but real-hand recognition
accuracy across lighting, hand sizes, and angles has **not** been measured on a
live camera. The tap-sign buttons and the ghost-hand auto-demo exercise the
exact same choir→scene pipeline, so the audio-visual experience is fully
demoable today regardless.
