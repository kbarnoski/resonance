# Diatonic Harmony — design notes

**Route**: `/dream/51-diatonic-harmony`  
**Cycle**: 62 · **Status**: demoable  
**Question**: what if every note you played automatically gained its correct diatonic harmonies?

---

## What it does

Mic input → autocorrelation pitch detection → key detection via Krumhansl-Kessler profile correlation → for each detected note, compute the diatonic third and fifth above → play them as sine oscillators and render all three as colored bars in a scrolling piano roll.

- **Melody** (warm orange): what you actually played
- **Third voice** (light blue): the scale-correct third above each note, panned left −28°
- **Fifth voice** (deep blue): the scale-correct fifth above each note, panned right +28°

## How the harmony voices work

Given a detected note and a key, the algorithm:
1. Reduces the note to a pitch class (0–11)
2. Finds the nearest scale degree in the detected key's scale
3. Steps up 2 scale degrees (third) and 4 scale degrees (fifth)
4. Converts scale steps back to semitone intervals, accounting for octave wraps

This means the intervals vary by scale degree, as a real arranger would write them:
- Scale degree 1 in C major (C): third = +4 semitones (E, major third), fifth = +7 (G, perfect fifth)
- Scale degree 2 (D): third = +3 semitones (F, minor third), fifth = +7 (A, perfect fifth)
- Scale degree 7 (B): third = +3 semitones (D, minor third), fifth = +6 (F, **diminished** fifth)

The diminished fifth on the leading tone is characteristic of tonal harmony — it's what makes resolution to the tonic feel inevitable.

## Key detection

Accumulates a 12-bin chroma vector from detected pitch classes. After 3+ notes, correlates against Krumhansl-Kessler major and minor profiles for all 12 roots. The highest-scoring root + mode wins. Updates on every new note onset. In demo mode, C major is pre-seeded (the Bach fragment is BWV 772 in C major — no need to detect it).

## What makes this different from `23-pitch-harmonize`

`23-pitch-harmonize` pitch-shifts the raw mic signal by a fixed interval — always a fifth, always the same number of semitones regardless of scale degree. The harmony is mechanically correct (always a P5) but tonally naive — it treats every note identically.

`51-diatonic-harmony` detects the key and generates *scale-correct* voices. Different scale degrees get different interval sizes (M3 vs m3, P5 vs dim5). This produces chord-appropriate harmony: playing D in C major gives F above it (not F♯), which is correct for the subdominant. This is what a second voice in a Bach invention does.

## Demo mode

Bach Invention No.1 in C major (BWV 772, same fragment as `22-code-score` and `24-piano-roll`). The melody plays audibly as a soft triangle wave. Harmony voices play at the same time as sine tones. The piano roll shows all three voices simultaneously. Visually: orange melody + light blue third + deep blue fifth, each at their correct MIDI pitch position on the same staff.

The opening phrase (C-D-E-F-G-A-B-C) is a rising C major scale. Watch the harmony bars: the third above C is E (+4 semitones), the third above D is F (+3 semitones), the third above E is G (+3 semitones), etc. — three different colors of blue, but all landing on the correct diatonic pitches.

## Architecture

- Pitch detection: `detectPitch()` — same autocorrelation as `13-piano-canvas`, `24-piano-roll`, `26-score-follow`, `33-aria-companion`. FFT size 4096.
- Key detection: `detectKey()` — KK-profile dot-product correlation, runs on every note onset.
- Voice computation: `computeDiatonicVoices()` — pure function, no state, handles octave-boundary wraps.
- Harmony audio: inline `startHarmony`/`stopHarmony` inside the render `useEffect`. Two `OscillatorNode` → `GainNode` (150ms attack) → `StereoPannerNode` → destination. On note release: 400ms fade via `linearRampToValueAtTime`.
- Piano roll: same Canvas2D approach as `24-piano-roll`. Three-color note bars. Piano key sidebar highlights active pitch.
- Note bar colors: additive blending (`globalCompositeOperation = "lighter"`) so overlapping harmony voices glow brighter where they coincide.

## Polish ideas for future cycles

- **Chord name overlay**: run `28-chord-canvas`-style template matching over the last 3 notes + their voices → show the harmonic function ("V7 in C", "ii in G") as text.
- **Three-part score export**: PNG of the piano roll with voice labels, same as `13-piano-canvas` download.
- **Voice doubling**: add a third harmony voice (diatonic 6th or 7th above) for fuller 4-part texture.
- **Voice leading mode**: when the key shifts, smooth the harmony voices to the nearest chord tone rather than snapping — avoids parallel motion artifacts.
- **NEURAL_PITCH upgrade**: when Karel OKs CREPE-tiny ONNX, swap `detectPitch` for the shared neural hook — would improve accuracy on sustained piano notes with heavy harmonic content.
