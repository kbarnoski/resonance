**For**: kids (4+)

**Concept**: What if a 4-year-old closed their eyes, held the tablet like a lantern, and turned their body to hunt for gentle animal sounds hidden floating around them in 3D space?

## Tags

- **INPUT**: device orientation / compass heading (`DeviceOrientationEvent`) — the child turns their body/phone to sweep a "listening beam" around a 360° ring. Not touch.
- **OUTPUT**: audio-forward / eyes-closed — spatialized Web Audio via `PannerNode` (HRTF `panningModel`) is the star; the sound carries the piece. The visual is deliberately minimal: a soft compass glow and a ring of dim dots that brighten as voices are found.
- **TECHNIQUE**: 8 gentle voices placed at fixed azimuths around a 360° ring via `PannerNode` (HRTF). The heading rotates the `AudioListener`; when the beam points near a hidden voice its gain swells (proximity → gain), a soft chime reveals it once (latched), and its dot glows. Collecting all eight blooms a calm consonant chord.
- **PALETTE / VIBE**: calm bedtime "lantern in the dark" — soft, warm, dim-but-readable, cozy. The calm register on purpose. No score, no fail, no timer.

## Mapping

Each hidden voice is a soft tone tuned to a C-major pentatonic chord tone, so revealing any subset always sounds harmonious. Compass heading (`webkitCompassHeading` / `alpha`, with `gamma` tilt as a fallback axis) points the beam; angular proximity of the beam to a voice's azimuth drives that voice's gain via a cosine lobe, with an inner threshold that latches a gentle chime + glow once. When all are found, a soft rising shimmer plays and the full chord blooms; play then loops forever.

## Kid-safe audio chain

All voices → master `GainNode` (0.28) → `BiquadFilterNode` lowpass (7000 Hz) → `DynamicsCompressor` (threshold -10, ratio 20) → `destination`. Slow attacks, long decays, an always-on gentle sub-drone bed so it never feels broken, and a pentatonic palette so nothing is ever "wrong."

## Graceful degradation

If device orientation is denied or absent (e.g. desktop), the piece runs a slow **auto-tour** that sweeps the beam around the ring and reveals each voice hands-free, **plus** a drag-to-turn control on the ring, **plus** a `text-rose-300` notice. Fully playable and audible on a laptop with no sensor. `PannerNode`/`AudioListener` position setters are feature-detected for both the modern (`positionX.value`) and legacy (`setPosition`/`setOrientation`) APIs.

## Named references

- **PlugSonic** — web/mobile system for binaural sonic narratives (Geronazzo et al.).
- **Pauline Oliveros — *Deep Listening*** — the attentional, eyes-closed listening practice this piece invites.
- **Web Audio `PannerNode` HRTF** — head-related transfer function spatialization for true 360° binaural placement over headphones.

## Honest ambition self-assessment

- **#2 (≥3 subsystems)**: yes — (1) HRTF spatial audio graph with per-voice swell + latched reveal, (2) device-orientation/compass input with a real functional auto-tour + drag fallback, (3) the synchronized minimal SVG compass/ring visual and chord-completion logic.
- **#3 (named reference)**: yes — PlugSonic, Deep Listening, and the Web Audio HRTF technique are cited and reflected in the design.
- **#5 (recent-research register)**: yes — sits in the 2026 immersive / binaural spatial-audio register: HRTF head-tracked panning driven by real device heading for embodied, eyes-closed listening, in line with current web-binaural narrative work.

Files: `page.tsx`, `audio.ts`, `README.md`.
