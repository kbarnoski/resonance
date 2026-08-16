# 13904-unmixer — live HPSS un-mixer

## The design question
What if you could reach into your own recording and **lift the melody off the
pulse** — pull it into its harmonic (sustained chords) and percussive (attack /
pedal transients) layers and re-balance them live with faders? Not a passive
visualizer: a hands-on studio instrument played on Karel's real solo piano.

## Audio source
Karel's own catalog only, via the shared helpers — `REAL_TRACKS` (Welcome Home
×13 + Snowflake ×3) and `loadRealTrackBuffer`. No synths, no oscillators. Every
node routes into `createSafeMaster(ctx).input`, never `ctx.destination`.

## How the HPSS median-filtering works here
Following FitzGerald's method, on the decoded (mono-summed) buffer:

1. **STFT** — a hand-rolled radix-2 FFT (2048-pt, 512 hop, Hann window; no npm
   dep) builds the complex spectrogram and its magnitude `|X|`.
2. **Harmonic estimate `H`** — a length-17 median filter *across time* (per
   frequency bin). Sustained tones persist across frames and survive; transients
   are brief and get medianed away.
3. **Percussive estimate `P`** — a length-17 median filter *across frequency*
   (per time frame). Broadband attacks span many bins and survive; narrowband
   tones get medianed away.
4. **Soft Wiener masks** — `Mh = H² / (H² + P² + ε)` and `Mp = P² / (H² + P² +
   ε)`, applied to the **original complex STFT** so the original phase is kept.
5. **ISTFT** — Hermitian-symmetric inverse FFT per frame + windowed overlap-add
   (normalised by the summed squared window) resynthesises two real
   `AudioBuffer`s.

Each buffer loops through its own `GainNode → safe.input`; the two faders set
those gains. Solo buttons hard-mute the other layer. A per-layer `AnalyserNode`
tap feeds live RMS to the visual.

## Which resynthesis shipped
**The true offline HPSS resynthesis** (masked complex STFT → ISTFT into two audio
buffers), not the parallel-filter-bus simplification. It is precomputed once at
load with a visible progress meter.

## Visual
WebGL2 dual-field (attribute-less full-screen triangle). Harmonic → smooth
horizontal **ice/cyan ridges**; percussive → vertical **violet sparks/columns**
that flash on attacks. Brightness is driven by each layer's live level, so
soloing the harmonic makes ridges dominate and soloing the percussive makes
sparks dominate. Near-black ground, cool palette only. No-WebGL2 shows a
`text-destructive` notice; full GL teardown on unmount.

## Self-demo
After separation completes, playback auto-sweeps the faders (harmonic up /
percussive down, then reverse, then settle) over ~11s so a reviewer with sound on
immediately hears the two layers pull apart. Touching either fader cancels the
demo and hands control over.

## Determinism
No `Math.random` / `Date.now` / `new Date`. The shader uses a deterministic hash;
timing uses `ctx.currentTime` / `performance.now()`. Same track in → same
separation out.

## Honest limitations
- Only the **first 30s** of a track is separated and looped — full-length
  separation would blow the memory budget on a phone.
- Mono-summed before analysis (stereo image is not preserved).
- Piano is overwhelmingly harmonic, so the percussive layer is hammer/key
  attacks and pedal thumps — the "skeleton of the touch," not a drum kit.
- Separation is a couple of seconds of main-thread work (chunked with UI yields
  to stay responsive); no Web Worker.

## Reference
D. FitzGerald, "Harmonic/Percussive Separation using Median Filtering," Proc. of
the 13th Int. Conf. on Digital Audio Effects (DAFx-10), Graz, Austria, 2010.

## Files
- `page.tsx` — UI, audio graph, fader console, self-demo, render loop.
- `hpss.ts` — FFT, STFT, median filtering, Wiener masks, ISTFT resynthesis.
- `gl.ts` — WebGL2 dual-field renderer.
