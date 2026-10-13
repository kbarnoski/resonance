# Photosensitive flicker safety gate

Resonance is shown on large screens to people who sit close. Nothing that could
trigger photosensitive seizures may ship. On 2026-10-13 Karel saw the particle
glow flicker (in the floral shape), and the cinematic bloom was switched off.
This gate measures flicker on filmed footage so that the glow can only come back
once a film shows it is safe.

## Standard

The core is `src/lib/safety/flicker-analysis.mjs`. It is a practical version of
a Harding-style analyser for **WCAG 2.x SC 2.3.1** ("general flash and red
flash thresholds"), **ITU-R BT.1702** and the **Ofcom** flashing-images guidance.

| Rule | Threshold |
|---|---|
| Luminance | relative luminance `0.2126R+0.7152G+0.0722B` of linearised sRGB |
| Transition | a monotonic change of ≥ 0.10 (10 % of max), where the darker state is < 0.80 |
| Flash | a pair of opposing transitions |
| Red transition | a change of ≥ 20 in `(R−G−B)×320` (negative values count as 0), where the saturated state has `R/(R+G+B) ≥ 0.8` |
| Area (WCAG, gates) | changing cells cover ≥ 25 % of any 10° visual field. The field is a 341×256 window at 1024×768 (⅓ × ⅓ of the screen), slid over the frame |
| Area (Ofcom/ITU, reported) | ≥ 25 % of the whole screen |
| Concurrency | transitions within 2 frames count as concurrent |
| **FAIL** | **> 3 general flashes or > 3 red flashes in any 1 s window** |

Frames are decoded with `ffmpeg-static` to 256 px wide at the film's native fps
(capped at 60), with no 30 fps resampling, so fast flicker does not alias away.
The analysis uses 4 px cells.

### Local flicker (WARN): the particle-shimmer metric

The standards only count flashes over large areas. Small glows that pulse
quickly fall below that area rule, but Karel can still see them and they are
unpleasant. The meter therefore tracks them as a separate, first-class metric:

- The analysis uses 8 px cells, each pooled with its 3×3 neighbourhood in
  linear light. A particle that only *moves* keeps the pooled light roughly
  constant. A glow that *pulses* changes it.
- Values are in CIE L* (perceptual lightness), so a pulse on a dark ground
  registers the way the eye sees it. A transition is ≥ 1.5 L*.
- A cell is flickering when it has ≥ 6 transitions in 1 s (≥ 3 Hz).
- Score: the % of the worst 10° field that is flickering, plus the % of the
  whole screen. The meter also reports the worst timestamp and region, and a
  per-second timeline.
- **WARN** when the field score is ≥ 10 % or the screen score is ≥ 2 %. These
  thresholds were calibrated on 2026-10-13 against show footage: every
  base/show film scored ≤ 6 %, and the bloom film of the floral shape scored 62 %.

## Run

```bash
node scripts/flicker-meter.mjs film.mp4 [--timeline] [--json] [--out=r.json]   # one file; exit 1 on FAIL
node scripts/flicker-gate.mjs  <dir-of-films> [--strict] [--json=all.json]      # table; exit 1 on any FAIL
npx vitest run src/lib/safety                                                   # synthetic-signal tests
```

## How it gates

- `flicker-gate.mjs` exits non-zero when any film FAILs the WCAG general or red
  flash rule, or cannot be read. Add it after the film rig in
  `scripts/kiosk-deploy.sh`, for example
  `node scripts/flicker-gate.mjs "$FILM_DIR" || exit 1`.
- WARN (local flicker) is printed but does not block. `--strict` makes WARN
  block too. Use `--strict` for any change to the glow, bloom or particle
  brightness, such as bringing the cinematic bloom back.
- The meter measures the film, not the GPU. Film on the kiosk GPU (headed
  rig), because headless/SwiftShader rendering does not reproduce mip-chain
  bloom stepping.
