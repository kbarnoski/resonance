# Comma Veil

**Route:** `/dream/1952-comma-veil`

Comma Veil asks one question: what if a DMT-breakthrough form-constant mandala — the geometric hallucination of a psychedelic peak — were rendered with ZERO canvas, purely in the CSS compositor, and PLAYED like an instrument, so that the harmony you play warps the impossible geometry in real time?

The render substrate is the browser's CSS compositor and nothing else. There is no canvas, no WebGL, no SVG. The mandala is a stack of animated `<div>`s built from `repeating-conic-gradient`, `repeating-radial-gradient` and `radial-gradient`, fused with `mix-blend-mode` (screen / overlay / soft-light), feathered with `mask-image`, and kaleidoscope-mirrored with CSS transforms. Every layer is driven by CSS custom properties — `--hue`, `--warp`, `--axes`, `--spin`, `--tension`, `--scale`, `--bloom` — that JS rewrites each frame. What you see is the compositor resolving harmony into geometry.

Harmony drives geometry through one source of truth. The synth uses just intonation (base drone ~58 Hz; each note a JI ratio above the tonic), so held intervals genuinely beat and resolve. From the notes actually sounding we compute a live tension scalar using the Plomp–Levelt roughness model over every sounding pair of partials. Consonance (octaves, fifths, thirds) LOCKS the field into a still, symmetric, warm-gold form-constant. Dissonance (tritone, major seventh) SHEARS it: the kaleidoscope grows more mirror axes than physical space allows, the spin quickens, and the palette slides toward cold oil-slick thin-film teal / magenta / gold. Register (pitch height) drives how deep into the tunnel you fall; velocity and voice-count drive brightness and bloom.

Play it three ways. A MIDI keyboard (Web MIDI API) is the primary instrument. With no hardware, the computer keyboard maps to the JI scale over ~2 octaves: `a s d f g h j k l` are the ascending degrees, `w e t y u o p` fill the in-between degrees. And after ~6 s of silence a seeded, fully deterministic ghost player takes over — a slow progression that builds tension, resolves, and breathes — so the piece self-demos with zero input and is never a dead screen. Any key or MIDI note pauses the ghost.

## Subsystems

1. **Input engine** — Web MIDI note-on/off, a QWERTY-to-JI keymap fallback, and a seeded deterministic ghost player (mulberry32, fixed seed; time advanced by `performance.now()` deltas).
2. **JI harmony / consonance-tension engine** (`harmony.ts`) — exact just-intonation ratios and a Plomp–Levelt sensory-roughness model that turns the sounding chord into a single 0..1 tension scalar plus register.
3. **Web Audio additive synth** (`audio.ts`) — per-note triangle+sine through a gentle lowpass, a shared JI drone bed, and a tanh `WaveShaperNode` soft-clip limiter. Master gain hard-capped at 0.17.
4. **CSS-compositor form-constant renderer** — six stacked gradient layers driven entirely by CSS custom properties.

## Safety

This is flicker-adjacent, so it never strobes. Motion is slow luminance / hue drift plus continuous transforms (spin stays under ~0.13 Hz even at peak tension); no alpha flashing above ~3 Hz — the one opacity that tracks tension is heavily smoothed and drifts over seconds. `prefers-reduced-motion` freezes the spin and warp and holds a still mandala.

## References

- Heinrich Klüver, **form constants** — the honeycomb / lattice / spiral / tunnel taxonomy of psychedelic geometry.
- QRI / Andrés Gómez Emilsson, **"The Hyperbolic Geometry of DMT Experiences"** — curvature as the felt substrate of intensity.
- Plomp–Levelt / Sethares **sensory-dissonance curve** — the roughness model behind the tension scalar.
- The lineage that treats the **CSS compositor itself as a render substrate** for generative art.

## Honest caveats

CSS gradients are not a real hyperbolic manifold — the "impossible axes" are an evocation via layered mirror symmetry, not true negative curvature. The roughness model is a coarse approximation, and heavy multi-layer blending can tax low-end GPUs, so the layer count stays modest.
