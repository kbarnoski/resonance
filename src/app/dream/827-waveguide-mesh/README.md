# 827 · Waveguide Mesh

**What if a chord weren't synthesized but physically *travelled*?**

You strike a point on a 2-D vibrating drumhead. The energy spreads outward,
reflects off the rim, interferes with itself, and rings as a real drum/plate
tone — and you watch the wavefronts ripple across the surface in exact sync with
what you hear. There is no oscillator pretending to be a drum: the membrane's own
physics *is* the timbre.

This is a live-performance, percussive instrument — play it hard, stack chords,
let it ring.

## How to use it

1. Press **Enable sound** (audio starts on the first gesture, as browsers require).
2. Play it any of four ways — they all do the same thing, hit the membrane:
   - **MIDI keyboard** — plug one in. Note-on velocity sets how hard the head is
     struck; pitch sets the membrane tension (and where on the head it's hit).
     The status line shows **"MIDI keyboard connected ✓"**.
   - **On-screen pads** — two rows (lower "toms", higher "plates"). Tap two or
     more together for a **chord** — the mesh sums the strikes. Always available,
     no device needed.
   - **The membrane itself** — tap directly on the drumhead to strike at that exact
     point. Vertical position = octave, left↔right = pitch.
   - **Computer keyboard** — the `A S D F G H J K …` row plays one octave.

If there's no MIDI device, the status line says so in amber and points you at the
pads — nothing breaks. On load the head idles with gentle auto-strikes so it's
never a dead canvas.

## The technique

### 2-D digital waveguide mesh / FDTD wave-equation membrane

The core is a real **finite-difference solution of the 2-D wave equation** on a
grid of nodes (a digital waveguide mesh). Every node holds a displacement, and
each step advances the whole grid with the standard FDTD update:

```
u_next = (2·u_cur − u_prev + C²·∇²u_cur) · damping
∇²u = u(x−1,y) + u(x+1,y) + u(x,y−1) + u(x,y+1) − 4·u(x,y)
```

with **fixed (clamped) boundaries** — the rigid rim of a drumhead off which waves
reflect. `C` is the Courant/wave-speed coefficient, kept inside the 2-D CFL
stability bound `C ≤ 1/√2 ≈ 0.707`.

A **strike** injects a localized Gaussian bump of energy into `u` (with a touch of
outward velocity so it bursts open). That energy then physically propagates,
bounces off the four edges, and sets up the membrane's natural modal pattern.

### From membrane to sound

The primary engine runs this mesh **at the audio sample rate inside an
AudioWorklet** (`worklet-source.ts`, loaded from a Blob URL so the prototype stays
self-contained). The audio signal is simply the **displacement read at fixed
pickup nodes** every sample — the membrane's own ringing, DC-blocked and softly
saturated. The worklet posts a downsampled snapshot of the displacement field to
the main thread ~45×/second, and the canvas paints *that exact field*, so the
ripples you see are the waveform you hear.

If `AudioWorklet` is unavailable, an honest fallback kicks in: a **matched bank of
modal resonators** — damped sine partials at the membrane's eigenfrequency ratios
(the circular-membrane mode series 1.00, 1.59, 2.14, 2.30, 2.65, …) excited per
strike — paired with a **main-thread control-rate FDTD mesh** that drives the same
visual field callback. Audio and visuals stay coupled either way.

Master chain: `master gain → lowpass (≤12 kHz safety) → DynamicsCompressor →
destination`.

## Pitch / harmony

Pitch comes straight from the **full chromatic scale** (MIDI note → tension), not a
C-major pentatonic. A higher note tightens the head → faster waves → higher modal
frequencies, and rings a little shorter so fast chordal playing stays articulate.
Position is also pitch-mapped (low notes nearer the rim, high notes nearer centre)
so different pitches excite different modes. Chords are just multiple simultaneous
strikes summed into the same membrane.

## Named references

- **Scott A. Van Duyne & Julius O. Smith III — "Physical Modeling with the 2-D
  Digital Waveguide Mesh."** *Proceedings of the International Computer Music
  Conference (ICMC), 1993.* The 2-D mesh membrane model this simulation
  implements.
- Perry R. Cook — modal / banded-waveguide percussion synthesis (STK), the basis
  of the matched modal-resonator fallback.

## Files

- `page.tsx` — UI, Web MIDI, on-screen pads, pointer/keyboard strikes, render loop.
- `worklet-source.ts` — audio-rate 2-D FDTD membrane (AudioWorklet processor).
- `audio.ts` — AudioContext / master chain / worklet management + modal fallback.
- `mesh.ts` — grid constants and MIDI → tension/damping/frequency mapping.
- `render.ts` — Canvas2D displacement-field renderer (coppery-violet heatmap).
