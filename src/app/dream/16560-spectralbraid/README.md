# 16560 · Spectral Braid

state: demoable · pole: cross-synthesis / painterly DSP

## The one question

**What if you could PAINT which of two different recordings of Karel's shows
through, across the whole time–frequency plane — and hear the two takes braided
together into one impossible performance that is neither?**

Not one take looped against itself — two genuinely *different* takes, recombined
cell by cell into a performance that never happened.

## How the paint-mask cross-synthesis works

1. **Offline STFT (up front).** On Play, both takes are decoded to mono and run
   through a Short-Time Fourier Transform — a Hann-windowed, 2048-point FFT at 4×
   overlap (hop 512) — capped to the first ~17 s (1500 frames) so analysis stays
   fast and memory bounded. Per frame we store magnitude and phase for every bin.
   A self-contained iterative radix-2 Cooley–Tukey FFT lives in `fft.ts` (no npm
   dependency).

2. **The mask.** The canvas *is* the time–frequency plane: x = time frame, y =
   log-scaled frequency. A `[120 × 64]` grid of values in `[0,1]` — `0` = take A,
   `1` = take B — is painted with a soft-falloff brush. It defaults to `0.5`: an
   even braid, the "neither" state, audible before you touch it.

3. **Resynthesis (streamed).** A `ScriptProcessorNode` (buffer 4096) runs
   overlap-add: for the current frame, each bin's **magnitude blends linearly**
   by the mask value and its **phase is taken from whichever take dominates**
   that cell (avoids cancellation). Inverse-FFT → windowed overlap-add → output,
   looping the analysed span. The playhead sweeps in sync. Everything routes into
   the shared ear-safety master — never `ctx.destination`.

4. **Graceful fallback (required).** If analysis throws or the ScriptProcessor is
   unavailable, it degrades to an **equal-power crossfade** of the two real takes
   driven by the mask's *average* value — always audible — and shows a notice.

## Audio source

Karel's REAL catalog only (STFT → mask → IFFT of his actual buffers). No
oscillators, no noise, no synth. Both sides are his recordings, transformed.

- **Take A (copper #c4703a):** `REAL_TRACKS[0]` — *Interplay*
- **Take B (verdigris #8fb3ad):** `REAL_TRACKS[12]` — *All Together*
- Both selectable from an A/B picker (any two different Welcome Home / Snowflake
  takes).

## Palette

An ART duotone, canvas only: warm **copper** for take A, cool
**silver-verdigris** for take B, blending where painted, brightness carrying the
blended spectral magnitude. All chrome uses semantic tokens.

## Reference

IRCAM ASAP "Spectral Crossing" and the broader **spectral cross-synthesis**
tradition (phase-vocoder magnitude/phase recombination of two sources).

## Status

Built to demoable. Offline STFT of both takes completes in well under a second on
a modern laptop; painting moves the sound live; the crossfade fallback guarantees
audio if streaming resynthesis is unavailable. Verified: `"use client"` on line
1, imports from `../_shared/welcomeHome` and `../_shared/visionary/safeMaster`,
zero `ctx.destination`, zero oscillators/noise.
