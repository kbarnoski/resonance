# 7368 · vocodrift

**One question:** What if your own recording became a flowing spectral
_terrain_ you fly over — and a phase vocoder slowly stretched and drifted it,
reconstructing the sound in real time so the landscape you see is exactly the
sound you hear?

## Concept

`vocodrift` treats a piece of audio as a place. A hand-rolled short-time Fourier
transform turns the recording into a luminous violet landscape: **time** runs
into the distance, **frequency** (log-spaced) across the width, **magnitude**
into the height and brightness of the ridges. You fly slowly over it.

Then it sings the terrain back. A real **phase vocoder** reconstructs the audio
from that same spectral data — inverse-FFT + overlap-add with per-bin phase
accumulation — while a seeded drift slowly varies the time-stretch and a gentle
pitch drift rides on top. Because the playhead is mapped back from the exact
synthesis position, the picture and the sound stay locked: the ridge sliding
under you _is_ the moment you are hearing.

## How it works

All DSP is dependency-free and lives in `dsp.ts`:

1. **FFT** — an in-place radix-2 Cooley–Tukey transform (forward + inverse),
   hand-written, not an npm package.
2. **STFT** — a Hann-windowed transform, 2048-point FFT, 512-sample hop, mono.
   It keeps **both magnitude and phase** for every bin of every frame. The phase
   is what separates this from a plain spectrogram — it is the substrate the
   vocoder runs on.
3. **Terrain field** (`buildTerrain`) — the linear-frequency magnitudes are
   folded into 96 log-frequency bands and dB-scaled, giving a stable height
   field. `scene.ts` renders it in **three.js** as a displaced plane with vertex
   colours (a violet valley→ridge ramp), a faint shared-geometry wireframe, a
   glowing playhead bar, and a slow fly-over camera.
4. **Phase vocoder** (`buildReconstruction`) — the payoff. Synthesis hop equals
   analysis hop, so advancing each bin's phase by its measured instantaneous
   frequency preserves pitch regardless of stretch. A read-head walks the
   analysis frames at a **drifting rate** (seeded slow sines): faster/slower =
   time-stretch, which is what makes the terrain visibly flow. Each column is
   rebuilt with a Hermitian-symmetric inverse FFT and Hann overlap-add
   (normalised by the window-squared sum). A light resampling layer
   (`playbackRate`) adds the gentle **pitch drift** on top.
5. **Alive on load** — with no file, a deterministic internal "recording"
   (`makeDefaultRecording`: a seeded additive-synth pentatonic piano phrase) is
   synthesised straight into a `Float32Array`, analysed, and the terrain flies
   silently from first paint. **Begin** opens the live `AudioContext` (autoplay
   policy) and starts the resonification.

## Controls

- **Begin — reconstruct + resonify** — opens audio and starts the drifting
  phase-vocoder reconstruction of the current recording.
- **Drop your own recording** — drag a file onto the page or use the button.
  Decoded via `OfflineAudioContext` (no gesture needed), downmixed to mono, and
  analysed (first 30 s). If audio is already running, the reconstruction swaps
  live. _Karel can drop a Path piano track here._
- **Read the design notes** — in-page dialog mirroring this README.

## Named references

- Flanagan, J. L. & Golden, R. M. — "Phase Vocoder", _Bell System Technical
  Journal_, 1966. (The original.)
- Dolson, M. — "The Phase Vocoder: A Tutorial", _Computer Music Journal_, 1986.
  (The analysis/modify/synthesis loop and phase-advance maths used here.)
- Laroche, J. & Dolson, M. — "Improved Phase Vocoder Time-Scale Modification of
  Audio", _IEEE Trans. Speech and Audio Processing_, 1999. (Phase-locking for
  cleaner stretches; we use standard accumulation, phase-locking is a noted
  future step.)

## The honest ML-vs-non-ML note

The research anchor **arXiv 2608.03032, "DDSynth-RL: Audio Synthesizer Inversion
via Discrete Diffusion" (5 Aug 2026)** is a modern _machine-learning_ approach
to reconstructing/transforming a target sound — it inverts a synthesiser with a
learned discrete-diffusion model. `vocodrift` is deliberately the **classic,
non-ML analog**: a 1966-lineage signal-processing algorithm with no learned
model, no training, no network. Same goal (reconstruct and transform a target
sound), opposite method. Both are cited so the contrast is explicit.

## Known limitations

- Dropped files are analysed for their first **30 seconds** to stay responsive
  on the main thread; longer tracks are truncated for the terrain and the
  reconstruction.
- The reconstruction is rendered once at **Begin** (or file swap) and looped —
  the drift is baked deterministically, not re-rolled per loop. This keeps
  playhead sync exact and the piece deterministic.
- Pitch drift uses resampling (`playbackRate`), which nudges duration slightly;
  a bin-shift pitch stage would decouple it fully. Standard phase accumulation
  is used rather than Laroche–Dolson phase-locking, so hard transients can
  smear a little under large stretches.
- If WebGL cannot start (or the context is lost), the page shows a
  `text-destructive` notice rather than a blank canvas.

## Determinism & safety

No `Math.random`, no `Date.now`, no `new Date()`. The one PRNG is
`mulberry32` seeded from `0x7368`; all timing comes from `performance.now()`,
the audio clock, and frame indices. `prefers-reduced-motion` calms the camera,
stops the pitch drift, and shrinks the stretch drift. Luminance changes are slow
and strobe-safe. Full teardown on unmount: rAF cancelled, audio stopped and
`AudioContext.close()`d, nodes disconnected, three.js geometries/materials
disposed, `renderer.dispose()` + `forceContextLoss()`, listeners removed.
