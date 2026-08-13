# 11240-datamatics — your music as raw information

## The one question

**What if your music were stripped to pure data — rendered as a strict 1-bit
black/white/red scanning bitmap and test-pattern grid, the way Ryoji Ikeda turns
sound into raw information?**

## What it does

Press **Start** and a deterministic, self-playing synth pattern begins. Its sound
is analysed with an FFT; the spectral magnitude field is quantized to **one bit**
via ordered (Bayer) dithering and painted as a hard black-and-white raster that
scrolls right→left like a data tape. Spectral-flux onsets punch sparse **pure-red**
index marks into the top/bottom margins; the strongest low-band beats fire a
hard-edged **test-pattern barcode** band. Drop a WAV/MP3 onto the running page and
it scans that file instead.

## The pipeline (1-bit dither + test-pattern)

1. **FFT.** An `AnalyserNode` (fftSize 1024, low smoothing for crisp onsets) taps
   the source. `getByteFrequencyData` gives 512 magnitude bins per frame.
2. **Log-frequency rows.** Each of the 216 raster rows maps to an FFT bin on a log
   scale (55 Hz at the bottom → 12 kHz at the top).
3. **Push a column.** At a fixed tape speed, the current spectrum is written as one
   new column into a ring buffer (a gentle γ≈0.72 lifts low-energy structure so it
   survives the 1-bit crush). New columns enter at the right; the tape scrolls left.
4. **Ordered dither → 1 bit.** For every screen pixel, an **8×8 Bayer matrix fixed
   in screen space** supplies the threshold: `white = magnitude > bayer(x,y)`. Because
   the threshold is stationary while content scrolls through it, the dither reads as a
   stable engraved data-texture instead of shimmering. This is the core technique
   (`dither.ts`, `rasterizeTape`).
5. **Red index marks.** On a spectral-flux onset the next-pushed column is flagged;
   flagged columns get pure-red (#f00) ticks in the thin top/bottom margins. Red is
   the only non-monochrome ink and it stays sparse.
6. **Test-pattern band.** Strong low-band onsets build a hard-edged barcode (variable
   bar widths, on/off biased by current spectral energy) drawn into a small horizontal
   band — Ikeda's *test pattern* barcode idiom (`drawTestBars`).

## Honest ambition (how it clears the floor)

This does **not** claim a grep-0 "first" — ordered dithering exists elsewhere in the
lab. It clears the floor on exactly two criteria:

- **#3 — borrows a NAMED living technique from a living artist.** Ryoji Ikeda
  (b. 1966, actively touring) and his works *datamatics* (2006–) and *test pattern*
  (2008–, incl. the *test pattern [Nº100]* massive-LED installations). What was
  ported, specifically: (a) the **1-bit black/white data-as-image language** — sound
  reduced to a raw scanning bitmap; (b) the **barcode / test-pattern bar sequences**
  as rhythmic punctuation; (c) the **sparse red index marks** against strict
  monochrome. The mechanism used to get there (screen-space Bayer dithering of an FFT
  field) is my own implementation of that visual language.
- **#2 — ≥3 distinct subsystems.** Four:
  1. **Seeded self-playing synth** — a mulberry32-seeded (fixed seed, *not*
     `Math.random`) 16th-note step sequencer of sine sub kicks, pure sine data blips,
     filtered-noise hats and sustained sine bass, **plus an audio-file decode path**
     (`decodeAudioData` → looped buffer). (`synth.ts`)
  2. **FFT analyser + spectral-flux onset detector.** (`page.tsx`)
  3. **Ordered-dither 1-bit rasterizer.** (`dither.ts`)
  4. **Test-pattern / red-index sequencer synced to onsets.** (`page.tsx` +
     `drawTestBars`)

## Strobe safety (critical for this piece)

Ikeda's real work flickers hard — a genuine photosensitive-epilepsy hazard — so this
port is calm by construction:

- The full frame is **never** inverted or flashed. There is no full-field luminance
  strobe anywhere.
- The "scanning" motion is **spatial scroll** of the data tape (safe), not temporal
  flashing.
- The test-pattern band is a **small area** (~16% of height) and is **rate-limited to
  ≤ ~2 Hz** (≥ 0.42 s between beats).
- Under **`prefers-reduced-motion`** the tape freezes to a slow crawl (~7 cols/s vs 84)
  and **all bar-flash is disabled**.
- An on-screen note states the motion is strobe-limited.

## Tags

- **INPUT:** audio-file. Default = seeded self-playing synth pattern (deterministic);
  drop-zone accepts WAV/MP3 → `decodeAudioData`. No mic, no tilt.
- **OUTPUT:** Canvas2D, drawn as a strict 1-bit raster via `ImageData` (backing store
  384×216, CSS-scaled with `image-rendering: pixelated`). Not WebGL / shader / SVG /
  three.js.
- **CORE TECHNIQUE:** FFT → ordered (Bayer 8×8) dither to 1 bit → scrolling datamatics
  raster + test-pattern bar sequencer.
- **PALETTE / VIBE:** high-contrast Ikeda #000 / #fff with sparse pure-#f00 index marks
  only. (Raw hex lives only inside the canvas art; all chrome uses semantic tokens.)

## Limitations

- Onset detection is spectral-flux with a simple adaptive threshold — it locks onto
  the seeded kick nicely but a dense, loud dropped track can make onsets/red marks
  denser than ideal.
- The barcode pattern is data-biased but not a literal render of any single spectral
  frame; it's a rhythmic punctuation, not an information channel you can decode back.
- Fixed `dt = 1/60` for tape advance keeps scroll speed stable but means very low frame
  rates scroll slightly slow rather than skipping.
- Audio routes through the shared safe master (high-shelf + lowpass + limiter), so the
  top end is deliberately tamed vs. Ikeda's clinical brightness — an ear-safety trade.
