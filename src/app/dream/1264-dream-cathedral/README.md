# 1264 · Dream Cathedral

**What if Resonance were a SPACE you are INSIDE — a first-person hypnagogic dream-cathedral you WALK through and PLAY by striking its surfaces, with each strike spatialized (HRTF) to exactly where it happened?**

**Status**: demoable

A real three.js scene-graph interior — a nave of plaster pillars, arches, hanging chime-slabs and inlaid floor tiles — that you navigate in the first person and play like an instrument. It is not an object you orbit; you are inside it, and it never ends.

## How to use it

1. Press **Enter the cathedral**. This is the user gesture that starts the AudioContext. Pointer lock engages (or, if the browser blocks it, the piece falls back to **drag-to-look** and tells you so).
2. **Walk** with `WASD` / arrow keys — a slow, weightless, dream pace with gentle inertia, head-bob and idle breathing (never an FPS sprint).
3. **Look** with the mouse (or drag). A crosshair shows what you are aimed at; resonant surfaces glow faintly when hovered.
4. **Strike** by clicking (or `Space`). The surface you hit rings, blooms with teal light and throws an expanding ripple — and the tone is placed in 3D by its own HRTF panner at that surface's world position, so it arrives from where you struck.
5. Keep walking. The colonnade is an **endless treadmill** (bays recycle around you) and the low sun's azimuth crawls, so the long shadows slowly swing — minute 3 does not look like minute 1.

If WebGL is unavailable a readable notice appears instead of a blank page. `prefers-reduced-motion` damps the head-bob, sway and chime-swing.

## Named reference

Giorgio de Chirico's metaphysical-architecture paintings — empty arcaded plazas, bone plaster, cold flat light and long raking shadows — crossed with the hypnagogic "impossible rooms / endless corridors" of sleep-onset. The palette is deliberately liminal-architectural (bone/plaster white, cold fluorescent-teal ambient, long de Chirico shadows); it avoids the banned cosmic-glow-on-dark and warm-paper/parchment looks, and the renderer runs with no tone-mapping so the scene reads flat and painterly rather than game-like.

## Technique

- **First-person navigable interior**: raw three.js real geometry (pillars, capitals, arches, chime-slabs, floor tiles) with pointer-lock mouselook + WASD, inertia and head-bob. Shadow-mapped directional sun with a crawling azimuth for the metaphysical shadows.
- **HRTF spatial audio**: every strike gets its own `PannerNode` with `panningModel: 'HRTF'`, positioned at the struck surface's world coordinates; the Web Audio `AudioListener` is driven each frame from the walking camera's position + orientation. The sound is *placed*, not merely panned.
- **Physical-model struck resonators**: each strike synthesises a small **modal bank** — a few mildly-inharmonic partials (≈ 1, 2.01, 3, 4.18, 5.43, 6.79), each with its own exponential decay, excited by a filtered-noise mallet transient. An instrument you PLAY, not a readout.
- **Real modal tuning**: resonators are tuned to **just-intonation A Dorian** (A B C D E F♯ G — a real mode with real semitone steps, *not* a no-wrong-notes pentatonic). Pillars/tiles/chimes sit in different registers and neighbouring bays are a third apart, so walking the nave and striking several surfaces builds genuine modal harmony.
- **Endlessness**: bays wrap around the camera in both directions and the floor plane recentres by whole tiles, so the plaza is seamless and infinite.

## Integrated subsystems

- `_shared/psych/droneBank.ts` — the slow just-intonation drone bed (custom A-minor/Dorian chord), the cosmic-ambient pole; its `drive` spikes gently on each strike and eases back.
- `_shared/psych/convolutionVoid.ts` — the code-generated cathedral convolution reverb, used as a pure-wet send bus so strikes bloom into a long stone tail.
- `_shared/psych/safeFlicker.ts` — `prefersReducedMotion()` for the motion-safety gate. There is no fast luminance flicker at all; all change is slow drift, well under the 3 Hz ceiling.

## Next-cycle deepening

Give the architecture memory: let each struck resonator leave a faintly-ringing "sympathetic" ghost that the reverb keeps alive, and let the room slowly re-tune itself around the notes you play most — so after a few minutes the cathedral has learned your mode and the endless corridors reconfigure into a space that answers you.
