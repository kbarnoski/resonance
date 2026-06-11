**For**: kids (4+)

A glowing firebird creature of light forms around your hand and sings when you open your fingers.

## How It Works

MediaPipe Hands detects 21 skeletal landmarks on the child's hand via webcam. A WebGL2 GPU particle system of ~2000 additively-blended points is attracted to those landmarks, leaving warm orange-yellow comet trails as the hand moves. Opening the hand blooms the creature wide and triggers pentatonic singing via Web Audio oscillators; closing gathers it into a quiet ember. Hand height maps to pitch; finger spread maps to scatter width and harmonic brightness.

Audio architecture: all sound routes through a DynamicsCompressor brick-wall limiter (threshold −6 dBFS, ratio 20:1) into a 8 kHz lowpass filter before the destination. An always-on ambient pad of detuned sine oscillators ensures it is never silent. All parameter changes use `setTargetAtTime` for smooth, safe envelopes.

A scripted virtual hand (8-second loop: fist → open bloom → close → flutter) drives the firebird automatically on load — no camera permission required. After 3.5 s of hand absence the prototype reverts to the virtual demo.

## References

- MediaPipe Hands: Zhang et al., "MediaPipe Hands: On-device Real-time Hand Tracking," arXiv 2006.10214
- Luminous particle creature lineage: thatgamecompany *Journey* (cloth-light creatures, 2012); Memo Akten, particle field works
- Web Audio API for real-time synthesis

## Tags

INPUT=hand-tracking (MediaPipe Hands, 21 landmarks) · OUTPUT=WebGL2 shader / GPU particles · TECHNIQUE=hand-landmark gesture-rig → particle field + synth · VIBE=joyful embodied wonder

## Unverified Surface

MediaPipe CDN bundle loaded from jsdelivr — bundle exports may vary by version; the loader falls back gracefully if `HandLandmarker` is not found. WebGL2 availability varies on older iOS devices.
