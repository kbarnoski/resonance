# 85 — spectrogram paint

**Route**: `/dream/85-spectrogram-paint`

**Question**: What if your sound crystallized into a living painting that remembers where it's been?

---

## What it does

A live audio spectrogram rendered as a scrolling waterfall — time flows left to right, pitch rises bottom to top (log scale, 20 Hz–8 kHz). Each frame the FFT column scrolls left and a new amplitude column is written at the right edge.

The novel part: the spectrogram feeds into a **Canvas2D ping-pong feedback loop**. Each frame, the previous display is copied back onto itself with a slow decay (98.4%), a subtle zoom (1.002×), and a small drift (0.28 px rightward, 0.08 px downward). The fresh spectrogram is then injected additively ("lighter" composite). The result: notes leave trails that expand slightly outward, breathe, and slowly dissolve — as if the sound is crystallizing and then evaporating.

---

## Colormap

**Ryoji Ikeda hot monochrome with frequency-zone tint** (from his *data.matrix* / *test pattern* work):

| Amplitude | Color |
|-----------|-------|
| 0 (silence) | Pure black |
| Low | Dim violet (bass) or dim cyan (treble) |
| Mid | Brightening toward white-purple or white-blue |
| Peak | White (saturated) |

The bass/treble hue split is subtle — most of the image reads as monochrome. Loud piano notes appear as bright white stripes against a dark field.

---

## Feedback parameters

| Parameter | Value | Effect |
|-----------|-------|--------|
| Decay | 0.984 | Trail fades over ~2 s |
| Zoom | 1.0022× / 1.0012× | Slow outward bloom |
| Drift | 0.28 px, 0.08 px | Slight rightward creep |
| Spect inject | 0.52 α, "lighter" | Fresh data always readable |

These values were tuned so:
- Single staccato note: bright flash, ~2 s tail
- Sustained note: saturates to bright white, then fades after release
- Silence: display decays smoothly, slight zoom distortion visible

---

## Architecture

Three offscreen `HTMLCanvasElement` buffers (created on first run, browser-side only):
- `spect` — raw scrolling spectrogram (W×H = 512×256)
- `pingA` / `pingB` — ping-pong feedback display buffers

Per-frame tick:
1. `getByteFrequencyData()` → one call, maps log-Hz rows to FFT bins
2. `spect.drawImage(spect, -1, 0)` → scroll left; `putImageData()` → write new column
3. `pingCtx.drawImage(pong)` (decay+zoom+drift) → `drawImage(spect)` (additive inject) → write to ping
4. `mainCtx.drawImage(ping)` → stretch-blit to full screen

---

## Demo mode

Without mic, 11 C-major scale frequencies (C2–C6) are animated with individual LFOs at irrational-multiple rates. Each "note" is a narrow Gaussian spike (bandwidth 1.6% of center freq) with a softer second harmonic. The result looks like an improvising pianist — notes fade in and out, overlap, cluster around chord tones. Sub-bass rumble at ~55 Hz pulses slowly underneath.

---

## What to try

- Play a piano chord — watch it crystallize as a vertical cluster of white lines
- Sustain a note — it blooms outward in the feedback loop
- Play fast arpeggios — each note leaves a brief bright trail, the tails layer
- Hum at a steady pitch — the trail stretches and drifts right as the zoom accumulates
- Silence for 3 s — watch the painting slowly evaporate

---

## Cycle 102 upgrade path (WebGPU)

The Ideas spec called for WebGPU texture writes for the spectrogram. This first pass uses Canvas2D for maximum compatibility (Chrome, Firefox, Safari, mobile). A Cycle 102 upgrade could port to:
- `device.queue.writeTexture()` for the FFT column write
- A WGSL feedback shader (same as `74-touchdesigner-feedback`) for the ping-pong
- A color-mapping shader that applies more complex tonemapping (ACES filmic, etc.)

The Canvas2D version already achieves the core aesthetic at full fidelity.

---

## Polish ideas

- Hue rotation shader: slowly cycle the color temperature (warm → cool → warm)
- Waterfall speed slider: faster scroll = more time compressed
- Log/linear frequency toggle: log is perceptual, linear shows harmonics more clearly
- "Freeze" button: stop the scroll, hold the current painting
- Save PNG: export the current spectrogram painting as a timestamped image
