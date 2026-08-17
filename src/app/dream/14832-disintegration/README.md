# 14832 — Disintegration

A loop left to wear away. One of Karel's recordings is set looping and then
**slowly wears itself away** — a piece that is audibly, visibly *different at
minute five than at minute one*. A long-form meditation on impermanence, in the
lineage of William Basinski's *The Disintegration Loops*, where tape loops shed
a little of their oxide with every pass until only their ghost remains.

## The question

What if one of Karel's takes were left unattended to erode — the top wearing off
first, the loop losing material, the room rising from beneath — so that time
itself became the composer?

## The erosion state (the mechanism)

Everything is governed by a single evolving state **`e ∈ [0,1]`**. It is *real
memory*: it climbs unattended and does not reset each frame.

- `e` integrates upward over a user-set **Evolve duration** (default ~4 min,
  adjustable 1–16 min via a slider — after the "Evolve" auto-degradation knob in
  *False Memory*, All the Machines, 2026). Rate = `1 / evolveSeconds` per second.
- **Press and hold on the frame to abrade** — while held, the wear rate is
  multiplied (~3.5×) and grain blooms locally where you touch. **Restore · begin
  again** sets `e = 0` and clears the emulsion for a fresh loop.

As `e` rises, the looping `AudioBufferSourceNode` is progressively degraded
through a Web Audio chain:

| Facet | Node | e = 0 → e = 1 |
| --- | --- | --- |
| Top wears off first | `BiquadFilter` lowpass | ~16 kHz → ~800 Hz (exponential) |
| Loses material | `GainNode` thinning | irregular sag deepens (dropouts) |
| Wow & flutter | `src.detune` (driven per-frame, no oscillator) | 0 → ~±58 cents wobble |
| Room surfaces | `ConvolverNode` + wet `GainNode` | wet 0.04 → 0.54 |
| Room-tone floor | noise buffer → `bandpass` → `GainNode` | hiss 0.001 → 0.03 |

The wow/flutter is written onto `src.detune` from the render loop rather than an
LFO, so the piece uses **no oscillators** — all audible music is Karel's real
take, and noise appears only as a reverb impulse response and a very-low hiss
bed, never as a musical voice. The whole graph routes into one
`createSafeMaster(ctx)` via `safe.input`; visuals read `safe.analyser`.

## The WebGL2 feedback-emulsion technique

The image is a decaying silver-gelatin emulsion drawn with a **raw WebGL2
ping-pong feedback texture** — two RGBA8 framebuffers swapped every frame. Each
frame runs two passes over a fullscreen triangle (generated from `gl_VertexID`,
no vertex buffer):

1. **Update pass** samples the *previous* frame's texture through a slow
   wow/flutter warp offset (widening with `e`), re-injects a faint latent image
   (an indistinct standing form inside a filmstrip frame with sprocket holes),
   fades the whole frame toward black (decay grows with `e`), then layers
   **accumulating silver grain** and **silver flecks that bloom and die** (the
   feedback fade kills them). Grain and decay are driven by the analyser (RMS +
   spectral tilt) and by `e`. Renders into the write texture.
2. **Present pass** tone-maps the write texture to **achromatic silver-gelatin**
   — neutral grayscale only, black / silver / bone-white, a vignette, film-base
   fog, and faint wear striations that deepen with `e`. Then the read/write
   textures swap.

So the picture literally degrades over time: grain builds, the frame thins,
flecks bloom and vanish. **Photosensitive safety is absolute** — luminance
evolves slowly and the grain is per-pixel *spatial* noise, never a full-frame
strobe or flicker.

## Degrade gracefully

No WebGL2 → a clear notice, no crash. Audio failure is caught and surfaced ("the
frame decays, but silent") — the visual keeps eroding regardless.

## References

- **William Basinski — *The Disintegration Loops* (2002).** Decades-old tape
  loops digitised as their ferrite literally flaked off the tape with each pass;
  the decay *is* the composition. This piece is its digital cousin: one real
  take, worn down by an evolving erosion state instead of shedding oxide.
- **_False Memory_ (All the Machines, 2026).** Its real-time disintegration
  effect and "Evolve" knob auto-degrade a source over an adjustable span — the
  direct model for the 1–16 minute Evolve-duration control here.
