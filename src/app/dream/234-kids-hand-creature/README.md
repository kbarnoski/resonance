# 234 · Kids Hand Creature 🪼

**Question:** *What if a 4-year-old could grow and play a glowing 3D creature just by moving their hands in front of the iPad — no touching the screen?*

A friendly blobby creature lives on a soft dark gradient. The child holds their
hands up in front of the iPad's front camera and **conducts** it: raising hands
inflates and grows the creature and rings soft pentatonic notes; opening the
hands wide makes it spike and sparkle; bringing up a second hand spawns a small
satellite blob that orbits the main one. No touching, no reading, no fail states.

## How it works

- **Visuals** — raw three.js (`WebGLRenderer`, no R3F) renders a high-detail
  `IcosahedronGeometry` (detail 24) displaced in a **vertex shader** by layered
  3D simplex noise (Ashima/Gustavson `snoise`). Uniforms `uGrow` (inflation),
  `uSpike` (noise amplitude), `uHue`, `uBright`, `uTime` are driven each frame
  from the hand state. A rim-light + filmic tonemap in the fragment shader give
  it a soft jelly glow. A second mesh is the two-hand satellite blob.
- **Input** — the webcam feed (mirrored, shown small in the corner) is read by
  **MediaPipe HandLandmarker** (CDN ESM, GPU delegate, `numHands: 2`), called
  once per detection frame via `detectForVideo`. Landmarks are normalized 0..1.
- **Audio** — Web Audio API. An always-on three-voice sine pad with slow
  tremolo loops underneath so it is never silent. Hand gestures pluck soft
  sine+triangle **C-major-pentatonic** notes (C4 D4 E4 G4 A4 C5) through a gentle
  attack/release envelope, a feedback-delay shimmer ("reverb"), and a
  `DynamicsCompressor` limiter so nothing is ever harsh (kids rule: safe sounds).

## Hand → sound → visual mapping

| Gesture (input) | Measured from landmarks | Sound | Visual |
|---|---|---|---|
| **Hand height** | `1 - wrist.y` (highest hand wins) | selects pentatonic step C4→C5; rings on crossing the raise threshold and on each new step while raised | `uGrow` inflation/size; hue (low = deep violet, high = warm rose/amber); brightness |
| **Hand openness** | avg fingertip distance from wrist, normalized by hand span (MCP) | adds velocity/brightness to the plucked note | `uSpike` noise amplitude (spikiness) + brightness |
| **Two hands** | second hand present | (richer texture) | satellite blob appears and orbits; its position tracks the off hand |
| **Raise past threshold (height > 0.6)** | latched crossing | **rings a pentatonic note** (soft sine+triangle, gentle env, delay shimmer) | creature is large & bright at that moment |
| **Hands lowered / gone** | no landmarks | pad continues | creature relaxes to a sleepy breathing idle |

Hue ramp per pitch step: violet `0.74` → indigo → cyan → amber `0.16` →
warm `0.08` → rose `0.03` (HSL hue, see `HUE_FOR_STEP`).

## Graceful degradation

- **Idle (pre-gesture):** before "Wake the creature 🪼" is tapped, the creature
  gently breathes on screen (idle noise animation) so the page is alive. The
  button is required to unlock the camera **and** the AudioContext.
- **Camera denied:** falls back to **auto-demo** — the creature breathes and an
  8-note pentatonic phrase rings on a slow loop, with a friendly `text-rose-300`
  message. Still a full AV piece.
- **MediaPipe fails to load (offline):** same auto-demo fallback.
- **Tap fallback:** in fallback mode only, tapping the creature bounces and rings
  it (acceptable as degradation, since the no-touch camera path is unavailable).

## References

- **Derivative — "Hand Tracking Master Class in TouchDesigner with MediaPipe"** —
  the idea of hand landmarks *conducting* visuals in real time.
- **spite / clicktorelease — "Vertex displacement with a noise function using
  GLSL and three.js"** — the noise-displaced blob shader this creature is built on.

## Limitations

- HandLandmarker GPU delegate + the `.task` model are CDN/network-loaded; first
  wake on a cold connection can take a couple of seconds (pad covers the gap).
- Openness normalization is a heuristic (fingertip spread / hand span); very
  small hands or extreme angles can read slightly under-open.
- Note triggering is latched to a single raise-threshold + per-step changes; it
  is intentionally forgiving rather than a precise instrument.
- The corner webcam preview is shown only in live mode (mirror feel); it is
  decorative and never gates interaction.

## Next-cycle ideas

- Pinch (thumb–index distance) → vibrato / a "tickle" giggle sound.
- Map left/right hand position to stereo pan so the creature sounds where it is.
- Persistent creature "mood" colors that drift between sessions.
- A second creature that mirrors a friend's hands for two-kid duet play.
- Particle sparkles emitted from fingertips at high openness.
