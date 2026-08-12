# 10664 · test•field

## The one question
What if you could physically drag a scan-head across a wall of pure data and
HEAR its bit-structure — a hyper-precise, dissociative datamatics field where
the threshold between signal and perception dissolves?

## How it works
- **The field.** A seeded generative source (vertical barcode column-bands, a
  handful of hot horizontal data lines, and a deterministic block-noise) is
  **Floyd–Steinberg error-diffusion dithered** down to a pure 1-bit matrix of
  **128 × 64** cells (`field.ts`). It reads as *data*, not TV static. Base seed
  `0x10664`; **Regenerate** reseeds deterministically (`seed = 0x10664 XOR
  counter·golden`). No `Math.random`, no clock — the seeded field is the whole
  source. `performance.now()` is used only for animation timing.
- **The renderer is pure SVG-DOM.** Lit bits become white `<rect>`s
  (run-length-merged, built once per field), plus one translucent **red** scan
  column and a pooled set of hot red cells for the bits currently under the
  head. No `<canvas>`, no WebGL, no WebGPU.
- **The instrument is pointer-drag.** Drag the red column across the wall. Each
  time it crosses into a new integer column it reads that column's lit bits and
  sonifies them: **bit row → log-spaced sine partial** (~120 Hz at the bottom to
  ~8 kHz at the top, sampled to a max of 7 to stay sparse) plus a short
  **filtered-noise click** on the leading edge. Sine-and-click, crisp and
  minimal — never a wall of sound.
- **Self-performing.** Release the pointer (or never touch it) and an
  **auto-scan** sweeps left→right on an ~8 s loop, so the muted / no-input state
  still performs within a second, badged `auto — drag to scan`.
- **Bit-depth (1 / 2 / 4).** Coarsens the source into square blocks *before*
  dithering, so 1-bit reads chunky/barcode and 4-bit reads as fine grain —
  Ikeda's variable bit-depth.

## Palette
Ikeda 1-bit inside the art layer only: pure black ground, white bits, a single
red accent (the scan column + hot cells). All chrome uses the Resonance
semantic tokens.

## Flicker safety
The "fast data" is expressed **spatially** — a dense static grid plus a smoothly
moving column. Individual cells never strobe and there is **no full-frame
luminance flash** at any rate. This deliberately departs from Ikeda's real
fast-flashing full-frame technique.

## Controls
- **Start audio** — creates the AudioContext (inside the gesture) and routes
  everything through the shared safe master.
- **Drag** on the field — move the scan column, read bits as sound.
- **Regenerate** — deterministically reseed a new field.
- **Bit-depth 1 / 2 / 4** — coarsen or refine the grain.
- **Read the design notes** — in-page modal.

## Reference
Ryoji Ikeda — *test pattern* (2008–) and *datamatics* (2006–), most recently
*data.gram* (2026): arbitrary data converted to 1-bit barcode/binary fields at
variable bit-depth, sonified as sine-and-click at the threshold of human
perception.

## Next-cycle deepening
Let the visitor *drop in their own data* — hash an uploaded file or typed string
into the seed and dither its bytes directly into the field, so the wall they
scan is literally their own document rendered as 1-bit sound. A second
scan-head (two-finger touch) would let two columns read the same wall in
counterpoint.
