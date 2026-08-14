# Morning digest — last updated 2026-08-14 UTC (cycle 1131)

**WIDE cycle — three unrelated directions raced, and the winner is the strangest thing the lab has built in a while: a picture that isn't moving, but your eyes insist it is.** I aimed one lane straight at the "neuroscience of perception" mandate and it paid off.

## New since yesterday
- **[11792-snakevoid](https://getresonance.vercel.app/dream/11792-snakevoid)** — *a full-screen field of light that is NOT actually moving, yet your visual system swears it's rotating and breathing — and the illusion's speed answers to the sound.*
  - **Why open this:** it's the peripheral-drift illusion (Kitaoka's *Rotating Snakes*) made audio-reactive. Concentric rings of an asymmetric light→dark sawtooth trip your low-level motion detectors into seeing continuous rotation from static pixels — fixate one ring and it stalls, glance away and it turns. A self-driving drone's real spectrum modulates the ring contrast and a sub-threshold drift, so the rotation speeds, slows and reverses with what you hear. **It works muted on your phone** — the rings breathe within ~1s with no sound. This is the rare piece whose whole effect is *present on a static screen*, which is exactly why it won a muted-review cycle.
  - **Strobe-safety is built in, not bolted on:** the illusion is static — no flashing — so it carries all its motion with near-zero real luminance change. The one gentle real "breath" is capped at ≤3 Hz through the shared safe-flicker engine; reduced-motion freezes it.

## Also explored (banked, not shipped — see IDEAS §1131)
Two other directions, both built clean, folders removed, ready to resurrect:
- **11808-stillpoint** ⭐⭐⭐ — an audio-FIRST meditative void: your own Path piano granular-stretched into a boundless drone, orbited in HRTF around your head, under an isochronic breath, behind a near-blank breathing disc. It lost *only* because its value is **heard on headphones** — which a muted 06:30 phone can't judge. **This is the piece for the "sound-on review slot" you keep asking about** — say the word and I ship it verbatim.
- **11824-honeyveil** ⭐⭐⭐ — tilt your phone to fall through a boundless **hyperbolic honeycomb** (Klüver's form-constant) in real three.js 3-D geometry, each cell ringing an inharmonic bell. Real GPU-3-D (the jury's ask); lost as another "fall down a tunnel" shape near recent camp + an unverifiable-headless warp.

## Research worth a look
- The peripheral-drift illusion (Kitaoka; Faubert & Herbert 1999) is a **strobe-safe** way to make light appear to move with zero flicker — it fed tonight's winner. Separately: **SIGGRAPH Real-Time Live! 2026** + Ghost Arcade now run **WebGPU compute→compositor zero-copy** — live tooling, a nudge to reclaim the lab's WebGPU-compute line on a real-device slot.

## Open questions for you
- **snakevoid on a real screen:** does the rotation actually read on your phone, and does the sound-driven speed change land? My review is eyeless.
- **The sound-on / real-device review slot is overdue** (stillpoint + honeyveil + a stack of banked GPU pieces all need it). One designated slot unlocks the whole line.
- **Standing (40+ cycles):** the AI-pipeline chain (music→image→video) still needs a `FAL_KEY` budget — build it or strike it?
