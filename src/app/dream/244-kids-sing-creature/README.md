**For**: kids (4+)

# 244 · Sing Creature

**The one question:** What if a 4-year-old could *sing* to grow and shape a glowing 3D creature that sings their melody back?

A single luminous blob-creature floats in a soft bedtime sky. The child hums or sings into the microphone and the creature breathes, swells, changes color, and — after a moment of quiet — sings their little tune right back. No reading, no words, no wrong notes: voice is the only instrument.

## The voice → creature mapping

- **Pitch → color + note.** Detected pitch is snapped to the nearest note of the **C-major pentatonic** scale (C3…C5), so anything the child sings "sounds right." That snapped pitch sets the creature's **hue**: low notes glow deep violet, high notes climb toward cyan and rose.
- **Loudness (RMS) → size + surface.** The louder the singing, the more the creature inflates and the bigger its rippling per-vertex displacement. Quiet, and it settles back into a gentle idle breath.
- **Sustained singing → growth.** Keep singing and the creature visibly *grows* over a few seconds — a well-fed creature — with a continuous soft wobble/jiggle.
- **Live "in-tune" voice.** While the child sings, a soft sine synth tracks the snapped pitch so they hear themselves perfectly in tune (soft attack/release, no clicks, never harsh).
- **Call-and-response.** The last ~7 snapped notes are remembered. After ~2.5 s of silence, the creature **sings the melody back** as a glowing pulse sequence — each played-back note pulses the creature and its halo. Simple ear-training through play.

## Subsystems (the ambition floor — three integrated systems)

1. **Microphone autocorrelation pitch detection.** `getFloatTimeDomainData` from a `MediaStreamSource` → an autocorrelation pitch tracker with parabolic peak interpolation and an RMS gate, clamped to a child's vocal range. The mic feeds an `AnalyserNode` only — it is never recorded, routed to the speakers, or transmitted.
2. **three.js displaced-geometry creature.** A high-resolution icosphere whose vertices are pushed along their normals by layered 3D simplex noise in a custom GLSL `ShaderMaterial`. Loudness drives the displacement amplitude, growth scales the whole body, and a fresnel rim + an additive back-side halo give it a glowing-jelly bedtime look.
3. **Melody record → playback synth (Web Audio).** A ring of recent snapped notes is played back through soft dual-oscillator voices with gain ramps, while an autonomous ambient C/G drone pad (with a slow filter LFO) keeps the scene alive and audible from the first frame.

## Kid-safety & graceful degradation

- **Never silent, never dead:** an ambient pad and an idle breathing animation are alive immediately (audio after the Start gesture, per autoplay rules).
- **No wrong notes** (pentatonic snap), no sudden loud transients, soft attack/release on every note via `setTargetAtTime`.
- **No mic? Still playable.** If permission is denied or unavailable, a rose-colored note appears and a big "tap and hold" circle feeds the creature pentatonic notes instead — it is never broken.
- **No WebGL?** A readable notice shows; audio still works.
- Large tap targets, no reading required to play.

## Named references

- **Toca Boca / Sago Mini** — calm, open-ended, no-fail kids play.
- **"Singing Tesla" / voice-driven-blob lineage** — voice as a direct sculptor of a living glowing form.
- **Reggio-Emilia + embodied music cognition** — the voice as a child's first instrument; learning pitch and melody through the body and play rather than instruction.

## Notes

- First Resonance kids piece driven by **voice pitch into a 3D morphing creature** (prior kids pieces are touch on a 2D canvas; one used voice→2D paint, none voice→3D).
- Self-contained in this folder. Web Audio API + `three` only; no extra deps, no network, no persistence.
