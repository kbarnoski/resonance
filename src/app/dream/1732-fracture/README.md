# 1732 · Fracture

## The one question

What if you could drop any track and hear it **fracture** into gritty,
dissonant lo-fi ruin while the image **datamoshes** into DMT-like
hyper-detail — with **bit-crush (quantization) as the headline instrument**?

Drop a file (or let the built-in carrier run), then pull the Grit slider. The
sound quantizes into rubble and the picture smears into an over-detailed
mirror-world in lockstep with the audio.

## How the grit engine works

The headline destruction is **amplitude quantization** — classic lo-fi
bitcrush — plus **sample-rate hold / decimation**, applied per sample inside a
single `ScriptProcessorNode` (buffer size 2048). It's a deprecated node, but it
is fully self-contained: no separately served AudioWorklet module, so it runs
everywhere including the headless review box.

Two things happen in `onaudioprocess`:

1. **Bit-depth quantization.** Each sample is rounded to one of `2^bits`
   evenly spaced levels across `[-1, 1]`. At max grit that's **2 bits** (four
   levels — brutal); at min grit ~**12 bits** (nearly clean).
2. **Sample-rate hold.** The last quantized value is *held* for `N` input
   samples before a new one is taken (`N` from 1 up to ~24), decimating the
   effective sample rate and adding aliased buzz.

The **Grit slider (0–1)** drives both through a smoothstep curve (fewer bits +
longer hold as it rises) and also opens a dry/wet blend (0.35 → 1.0) so the
effect stays controllable rather than instantly total.

Signal path: `source → input gain → ScriptProcessor (crush) → AnalyserNode →
DynamicsCompressor → low master gain → destination`. Master sits at ~0.12 for
the carrier and ~0.20 for a loaded file; all gain changes are ramped
(`setTargetAtTime`) so nothing clicks.

### The built-in carrier (self-demo, headless-safe)

If no file is dropped, a deterministic carrier auto-plays so the piece is never
silent. It is deliberately **dissonant**: three detuned beating saw voices, a
sub sine, and band-pass-filtered noise, voiced on minor 2nds, tritones and
major 7ths (never a consonant drone). Its entire pattern is a pure function of
an integer frame counter + `Math.sin` + a fixed-seed `mulberry32` — identical
on every machine, with nobody interacting. This is what the review box hears.

## The visuals

Pure **Canvas2D** feedback-displacement datamosh (no WebGL / WebGPU / three.js).
A ping-pong pair of offscreen buffers carries the feedback. Each frame:

- the previous buffer is redrawn onto the next, **displaced in 22 horizontal
  slices** (I-frame smear);
- a fresh audio-driven pattern (Ikeda-style violet data-columns + a single hot
  accent tick + quantization dots) is composited over it;
- the result is mirror-tiled into a **2×2 kaleidoscope** with a **half-scale
  nested mirror** for machine-elf density.

Audio → image mapping:

- **Bass → displacement magnitude** (how far slices smear)
- **Mid → flow direction** (which way the smear flows)
- **High → chromatic split / fine detail** (RGB offset + dot/tick sparkle)

Palette is near-monochrome violet ramp (from the shared design system) with one
hot rose accent. A constant feedback-decay fill and a radial vignette **clamp
luminance** so nothing full-frame-flickers.

## Conceptual anchor: bitcrush → RVQ

Bitcrush is amplitude quantization. That makes it the audible-artifact
**ancestor** of the **Residual-Vector-Quantization** (codebook quantization) at
the heart of every 2024–26 AI music generator — Suno, Udio, Stable Audio,
MusicGen all encode audio as sequences of quantized codebook indices. Where a
bitcrusher rounds an amplitude to the nearest of a handful of levels, an RVQ
codec rounds an embedding to the nearest of a handful of learned vectors, then
does it again on the residual. Same move, higher dimension. See **ArtifactNet**,
arXiv **2604.16254** (2026-04-20), on how RVQ codebook quantization shapes the
"texture" of generated audio. Fracture makes that quantization grit *playable*.

## References

- Rosa Menkman, *Glitch Studies Manifesto* (2011) — error as aesthetic material.
- Ryoji Ikeda, *data.matrix* / *test pattern* — near-monochrome data-as-image.
- Datamosh / I-frame displacement — dropped keyframes smearing motion vectors.
- DMT hyper-detail "machine-elf" phenomenology — the over-detailed mirror density.
- ArtifactNet, arXiv 2604.16254 (2026) — RVQ codebook quantization in AI audio.

## Determinism & safety

- **No** `Math.random` / `Date.now` / `new Date` / `performance.now` anywhere in
  the state / audio / visual path. Randomness is a fixed-seed `mulberry32`;
  motion is an integer frame counter + `Math.sin`. `audioCtx.currentTime` is
  used only for gain/param ramps.
- The AudioContext is created on mount but is autoplay-suspended until the first
  interaction (tap / key). The canvas animates from the frame counter regardless,
  so it is never blank in the review box.
- No strobe: slice/feedback motion only, brightness clamped, no full-frame
  luminance flips in the 3–30 Hz band. Honors
  `prefers-reduced-motion: reduce` (slower motion, reduced flashing).
- Fully client-side. No network, no fetch, no API route, zero new dependencies.

## Known knobs & limits

- `RENDER_SCALE` (0.72) — feedback buffers run below CSS resolution for speed;
  raise for crispness, lower if a machine struggles.
- `SLICES` (22), `STEP_FRAMES` (26 — carrier tempo), grit curve, and master
  levels are all constants at the top of their modules.
- `ScriptProcessorNode` is deprecated; on some browsers it can glitch under
  heavy main-thread load. It is used deliberately for self-containment (an
  AudioWorklet would need a separately served module and fail the review box).
- Very long files decode fully into memory before looping; huge uploads may
  take a moment. Decode failures fall back to the carrier with a
  `text-destructive` note.
