# 14096 · Song Wheel

**Play your recording's own form.** One of Karel's real solo-piano takes, laid out
as a radial clock: its auto-detected **sections** are the colored arcs on the rim,
glowing chords cross the interior to link the bars that **rhyme**, and a playhead
orbits the current moment. Click an arc to loop a section, follow a chord to a
distant echo, or let it wander — and **every leap is snapped to the downbeat, so it
always lands in time.**

This is the DEEP-mode sibling of **14048 Rhyme Loom**, exploring the same "play your
song by its own echoes" idea through a *different geometry*. Rhyme Loom laid the
self-similarity matrix flat as a square heat-map you leap around; its leaps landed
mid-phrase (frames were fixed-length, not beat-aligned) and it had no sense of the
song's larger structure. Song Wheel is the **radial, section-aware, beat-locked**
realization: it tracks beats and downbeats, groups them into bars, segments the
piece into lettered sections, and only ever leaps *at* a downbeat, *to* a downbeat.

## The one question

> What if your own recording's FORM became a wheel you can play — the song as a
> radial clock where sections are colored arcs on the rim, glowing chords connect
> the bars that rhyme, a playhead orbits, and you can jump / loop / wander forever
> between rhyming beats — every leap snapped to the downbeat so it lands in time?

## Pipeline (classic MIR, hand-rolled — no synth; every sound is Karel's audio)

Computed once per track load, off the main thread's critical path (the analysis
loop yields to the event loop between chunks so the UI never freezes):

1. **Decode → decimate** to mono ~11 kHz for analysis; the full-rate buffer is kept
   for playback.
2. **Onset novelty** — a hand-rolled iterative radix-2 **FFT** (1024-pt window,
   512-sample hop) → half-wave-rectified **spectral flux** per frame → normalized
   novelty curve. Onsets are peak-picked with an adaptive local threshold and a
   minimum spacing.
3. **Tempo** — **autocorrelation** of the novelty curve over the 55–165 BPM lag
   range. If the autocorrelation peak is weak (Karel plays deeply rubato), the grid
   falls back to the **median inter-onset spacing** and the lock is honestly
   labelled **"loose."**
4. **Beat grid** — a phase-aligned metronomic grid (offset chosen to maximize
   novelty energy on the beats), each beat **snapped to the nearest onset** within a
   tolerance window so it tracks rubato. Beats are grouped into **bars** of 4 (or 3,
   toggleable); the downbeat phase is the one that lands on the strongest beats.
5. **Beat-synchronous chroma** — a hand-rolled **Goertzel** filter bank (60
   semitone bins, C2–B6) computes a 12-D L2-normalized chroma vector on a fixed
   0.25 s grid; each **bar's** chroma is the average of the frames inside it. (The
   fixed grid means BPM / meter nudges only *re-bin* — they don't recompute chroma,
   so they're instant.)
6. **Self-similarity** — `S[i][j] = cosine(chroma_i, chroma_j)` over bars.
7. **Section boundaries** — **Foote's checkerboard-kernel novelty**: a
   Gaussian-tapered checkerboard kernel is correlated along S's diagonal → a novelty
   curve → adaptive peak-pick (threshold + minimum spacing) → boundaries. Sections
   are then **clustered by mean chroma** so a returning theme reuses its letter
   (A / B / C…). These become the **rim arcs**, sized by duration, colored by
   cluster (cool-violet shades).
8. **Rhyme edges** — per bar, the top-K most-similar *other* bars (excluding trivial
   neighbors). The strongest across the whole track are drawn as **glowing chords**
   bowed through the wheel's center, brightness ∝ similarity. Because bars begin on
   downbeats, every rhyme endpoint is already a downbeat.
9. **Gapless beat-quantized scheduler** — a ~100 ms look-ahead scheduler plays the
   real buffer **bar by bar** (`createBufferSource` + `start(when, offset, dur)` +
   ~20 ms equal-power crossfades; **never** `source.loop`). A leap sets a pending
   target that takes effect at the *next* bar boundary and lands on a matched
   downbeat — always in time. The playhead orbits the rim in real time, driven by
   the audio clock.

Everything is routed through `_shared/visionary/safeMaster` (ear-safety limiter);
visuals read its analyser for a subtle center bloom. Audio comes only from Karel's
verified catalog via `_shared/welcomeHome` (`COLLECTIONS` / `REAL_TRACKS` /
`loadRealTrackBuffer`).

## Controls (the "play")

- **Play / Pause** (or spacebar) · **Track picker**, grouped by album.
- **Click a rim section arc** → jump to it (bar-quantized). Turn on **Loop section**
  to keep it cycling within that section's bars.
- **Hover / click a rhyme chord** → leap along it to the matching bar at the next
  downbeat.
- **Leap (J)** → jump to a rhyme of the current bar.
- **Auto-wander** → an endless coherent orbit that occasionally follows a rhyme to a
  distant section, with a short anti-repeat memory.
- **Coherence slider** → smooth (only the closest match) ↔ surprising (wider pool of
  rhymes).
- **BPM − / +**, **×2 / ÷2** (octave-error fix), **4/4 ↔ 3/4** → re-seat the beat
  grid and bars if the auto-lock looks off.

## References & lineage

- **Jonathan Foote**, *"Automatic Audio Segmentation Using a Measure of Audio
  Novelty"*, IEEE ICME 2000 — the checkerboard-kernel novelty used for section
  boundaries (and his 1999 self-similarity-matrix work underneath it).
- **Paul Lamere**, *"The Infinite Jukebox"*, 2012 — playing a fixed recording
  forever by jumping between beats that sound alike.
- **14048 Rhyme Loom** — the flat-matrix sibling this piece is a direct answer to;
  Song Wheel adds beat/downbeat tracking, section segmentation, and radial layout.

## Honest limitations

- **Beat tracking on rubato solo piano is hard.** Karel's playing has soft, elastic
  tempo, so the metronomic grid can drift within a phrase even with onset-snapping.
  When the autocorrelation peak is weak the lock is labelled **"loose"** and the grid
  falls back to median onset spacing. The **BPM nudge**, **×2 / ÷2**, and **meter
  toggle** exist precisely so you can re-seat the bars by ear — expect to use them.
- **Sections are approximate.** Foote novelty on bar-level chroma finds *harmonic*
  boundaries; it can over- or under-segment quiet, gradual passages, and the letter
  clustering (mean-chroma cosine threshold) can occasionally split a theme that
  drifts in register or merge two that share a chord. It reads as a sketch of the
  form, not a definitive score.
- **Chroma is piano-only and octave-folded**, so two passages in the same key but
  different character can look more alike than they sound; a rhyme leap is always
  *harmonically* plausible but not always *texturally* seamless.
- **Leaps are downbeat-quantized, not phrase-aware.** They land in time, but a leap
  can still cross into a passage of very different dynamics.
- **Renderer:** pure **SVG** (no WebGL / three.js), chosen deliberately for zero GPU
  render risk — it degrades to nothing exotic and needs no fallback. The heavy
  analysis is plain typed-array math in the main thread, chunked with `await`
  yields; on a very long track the first build takes a few seconds (progress is
  shown). This was written and linted headless — the visual/audio result could not
  be verified by ear or eye in this environment, so timing feel and segmentation
  quality on each specific track are **unverified**.
