# 9416 · Form Canon

**The one question:** *What if you could PLAY the taxonomy of visionary geometry — steer a continuous morph between the four Klüver "form constants" (tunnel ↔ spoke ↔ spiral ↔ honeycomb) and hear each geometry sing its own generative voice?*

Every prior piece in this lab rendered **one** form constant reacting to sound. Form Canon makes the whole four-constant taxonomy a **navigable, playable 2D instrument**.

## How it works

### The geometry space
Klüver's four form constants sit at the corners of one continuous unit square:

```
spiral (0,1) ───────── honeycomb (1,1)
     │                       │
tunnel (0,0) ───────── spoke (1,0)
```

A cursor lives in `[0,1]²`. Its **bilinear weights** over the four corners are a partition of unity, so the rendered field is a weighted blend of the four form-constant fields and the blend stays in `[0,1]`. Move the cursor and the geometry morphs continuously between constants.

- **WASD / arrow keys** steer the cursor.
- **Number keys 1–4** jump straight to a corner (pure tunnel / spoke / spiral / honeycomb).
- **Any letter key** triggers a note across the currently active voices.
- **Web MIDI** is optional (note-on → triggered note); the keyboard is the guaranteed path.

### The render
All four fields come from the shared engine `_shared/visionary/logpolar.ts`. The retina→V1 cortical map is a complex logarithm, so plane-wave stripes in **cortical** space become, under the inverse `exp()` warp:

- `tunnel` — vary with `log r` → concentric rings/funnels (`phi = 0`)
- `spoke` — vary with `theta` → radial rays (`phi = π/2`)
- `spiral` — diagonal → spirals (`phi = π/4`)
- `honeycomb` — a hexagonal Turing lattice → honeycomb

The **primary** path is a WebGPU fragment shader (`gpu.ts`) with the log-polar transform and the four field functions **ported to WGSL** from the TS source. The **fallback** (`cpu.ts`) computes the identical field per-pixel on a small Canvas2D buffer via the TS helpers (`screenToCortex` / `formConstant` / `honeycomb`) and CSS-upscales it — never blank. Coloring is iridescent-spectral: an HSV hue that drifts with the cortical warp and the field value, each constant carrying its own base hue so the color identity shifts as you morph.

### The four voices
Each corner owns a distinct generative voice (`audio.ts`), crossfaded by the same cursor weights:

- **tunnel** — low, spacious fifths (sine + sub octave), long soft tails
- **spoke** — stark octaves (square), short and hard
- **spiral** — a rising triangle arpeggio on each trigger
- **honeycomb** — clustered FM bells

Under them sits a soft breathing pad per voice whose level is `weight × a decaying "energy"` — so the mix is note-**gated**, not a continuous drone. Triggering a note fires it in **every active voice** at an amplitude proportional to that voice's weight, so timbre crossfades as the geometry does. Everything routes into the shared safe master (high-shelf + lowpass cap + limiter) at `gain 0.18`.

### Safety
**No strobe, no flicker.** The flicker-induced geometry is evoked *without* the flicker trigger — animation is slow continuous phase drift plus a gentle luminance drift only, and `prefers-reduced-motion` slows both. This is the whole point: the entoptic forms, minus the photosensitive-epilepsy hazard.

### Determinism
Seed `mulberry32(0x9416)` for all randomness; `performance.now()` for all timing. A seeded, audio-free auto-demo drifts the cursor through the geometry space on mount, so a muted phone immediately sees the field morph between all four constants before any tap.

## References

- **Klüver, H. (1926 / 1966)** — *Mescal and Mechanisms of Hallucinations*: the original four "form constants."
- **Bressloff, Cowan, Golubitsky, Thomas & Wiener (2002)** — *What Geometric Visual Hallucinations Tell Us about the Visual Cortex*: the log-polar retino-cortical map that turns cortical plane waves into these shapes.
- **bioRxiv 2026.02.18.705710** — *A Large-Scale Computer-Vision Mapping of the Geometric Structures of Stroboscopically-Induced Visual Hallucinations*: empirically CV-maps thousands of flicker-induced entoptic geometries into exactly these four constants.

## Tags

input=keyboard (+ optional Web MIDI) · output=WebGPU-render fragment shader (Canvas2D fallback) · technique=log-polar form-constant taxonomy navigation · palette=iridescent-spectral · state=visionary-geometry · pole=intense↔cosmic
