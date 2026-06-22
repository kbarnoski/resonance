# 853 — The Motet Room (Reach)

## What it is
A binaural "conductor's room." You stand at the fixed center of a fixed
constellation of ~18 sustained, vowel-ish choir voices, each spatialized in 3D
through its own HRTF `PannerNode`. Your two hands become conductor's magnets:
reach toward a section and it swells and leans toward you; spread your arms and
the whole choir blooms open and brightens around your ears; bring your hands
together and the field collapses to a tight, resolved central cluster; pinch a
single voice and fling it to a new place in the room — it stays where you drop
it, permanently re-sculpting the constellation.

## The one question
*What if you stood at the center of a fixed field of spatialized voices and
CONDUCTED it with your bare hands — swelling sections, blooming or resolving the
whole choir, and physically relocating individual voices to re-sculpt where
they live around your head?*

## How it works
- **Input — MediaPipe Tasks-Vision `HandLandmarker`** (two hands, loaded from
  CDN at runtime via `handLoader.ts`, `webpackIgnore`, never added to
  `package.json`). Per frame, `detectForVideo` gives landmarks:
  - Hand screen position → a 3D "magnet" point in the room (height = reach
    depth into the field). Nearest voices swell (gain) and lean toward it.
  - **Spread** between the two hands → opens the whole field (voices spread out
    + brighten). **Hands together** → collapses toward a tight central cluster.
  - **Pinch** (thumb-tip↔index-tip distance) → grab the nearest voice; while
    pinched it follows the hand; release drops it at the new 3D position, which
    becomes its new resting spot. One grabbed voice per hand, never the same.
  - Everything smoothed with EMAs; positions pushed to panners via
    `setTargetAtTime` so you HEAR voices glide around your head.
- **Audio** — a slowly-evolving polyphonic motet: each voice is two detuned
  sawtooth oscillators → a bandpass **formant** (vowel colour) → a lowpass
  **brightness** filter (opens with spread/swell) → gain → its own
  HRTF `PannerNode` at a fixed 3D coordinate on a shell around the listener.
  The `audioCtx.listener` is fixed at the origin looking −Z. Voices breathe and
  drift so the field is alive at rest. Master chain: sum → `DynamicsCompressor`
  limiter → master gain (≤ 0.28) → destination.
- **Output — raw WebGL2** (no three.js, no Canvas2D): additive billboarded glow
  point-sprites for each voice-orb at its mutable 3D position, projected with a
  hand-rolled perspective matrix, plus faint glowing cursors for the two hands.
  Voices read cool violet at rest and warm gold when the conductor pulls them
  forward. Camera pulled back so the surrounding room reads as depth.

## Graceful fallback (no webcam needed)
- Camera denied / unavailable / MediaPipe fails → a `text-rose-300` notice AND
  an **AUTO-DEMO**: two virtual hands drift, spread/close, and periodically
  pinch on their own, so the sculpting is fully visible and audible with no
  camera.
- **Pointer/mouse fallback**: move the mouse over the field = one hand;
  click-drag = pinch-grab the nearest voice and fling it.
- Audio always sounds regardless of input.

## References
- **Object-based / scene-based spatial audio** — treating each voice as a
  positioned object the listener (or here, the conductor) can pull forward,
  rather than a fixed stereo mix.
- **Janet Cardiff, _The Forty Part Motet_ (2001)** — a 40-speaker installation
  of Thomas Tallis' _Spem in Alium_ that lets you walk among the singers; the
  spatialized-choir lineage this piece inverts (here you stay still and move the
  voices instead).

## Tags
- **INPUT**: hand-tracking-camera (MediaPipe HandLandmarker, two hands)
- **OUTPUT**: raw-WebGL2 (additive glow point-sprites, hand-rolled perspective)
- **TECHNIQUE**: HRTF binaural spatial sculpting + two-hand gestural conducting
- **PALETTE / VIBE**: installation / sacred-ambient — cool violet bed warming to
  gold under the conductor's focus, on near-black.

## Ambition criteria hit
- A genuinely new interaction: a *fixed* source field + *fixed* listener
  conducted by hands — distinct from `677-presence-field` (voices on joints).
- Real HRTF binaural audio you can hear move when you relocate a voice.
- Persistent re-sculpting: flung voices keep their new homes.
- Self-contained, zero new deps, raw WebGL2, full unmount cleanup, and a fully
  demoable no-camera path (auto-demo + mouse).

## Honest weaknesses
- HRTF quality is browser/headphone dependent; on laptop speakers the binaural
  cues mostly collapse to L/R + level, so headphones are strongly recommended.
- The "vowel" timbre is a formant approximation, not a true source-filter vocal
  model — it reads as "choral pad," not literal sung syllables.
- 18 simultaneous HRTF panners + per-frame `setTargetAtTime` is moderately
  heavy; on weak GPUs/CPUs the rAF rate may dip. There is no ping-pong feedback
  trail yet (left as an optional deepening).
- Depth perception in the visual relies on point-size scaling only; without
  occlusion or a floor grid the front/back ordering can be ambiguous.

## Next-cycle deepening
- Add the optional ping-pong feedback texture for luminous voice trails so a
  relocated voice leaves a visible comet path as it flies to its new home.
- A subtle floor/horizon grid + depth fog to make the room's geometry legible.
- Per-section vowel morphing (ah→oo→ee) driven by hand height, and a true
  "cadence" gesture (both hands sweep down) that resolves the whole field onto a
  consonant final chord.
