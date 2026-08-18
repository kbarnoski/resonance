# 15152-pulse — "Pulse"

> input: camera-PPG heartbeat (biosignal, secondary) + synthetic-pulse fallback · output: inline-SVG/DOM cardiac trace · technique: PPG heart-rate detection → real-take amplitude+low-shelf entrainment · palette: cool cyan/indigo on black · pole: interoceptive/embodied

**The one question:** *What if Karel's recording entrained to YOUR OWN heartbeat — read optically from a fingertip on the camera — so the music breathes in your body's time?*

The lab's first biosignal / interoceptive piece. Instead of you listening to the music, the music listens to your body.

## How the PPG heartbeat detection works

1. **Optical capture.** The visitor rests a fingertip fully over the camera lens (torch requested via `track.applyConstraints({ advanced: [{ torch: true }] })` where the device supports it — most phones do, most laptops don't). Frames are drawn to a tiny 48×36 offscreen canvas (used only for `getImageData` pixel sampling — the visible art surface is inline SVG, never Canvas2D).
2. **Mean red channel.** Each frame we average the RED-channel brightness across the sampling canvas. Blood pulsing through the capillaries under the fingertip modulates that brightness at the heart rate — photoplethysmography (PPG).
3. **Rolling buffer + detrend.** We keep a ~10 s buffer of `{t, meanRed}`, then detrend by subtracting a ~0.9 s moving average, isolating the oscillation from slow drift (finger pressure, ambient light).
4. **Beat detection.** A decaying amplitude envelope tracks the oscillation size; a beat is an **upward threshold crossing** (0.42 × envelope) gated by a refractory period (≥ 0.33 s ⇒ ≤ ~182 bpm) and a noise floor (so an uncovered lens registers nothing). The median inter-beat interval → **BPM** (exponentially smoothed); the interval's coefficient of variation + the oscillation amplitude → a **signal-quality** score.
5. **Stability arbitration.** With hysteresis: once ≥ 4 regular beats lock in-range, the camera becomes the live beat source; a ~4 s quality dip or ~6 s of never-locking falls back to the resting clock.

## How the entrainment works (100% his catalog, zero synthesis)

One of Karel's real sustained Welcome Home takes ("Bath") loops through:

```
BufferSource(loop) → LowShelf(150 Hz) → SwellGain → createSafeMaster → destination
```

On **each detected beat** we:

- **Amplitude swell** — a gentle breath on the `SwellGain` (0.82 → ~0.98 → back), so his recording rises and settles in your heart's time.
- **Felt-heartbeat throb** — a brief `+7 dB` boost of the `LowShelf` that carves a *felt* cardiac pulse **out of his own low end**. This is the CHI "Heartbeat Resonance" finding applied honestly: a felt cardiac throb sculpted from the music, **not** a synthesized tone/click. `createOscillator`/`createConstantSource` are never called; the PPG signal and the fallback clock are CONTROL signals only, never audio sources.

The overall swell cadence tracks your BPM because the beats *are* your beats.

## Fallback (validated path)

No camera / permission denied / no stable pulse within a few seconds → a clean internal **~62 bpm resting clock** (a control signal, not audio) drives the same swell + throb, the trace draws a synthetic PPG waveform (systolic upstroke + dicrotic notch), and a `text-destructive` badge reads "resting ~62 bpm". The piece looks and sounds complete with zero camera. Live-vs-resting state is badged in the corner.

## Visual

Inline SVG cardiac readout on near-black (`#04070b`): a scrolling PPG trace (deep cyan→indigo gradient, `#22d3ee`/`#818cf8`), a large mono BPM number, a soft radial **beat bloom** that swells on each beat (capped, and further gentled under `prefers-reduced-motion` — no hard strobe), and a signal-quality bar. All 60 fps updates go straight to SVG/DOM via refs; React state is throttled to ~5 Hz.

## Honest limits

Real PPG needs a real finger and a real camera — ideally with the torch on. I validated the **fallback path** (synthetic clock + synthetic waveform + entrainment) in the browser without a sensor; the live-camera path follows the standard mean-red / detrend / peak-interval PPG recipe but its lock quality will vary by device, camera, torch availability, and how fully/steadily the finger covers the lens.

## References

- *Heartbeat Resonance* (ACM CHI 2025) — a felt heartbeat conjured from ~78 Hz low-frequency sound; the basis for carving the throb from real low end rather than adding a tone.
- *Sensory processing reallocation from auditory to cardiac signals in REM sleep* (Current Biology, 2026) — the interoceptive framing of hearing giving way to the body's own cardiac signal.
