# 17120 · breathline

**Status:** demoable

## What / why

Does Karel's rubato *breathe* on a hidden slow pulse — and can you SEE that
breath as the living substrate of his whole take? A performer's beat-by-beat
timing variability (rubato) was long dismissed as random jitter. Recent
motor-timing work argues the opposite: those deviations carry a shared, slow
**~0.36 Hz** oscillation — an "infra-delta" cycle (~2.8 s period) running
underneath expressive timing like a breath. This piece extracts that breath from
one of Karel's real recordings and makes the whole field inhale when he leans
back (lags the beat) and exhale when he presses forward (rushes), with the fast
expressive tremor riding on the slow swell.

## Mechanics

1. **Audio.** One real recording from Karel's verified catalog loads via
   `loadRealTrackBuffer` and plays through `createSafeMaster(...).input` — the
   only audio path. No oscillators, synths, or generated tones. The safeMaster
   analyser is tapped for a faint secondary glow only.
2. **Rubato deviation.** From `loadTrackAnalysis` we take his note-roll, collapse
   near-simultaneous notes (chords) into struck onsets, and fit a slow **local
   tempo grid** — a moving average of inter-onset intervals. Per interval we
   measure how much it *leads or lags* that grid (the signed rubato deviation, a
   fraction of a beat): longer than the local norm → he leans back (inhale),
   shorter → he presses forward (exhale).
3. **Recover the breath.** The irregular deviation series is resampled to a
   uniform 20 Hz grid, the very-slow drift is stripped, and the signal is
   low-passed toward the infra-delta band (~0.2–0.5 Hz). What survives is the
   breath; the residual above it is the fast expressive **tremor**. A rolling RMS
   gives the breath **amplitude**.
4. **Measured period.** Autocorrelating the band-limited breath over 2–5 s lags
   recovers the take's dominant slow period, shown live in the readout (e.g.
   "breath ≈ 0.34 Hz · 2.9 s · measured from his timing"). If a take is too short
   or the autocorrelation peak too weak, it falls back to the ~0.36 Hz
   infra-delta prior and labels the readout accordingly.
5. **Visual (Canvas2D, warm/organic).** A luminous amber-rose-through-violet
   aperture expands on inhale and contracts on exhale; the rim carries the
   tremor; rings emanate on each inhale crest; and a bottom graph shows the slow
   breath (violet) with the raw deviation (warm) riding on it, so both scales are
   legible at once. The breath is driven by his **timing**, not an FFT.
6. **Autonomous + degradation.** Everything runs on play; the only chrome is a
   native track selector and a play/stop button (no pointer/drag art input). If
   the buffer fails, a `text-destructive` notice shows but the page stays alive.
   If a take has no note analysis, the breath is driven from the recording's
   dynamic envelope instead, badged "no note analysis". Reduced-motion freezes
   the preview and drops the shimmer and emanating rings — the breath curve rests.

## References

- bioRxiv **2026.03.27.714869**, *Infra-delta oscillatory structure in
  expressive piano performance* — a shared, slow **~0.36 Hz** oscillation
  underneath beat-level rubato.
- ASAP-dataset work, *Frontiers in Psychology* **2026** — expressive timing
  flexibility is closely aligned with dynamic shaping and largely independent of
  note density.
