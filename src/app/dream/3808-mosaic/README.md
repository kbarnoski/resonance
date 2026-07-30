# 3808 · Mosaic — a recording that sings back another sound

**Route:** `/dream/3808-mosaic`

> The one question: *What if a recording could **resynthesize** another sound —
> you feed it a target (your voice via mic, or a dropped second recording), and
> it reconstructs that target's melody/phrase out of the **first** recording's
> **own** grains, temporally coherent so it rebuilds the* phrase *, not just a
> texture wash?*

Mosaic is a real-time **audio-guided concatenative musaicing** instrument. A
corpus recording (the "instrument") is sliced into ~46 ms grains placed in a 2-D
timbre-space; a **target** signal then drives which grains play, and a tunable
**transition prior** keeps the choices temporally coherent so the corpus rebuilds
the target's *phrase*. You watch the reconstruction carve a live path through the
GPU point cloud, and you hear the corpus "singing" the target.

## What it is

Five real subsystems working together (all self-contained in this folder):

1. **Descriptor analysis** (`mosaic-corpus.ts`) — slices the corpus into ~46 ms
   grains and measures real spectral descriptors with an inline radix-2 FFT +
   autocorrelation: spectral **centroid** (brightness), **RMS** loudness, a
   **pitch / periodicity** estimate, spectral **flatness** and **spread**.
2. **Shared feature space** (`mosaic-corpus.ts`) — each grain becomes a
   normalized 5-D **feature vector** (`[centroid, pitch, flatness, spread, rms]`,
   percentile-normalized) *and* a 2-D atlas position (x = brightness, y = pitch).
   The exact same extraction + normalization is applied to target frames, so
   target and corpus live in one comparable space — that is what lets one sound
   be reconstructed from the other.
3. **Target analysis** (`mosaic-target.ts`) — a target is windowed into frames
   with the same descriptors. Three sources: the seeded **auto** melody and
   **dropped files** are pre-analyzed into frame arrays; the **mic** is analyzed
   live from an `AnalyserNode` (time-domain RMS + autocorrelation pitch, plus
   frequency-domain centroid / flatness / spread).
4. **Concatenative musaicing engine** (`mosaic-audio.ts`) — the load-bearing new
   subsystem. For each grain step it scores every corpus grain and plays the
   argmin, then triggers slices of the corpus buffer through overlapping Hann
   windows and a soft tanh clip. The matcher is wall-clock driven so the visual
   path animates even with no audio unlocked; audio attaches lazily on a gesture.
5. **GPU point-cloud renderer with a live path** (`mosaic-gl.ts`) — raw
   **WebGL2** `gl.POINTS`, additive `SRC_ALPHA / ONE` blending: the dim corpus
   field, a fading **comet trail** of recently-chosen grains, a bright
   **playhead** at the grain sounding now, and a cool **target ring** marking
   where the observation "wants" to be.

## The descriptor → space map + the matcher

Each grain `s` carries a normalized feature vector `feats[s]`. For each target
frame with feature vector `f` the matcher computes, over **all** corpus grains:

```
score(s) = timbreDist(f, feats[s])                      // weighted Euclidean
         + coherence · WEIGHT · transitionCost(s, last+1)
transitionCost(s, expected) = min(1, |s − expected| / JUMP_SCALE)
```

and plays `argmin_s score(s)`, then sets `last = s`.

- **coherence = 0** → the transition term vanishes → pure nearest-timbre grain
  selection. This is exactly Atlas's behaviour: a scattered **texture** that
  matches moment-to-moment timbre but not the phrase.
- **coherence → 1** → the transition term dominates → the pick is pushed toward
  `last + 1`, the grain that sequentially follows the last one played. Playback
  marches through the corpus in order, so the corpus's own contour is preserved
  and the target's **phrase** is rebuilt.

Corpus indices are the **hidden states**, the target frame is the **observation**,
and the transition prior is the **transition model** — a deliberately simple,
greedy (argmin) reduction of the Bayesian formulation below. The `jump` read-out
in the HUD shows `|chosen − expected|` for the last pick, so the texture↔phrase
shift is legible even with the sound off (jump large at coherence 0, ≈1 near 1).

The coherence control is a slider **and** the `←` / `→` arrow keys (0 → 1).

## References (both real)

- **Tralie, Kitchen & Tralie — "The Concatenator: A Bayesian Approach to Real
  Time Concatenative Musaicing," arXiv:2411.04366 (2024).** Corpus grains as
  hidden states, the target as an observation stream, and a tunable transition
  prior that controls how strongly to prefer sequential grains so the
  resynthesis rebuilds phrases rather than nearest-timbre dust. Mosaic implements
  a greedy per-frame version of this (no full particle filter) whose transition
  prior is the "coherence" slider.
- **Zils & Pachet — "Musical Mosaicing," DAFx 2001.** The origin of audio
  mosaicing: reconstructing a target sound from a database of grains by
  descriptor matching under continuity/sequence constraints.

## How to use

- **Just watch/listen:** on mount a seeded (`mulberry32(0x3808)`) auto target — a
  synthetic melody — drives the matcher immediately, so the playhead traces a
  coherent path with no input. Browsers gate audio until a gesture; **Tap for
  sound** (or enabling the mic) unlocks it.
- **Move the coherence slider** (or `←` / `→`): watch the path go from scattered
  jumps (texture) to a smooth sequential sweep (phrase), and hear the output
  follow.
- **Use your voice (mic):** hum or speak a melody; the corpus sings it back. The
  first mic-enable or file-drop flips the **auto → you** badge.
- **Drop a recording:** it becomes the *target* (the melody to resynthesize); the
  default corpus stays the instrument.

## Tags

- **INPUT:** mic / dropped-audio **target** (not a pointer)
- **OUTPUT:** WebGL2 GPU point cloud + live reconstruction path / playhead
- **TECHNIQUE:** audio-guided concatenative musaicing with a temporal-continuity
  (transition) prior
- **VIBE:** uncanny, luminous — a recording sings back another sound

## Degrades gracefully

- **No WebGL2** → a friendly `text-destructive` notice; the audio mosaic still
  runs (the seeded auto target keeps driving the matcher and triggering grains).
- **Mic denied** → a `text-destructive` notice; the auto target keeps the mosaic
  running.
- **Undecodable dropped file** → a friendly message; the current target is kept.
- **Audio not yet unlocked** → visuals + matcher run immediately; the first
  gesture attaches and resumes the `AudioContext`.

## How it deepens 3608-atlas

Atlas turns a recording into a navigable timbre-space you **play with a cursor**,
but its documented limitation is: *"No time coherence — grain selection is
timbre-nearest, not sequence-preserving, so playback is texture, not the original
phrase."* Mosaic reuses Atlas's descriptor analysis and WebGL2 point-cloud
approach (adapted, not imported) and adds exactly the missing piece: the driver
is a **target** signal instead of a cursor, and a **transition prior** makes grain
selection sequence-preserving on demand. Setting coherence to 0 recovers Atlas's
texture; raising it rebuilds the phrase — the limitation becomes a control.

## Known rough edges

- **Greedy, not Bayesian.** The matcher is a per-frame argmin, not the paper's
  particle filter. It cannot recover from a locally-good-but-globally-wrong pick
  the way a full posterior would; at mid coherence it can briefly "stick" in a
  corpus region. Good enough to make the texture↔phrase axis clearly audible.
- **Mic feature drift.** Mic descriptors come from an `AnalyserNode` (dB spectra,
  a different window than the corpus's Hann FFT). Percentile normalization mostly
  absorbs the mismatch, but a very different room/level can bias matches; there is
  no per-session mic recalibration yet.
- **Main-thread analysis.** A long dropped file is analyzed synchronously (a
  "rebuilding" overlay covers it). A Web Worker would remove the hitch.
- **Fixed 1× reconstruction rate.** Grains step at the corpus hop, so the target
  is reconstructed at the corpus's own tempo, not time-warped to the target's.
- **Autoplay policy.** True zero-gesture sound depends on the browser; where it is
  blocked, visuals + the auto target run immediately and the first gesture unlocks
  audio.
