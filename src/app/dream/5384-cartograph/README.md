# 5384 — Cartograph · design notes

**Route**: `/dream/5384-cartograph`
**Status**: demoable

## The question

> "What if you could **see the hidden architecture** of a piece of music — where
> it repeats, where it turns, where its sections begin — as a self-similarity
> heat-map, and click any point to hear that moment?"

Almost every other prototype in the lab treats music as something to *paint*.
Cartograph changes the verb to *understand*: it renders a song's **form** — its
repeats and sections — as a picture you can read, and lets you click into it.

## What you see

- A time×time **self-similarity matrix (SSM)** of the audio's harmonic content,
  drawn as a violet heat-map on near-black. Bright off-diagonal stripes are
  **repeated passages**; bright square blocks are **sections**.
- Thin **boundary crosshairs** on both axes at each detected section start.
- A **Foote novelty curve** beneath the matrix, with the picked boundary peaks
  marked.
- A linear **timeline** of section blocks — repeated sections share a colour and
  letter (A, B, C …) — with boundary ticks and mm:ss labels.
- A **playhead**: a dot travelling the main diagonal plus a cursor on the
  timeline. On load it auto-sweeps so a silent, no-interaction review is never
  blank; audio starts only on the Start button (autoplay policy).

Click anywhere on the matrix diagonal or the timeline to **seek** playback.

## How it works (all hand-written in `analysis.ts`, no npm deps)

1. **Decode → mono → decimate** to ~11025 Hz.
2. **STFT** — a from-scratch radix-2 Cooley–Tukey **FFT**, Hann window, frame
   4096 (~0.37 s), hop = frame/2.
3. **Chroma** — fold FFT magnitude bins into 12 pitch classes
   (log-freq → MIDI pitch → pc = mod 12), L2-normalize each frame, light
   temporal smoothing.
4. **Frame-decimate** to ≤ 256 feature vectors so the O(N²) matrix stays
   sub-second.
5. **SSM** — cosine similarity between every pair of chroma frames, then a small
   **main-diagonal-direction smoothing** to sharpen repeated-path stripes.
6. **Key-invariant matching (the deepening)** — when comparing frames *i* and
   *j* we take the **max cosine over all 12 cyclic rotations** of one chroma
   vector (the **Optimal Transposition Index**). A repeat in a *different key*
   still lights up. This is the concrete advance over a naive same-key SSM, and
   the demo is built to show it off.
7. **Novelty (Foote 2000)** — a Gaussian-tapered **checkerboard kernel** is
   correlated along the diagonal to produce novelty[t]. **Adaptive peak-picking**
   (peaks above local mean + k·std, minimum distance apart) yields the section
   boundaries. Segments are then matched to earlier ones (again key-invariantly)
   so returns share a label/colour.

Rendering (`render.ts`) is **Canvas2D only** — no WebGL/three.js. Playback
(`audio.ts`) uses the Web Audio API: a fresh `AudioBufferSourceNode` per seek →
gain 0.3 → a `DynamicsCompressor` limiter → destination, plus a short blip when
the playhead crosses a boundary.

## The built-in demo

`demo.ts` renders a deterministic ~49 s piano-ish piece offline with
`OfflineAudioContext`, seeded by `mulberry32(0x5384)`. Its form is:

```
A   A'   B   A↑(+5)   C   B   A
```

The fourth section is section **A transposed up a perfect fourth**. In the map
you can see the A blocks all cross-correlate — *including* the transposed one —
because matching is key-invariant. That off-diagonal stripe to a differently-keyed
repeat is exactly what a same-key SSM cannot draw.

## Audio sources

1. **Built-in demo** (primary, no network, auto-analyzed on load).
2. **Drop a file** — `decodeAudioData` → analyze.
3. **Try a Path recording** (best-effort) — fetches a real piano take via
   `/api/audio/…`; on any error it shows a note and keeps the demo.

## References

- Jonathan Foote, *Visualizing Music and Audio using Self-Similarity*, ACM
  Multimedia 1999.
- Jonathan Foote, *Automatic Audio Segmentation using a Measure of Audio
  Novelty*, IEEE ICME 2000.
- Meinard Müller, *Fundamentals of Music Processing* (FMP) — chroma features,
  self-similarity matrices, and novelty-based segmentation chapters.

## What I'd deepen next

- **Path enhancement** of the SSM (forward/backward diagonal filtering, Müller &
  Kurth) for cleaner repeat stripes on noisy real recordings.
- **Transposition-aware repeat tracking** that reports the *interval* of each
  key-shifted repeat, not just that one exists.
- A **structure-features / novelty-hierarchy** view to segment at multiple time
  scales (phrase vs. section), and CENS-style smoothing for tempo robustness.
