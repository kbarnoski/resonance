# 1226 · Loom

**The one question:** What if you could pluck a physical membrane and HEAR ITS
SHAPE — the vibrating surface itself is the waveform you're listening to?

`INPUT: pointer-pluck + keyboard · OUTPUT: three.js-3D deforming ring · VOICE: scanned-synthesis wavetable · PALETTE: teal→magenta jewel · TECHNIQUE: 1D circular mass-spring + scanned wavetable`

## Reference

Bill Verplank, Max Mathews & Robert Shaw, **"Scanned Synthesis,"** Proceedings
of the International Computer Music Conference (ICMC), 2000. Scanned synthesis
couples a slow, hand-scale dynamical system (here a plucked elastic string bent
into a closed loop) to an audio oscillator that repeatedly *scans* the system's
current shape as a single-cycle waveform.

## How it works

A closed ring of **N = 128 masses** is simulated as a 1D circular mass-spring
string (`ring.ts`): each mass is coupled to its two loop neighbours by springs
(a discrete Laplacian, so waves travel around the loop), pulled weakly back
toward rest by a centering force, and damped so plucks ring out over a couple of
seconds. It is integrated with semi-implicit (symplectic) Euler at the **slow
haptic rate** — a handful of sub-steps every animation frame — so the wave
visibly sloshes around the ring over seconds, *not* at audio rate. The
instantaneous array of 128 displacements **is** a single-cycle wavetable. An
`AudioWorkletProcessor` (`worklet-src.ts`, loaded via a Blob URL) holds that live
table and gives each voice a phase accumulator that scans around the loop at the
note's pitch frequency (phase 0..1 → linearly interpolated lookup). Because the
main thread pushes the live shape to the processor every frame, the timbre morphs
continuously as the ring wobbles. A **pluck** (pointer press/drag on the ring, or
the `a s d f g h j k` keys / on-screen buttons in D Dorian) injects a gaussian
bump of displacement + velocity into nearby masses and triggers a voice — so the
same gesture changes both what you see and what you hear. The ring is drawn in 3D
(`renderer.ts`) as a glowing teal→magenta loop with a gold scan cursor orbiting
the read position and gold flares at pluck points, gently auto-rotating. On mount
it already breathes with a soft standing wave; after **Begin** it auto-plucks a
soft note when you're idle, so it plays itself.

Master chain: per-voice envelope (in the worklet) → master GainNode (ramped up
from 0) → DynamicsCompressor limiter → destination. Audio only starts after the
gesture-gated **Begin** button calls `audioCtx.resume()`.

## Edges / what's approximate

- **The visible scan cursor is a slowed representation.** The real read head
  sweeps the loop at the note's pitch (hundreds of Hz) — invisibly fast — so the
  gold dot orbits at a fixed slow rate purely to *show* that scanning happens.
- **Pointer-to-loop mapping ignores the 3D auto-rotation.** A pluck lands at the
  loop index under the screen-space angle from the ring's centre; because the
  group slowly rotates in 3D, the excited point can sit a little off from exactly
  under the cursor. The gesture still reads clearly as "plucking the ring."
- **The AudioWorklet fallback is additive, not identical.** With no
  `AudioWorklet`, each note is resynthesised from a live 16-harmonic DFT of the
  ring shape driving an oscillator bank. It captures the morphing timbre but is
  band-limited to 16 partials and is monophonic-ish (max 4 banks), so it sounds
  softer and less bright than the true scanning path. It degrades silently.
- **Physical constants are tuned for looks/feel, not calibrated** to any real
  membrane material; stiffness, centering and damping were chosen so the wave
  sloshes over ~seconds and plucks ring for ~2.5 s.
- **The ring is the membrane's rim, not a full 2D membrane.** Scanned synthesis
  as described uses a 1D scanned path; displacement is shown radially (plus a
  small out-of-plane bulge) rather than as a filled drumhead.
- **Bounded polyphony (12 worklet voices) with voice-steal:** heavy plucking
  steals the quietest voice, which can clip a still-ringing tail.
