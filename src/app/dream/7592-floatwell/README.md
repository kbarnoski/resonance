# 7592 · Floatwell

**Route:** `/dream/7592-floatwell`

**The one question:** What if the browser's own CSS compositor — no canvas, no
WebGL, not a single pixel you draw yourself — could sink a viewer into the
featureless "mythic" void of a sensory-deprivation float tank, where the empty
field slowly resolves into archetypal forms as you descend?

## What it is

A pure **CSS / DOM** generative-art piece. The renderer is the browser's
compositor: there is **no `<canvas>`, no WebGL, no WebGPU, no SVG path-art**.
Every mark on screen is a layered radial/conic-gradient `<div>` shaped by
`filter: blur()`, `mix-blend-mode: screen`, `mask`, and slow CSS transforms. A
render loop touches nothing but a handful of CSS custom properties per frame.

You breathe the void. Tap **spacebar** (or click/tap the field) at your own
breathing rate; the system entrains and sinks you deeper.

## How it works

### The renderer (all compositor, no GPU art)

Layers, back to front (`floatwell.module.css`):

1. **Ganzfeld void** — a nearly-featureless low-contrast dark-violet radial
   field. Its luminance is the whole-field breath swell, applied smoothly via
   `filter: brightness(var(--lum))`. Never flickers — only a breath-rate drift.
2. **Tunnel-to-light** — faint receding rings (`repeating-radial-gradient`,
   masked + blurred, slowly expanding) plus a bright throat core that scales
   with depth. `mix-blend-mode: screen`. Emerges deeper into the descent.
3. **Mandala rings** — two counter-rotating `repeating-conic-gradient` +
   `repeating-radial-gradient` discs, heavily blurred so the hard geometry
   becomes soft archetypal petals. Phase in and out with depth + a slow sine.
4. **Breath aura** — a big soft radial that expands on the inhale, making the
   swell visible beyond brightness.
5. **Phosphene field** — six blurred radial-gradient blobs drifting on long,
   staggered keyframe loops. The shallow-depth baseline; recedes as the mandala
   organizes.
6. **Vignette** — bounds the void and gives the descent its depth.

### The render loop (`page.tsx`)

Refs only — no per-frame React re-render. Each frame it rewrites six CSS custom
properties on the stage element:

- `--lum` — Ganzfeld luminance: base + breath swell + slow drift + a soft tap
  bloom.
- `--depth` — the monotonic descent, 0 → 1 over minutes (full traverse ~5 min
  when breathing calmly, slower when still).
- `--mandala`, `--tunnel`, `--phos` — archetypal-form opacities that phase in at
  increasing depth thresholds.
- `--aura` — the visible breath expansion.

### Breath (the verb)

A breath phase oscillator (`0.5 − 0.5·cos φ`, 0 at exhale, 1 at inhale) drives
the swell. Each tap eases the oscillator **period** toward your inter-tap
interval (entrainment) and fires a soft, non-flicker bloom. **Slower, steadier
breathing = calmer = faster, deeper descent**; stopping lets the swell settle
and the period relax to a default 6 s auto-breath — the void stills.

### Audio (`audio.ts`)

A boundless cosmic-ambient drone, all consonant just intonation, **no melody /
no percussion**:

- Shared `droneBank` — a detuned just-chord bed (A1 · E2 · A2 · B2 · E3) whose
  lowpass slowly opens with depth.
- A single slowly-**rotating overtone** (5th harmonic, ±6-cent + amplitude LFOs)
  that emerges as you sink.
- Shared `convolutionVoid` — a 6 s code-generated convolution reverb, mostly
  wet, for a vast cistern tail.
- A breath gain node swells the whole bed in lock with your tap tempo.

Degrades gracefully: if Web Audio is unavailable the visual still runs and a
notice appears. All oscillators/LFOs stop, the drone fades, and the
`AudioContext` closes on unmount; the rAF loop is cancelled and listeners
removed.

## Named references

- **John C. Lilly** — flotation / REST (Restricted Environmental Stimulation
  Technique) tanks.
- The **Ganzfeld effect** — a featureless visual field resolving into imagery.
- "Hypnagogia, psychedelics, and sensory deprivation: the mythic structure of
  dream-like experiences" — *Frontiers in Psychology* 2025 (PMC12098477).
- "Beyond the reducing valve: computational neurophenomenology of altered
  states" — *Frontiers* 2026.

The research framing: sensory deprivation produces "mythic cognition" — the void
resolving into archetypal structure — which is exactly the arc of the descent.

## State / pole tags

`meditative-void` · `cosmic-ambient` · `NDE-tunnel-adjacent` · `pure-CSS/DOM` ·
`non-GPU` · `breath-entrained` · `long-form (3+ min evolution)` · calm,
boundless, hypnotic, **no strobe/flicker**.

## Ambition-floor criteria hit

- **Never-before-used technique in this lab:** the CSS compositor *is* the
  renderer — zero canvas/WebGL/SVG-path art. The "actually non-GPU" answer.
- **Audio-visual:** evolving drone + evolving field, both alive, no static page.
- **A real verb:** you breathe the void; tap tempo entrains the swell + drive.
- **Long-form:** a monotonic depth over minutes with forms that phase in/out.
- **Safe:** pure slow luminance drift, no flicker; `prefers-reduced-motion`
  holds the rotations/travel still while keeping the viewer-controlled breath.
- **House style:** semantic tokens for chrome, violet-only accent, full audio +
  animation cleanup on unmount.
