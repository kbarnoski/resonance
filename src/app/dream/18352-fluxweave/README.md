# 18352-fluxweave — Harmonize your recording in a current of light

**The one question.** What if you could pour your own recording into a body of flowing luminous light and harmonize it with your two hands — pull your hands apart and the single piano take fans open into a chord of itself, a shimmering harmonic stack woven into the current; bring them together and it collapses back to a clear unison?

## How to use it

Play one of Karel's real piano tracks, then conduct the harmony with two hands (or watch the labelled demo drive do it autonomously).

- **Hands together → unison.** Only the dry, untouched take is audible.
- **Pull your hands apart → the chord fans open.** As the separation between your hands grows, pitch-shifted copies of the same take fade in one by one — a fifth first, then an octave, then a major third, then a fourth below — building a consonant harmonic stack layered over the original.
- **Raise both hands → the harmony swells and the current quickens.** Average hand height sets the overall level of the added voices and the energy of the flow.
- **Move faster → the light stirs and the chord shimmers.** Each hand is a vortex source that warps the flow locally (hand speed = swirl strength), and hand speed also breathes a gentle ±cents shimmer across the harmonic voices so the chord never sits still.

Press `f` for fullscreen, `i` for the in-piece info overlay.

## The technique

- **Audio — granular pitch-shift harmonizer.** The recording plays back at rate 1.0 through a dry path that is never modified: its pitch and melody stay exactly Karel's take. The harmony is *added*, not substituted — four `AudioWorklet` granular pitch-shifters read the same decoded `AudioBuffer` and transpose it (+7, +12, +4, −5 semitones). Each is a two-tap, triangular-windowed overlap-add reader over a ring buffer (~100 ms grains): the read delay ramps as a sawtooth and the window is zero exactly where the delay wraps, so the seam is silent and the shift stays glitch-free. All voices plus the dry source terminate in the shared ear-safety master bus. Hand separation drives the per-voice fan-in; hand height drives the overall voices level; hand speed LFOs a small detune shimmer. Every hand-driven parameter is smoothed with `setTargetAtTime`.
- **Visual — WebGPU curl-noise particle flow.** ~200,000 particles are advected each frame by a divergence-free velocity field, **v = curl(potential)**, where the scalar potential is 2-octave value noise in space and time. Because a curl field is incompressible by construction, the advection is unconditionally stable — the current is always smooth and never explodes, so the piece leans into density and beauty. The two hands are vortex sources that add a local rotational swirl (strength = hand speed). Particles render as luminous additive splats with gentle feedback trails; a reduced Canvas2D current is the graceful fallback when WebGPU is absent.
- **Palette — nacreous / pearlescent.** A mercury-white base where light pools dense, with a faint low-saturation interference sheen (pale gold-green-rose) only in the specular highlights. The inside of a shell, not a rainbow. UI chrome stays on Resonance violet semantic tokens.

## References

- Bridson, Hourihan & Nordenstam (2007), *Curl-Noise for Procedural Fluid Flow* (SIGGRAPH) — the divergence-free curl-of-noise advection substrate.
- WebGPU GPGPU particle patterns — compute-shader advection + instanced additive splat rendering.
- MIDIBack (arXiv:2609.28008, 2026-09-23) — harmony-aware research anchor for adding a consonant stack to a source performance rather than replacing it.

**Status**: demoable
