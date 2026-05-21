# Shader Evolve — design notes

**Route**: `/dream/71-shader-evolve`  
**Cycle**: 89 | **Status**: demoable

## What it does

Natural selection of audio-reactive WGSL shaders. Four mutated variants run in a
2×2 grid simultaneously. Click any cell to promote it to the focus view (full-res,
60fps). Click **↻ EVOLVE** to breed four new mutations from the selected variant.
**★ SAVE** adds the current selection to a persistent gallery (up to 6 slots,
stored in localStorage). Click a gallery tile to start a new evolution line from it.
**✎ EDIT** opens the raw WGSL for manual refinement.

## The mutation model

All variants descend from a shared shader template: radial rings + orthogonal grid +
HSV color cycle, driven by six audio uniforms (`uBass`, `uMid`, `uTreble`, `uOnset`,
`uTime`, `uBPM`). The template has 16 named numeric parameters:

| param | default | controls |
|---|---|---|
| `ringFreq` | 18.0 | ring spatial frequency |
| `ringSpeed` | 1.5 | ring animation speed |
| `bassRing` | 5.0 | how much bass warps the rings |
| `gridFreq` | 26.0 | grid spatial frequency |
| `midGrid` | 4.0 | mid influence on grid X |
| `treGrid` | 4.0 | treble influence on grid Y |
| `gridBright` | 0.35 | grid brightness multiplier |
| `baseBright` | 0.35 | base brightness |
| `bassRange` | 0.65 | bass brightness range |
| `gridMix` | 0.5 | grid contribution to total brightness |
| `onset` | 0.7 | onset flash strength |
| `hueMid` | 0.5 | mid contribution to hue |
| `hueTre` | 0.3 | treble contribution to hue |
| `hueDrift` | 0.03 | passive hue drift speed |
| `sat` | 0.9 | HSV saturation |
| `vig` | 0.8 | vignette strength |

Each mutation randomly selects 3–5 params and multiplies each by a random
factor in [0.4, 2.5]. The resulting shader is always syntactically valid WGSL
because only numeric literals change, never the structure. Some mutations are
visually dull (all black, all white); these are "evolutionary dead ends." The
selection pressure is the user's eye.

## GPU architecture

One `GPUDevice` shared across five canvas contexts (4 grid + 1 focus). Each
context has its own `GPURenderPipeline` (different fragment shader). All share a
single `GPUUniformBuffer` and `GPUBindGroup`. The shared uniform buffer is written
and submitted sequentially per-canvas within the same `requestAnimationFrame`:
since `device.queue` is ordered, each canvas reads the correct audio data when
its draw commands execute.

Grid canvases throttle to ~15fps to stay within GPU budget. Focus canvas runs at
full 60fps. Total pixel throughput per frame is modest: ~4 × (200×200) + (600×600)
≈ 520,000 pixels at mixed frame rates.

## Interaction loop

```
start → 4 mutations of ROOT_PARAMS
      ↓
click grid cell → promotes to focus
      ↓
↻ EVOLVE → 4 mutations of focus params → new grid
      ↓
★ SAVE → stores params to gallery (max 6)
      ↓
click gallery tile → evolve from saved ancestor
```

The gallery creates a "fossil record" of aesthetic directions that can be revived
even after many evolution rounds.

## What surprised me

The mutation space is surprisingly rich. With only 16 parameters and random
multipliers in [0.4, 2.5], the four cells immediately look meaningfully different
from each other — not subtly different, often dramatically so. `ringFreq` mutated
to 45+ creates moiré-like interference patterns. `hueDrift` near 0.3 turns the
color shift perceptible in real time. `sat` below 0.05 produces near-monochrome
shaders with their own aesthetic.

The selection UI feels natural in a way that text-prompt editing doesn't: you look
at four things at once, pick the one that "feels right," and breed from it. The
vocabulary is purely visual.

## Polish ideas

- Add a second parameter family: alternative ring shapes (spiral, concentric squares,
  Lissajous) via `if/else` blocks in the shader, selectable per variant
- Crossbreeding: select TWO cells, breed an offspring that interpolates their params
  (average + noise) rather than mutating from one parent
- Export: download the current focus shader as a `.wgsl` file
- `68-wgsl-synth` integration: "Send to WGSL Synth" opens the selected shader's code
  in the manual editor next door
- Shader family: alternative parent templates (fluid-like, particle-like, Truchet-like)
  that use the same 16-param mutation system but produce qualitatively different
  visual forms
