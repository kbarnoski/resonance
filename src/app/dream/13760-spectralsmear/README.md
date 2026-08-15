# 13760 · Spectral Smear

## The one question

**What if you could reach into the SPECTRUM of your own recording and smear a
single instant of it across time — freeze a chord into an infinite shimmer, then
drag your hand through its overtones?**

The frequency-domain sibling of a granular scrubber. You pick one of Karel's real
recordings, see it as a scrolling spectrogram of his own STFT magnitudes, and
reach in: drag to move through the piece, press-and-hold to freeze a single
instant into an endless shimmering pad, drag while frozen to smear time, and open
a spread control to blur the frozen chord into a wide harmonic wash of his own
overtones.

## How it works

Everything you hear is **resynthesis of his decoded recording's own spectrum** —
no oscillators, no generated tones, no neural nets.

### STFT (analysis)
`fft.ts` is a self-contained iterative radix-2 Cooley-Tukey FFT. `spectralEngine.ts`
runs a short-time Fourier transform over his mono signal: **2048-sample Hann
frames, hop 512 (4× overlap)**. Each frame's magnitudes feed both the display
spectrogram and the resynthesis.

### Spectrogram (output)
`spectrogramView.ts` uploads the precomputed magnitudes (log-scaled, `R8` texture,
low freq at the bottom) to a **WebGL2** quad and blits a scrolling viewport with a
cool violet→cyan→ice colormap, panning with the playhead and shimmering on the
frozen frame. It reads as **data — his magnitudes over time × frequency** — not a
generative fragment field. A **Canvas2D** fallback (ImageData through an offscreen
buffer) draws the same viewport when WebGL2 is unavailable.

### Scrub (resynthesis)
When not frozen, each synthesis hop analyses the frame at the playhead, rebuilds
it from magnitude + original phase, and advances the head by one hop — inverse-STFT
**overlap-add** reconstructs his piece. Dragging moves the head, so you hear
yourself moving through the recording.

### Freeze (the core verb)
Press-and-hold captures one frame's magnitudes and the per-bin **true frequency**:
the expected bin phase increment `2πkH/N` plus the principal-value deviation
measured between two adjacent analysis frames. Then every synthesis hop holds the
magnitudes fixed and advances each bin's phase by that increment. Magnitudes
frozen, phase marching → a single instant sustains forever as a shimmer. This is
the classic **phase-vocoder freeze**.

### Smear & spread
Dragging while frozen retargets the freeze position and crossfades the held
magnitudes toward that frame's magnitudes (`SMEAR_RATE` per hop) — time smears.
The spread control **box-blurs the magnitudes across neighbouring bins**, opening
a crisp frozen chord into a wide harmonic wash.

Both modes share one overlap-add stream normalised by accumulated window energy,
rendered a block at a time into short `AudioBuffer`s scheduled ~0.2 s ahead of the
clock (no `ScriptProcessor`, no worklet) and routed into the shared `safeMaster`
ear-safety bus.

## References
- Flanagan & Golden (1966), *Phase Vocoder* — the original.
- Dolson (1986), *The Phase Vocoder: A Tutorial* — the freeze/time-scale framing.
- Laroche & Dolson (1999), *Improved Phase Vocoder Time-Scale Modification* —
  phase-locked resynthesis that motivates holding per-bin true frequency.
- The 2026 real-time tactile granular/spectral performance turn — reaching into a
  frozen spectrum by hand.

## Honest note on the DSP approximation
- **Windowing.** Play mode applies both analysis and synthesis Hann windows
  (effectively Hann²), which is exact under the window-energy normalisation. Freeze
  applies only the synthesis window — a small, constant gain difference that is
  inaudible on a sustained pad.
- **Phase jitter.** A tiny **seeded** (`mulberry32`) per-bin phase jitter is added
  during freeze so the pad doesn't ring metallic. This is a deliberate, documented
  approximation of a perfect vocoder freeze, not laziness — perfect per-bin phase
  locking (Laroche–Dolson peak tracking) would be heavier and, on a held chord,
  less pleasant.
- **Scrub reconstruction.** Fast scrubbing jumps the analysis position, so phase
  is discontinuous frame-to-frame; the Hann overlap-add hides it and it sounds like
  moving through his piece.

## Safety & housekeeping
No strobe — the scroll and freeze are smooth luminance. `prefers-reduced-motion`
stills the shimmer. No `Math.random()` (seeded `mulberry32`). Full teardown on
unmount: `cancelAnimationFrame`, engine stop (all scheduled sources stopped),
WebGL textures/programs deleted and context lost, `safeMaster.disconnect()`,
`ctx.close()`.

## Tags
`state:shimmer · pole:freeze↔smear · vibe:ice-cathedral`
