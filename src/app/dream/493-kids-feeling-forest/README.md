# Feeling Forest

**Route:** `/dream/493-kids-feeling-forest`

**Audience:** Children 4+ (no reading required)

---

## The One Question

> What if a child crossed a 2-D *world* with their BODY, and every place in that world *sounds* like a different feeling — prickly and clashing in one corner, sweet and open in another — so the child finds calm (or chooses to stay in the bittersweet middle) by *moving*, not by pressing a 'resolve' button?

---

## Interaction Model

The screen is a glowing "feeling forest" viewed from above. A glowing spirit-creature sits at the child's position in the world. Moving the creature across the canvas changes the harmony and texture of the music in real time — no buttons, no menus, no reading.

**Three ways to move:**

1. **Camera / pose** (primary): tap "Use Camera". The child holds their body or hand in front of the camera — their nose position (via MediaPipe PoseLandmarker) is mirrored onto the canvas. Moving left/right/up/down walks the creature across the forest.
2. **Drag / pointer** (fallback): touch or mouse drag moves the creature directly. Immediate and responsive.
3. **Auto-demo** (always-on, no input needed): if neither camera nor drag is active, the creature wanders the map on a slow looping path through prickly → electric → bittersweet → sweet → calm → dreamy → back. This runs from the moment the page starts so the sandbox always makes evolving sound + visuals hands-free. Any touch or camera input stops the demo.

---

## Harmony-Tension Map: Anchor Layout

Six "mood anchors" define the sonic landscape. At any point the child occupies, all parameters are **inverse-distance-weighted blended** (IDW, power=2) across the anchors — so dissonance/consonance, timbre, tremolo, and filter cutoff form a **smooth continuous spatial gradient**, not discrete zones.

| Anchor | Position | Voicing | Tension |
|---|---|---|---|
| **Storm** (prickly) | top-left (0.08, 0.08) | unison + m2 + tritone + m9 | ★★★★★ — genuinely clashing, 22¢ beating, sawtooth, fast tremolo |
| **Electric** (tense) | top-right (0.92, 0.08) | augmented + dominant-7th | ★★★★ — metallic, 14¢ beating, triangle |
| **Bittersweet** (center) | center (0.50, 0.42) | sus2 + octave | ★★★ — ambiguous, never resolves |
| **Dream** (floating) | bottom-left (0.15, 0.82) | whole-tone stack | ★★ — warm ambiguity, gentle tremolo |
| **Sweet** (warm) | center-bottom (0.55, 0.90) | major triad + octave | ★ |
| **Calm** (resolved) | bottom-right (0.88, 0.88) | open fifth + octave stack | 0 — pure, no detune, no tremolo |

**What morphs continuously:**
- Chord voicing (fractional semitone offsets blend between anchors — no scale snapping)
- Detune amount (0¢ → 22¢ of per-voice beating)
- Oscillator timbre (sine → triangle → sawtooth)
- Per-voice lowpass filter cutoff (380 Hz → 2200 Hz)
- Tremolo rate and depth (0 Hz → 5.8 Hz)
- Master filter cutoff

Audio stays safe: a DynamicsCompressor (limiter at −6 dBFS) prevents sudden-loud moments regardless of how many anchors the child lands near.

---

## FXplorer Citation

This prototype implements the core map-exploration idea from:

> Chu, A., Smith, J. B., & Pardo, B. (2026). **FXplorer: A Map-Based Interface for Exploratory Audio Effect Design**. *Proceedings of NIME 2026*. arXiv:2606.08286 (listed 2026-06-09).

FXplorer proposes replacing menus and sliders with a continuous 2-D parameter map that musicians *navigate*: every (x,y) position encodes a different audio effect configuration, and discovery happens through wandering rather than targeting. This prototype adapts the idea for young children: instead of audio effect parameters, the map encodes harmony and tension; instead of a mouse cursor, the child's body is the navigator; and instead of an adult exploring effect options, a 4-year-old explores the texture of feelings through sound and motion.

---

## Graceful Fallback

- If `getUserMedia` is denied → `setCameraError` shows a `text-rose-300` banner and falls back to drag input.
- If MediaPipe CDN script fails to load → camera input silently degrades; drag still works.
- If no interaction at all → auto-demo wanders the map continuously so the page always makes sound.
- AudioContext is created inside the "Enter the Forest" button press (user gesture) so iOS doesn't block it.

---

## Visual Design

- **Canvas2D only** — no WebGL, no Three.js.
- Background: an 8×8 grid of colored cells whose hue, saturation, and lightness reflect the blended anchor region. Prickly regions: cold blue/violet, low saturation, jittering lightness. Calm regions: warm amber, high saturation, steady.
- Creature: glowing firefly spirit. In tense zones it vibrates and sprouts spiky rays. In calm zones it pulses gently.
- Trail: short-lived dot trail (2.2 s) following the creature's path.
- Particles: emitted from the creature, direction and speed keyed to regional tension.
- Camera indicator: tiny 36×27px frame in the header corner showing the detected body position as a green dot.

---

## Next-Cycle Deepening Ideas

- **Multi-creature / multi-child**: two cameras → two creatures that harmonize or clash depending on their relative positions.
- **Haptic feedback**: vibrate the device when the creature enters the prickly zone (the feeling becomes tactile).
- **Recorded path playback**: let the child draw a path that plays back as a melody — their journey becomes a song.
- **Anchor remixing**: let a grown-up drag anchors to different positions, creating personalized emotional maps.
- **Binaural spatial audio**: pan voices across 3D space so the storm literally sounds like it comes from the upper-left.
