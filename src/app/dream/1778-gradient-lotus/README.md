# 1778 — Gradient Lotus

A warm, breathing, audio-reactive psilocybin/LSD mandala — rendered with **no
canvas and no WebGL at all**.

## The one question

> Can a genuinely psychedelic, audio-reactive mandala be rendered using **only
> the browser's CSS compositor** — layered animated conic/radial gradients,
> blend modes and masks — driven by CSS custom properties written from a
> Web-Audio FFT each frame?

## The thesis: the CSS compositor as a third render substrate

Almost every psychedelic piece in this lab is a **GPU fragment shader** or a
**Canvas2D draw loop** — both are heavily over-represented, and one is
jury-banned. This piece deliberately uses neither. There is no `<canvas>`, no
WebGL/WebGPU, no three.js anywhere on the page. The entire visual is produced by
the part of the browser that composites and paints boxes: stacked `<div>`s whose
backgrounds are gradients, fused with blend modes, clipped with masks, and
animated purely by mutating a handful of CSS custom properties from JS.

The constraint **is** the concept. Proving a third substrate is the point.

## The technique

The visual is a stack of eight absolutely-positioned `<div>`s inside a single
"stage" wrapper (which handles breathing zoom + pointer parallax via one
`transform` and one `filter`):

1. **Base wash** — a `radial-gradient` warm amber core → violet rim. This is the
   graceful-degradation floor: it shows even if `conic-gradient` is unsupported.
2. **Petal field A** — `repeating-conic-gradient(from calc(var(--rot)*1deg) …)`.
   The repeat period is the petal count; `mix-blend-mode: screen`; a radial
   `mask-image` feathers it into a soft aperture.
3. **Kaleidoscope mirror** — field A again with `transform: scaleX(-1)` for
   bilateral symmetry.
4. **Petal field B** — counter-rotating on `--rot2`, magenta→violet, blended
   `overlay`. Near-but-not-equal petal periods against A beat out **moiré /
   kaleidoscope interference**.
5. **Petal field C** — a fine golden shimmer on `--rot3`, `screen`.
6. **Iridescence** — a slow full-ramp `conic-gradient` under `soft-light`,
   nudged by `hue-rotate(var(--hue))` (kept inside a warm ±35° arc) for
   interference-band colour drift.
7. **Central bloom** — a `radial-gradient` warm core whose radius and intensity
   ride `--bloom`, blended `screen`. Its peak lightness is pinned at 80% — never
   pure white — as a flash-safety clamp.
8. **Vignette / aperture** — a dark `radial-gradient` rim that holds the lotus in
   a circle and caps edge brightness.

A **single `requestAnimationFrame` loop** is the only moving part. It never
touches the DOM tree — it only calls `el.style.setProperty('--x', …)` on the
root. `@property`/`registerProperty` is not required; plain custom properties
cascade to every layer and re-paint for free.

## How audio maps to the CSS props

A self-playing **warm generative bed** (Web Audio, no mic needed) runs from the
first `Begin`: a lydian pad of detuned triangle/saw partials under a slow
lowpass LFO and a code-generated void reverb, with a generative voice plucking
soft A-major-pentatonic bells that drift the harmony. An `AnalyserNode` taps the
master bus; each frame the FFT is reduced to six log-spaced perceptual bands
(smoothed) and written straight into custom properties:

| Audio → | CSS custom property | Visual effect |
| --- | --- | --- |
| band 1 (low-mid) | `--band1` | opacity/alpha of petal field A |
| band 2 (mid) | `--band2` | opacity/alpha of petal field B |
| band 4 (upper) | `--band4` | opacity/alpha of the fine shimmer C |
| overall energy | `--open` | petal count/intricacy, breathing scale, saturation |
| overall energy | `--bloom` | central bloom radius + intensity |
| overall energy | `--hue`, `--sat` | iridescent colour drift, saturation |

Louder/brighter audio **opens** the mandala (finer petals, bigger bloom, deeper
saturation); quiet lets it **close and dim**. Rotation is continuous and
independent of audio, so the piece is always alive. You can also **drop an audio
file** onto the page: it decodes, loops through the same analyser, and drives
the mandala instead of the bed.

## Safety

No strobe. Rotation is slow (~60 s/revolution), breathing is ~0.13 Hz, and no
luminance change approaches the photosensitive danger band. Peak layer
brightness is clamped below white. `prefers-reduced-motion` slows every rotation
to ~16% and damps the breathing depth.

## Next-cycle deepening

1. **`@property`-typed customs + CSS `@keyframes`** — register `--rot` etc. as
   `<angle>`/`<number>` so the compositor can interpolate them on its own
   thread, and move the base rotation into a pure CSS animation, leaving JS to
   write only the audio-driven props. Should cut JS work to near zero.
2. **Recursive Droste aperture** — nest a scaled, mask-clipped copy of the whole
   stage inside its own centre for infinite self-similar zoom, still 100% CSS.
3. **Per-band petal layers** — give each of the six bands its own conic layer at
   its own period/hue so the mandala visibly "spectral-analyses" the sound, with
   `background-blend-mode` stacking multiple gradients inside one layer to keep
   the div count flat.
