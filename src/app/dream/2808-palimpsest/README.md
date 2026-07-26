# 2808 · Palimpsest

**What if your movement drew a musical score you can see — a slit-scan
palimpsest where the camera reads your body one column at a time as a
spectrogram, past scans stack into a graphical score, and reading that score
back _is_ the sound?**

## What it is

A self-contained audio-visual prototype. The webcam is the only input. Your
movement is turned into a **graphical score** that you can both see and hear:

- The video is downsampled to a `96 × 128` grid and read like a moving
  spectrogram. **Motion** in each cell (frame-to-frame luminance difference,
  plus a whisper of luminance so a held pose still registers) accretes into a
  persistent buffer of _score energy_.
- The buffer **decays slowly**, so the score is a true palimpsest — gestures
  you drew a minute ago are still faintly present, layered under newer ones.
- A vertical **playhead** sweeps across the score (full width every ~13 s).
  Whichever column it is over is turned into sound.

## The slit-scan additive-score technique (approach C)

Reading the score back is done by an **additive synthesis bank** of 32 pure
sine partials on a warm reverb bus:

- Each partial's **frequency** is a _continuous_ logarithmic mapping of
  vertical position across a four-octave range (A2–A6): **top of frame = high,
  bottom = low**. The mapping is continuous — pitch is **never** snapped to a
  scale (no pentatonic / just-intonation quantisation).
- Each partial's **amplitude** is the score energy in that pitch band of the
  playhead's current column. So the drawn column literally _is_ the spectrum
  that sounds. As the playhead re-crosses gestures that are still in the buffer,
  they sound again — a **self-canon** of your own drawing.

The visual is deliberately Ikeda-crisp: the accreted strata rendered through a
monochrome **violet ramp**, a bright data-like playhead with a soft leading
glow, and a very faint mirrored video underlay in camera mode.

## The long-form arc

The piece is genuinely different at minute 5 than at second 0:

- **Sparse → dense.** Early on a motion gate suppresses all but strong gestures
  and accretion is gentle, so the score is sparse and literal. Over ~3 minutes
  the gate lowers and density rises, so the score fills and layers.
- **Breathing.** A slow ~95 s LFO modulates the decay rate, periodically fading
  the oldest strata so the score never fully saturates — a beginning → middle →
  end without a hard reset.
- The master lowpass opens as the score fills, so the timbre brightens and warms
  as the piece develops.

## References / lineage

- **Ryoji Ikeda** — data-crisp, high-contrast monochrome; the frame as a field
  of readable data.
- **Iannis Xenakis, UPIC** (1977) — a drawn curve on a surface becomes sound
  directly; graphical score _is_ synthesis instruction.
- **Steve Reich** — returning/phasing material; here the returning material is
  literally drawn and re-read by the sweeping playhead.

## Degrades gracefully (honest caveats)

- **Camera denied / unavailable:** a deterministic **virtual performer**
  (mulberry32 seeded `0x2808`, animated by `performance.now()`) paints smooth
  strokes into the score, so the full piece plays and self-demos with no camera.
  A small notice and a **Retry camera** button are shown. Never blank, never
  throws.
- **AudioContext** is created and resumed only after the user gesture (Start /
  Start camera). If Web Audio is unavailable the score still draws, silently.
- **Headless / SSR:** this is a `"use client"` component; all camera, canvas and
  audio work happens after mount behind a user gesture. Rendered without a
  browser there is no canvas output — it is designed to be _experienced_ live.
- No network, no npm audio/vision deps, no MediaPipe/OpenCV — Canvas2D + Web
  Audio only. All randomness routes through the single seeded PRNG; nothing uses
  `Math.random()` / `Date.now()`.

## Files

- `page.tsx` — React chrome, camera/degrade handling, the capture → accretion →
  playhead → render animation loop.
- `engine.ts` — framework-agnostic helpers: geometry constants, mulberry32,
  continuous partial-frequency mapping, the violet ramp, and the
  `PalimpsestAudio` additive bank + reverb.
