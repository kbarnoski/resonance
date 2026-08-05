# 7032-chladni

**One question:** *What if you dropped one of your own piano recordings onto a
vibrating Chladni sand plate and watched its frequencies push a field of glowing
sand grains into the plate's living nodal-line figures — and then the emergent
pattern sang back, its geometry re-sonified into a shimmering additive drone, so
image and sound co-generate each other?*

Sound made physically visible: a real, physically-simulated Chladni plate. Warm
violet sand on a dark plate, dancing at the antinodes and settling on the still
nodal lines. Drop a recording or sweep the exciter — the figure blooms and
dissolves as the music moves, then rings its own geometry back at you.

---

## The physics (implemented for real)

A square plate of side `L` supports standing-wave modes. We superpose several:

```
Z(x,y) = Σ_k  w_k · sin(m_k·π·x/L) · sin(n_k·π·y/W)
```

with `x,y` on the unit square. The plate shakes hardest at the **antinodes**
(`|Z|` large) and is still on the **nodal lines** where `Z ≈ 0`. Loose sand is
thrown off the antinodes and accumulates on the nodal lines, so the grains draw
the figure `|Z| = 0`. As the exciting frequency rises, higher `(m,n)` modes
resonate and the figure grows more intricate — exactly the classic demonstration
Ernst Chladni showed with a bowed metal plate.

**Audio → modes.** An FFT of the playing audio (`AnalyserNode`,
`getFloatFrequencyData`) is peak-picked across 50–2000 Hz. Each loud peak is
mapped — log-scaled — onto a table of `(m,n)` pairs sorted by their modal
frequency `√(m²+n²)`, so higher frequencies select higher modes. The dominant
peak also lights its two table neighbours, so a single tone still blooms a rich
2-D figure that morphs smoothly; a chord stacks several overlaid figures. Peak
magnitudes become the mode weights `w_k`.

**Grains → nodal lines.** ~24,000 grains are advected entirely on the GPU
(WebGL2 **transform feedback**). Each grain evaluates `Z` and its analytic
gradient in the vertex shader and steps *down* the gradient of `|Z|` toward the
nearest nodal line, with jitter scaled by local vibration energy — grains dance
where the plate shakes and go still where it doesn't, so they settle onto the
lines. State ping-pongs between two interleaved `[x,y,seed]` buffers; a second
pass draws the grains as additive point sprites, brightening the settled ones so
the figure glows.

## The bidirectional twist (this cycle's research finding)

Once the sand has organised onto the nodal lines, the emergent geometry is read
**back into sound**. Each active mode's spatial-frequency ratio `√(m²+n²)`,
relative to the lowest active mode and snapped to a just-intonation ratio, tunes
a sine partial over a warm root (A2); intricate high-order modes lift an octave
so the drone brightens. The result is a soft additive drone mixed *under* the
exciter — the plate ringing its own figure. Image and sound co-generate.
Inspired by **_ChladniSonify: A Visual-Acoustic Mapping Method for Chladni
Patterns in New Media Art Creation_** (arXiv 2605.09846, 2026).

## The four subsystems

1. **Audio-file / FFT input** (`audio.ts`) — dropped recording looped as a
   `BufferSource`, tapped by an `AnalyserNode`; peaks + broadband amplitude
   extracted each frame.
2. **Chladni plate-mode physics** (`chladni.ts`) — the mode table, the
   frequency→`(m,n)` mapping, mode superposition from spectral peaks, and the
   geometry→sound partial mapping.
3. **GPU sand-particle simulation** (`sim.ts` + `renderer.ts`) — WebGL2
   transform-feedback advection of 24,000 grains down `∇|Z|`, rendered as
   additive glowing point sprites on a dark violet plate.
4. **Pattern → sound re-sonification** (`chladni.modesToPartials` +
   `audio.setPartials`) — a bank of sine oscillators retuned live to the
   emergent nodal geometry.

## Input modes

- **Drop / pick an audio file** — the primary path; drag-drop zone + file input.
  Read locally via `arrayBuffer()` → `decodeAudioData` (never uploaded).
- **Oscillator sweep** — a 50–2000 Hz slider drives a single sine exciter. With
  **zero file** this walks the plate through its whole mode sequence — `(1,1)`
  up to intricate high-order figures — the classic Chladni demo, fully
  self-contained. The slider also sculpts the figure *before* Start (visual
  only), so the piece is alive on load.

## Named references

- **Ernst Chladni** — the 18th-century plate figures this simulates.
- **_ChladniSonify_**, arXiv 2605.09846 (2026) — the visual→acoustic mapping
  that motivates the bidirectional re-sonification.

## Graceful degradation

- **No file?** Sweep mode runs standalone — no file is ever required.
- **No WebGL2?** A `text-destructive` notice replaces the canvas; nothing
  crashes.
- **Bad / undecodable file?** The decode error is caught and shown; the sweep
  exciter keeps running. Re-dropping another file just re-decodes.

## Design notes (overlay caption)

> One question: *what if you dropped your own piano recording onto a vibrating
> Chladni plate and watched its frequencies push a field of sand into the
> plate's nodal-line figures — then the pattern sang back?* A square plate's
> standing waves are `Z(x,y) = Σ w·sin(mπx)·sin(nπy)`; sand flees the antinodes
> and settles on the **nodal lines** where `Z ≈ 0`. An FFT of the audio picks
> the loudest peaks; higher frequencies excite higher `(m,n)` modes, so the
> figure grows more intricate as the music climbs, with 24,000 grains advecting
> down `∇|Z|` on the GPU. **The twist — bidirectional:** the settled geometry's
> mode ratios re-tune an additive just-intonation drone, so the plate
> re-sonifies. After Ernst Chladni, and *ChladniSonify* (arXiv 2605.09846,
> 2026). Drop one of Karel's piano recordings, or sweep 50–2000 Hz with zero
> file.

## Files

- `page.tsx` — `"use client"` page: fullscreen canvas, controls strip, readout,
  design-notes overlay, graceful-degradation states.
- `chladni.ts` — plate-mode physics, frequency→mode mapping, geometry→sound.
- `audio.ts` — sweep + file exciters, FFT analyser, re-sonification drone.
- `sim.ts` — GLSL for the transform-feedback update + additive point render.
- `renderer.ts` — the WebGL2 rig running the GPU sand simulation.
