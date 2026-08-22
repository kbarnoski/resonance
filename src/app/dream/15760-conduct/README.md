# 15760 · Conduct

**You don't press play — you conduct.** Karel's real piano take is the orchestra;
your two hands are the baton.

## The one idea

Conducting is control of **time**, not just loudness. Your conducting hand's
height drives the *time-base* — the actual `playbackRate` of one of Karel's real
recordings — in real time, so raising the baton pushes his music forward, faster
and brighter, and lowering it draws the phrase out. This is the load-bearing
gesture; dynamics and timbre ride on top.

## How the gesture maps

| Gesture | Parameter | Feel |
| --- | --- | --- |
| **Conducting hand height** (the raised hand) | `playbackRate` / time-base, bounded `0.72×…1.35×` | higher = time moves forward, faster + brighter; lower = drawn-out. The dominant gesture. |
| **Distance between the two hands** | mix/master gain **and** the spatial wet amount (a feedback delay of his own signal) | hands wide = big, loud, spacious; hands together = quiet, close, dry. |
| **Hand openness** (finger spread vs. palm scale) | lowpass cutoff, `~520 Hz … ~12 kHz` | open palm = bright and present; closed fist = muffled and intimate. |

Every parameter is smoothed with `setTargetAtTime` (~0.11–0.13 s) so it feels
like conducting, not twitching.

## Reference

Anchored in **arXiv:2604.27957**, *"Real-Time Control of a Virtual Orchestra by
Recognition of Conducting Gestures"* (April 2026): the finding that a conductor
drives the ensemble's **time-base / tempo**, not merely its volume. Here the
"virtual orchestra" is Karel's own recording, and the gesture recognizer is
MediaPipe HandLandmarker.

## Audio — his real take only

The only audible sound is Karel's decoded recording (default **Bath**, from
*Welcome Home*; any track in his verified catalog is selectable). It is decoded
once and routed through the shared `safeMaster` bus:

```
AudioBufferSourceNode (loop) → lowpass (openness) → dry gain (dynamics) → master
                             → lowpass → DelayNode → feedback gain → (back to delay)
                                                   → wet gain (dynamics) → master
```

No oscillators, no synths, no generated tone anywhere — the hands only
**transform** his buffer (`playbackRate`, filter cutoff, gains, and a feedback
delay of his *own* filtered signal).

## Visual — WebGPU compute grain cloud

~20,000 luminous grains are seeded from his waveform (each grain carries an
amplitude sample of his take as its timbre/colour), then advanced and scattered
every frame by a **WebGPU compute shader**. Where your hands are in the frame,
the grains are pushed outward and swept in a conductor's arc — you sculpt the
field, it is not a passive thing you watch. His music's live RMS energy swells
the cloud's turbulence and brightness. Palette is warm chromatic: near-black →
oxblood → ember → gold → violet.

### Graceful fallback

- **No WebGPU** (`navigator.gpu` missing or init fails): the visual degrades to a
  Canvas2D grain render running the *identical* push/gather/turbulence model at a
  lower grain count. Audio is never blocked on the GPU.
- **No camera / permission denied / model fails to load:** a single-pointer
  sensor stands in — pointer **X** = hand-spread (dynamics), pointer **Y** =
  conducting height (time-base), press-and-hold = a **fist** that closes the
  sound. A visible notice reads *"Hands unavailable — conducting with pointer."*
  The piece is fully demoable with just a mouse.

The webcam preview is mirrored so it reads like a mirror, with hand-center and
two-hand-span markers drawn over it.

## Next-cycle deepening

- **Two independent voices** — let each hand conduct a separate layer (e.g. left
  hand a slowed harmonic pad from his low register, right hand the melody's
  time-base), so the two hands play against each other.
- **Recorded conducting playback** — capture a conducting pass as a gesture
  automation curve and replay it, so a performance can be authored and revisited,
  or two conductors layered.
- **Beat-synced grain emission** — detect onsets in his take and emit fresh grain
  bursts on the beat, so the cloud visibly pulses with his playing rather than
  only drifting.
- **Spectral grains** — seed grain colour from a per-frame FFT band rather than a
  static waveform sample, so the cloud's hue tracks his harmony as it moves.
