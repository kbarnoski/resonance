# 226 — Face Song

**For**: kids (4+)  
**Status**: demoable  
**Cycle**: 260  
**Zero permissions · zero API · zero deps**

## What it is

A glowing face made of five musical parts. Tap any part to wake it up.

| Part | Color | Sound | Animation |
|------|-------|-------|-----------|
| Head circle | Violet | C2 triangle drone (sustained) | Slow breathing pulse |
| Left eye | Teal | G3 pluck every 800ms | Blinks at ~1.3s intervals |
| Right eye | Amber | E3 pluck every 1200ms | Blinks at ~1.6s (offset) |
| Nose | Rose | A3 bounce every 600ms | Bounces to its beat |
| Mouth | Cyan | C3–G3–A3–E3–C4 melody (500ms/note) | Opens/closes while singing |

Tap a lit part again to silence it. When all five parts are singing → sparkle burst and **"La la la! ✨"** appears above the face.

## Why it works for 4-year-olds

- **No wrong state** — every tap produces immediate sound + visual
- **BANDIMAL sizing** — head (biggest) = lowest drone; eyes (small) = high plucks; nose (tiny) = mid beat. Size teaches pitch physically.
- **Polyrhythm by default** — G3 (800ms) + E3 (1200ms) + A3 (600ms) create interlocking rhythms that sound complex but are always consonant (all in C major pentatonic)
- **Part = voice** — each face feature IS a synthesizer voice. Assembling the face = building the texture. Same insight as `216-kids-band-builder` but embodied in a recognizable shape a child can point to.
- **Celebration moment** — the "all 5 on" reward gives children a clear goal and a clear sense of completion.

## Audio design

All Web Audio, zero dependencies:

- **Head**: `OscillatorNode(triangle)` at C2 (65.41 Hz), `GainNode` ramping to 0.048 over 700ms. `setTargetAtTime` fade-out on deactivation.
- **Eyes/nose**: `setInterval`-scheduled plucks: `OscillatorNode(triangle)` with `exponentialRampToValueAtTime` envelope (~0.45s decay).
- **Mouth melody**: rotating through `[C3, G3, A3, E3, C4, A3, G3, E3]` every 500ms. Staccato (note duration 400ms, interval 500ms → 100ms gap).
- **Ambient**: C2 + G2 sine pads at gain 0.009/0.006, fade in over 3s on first gesture.

## Polish ideas (future cycles)

- Auto-demo: face parts activate one by one on load so the canvas is alive before first touch
- Add eyebrows (optional 6th part?) that raise in surprise when the face celebrates
- "Sleep mode": if no tap for 15 seconds, face slowly dims and a lullaby plays; tap to wake
- Multi-face: plant a second face next to the first; when both are fully singing → they harmonize (one face in C, the other in G)
- Mic mode: child hums → mouth brightens proportionally to mic amplitude (no pitch detection needed)
