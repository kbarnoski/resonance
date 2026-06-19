**For**: kids (4+)

# 747 · Inkblot Bloom

> What if a 4-year-old could hum and watch living, mirror-symmetric inkblots
> bloom and unfold like a butterfly — and hear each fold sing?

A near-dark, calm screen. The child **hums or blows** into the mic; soft ink
blooms outward from the centre and unfolds in **kaleidoscopic mirror symmetry**
— a living Rorschach butterfly/flower. The ink growth is a **Gray-Scott
reaction-diffusion** field. As the reacting fronts spread and split they ring
soft consonant bell/chord tones: each hum seeds a fresh drop of ink and rings a
note whose pitch follows the bloom's radius and the hum's pitch. It is
contemplative — no beat, no loop, no "wrong" note, no fail state.

## How it works

- **Visual — Gray-Scott reaction-diffusion.** Two coupled fields (u, v) diffuse
  and react across a grid. Tuned to a gentle mitosis/coral regime
  (feed ≈ 0.0367, kill ≈ 0.0649) so spots grow and split softly instead of
  exploding. Edges wrap, so the bloom stays seamless and symmetric.
- **WebGPU compute (primary renderer).** The update runs as a WGSL compute
  shader on a **256×256 ping-pong storage-buffer pair** (8 sub-steps per frame).
  A full-screen render pass folds the screen UV into an N-fold kaleidoscope and
  mirrors within each wedge (butterfly symmetry), then maps `v` to a warm
  ink-on-light palette with a luminous front glow. No `@webgpu/types`
  dependency: minimal local interfaces + numerically hardcoded usage bits
  (`STORAGE 0x80`, `COPY_DST 0x08`, `UNIFORM 0x40`). `navigator.gpu` is only
  touched inside the Start handler.
- **Canvas2D fallback (required, not the headline).** If `navigator.gpu` is
  missing or adapter/device request fails, the **same** Gray-Scott model runs on
  a **96×96 typed-array CPU grid** (6 sub-steps) and is drawn mirror-
  symmetrically into rotated/clipped wedges on a Canvas2D — same palette, same
  kaleidoscope, same blooms and bells. A `text-rose-300` notice says it's in
  lite mode. The piece still fully blooms and sings.

## Sound

All audio routes through **master gain (≤0.26) → lowpass (7 kHz) →
DynamicsCompressor (−10 dB, 20:1) → destination** — no harsh highs, no sudden
loud transients.

- **Bells.** A bloom event rings a soft additive triangle bell (fundamental +
  faint octave/fifth partials) chosen from a **C-major pentatonic** scale across
  several octaves — there is no wrong note. Pitch follows the bloom's radius and
  the hum's pitch lift. Per-note (350 ms) and global (70 ms) refractories keep
  an avalanche from machine-gunning.
- **Always-on drone pad.** C2 + G2 + a faint C3, slightly detuned, so the piece
  never feels broken.
- **Ghost auto-demo.** If the mic is denied or idle > ~2.5 s, a scripted "ghost
  hum" keeps seeding ink and ringing bells hands-free, so a silent glance shows
  a blooming, sounding piece within ~2 s of Start.

## Mic (privacy)

`getUserMedia({ audio: { echoCancellation:false, noiseSuppression:false,
autoGainControl:false } })` is created **inside the Start tap** (iOS-safe). It
feeds an `AnalyserNode` for **RMS breath energy** and a **cheap zero-crossing
pitch estimate**. The analyser is **never** connected to `destination`: the mic
is live-analysis only — never recorded, never sent, never wired to the speakers.
More breath = more/brighter ink; higher pitch lifts blooms off-centre.

## Degradation summary

| Condition | Behaviour |
| --- | --- |
| WebGPU present | 256×256 Gray-Scott on GPU compute, kaleidoscope render |
| No WebGPU / adapter fails | 96×96 Gray-Scott on CPU → Canvas2D, lite-mode notice |
| Mic granted | breath seeds ink, pitch lifts blooms |
| Mic denied / idle | ghost hum keeps blooming + singing |
| Silence | always-on drone pad |

## References

- **Gray-Scott reaction-diffusion** — J.E. Pearson, *"Complex Patterns in a
  Simple System"* (Science, 1993); roots in A.M. Turing, *"The Chemical Basis of
  Morphogenesis"* (1952).
- **Bileam Tschepe (elekktronaut)** — feedback / inkblot TouchDesigner lineage.
- **Entagma**, *"Easy Houdini: Inkblots — Steal from TouchDesigner"* (May 11,
  2026).

## Files

- `page.tsx` — `"use client"` orchestrator: Start gesture, rAF loop, bloom
  sonification, ghost demo, teardown, UI.
- `gpu.ts` — WebGPU Gray-Scott compute + kaleidoscope render (WGSL).
- `cpu.ts` — Canvas2D CPU fallback (same model, mirror-folded).
- `audio.ts` — bells, drone pad, mic analysis (analysis-only), safe-sound chain.
