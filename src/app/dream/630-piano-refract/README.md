# 630 · Piano Refract

**One question:** *What if Karel's solo piano could be refracted like light through a prism — first split into its sustained STRINGS vs. its HAMMER attacks, then the strings layer fanned into four pitched register "voices" you can solo, mute, and re-mix?*

This is the **cycle-2 deepening** of `606-piano-vivisection`. That prototype split Karel's
piano into harmonic (strings) and percussive (hammers) layers with median-filter HPSS and let
you crossfade between them. Loved as it was, the strings layer was still a single undifferentiated
block. Here we keep that HPSS split as the legible ground and add a second, finer refraction on
top: the strings are fanned by **NMF** into four register voices.

## The two-stage refraction

1. **HPSS (the ground).** Median-filter Harmonic/Percussive Source Separation (Fitzgerald 2010):
   per-bin median across time → sustained horizontal trails (strings); per-frame median across
   frequency → vertical strikes (hammers). Soft Wiener masks on the original complex STFT keep
   phase. This stage is unchanged, proven, and instantly legible — the **Hammers** voice comes
   straight from the percussive layer.

2. **NMF (the new refraction).** The harmonic (strings) PCM is re-analyzed with a fresh STFT, and
   its magnitude spectrogram `V` (bins×frames) is factorized as `V ≈ W·H`, with `W` = bins×4 basis
   (the four register "colors") and `H` = 4×frames activations (when each register sounds).
   KL-divergence multiplicative updates (Lee & Seung 1999), ~70 iterations, chunked with `await`
   yields so the UI never freezes. Each component is turned back into audio by a soft per-component
   Wiener mask `Mk = Vk / (Σj Vj + ε)` applied to the **original complex harmonic STFT** (scaling
   real and imaginary parts together — phase preserved), then ISTFT.

## The legibility strategy: register-seeded / warm-start NMF

Random-initialized NMF converges to abstract components that are unstable run-to-run and impossible
to name. The fix here is a **warm start**: each of the four basis columns of `W` is initialized as a
smooth Gaussian-in-log-frequency bump centered at log-spaced register frequencies —
**~150 Hz (Low), ~350 Hz (Low-mid), ~800 Hz (High-mid), ~1800 Hz (High)** — each with a small
positive floor everywhere so the multiplicative updates can still move spectral mass and adapt to
Karel's actual partials. This biases every component to settle into a stable, musically-meaningful
register regardless of the run, directly fixing NMF's "unnameable / unstable convergence" weakness.
Components keep their low→high seed order and labels. (This is the seeded/supervised-basis idea from
Smaragdis & Brown 2003 applied for *legibility* rather than transcription.)

## The instrument — five voices

| # | Voice | Source | Color |
|---|-------|--------|-------|
| 1 | Hammers  | HPSS percussive layer        | cool steel |
| 2 | Low      | NMF component, ~150 Hz seed  | violet |
| 3 | Low-mid  | NMF component, ~350 Hz seed  | rose |
| 4 | High-mid | NMF component, ~800 Hz seed  | amber |
| 5 | High     | NMF component, ~1800 Hz seed | emerald |

Each voice is an independent looping `BufferSource → GainNode → AnalyserNode → master`. All five
buffers are trimmed to the shortest length and started sample-aligned, and they **always play**.
Solo / mute / gain only adjust the gain nodes (short `setTargetAtTime` ramps), so **solo and mute
are instant** with no clicks and no re-trigger. Master chain: `master gain → DynamicsCompressor
(gentle) → destination`.

## Visual — WebGL2 prism (Canvas2D fallback)

The refraction is drawn as a fan of light: an incoming white piano beam on the left splits into five
colored bands. Each band shows that voice's spectral profile (the NMF basis `W[:,k]`, or the average
hammer spectrum) and is driven by its live level from an `AnalyserNode`. The soloed band glows;
muted/dimmed bands fade. On mount an **idle animation** starts immediately so a silent glance already
shows the prism alive, and after ~2.5s of no interaction an **auto-demo** cycles which voice is
soloed (any real interaction preempts it instantly). A backend badge shows **WebGL2** or **Canvas2D**.
If WebGL2 is absent, a real Canvas2D scene draws the identical five bands with `fillRect`.

## Controls

- **Keyboard (primary, off-glass):** `1`–`5` solo a voice · `0` reset (all on) · `m` mute selected ·
  `←/→` select voice · `↑/↓` selected-voice gain · `space` play/pause.
- **Device tilt "spectral spotlight" (mobile):** lean left/right to spotlight (select + solo) a
  voice. iOS 13+ requires `DeviceOrientationEvent.requestPermission()` — it is gated inside the
  Begin gesture; if denied/unavailable it falls back silently to keyboard and shows a `text-rose-300`
  notice.
- **On-screen:** five voice rows, each with a solo button, mute button, and gain fader (all
  tap-targets ≥44px), plus reset / play-pause.

## Fallbacks (degrade gracefully)

- Karel's recording fetch fails → synthesized piano fallback (amber note "synthesized piano —
  recording unavailable").
- WebGL2 absent → Canvas2D scene (same bands).
- Tilt denied/unavailable → keyboard-only (rose notice).
- Audio gated → "Begin" gesture builds & resumes the AudioContext.
- Heavy DSP → HPSS and NMF are both chunked with `await` yields and drive a single progress bar
  (first half HPSS, second half NMF); the tab never freezes.

## Subsystems

- `audio.ts` — fetch Karel's real solo-piano recording (`/api/audio/<id>`), synthesized fallback.
  Copied verbatim from 606.
- `hpss.ts` — STFT/ISTFT, median filtering, full HPSS `decompose()`. Copied from 606.
- `nmf.ts` — register-seeded KL-NMF on the harmonic spectrogram → four register PCM voices + basis/
  activation profiles.
- `gl.ts` — WebGL2 prism renderer + real Canvas2D fallback.
- `page.tsx` — client component: load → HPSS → re-STFT strings → NMF → five-voice mixer, controls,
  render loop, auto-demo.

## Next-cycle deepening

A cycle-3 could let the four register voices be **re-pitched / re-timed independently** (granular
loop per register), add a `K`-slider to refract into more or fewer registers, or run **supervised
NMF** with a fixed basis learned from a clean note dictionary so each voice maps to true pitch
classes rather than register bands. Tilt could become a continuous spotlight that fades neighbors
rather than hard-soloing one band.

## References

- D. D. Lee & H. S. Seung, "Learning the parts of objects by non-negative matrix factorization,"
  *Nature*, 1999. (NMF + multiplicative updates.)
- P. Smaragdis & J. C. Brown, "Non-negative matrix factorization for polyphonic music
  transcription," *WASPAA/ISMIR*, 2003. (NMF on music spectrograms; supervised/seeded NMF.)
- D. Fitzgerald, "Harmonic/Percussive Separation using Median Filtering," *DAFx*, 2010. (The HPSS
  ground this builds on.)
