**For**: kids (4+)

# Sky Choir (582-kids-dance-sky)

A 4-year-old's whole body becomes a warm sky-choir. They stand in front of an
iPad or phone, and their body is tracked as a glowing skeleton. Raise your arms
and the sky brightens; spread out wide and the chord opens. No tapping, no
humming, no creature to feed — just dance. There are no wrong notes, and it is
never silent once started.

This is an off-the-glass, embodied prototype: the instrument is the child's
moving body, not their finger.

## How it works

The front camera tracks **33 body landmarks** (MediaPipe PoseLandmarker). Those
landmarks feed a warm choir and a Canvas2D glowing skeleton with a blooming
aura. The child sees themself drawn as warm light from the very first frame.

### Pose → sound mapping

- **Each hand's height** (left & right wrist) → two distinct warm voices. A
  higher hand is a brighter, higher note within a warm scale; the left hand
  lives in a lower register, the right in a brighter one (and tinted toward sky
  blue in the visuals).
- **Body spread** (distance between the wrists) → **chord openness**. Narrow =
  a close root + fifth; arms wide = an open, shimmering voicing where an added
  6th/9th fades in.
- **How high the arms are raised** (hands relative to shoulders / centre of
  mass) → master **brightness**: the lowpass filter opens (up to 7.5 kHz) and
  the aura glow blooms.
- **Feet / hip motion** (overall body movement) → a soft low **bass swell** —
  never thumpy, just a warm rise under everything.

### Harmony (not the tired kids pentatonic)

A constant low **root + fifth drone** sits underneath at all times (so it is
never silent). The expressive voices are tuned with **just-intonation ratios**
in a warm **Lydian-ish cluster** (1, 9/8, 5/4, 45/32, 3/2, 5/3, 15/8, 2) over a
low A root, adding octaves, 6ths and 9ths as the body opens. Still "no wrong
notes," but the expression lives in the *body pose* — felt, not solved like a
puzzle.

## Audio-safety chain (kids-safe)

Built exactly as:

```
source → GainNode → BiquadFilter lowpass (≤ 7600 Hz) → DynamicsCompressor
         (threshold -10, ratio 20, knee 6) → ctx.destination
```

- The `AudioContext` is created **inside the Start button gesture** (iOS unlock).
- All gain and filter changes use `setTargetAtTime` — no clicks, no sudden
  loud sounds.
- Always-on soft ambient drone, so it is never silent after Start.
- No fail state, nothing scary.
- A **Chris-Wilson look-ahead scheduler** (`setInterval` ~25 ms) pumps the audio
  parameter ramps steadily on the AudioContext clock, rather than a
  `setTimeout`-per-note.

## MediaPipe runtime load + fallback

MediaPipe Tasks Vision is loaded **at runtime from a CDN** via a dynamic
`import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@.../vision_bundle.mjs")`
with the WASM and pose `.task` model also fetched from CDN / Google storage. It
is **never added to `package.json`** and never bundled at build time.

Graceful degradation (all wrapped in try/catch, never a white screen):

1. **Camera + pose works** → full skeleton + body→choir mapping.
2. **Camera works but the pose model fails to load** → a Canvas2D
   **frame-difference motion blob** drives a simplified version of the same
   mapping (blob height = brightness, blob spread = openness), with a
   `text-rose-300` notice.
3. **No camera / permission denied** → drag a finger across the sky to play, with
   a `text-rose-300` notice.
4. **No input for ~3 s** → a gentle **auto-demo** (a synthetic dancing skeleton)
   plays the chord so a silent 06:30 glance still looks alive and sings. It
   cancels on real input and resumes after ~5 s idle.

Privacy: camera frames are analysed in-browser only — never recorded or sent.

## Named reference

**Myron Krueger — *Videoplace* (1974).** Krueger's "responsive environment"
work put a person's whole silhouette into a shared graphical space where the
*body itself* — not a mouse or cursor — was the instrument, reacting in real
time. Sky Choir sits in that lineage: the child's tracked body is the
controller, and the room responds with light and sound the instant they move.
