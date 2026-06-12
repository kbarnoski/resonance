# 529 — Kids: Doodle Choir

**Route**: `/dream/529-kids-doodle-choir`  
**Status**: demoable  
**Tags**: INPUT=finger-drawing, OUTPUT=Canvas2D, CORE=TF.js sketch classification, VIBE=joyful kids storybook

## The idea

"Quick, Draw! that sings."

A child draws a simple doodle on a big canvas. A real in-browser neural net
recognizes WHAT they drew. The recognized thing animates and sings a short warm
motif unique to its kind. Each drawing stays on screen as part of a growing,
gently-looping choir — so after drawing a few things, the child has a small
singing world. Joyful, magical, make-believe. No reading required. No way to
fail.

## Core technique: TensorFlow.js real-time sketch classification

The headline feature is the first use of TF.js / ML inference in the Resonance
Dream lab.

- **TensorFlow.js** is loaded at runtime via CDN dynamic import:
  `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4/+esm`
- **DoodleNet** model (yining1023): a CNN trained on the Quick, Draw!
  345-category dataset, ported to TF.js.
  - Model URL (community-documented; best-effort):  
    `https://storage.googleapis.com/tfjs-models/tfjs/doodle_recognition_v1/model.json`
  - Input: 28×28 greyscale (white bg, black strokes, values 0–1)
  - Output: 345-class softmax
- The drawing canvas is rasterized to 28×28, run through inference, and the
  top-1 class name is mapped to one of 8 archetypes.

### References

- **Quick, Draw!** — Jongejan, Ha, et al. Google (2016).
  The original dataset and game this classifier descends from.
  https://quickdraw.withgoogle.com

- **DoodleNet** — yining1023.
  TensorFlow.js port of a CNN trained on the Quick, Draw! dataset.
  https://github.com/yining1023/doodlenet

## Archetype mapping

The 345 DoodleNet class names are mapped to 8 archetypes, each with a distinct
animation style and musical motif:

| Archetype | Example classes | Animation | Motif |
|-----------|----------------|-----------|-------|
| `sun`     | sun, moon, circle, clock | Pulses, rises | Rising C major arpeggio (C4→E4→G4→C5) |
| `fish`    | fish, whale, shark, wave | Wiggles horizontally | Bubbly descending arpeggio (G4→C3→A3) |
| `bird`    | bird, duck, butterfly, airplane | Quick flutter bob | Chirpy high motif (E5→G5→E5→A4→E4) |
| `plant`   | tree, flower, leaf, cactus | Gentle sway | Bell bloom up (G3→C4→E4→G4→C5) |
| `cloud`   | cloud, rain, rainbow, snowflake | Drifts slowly | Airy simultaneous chord |
| `star`    | star, fireworks, diamond, crown | Twinkle scale pulse | Pentatonic leaps (C4→G4→E4→A4→C5) |
| `critter` | cat, dog, snail, rabbit, bee | Walking bounce | Staccato bassline (G3→A3→C4→D4→E4→G4) |
| `home`    | house, castle, tent, everything else | Gentle breath | Soft C major chord stack |

All motifs are in C major / C pentatonic so nothing ever sounds wrong together.

## Graceful degradation

Two layers of fallback:

1. **TF.js fails to load** (network blocked, etc.): falls back to a
   hand-coded **geometric heuristic classifier** that analyses the pixel
   bounding box, ink density, and aspect ratio of the drawing canvas.
   A small `◈ shape matching` badge (text-rose-300) indicates heuristic mode.
   The prototype ALWAYS works — zero blank screens.

2. **Canvas2D unavailable**: shows a notice in place of the canvas.

The classifier mode badge shows:
- `✦ AI ready` (green) — TF.js + DoodleNet loaded
- `◈ shape matching` (rose) — heuristic fallback active

## Auto-demo (hands-free)

On load, before any drawing, a scripted ghost finger traces simple shapes:
sun → fish → bird → plant → star → critter → cloud → home, cycling forever.
The demo drives through the same archetype pipeline as real drawing (bypasses
the async classifier for speed, directly assigns the intended archetype) so
creatures always appear and sing regardless of model load state.

After 4 seconds of real user drawing, the auto-demo pauses. After 4 seconds of
inactivity, it resumes.

## Audio architecture

```
masterGain → lowpass (≤ 7.8 kHz) → DynamicsCompressor (−6 dB, 20:1) → destination
```

- **DynamicsCompressor**: brick-wall limiter (threshold −6 dB, ratio 20:1,
  attack 3ms, release 250ms) prevents any loud transients.
- **Lowpass ≤ 8 kHz**: cuts harsh high frequencies, keeps it soft for children.
- **setTargetAtTime envelopes**: all gain changes are smooth ramps — no clicks.
- **All notes in C pentatonic**: C D E G A — every combination sounds good.
- **AudioContext created inside the Start button** gesture for iOS unlock.
- Quiet ambient C major pad hums throughout.
- Each creature joins the "choir" — its motif loops quietly on its own interval.

## Design notes

- iPad/mobile first. Drawing canvas spans full screen. Touch/pointer events.
- No reading required. The big Start button has an emoji. Instruction is a
  single emoji: "✏️ Draw anything!"
- Min touch target: Clear button is 44px+ height.
- Dark storybook palette: indigo/purple sky, warm green ground.
- Each creature keeps its original doodle stroke visible (faint, colored by
  archetype), so children can see their drawing transform.

## Unverified surfaces

- The DoodleNet model URL (`storage.googleapis.com/tfjs-models/tfjs/doodle_recognition_v1/model.json`)
  is community-documented and treated as best-effort. If it changes or goes
  down, the heuristic fallback activates automatically.
- The 345-label list is sourced from the Quick, Draw! dataset paper and
  community documentation, not verified against the model binary directly.
- `webkitAudioContext` fallback covers older iOS Safari; untested on iOS <15.
