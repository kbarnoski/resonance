# 15824 · Canon

**Two hands, one recording, two voices.** This deepens `15760-conduct` from a
single conducted take into **two-hand polyphonic conducting**: Karel's one real
piano take is split into two independent voices that play in counterpoint
against each other, each voice conducted by one of your hands.

## The one idea

A frequency **crossover** splits his single recording into a **bass** voice (the
low-register pad) and a **treble** voice (the melody). Two independent loop heads
read the *same* buffer, and each hand conducts the **time-base** of one voice —
your **left hand** drives the bass's `playbackRate`, your **right hand** drives
the treble's. Because your two hands move independently, his take plays in
**counterpoint against itself** — a canon of his own recording, the low pad
dragging slow while the melody pushes forward, or the reverse. The one question
it answers: *what if my two hands could pull one recording apart into two voices
that play against each other?*

## How the gesture maps

| Gesture | Parameter | Feel |
| --- | --- | --- |
| **Left-hand height** | bass `playbackRate`, bounded `0.55×…1.15×` | raise it and the pad's time moves forward; lower it and it drags slow. |
| **Right-hand height** | treble `playbackRate`, bounded `0.72×…1.4×` | the melody's independent time-base — push it against the bass to open the canon. |
| **Per-hand openness** (finger spread vs. palm) | that voice's tone lowpass, within its own band (bass `~140–1400 Hz`, treble `~900 Hz–12 kHz`) | open palm = bright/present for that voice; fist = muffled + hushed. |
| **Distance between the two hands** | overall master gain + per-voice spatial wet | hands wide = big and spacious; hands together = quiet and close. |

Every parameter is smoothed with `setTargetAtTime` (~0.11–0.14 s) so it feels
conducted, not twitching.

### Which hand is which

Hands are assigned to voices by **MediaPipe handedness** when the two hands are
labelled distinctly, and by **screen position** otherwise. The webcam preview is
mirrored (it reads like a mirror), so your left hand appears on the *right* of
the frame — both assignment paths agree that **bass is always your left hand**.
With only one hand in view, that hand conducts **both** voices together
(graceful, but no counterpoint until the second hand joins).

## Audio — his real take only, band-split

The only audible sound is Karel's decoded recording (default **Bath**, from
*Welcome Home*; any track in his verified catalog is selectable), decoded once
and routed through the shared `safeMaster` bus. Two independent
`AudioBufferSourceNode`s loop the same buffer:

```
bassSource   → LP380 → LP380 → toneLP(openness) → dry(dynamics) → master
                                        └→ delay → feedback → wet(dynamics) → master
trebleSource → HP380 → HP380 → toneLP(openness) → dry(dynamics) → master
                                        └→ delay → feedback → wet(dynamics) → master
```

The two cascaded biquads per voice approximate a **Linkwitz-Riley crossover** at
~380 Hz. There are **no oscillators, no synths, no generated tone** anywhere —
the split and everything you hear is 100% his own signal, only band-separated and
transformed (`playbackRate`, crossover + tone filters, gains, and a feedback
delay of his *own* filtered signal).

## Visual — two WebGPU compute grain clouds

Conduct's WebGPU compute-shader grain engine, now driving **two clouds**. ~20,000
grains are seeded from his waveform; the first half is the **bass cloud**, the
second half the **treble cloud**. Each cloud is advanced and scattered by a
compute pass, **swept by its own hand**, and biased toward its register (bass
settles low, treble rises high) so the two voices separate and their counterpoint
**interleaves** on screen. Both clouds sit on the same warm-chromatic ramp so
they read as *one instrument in two registers*: the bass cloud on the deep
**ember/oxblood** end, the treble cloud on the **gold → violet** end. His live RMS
energy swells both clouds' turbulence and brightness.

### Graceful fallback

- **No WebGPU** (`navigator.gpu` missing or init fails): degrades to a Canvas2D
  two-cloud render running the *identical* push/gather/register model at a lower
  grain count. Audio is never blocked on the GPU.
- **No camera / permission denied / model fails to load:** a single-pointer
  sensor stands in — pointer **X** picks the active voice (left half = bass,
  right half = treble) and sets the spread, pointer **Y** is that voice's
  conducting height, press-and-hold is a **hush**. It is degraded (one pointer
  can't drive two voices *at once*), but the inactive voice **holds its last
  rate**, so you can still build the canon voice by voice. A visible notice reads
  *"Hands unavailable — conducting with pointer."*

The webcam preview is mirrored, with the two hand markers coloured by their
assigned voice (bass = ember, treble = violet) and a faint span line between.

## Reference

- **arXiv:2604.27957**, *"Real-Time Control of a Virtual Orchestra by Recognition
  of Conducting Gestures"* — conducting is control of **time**, not loudness (the
  lineage from `15760-conduct`).
- The July-2026 real-time low-latency **music source separation** cluster —
  **arXiv:2607.12872** *"Low-Latency Neural Models for Real-Time Music
  Enhancement"* and *"Towards Practical Real-Time Low-Latency Music Source
  Separation"* — the fresh capability of splitting a recording into independent
  stems in real time. **Honest reframe:** this piece realizes the split with a
  lightweight frequency **crossover** (bass/treble bands of his take), not a
  neural model, so it is browser-real and stays 100% his audio.
- **BachDuet** — human-machine counterpoint — the "two voices conversing"
  lineage.

## Next-cycle deepening

- **True stem separation** — swap the crossover for an on-device low-latency
  source-separation model (the arXiv:2607.12872 cluster), so the two voices are a
  real *left-hand / right-hand* piano split rather than a low/high band — closing
  the gap between the honest reframe and the referenced capability.
- **A third voice** — add a mid-band voice conducted by head tilt or two-hand
  centroid, so the canon becomes a trio.
- **Recorded conducting playback** — capture a two-hand conducting pass as a
  gesture automation curve and replay it against a live second conductor, so a
  canon can be authored and then answered.
- **Onset-locked grain bursts** — detect per-voice onsets in the band-split
  signals and emit fresh grain bursts on each voice's beat, so the two clouds
  visibly pulse in their own time rather than only drifting.
