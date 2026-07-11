export const README = `FACE MANDALA — your face conducts a living psychedelic mandala

WHAT IT IS
A nested, counter-rotating kaleidoscopic mandala rendered as a real three.js
scene-graph (five tiers of instanced diamond "petals", not a full-screen
shader). Your own face drives it live through MediaPipe FaceLandmarker v2
blendshapes, read straight in the browser from the front camera.

YOUR FACE IS THE CONDUCTOR
• jawOpen      — the mandala BLOOMS outward: petal rings scale + the fold count
                 opens up, while the synth lowpass opens and the drone swells.
• smile        — warm gold saturation + brighter glow; higher energy.
• browInnerUp  — adds an upper petal tier + lifts the upper harmonic partials.
• brow down / frown — the mandala contracts and darkens.
• blink        — a soft, throttled pulse + a bell strike.
• mouthPucker  — tightens the kaleidoscope: fewer, sharper petals.
• head yaw / pitch / roll — tilt and rotate the whole mandala in 3D.

When your face is neutral (or no face is seen) a slow autonomous "breathing"
keeps the mandala alive and singing.

NO CAMERA? STILL SINGS
If the camera is blocked, the CDN is unreachable, or WebGL is unavailable, it
falls back to a SELF-DEMO: the same blendshape values are generated from slow
sine LFOs so the mandala keeps blooming and the synth keeps playing.

REFERENCES
• MediaPipe FaceLandmarker v2 (Google, 2024–2025) — browser-native 52-value
  face blendshapes + head-pose matrix.
• Klüver's four form constants + the Bressloff–Cowan cortical (log-polar) map —
  why psychedelic geometry is radial + rotational symmetry.
• Psilocybin affect-coupling — patterns shift with emotional state
  (Carhart-Harris entropic-brain / REBUS).

SAFETY
Master gain ramps into a compressor and is capped; voices are pooled and
stolen oldest-first. No strobe — any luminance change is a soft drift and the
reduced-motion preference is honoured.`;
