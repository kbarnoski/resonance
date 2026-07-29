# 3608 · Atlas — a recording as a navigable timbre-space

**Route:** `/dream/3608-atlas`

> The one question: *What if a recording became a **place** you could walk
> through — where every grain of its sound sits at a position decided by its
> timbre, and you play the recording by moving through its own timbre-space?*

Atlas is a corpus-based concatenative-synthesis **instrument**. On load it turns
an audio buffer into a glowing GPU point cloud where each point is one ~46 ms
grain of the sound, placed by what it *sounds like*. Moving the cursor through
the cloud continuously triggers the grains nearest it — you paint sound by
location.

## What it is

Four/five real subsystems working together:

1. **Descriptor analysis** (`atlas-corpus.ts`) — slices the signal into ~46 ms
   grains and measures real spectral descriptors per grain with an inline
   radix-2 FFT and autocorrelation: spectral **centroid** (brightness), **RMS**
   loudness, a **pitch / periodicity** estimate, spectral **flatness**
   (noisiness) and spectral **spread**. Nothing is faked — every number comes
   from the audio.
2. **Descriptor → space projection** (`atlas-corpus.ts`) — maps each grain to a
   2-D point. This map *is* the instrument.
3. **k-nearest granular playback engine** (`atlas-audio.ts`) — a look-ahead
   scheduler finds the k grains nearest the cursor and triggers slices of the
   source buffer through overlapping raised-cosine (Hann) windows, weighted by
   distance, through a soft tanh clip.
4. **GPU point-cloud renderer** (`atlas-gl.ts`) — raw **WebGL2** `gl.POINTS`,
   additive `SRC_ALPHA / ONE` blending, soft `gl_PointCoord` falloff, coloured on
   the violet ramp. Grains near the cursor swell and brighten; a soft halo marks
   the cursor.
5. **File-decode corpus builder** — drop your own audio; it is decoded,
   re-analyzed, and the atlas becomes your sound.

## The descriptor → space mapping

| axis / channel | descriptor | scaling |
| --- | --- | --- |
| **x** | spectral centroid (brightness) | log2, percentile-normalized to [-0.95, 0.95] |
| **y** | pitch (autocorrelation; centroid fallback when unvoiced) | log2, percentile-normalized |
| **color t** (violet ramp) | brightness blended with loudness | dim violet → bright violet-100 |
| **point size / grain gain** | RMS loudness | 0 → 1 |

So the low, dense, warm region sits low-left; bright shimmering material sits
upper-right. Linger over the bright region for shimmer; dive low for a drone.

## How to use

- **Just watch/listen:** on load a seeded (`mulberry32(0x3608)`) auto-tour wanders
  the cloud so the granular texture evolves and you see the playhead move with no
  input. Browsers gate audio until a gesture — if it starts silent, a **Tap for
  sound** button (or any click/key) unlocks it.
- **Play it:** move the pointer over the cloud. Your first move hands over control
  (the **auto → you** badge flips) and you drive the grain triggering directly.
- **Make it yours:** drop an audio file anywhere on the page (or use *Drop your
  own audio*). It is decoded and the whole atlas is rebuilt from your material —
  same instrument, your sound.

## References (both real)

- **Diemo Schwarz — CataRT / corpus-based concatenative synthesis (IRCAM).** The
  guiding idea: *"the actual instrument is the space of sound characteristics the
  performer navigates."* Atlas is a browser take on navigating a 2-D descriptor
  space to concatenate grains.
- **TENOR 2023 — "Maps as Scores: Timbre-Space Representations."** The point cloud
  is a map that doubles as a playable score surface.

## Ambition criteria hit

- **(a) ≥3 distinct subsystems:** descriptor analysis + descriptor→space
  projection + k-nearest granular engine + WebGL2 point renderer + file-decode
  corpus builder = **five**.
- **(b) a named reference:** CataRT (Diemo Schwarz / IRCAM) **and** TENOR 2023
  "Maps as Scores."

## Tags

- **INPUT:** pointer-navigate + drop-your-own audio file
- **OUTPUT:** WebGL2 GPU point cloud (`gl.POINTS`, additive point sprites)
- **TECHNIQUE:** corpus-based concatenative / descriptor-space granular navigation
- **VIBE:** exploratory play, luminous, warm — it is *played*

## Degrades gracefully

- No WebGL2 → a friendly notice; the audio instrument still plays (the auto-tour
  keeps navigating and triggering grains).
- An undecodable dropped file → a friendly message; the current atlas is kept.

## Known rough edges

- **Big-file build cost.** Analysis is single-threaded on the main thread. The
  default ~9 s corpus (~340 grains) builds in a blink; a several-minute dropped
  file is capped at 5000 grains and the pitch search is decimated 2×, but the
  synchronous build can still stutter for a second or two (a "rebuilding" overlay
  covers it). A Web Worker + OfflineAudioContext `AnalyserNode` path would remove
  the hitch.
- **Autoplay policy.** True zero-gesture sound depends on the browser; where it is
  blocked, visuals + auto-tour run immediately and the first interaction unlocks
  audio.
- **Point-size clamping.** Very near-cursor / halo points can exceed a device's
  `gl_PointSize` range and clamp; purely cosmetic.
- **2-D projection only.** Flatness and spread are computed but not yet mapped to a
  z-axis or size channel; the cloud is 2-D.
- **No time coherence.** Grain selection is timbre-nearest, not
  sequence-preserving, so playback is texture, not the original phrase (by
  design — that is what concatenative navigation is).
