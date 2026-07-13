# 1548 — Ink Bloom

**The one question:** What if drops of ink bloomed into concentric
**suminagashi** rings that your breath stirred and boiled — rendered natively by
the browser's **CSS compositor**?

`state: hypnagogic ink-drift / suminagashi · pole: cosmic-ambient ↔ intense`

## What it is

A microphone-driven marbling instrument. Ink is dropped onto a still black pool;
each drop blooms into a ring, and — as in real **suminagashi** (Japanese
floating-ink marbling) — every new drop pushes all the earlier rings radially
outward, so the ink settles into nested, interlocking concentric contours. Your
breath / voice loudness controls the drop rate, a "boil" that agitates the
contours into jeweled filigree, and the overall warmth. Calm = slow cosmic ink
drift; loud = boiling, gold-flecked intensity.

## The headline technique — CSS Houdini Paint API

The marbling is drawn by a **CSS Houdini Paint Worklet** — a technique this lab
has never used before. This is the real substrate, not a gimmick layer:

- A worklet class registered with `registerPaint('inkbloom', …)` whose
  `paint(ctx, size, props)` receives a **`PaintRenderingContext2D`** — a strict
  *subset* of Canvas2D that offers **only vector drawing** (paths, `fill`,
  `stroke`, `createRadialGradient`, `shadowBlur`, transforms) and **no
  per-pixel access** (`getImageData`/`putImageData` do not exist). The whole
  piece is therefore designed as **vector contour ops**, never a pixel buffer.
- The worklet is loaded at runtime from a **Blob URL** — no separate file, no
  network:
  `CSS.paintWorklet.addModule(URL.createObjectURL(new Blob([source], {type:'application/javascript'})))`.
- Paint worklets have **no animation loop of their own**; they repaint only when
  an *input custom property* changes. So eight typed, animatable properties are
  registered once with **`CSS.registerProperty`**
  (`--t`, `--energy`, `--drops`, `--boil`, `--hue`, `--px`, `--py`, `--stir`,
  each `<number>`), declared in the class's `static get inputProperties()`, and
  the element carries `background: paint(inkbloom)`. React's `requestAnimationFrame`
  loop calls `el.style.setProperty('--t', …)` every frame — and that property
  change is what drives the compositor to repaint.
- Because the worklet only receives scalars, it **reconstructs the entire ink
  field deterministically** from them each paint: a per-index `mulberry32` PRNG
  seeded from `--drops` places drops; the suminagashi transform nests them; `--t`
  drives slow drift; `--boil` agitates; `--px/--py/--stir` pull recent drops
  toward the pointer.

### The suminagashi transform (exact)

When a drop of radius `d` lands at center `C`, every prior point `P` is displaced
to `C + (P − C)·√(1 + d²/|P−C|²)` — i.e. a point at distance `r` moves to
`√(r² + d²)`. Applied in birth order over a sliding window of the most recent
drops, this is the classic non-overlap marbling map that turns isolated rings
into interlocking concentric contours.

## First-class fallback (mandatory, and real)

The render is factored into ONE pure function, `drawInk(ctx, w, h, state)`, that
uses only the vector ops available in `PaintRenderingContext2D`. The Paint
Worklet's `paint()` calls it (its exact source is `.toString()`-embedded into the
worklet blob, so the code is *literally identical*), and a `<canvas>` rAF loop
calls the same function when Houdini is missing. Feature detection:

```
const houdini = typeof CSS !== 'undefined'
  && 'paintWorklet' in CSS
  && typeof CSS.registerProperty === 'function';
```

- **Houdini present (Chromium):** the `paint(inkbloom)` element is shown, the
  canvas is hidden, and the Houdini path genuinely renders. The top-right label
  reads **"CSS Houdini Paint"**.
- **Houdini absent (Firefox / Safari / headless):** the canvas is shown and
  driven each frame with the identical `drawInk`. The label reads
  **"Canvas 2D fallback"**. Visuals are the same either way.

## Input & audio

- **Primary input = microphone.** "Begin" is the user gesture that creates the
  `AudioContext` + `getUserMedia`; an `AnalyserNode` → time-domain RMS → energy
  drives drop rate, boil, brightness and warmth. If the mic is denied or absent,
  a **seeded self-demo** envelope keeps ink blooming and audio droning — never
  blank, never silent.
- **Pointer stir (secondary):** press / drag to drop ink and pull the freshest
  contours toward the pointer (`--px/--py/--stir`); the sheet relaxes back when
  you release. Mic + idle demo work fully without it.
- **Audio (self-contained Web Audio):** a sustaining cosmic drone bed (three
  detuned oscillators through a slow-LFO lowpass) plus bell/ink-drop plinks fired
  on the exact frame a drop is dropped — the drop you *see* is the plink you
  *hear*. Master gain ramps to **0.18 (≤ 0.2)** through a `DynamicsCompressor`
  limiter; **≤ 14 concurrent voices** (≤ 5 plinks × 2 osc + 3 drone osc + 1 LFO);
  full teardown (stop oscillators, `close()` the context, cancel rAF, stop stream
  tracks) on Stop and on unmount.

## Palette & house style

Iridescent violet/indigo ink over near-black, warming to jeweled magenta with a
sparing gold filigree only at high energy. Violet (~262°) is the brand hue and
all UI chrome stays monochromatic-violet with semantic tokens.

## Safety / aperture / limits

- **No strobe.** Boil modulates contour *amplitude*, never frequency; the drone
  LFO is 0.06 Hz; hue drifts on a ~30 s cycle. All luminance change is slow drift
  (≤ 3 Hz).
- **Reduced motion:** `prefers-reduced-motion: reduce` halves a virtual clock
  that feeds every drift/boil term, slows energy smoothing, and lowers the drop
  rate.
- **Determinism:** all randomness comes from a seeded `mulberry32`; time comes
  only from `performance.now()`. No wall-clock constructors and no ambient RNG
  are used anywhere in the source.
- **Limits:** the worklet renders a sliding window of the ~22 most recent drops
  (56 vertices each) to bound cost and continually renew the sheet; because the
  worklet only sees scalars, pointer-stirred drops are expressed as an attractor
  on recent drops rather than an arbitrary drop history.

## Named references

- **Suminagashi** — Japanese floating-ink marbling; the concentric-ring
  non-overlap displacement is its defining move.
- **CSS Houdini Paint API** — and **George Francis (georgedoescode)**, whose
  generative Paint Worklet experiments are the touchstone for using
  `registerPaint` as an art substrate.
- **Memo Akten** — for the lineage of breath / energy as the continuous
  controller of a living generative field.

## Next-cycle deepening (multi-cycle commitment)

Ink Bloom is the first of a Houdini-marbling family; it shipped as cycle 755's
DEEP winner over two sibling explorers whose best ideas are the roadmap here:

- **From `1550-comb-marble` (ebru):** add a **divergence-free curl-noise flow**
  (curl of an analytic sum-of-sines potential) as a second warp layered under the
  suminagashi displacement, plus a **pointer-rake** stroke — so calm ink can be
  *combed* as well as dropped. This makes the sheet feel like a real tray.
- **From `1552-veil-marble` (thin-film):** color the contour fills with a
  **thin-film interference hue** driven by local ink "thickness" (contour density
  under a drop), so overlaps beat through the soap-bubble spectrum at high energy
  instead of only warming toward gold.
- **Cycle-2:** let Karel's real Path piano drive the drop schedule (onset → drop,
  sustain → boil) — welds the real-music directive to the Houdini substrate.
