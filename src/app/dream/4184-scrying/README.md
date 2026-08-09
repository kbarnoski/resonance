# 4184 · Scrying

**Hear what the camera sees.** A synesthetic instrument that reads the live
visual world literally as a sound spectrogram and inverse-transforms it back
into audio — so the image plays itself.

## The one question

> What if you could HEAR what the camera sees — where a live image is read
> literally as a sound spectrogram and inverse-transformed back into audio, so
> the visual world plays itself?

## How a column becomes a spectrum becomes sound

Every audio visualizer draws sound as a picture. This inverts that: it
**sonifies a picture.**

1. **Frame as image.** The rear camera (`getUserMedia({ video })`) is drawn to a
   200×256 offscreen canvas each animation frame.
2. **Scan column.** A vertical scan-line sweeps left→right across the frame over
   3–9 seconds and loops. The single pixel column beneath it is the current
   frame's magnitude spectrum.
3. **Column → spectrum.** That column is resampled to 128 bins mapped
   **logarithmically to pitch** — the bottom of the image is low (80 Hz), the top
   is high (4.8 kHz). Each bin's brightness (luminance, gamma-shaped to lift the
   noise floor) becomes that bin's magnitude.
4. **Spectrum → sound (inverse STFT).** The magnitudes drive an **additive bank
   of 128 sine partials** at the log-spaced bin frequencies — a real-time inverse
   short-time Fourier read-out. Gains glide click-free via `setTargetAtTime`; a
   `DynamicsCompressor` keeps the summed bank from clipping. (An overlap-add IFFT
   is an equivalent path; the additive bank is the reliable low-latency one.)

So a bright horizontal band = a sustained tone; a textured/edgy region =
broadband noise; a moving object sweeps the pitch. The scanned column **glows**
as a bright vertical line over the dimmed grayscale frame, with active partials
drawn as dots and a log-frequency axis, so you **see the exact slice you hear.**

## Fallbacks

- **Camera denied or absent** → a **seeded procedural image** (slowly drifting
  horizontal bands + a moving bright blob, from `mulberry32(0x4184)`) is rendered
  to the same offscreen canvas and sonified identically, so the piece self-demos
  with zero permissions. An on-brand `text-destructive` notice explains the
  fallback.
- **No Web Audio** → a graceful notice; nothing crashes.

## Photosensitive safety

The scan-line is a **slow smooth drift** (a full sweep is ≥3 s), never a strobe.
There is no full-screen luminance flashing. `prefersReducedMotion()` from
`_shared/visionary/safeFlicker` slows the sweep further. Determinism is preserved:
no `Math.random` / `Date.now` / `new Date` — only `performance.now()` and the
seeded `mulberry32(0x4184)`.

## Named references

- Chen, Ryu, et al. *"Images that Sound: Composing Images and Sounds on a Single
  Canvas"* (arXiv:2405.12221).
- The spectrogram-art lineage: Aphex Twin (*"Equation"* / the ΔMᵢ⁻¹ face),
  Venetian Snares (*"Songs About My Cats"*), Nine Inch Nails.
- The **ANS synthesizer** and the photosonic tradition of reading drawn images
  as sound.

## Full teardown

On unmount / Stop: cancels `requestAnimationFrame`, stops every oscillator and
closes the `AudioContext`, stops all camera `MediaStream` tracks (no camera light
left on), and clears the video source.

## Next-cycle deepening

Swap the sine bank for a genuine overlap-add IFFT with phase reconstruction
(Griffin–Lim style) so texture becomes true broadband timbre, and let the scan
axis rotate — sweeping radially or along image gradients — so the "voice" of the
image can be steered rather than only swept.
