# Hum Blossom (1033-kids-hum-blossom)

**One question:** *What if humming a note made a flower bloom in tune with you?*

A kids prototype (designed for a 4-year-old, no reading required). A child hums or
sings into the microphone. The app detects their pitch in real time, and a glowing
flower grows from a bud — petals sprout while a tone is sustained, and the petal/glow
color tracks the pitch. Meanwhile a soft 3-voice "ah" choir **answers**, harmonizing
the child's hum into a real chord underneath.

## How to play

1. Tap **"Hum to bloom 🌸"** and allow the microphone.
2. Hum a note and **hold it**. The flower's center glows, petals begin to sprout in a
   natural spiral, and the choir sings a chord beneath you.
3. Slide your voice up and down — the colors shift from warm red/orange (low notes) to
   violet/white (high notes), and the choir's chord slowly cycles through a progression.
4. No mic? It plays a gentle auto-demo hum so the flower still blooms and sings (you'll
   see a rose-colored notice that the mic is off).

## The pitch-detection technique

Pitch detection lives in the **pure, framework-free module `pitch.ts`**
(`detectPitchHz(buffer, sampleRate)`), so it can be unit-tested and reused:

- **RMS silence gate** — frames quieter than a floor return `-1` (silence never triggers).
- **Normalized autocorrelation** (a YIN-lite approach) across a candidate lag range
  derived from the target frequency band (~70–1200 Hz). Normalizing each lag by the
  energy of both windows keeps the correlation in `[-1, 1]` so the clarity gate is
  meaningful regardless of loudness.
- **First strong peak after the correlation dips below zero** — for a periodic signal the
  normalized correlation is ~1 at every multiple of the true period, so taking the
  *first* qualifying local maximum recovers the fundamental instead of an octave-down
  sub-harmonic error.
- **Clarity gate** rejects noisy/unvoiced frames.
- **Parabolic interpolation** around the peak for sub-sample (sub-Hz) accuracy.

Detected Hz is converted to a fractional MIDI note (`hzToMidi`) and lightly smoothed.

### Verification — `pitch.test.ts`

`pitch.test.ts` is **pure TS + `console.assert` only** (no test framework imported, so it
cannot break `next build`, and it does **not** auto-run at module load). It synthesizes
pure sine buffers at 220 / 440 / 880 Hz (plus G3 ~196 Hz) and asserts the detected
frequency is within ~3%, and that silence / near-silence return `-1`. Run it explicitly,
e.g. with a tiny scratch script that imports `runPitchTests()` and calls it via `tsx`.
All assertions pass.

## The harmony mapping

This is **real functional harmony**, not a "no wrong notes" pentatonic snap.

- A slowly-cycling diatonic progression **I – vi – IV – V** in C major (C → Am → F → G),
  each chord held ~3.4 s.
- The child's detected MIDI note is **snapped to the nearest chord tone** of the current
  chord (nearest pitch class, kept near the original octave).
- A soft **3-voice "ah" choir** (bandpass-filtered sawtooths with formant tracking) sings
  the current chord's voicing underneath, with gentle attack/release. Its loudness rises
  with how strongly and steadily the child sustains a tone.
- An **always-on soft ambient pad** (low C drone) holds the key.
- Master gain → **DynamicsCompressor limiter** → destination keeps everything soft with
  no loud transients.

So the child's own hum is folded into genuine functional harmony — always musical, but
real I–vi–IV–V, not a pentatonic safety net.

## What's fresh

First real-time **voice pitch-tracking → functional-harmony kids instrument** in the lab.
Four subsystems held together: (1) mic → AnalyserNode, (2) autocorrelation/YIN-lite pitch
detection, (3) functional-harmony 3-voice choir engine, (4) organic Canvas2D blossom that
grows by phyllotaxis (golden-angle petal spread) with pitch-mapped color. Plus a committed
unit test for the pitch module — the lab's verification template.

## Mic safety & privacy

The microphone connects to the **AnalyserNode only** — **never** to
`audioContext.destination` — so there is no feedback howl. Audio is analyzed on-device
in real time; nothing is recorded, stored, or sent anywhere. All timers, the AudioContext,
oscillators, the rAF loop, and the mic stream are cleaned up on unmount.

## Limits

- Monophonic pitch detection: it tracks one sung note at a time; chords/multiple voices or
  very breathy/whispered input won't track well.
- Tuned for a child/adult voice band; whistles above ~1200 Hz or very low notes below
  ~70 Hz are gated out.
- The auto-demo is a fixed slow sweep, not a recording of the user.
