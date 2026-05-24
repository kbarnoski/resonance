# Shepard Tone — design notes

**Route**: `/dream/132-shepard-tone`  
**Cycle**: 157 (adult build)  
**Status**: demoable  
**Zero deps · Zero API · Zero permissions**

---

## The idea

A Shepard tone is a superposition of sine waves separated by octaves, each fading in at the bottom of the audible range and out at the top. Discovered by psychologist Roger Shepard in 1964. The most famous auditory illusion in music: a tone that rises (or falls) continuously without ever reaching a higher (or lower) pitch. The staircase never ends.

**What's actually happening**: 8 sine waves at A1 (55 Hz) through A8 (7040 Hz), each separated by one octave. At any moment, each oscillator's gain is controlled by a bell-curve envelope in log-frequency space, peaking around A4–A5 (the most audible range) and tapering to near-zero at the extremes. All 8 oscillators glide upward together at a constant rate. When the highest oscillator becomes inaudible at the top, its contribution to the perceived pitch is zero — and the cycle has wrapped. There's no seam because the glide is circular.

**Why it sounds like forever**: human pitch perception is logarithmic and relative. When all octave-equivalent tones (A1/A2/A3/A4/A5/A6/A7/A8) are present at once with matched amplitude and they all rise together, the ear hears "rising" without registering which octave it's in. The perception is chroma (note class: A, Bb, B...) without register (octave). The staircase goes up; the pitch class completes a loop.

---

## Implementation

```
N = 8 sine OscillatorNodes
BASE = 55 Hz (A1)
CENTER = 3.5 (octave index of bell peak, = A4/A5 boundary)
sigma = 1.55 octaves

At time t:
  phase ∈ [0, 1) = fraction of one octave traversed

For each oscillator i = 0..7:
  logOct  = i + phase
  freq_i  = 55 × 2^logOct
  d       = logOct − 3.5
  gain_i  = exp(−d² / (2 × 1.55²)) × 0.13
```

The `setTargetAtTime` exponential approach (τ = 25ms) prevents frequency discontinuities when phase wraps. Each oscillator slides continuously — no sample-accurate jumps.

**Step modes**:
- **Glide**: phase advances smoothly at `rate/60` octaves/second
- **Whole-tone**: phase snaps forward in steps of 1/6 octave (2 semitones). Creates a rhythmic quality — you hear distinct pitch classes tick upward.
- **Semitone**: steps of 1/12 octave. Slower, more deliberate, textbook demonstration.

---

## Visual design

- **8 circles, vertical stack**: A1 at the bottom (56 Hz), A8 at the top (7040 Hz). Circle size and glow intensity scale with current bell-envelope gain. Middle circles are always brightest; extremes are dim.
- **Global hue cycle**: as phase completes one octave, the color shifts from violet → rose → amber → ... → back to violet. The visual periodicity matches the audio periodicity.
- **Phase ring** (bottom-right): a small circle with a glowing dot that completes one orbit per octave traversal. Center shows current note name (A, Bb, B, C, ...). The dot is the only element that moves visibly and continuously — everything else breathes subtly.
- **RATE slider**: 0.5–30 BPM (BPM = octave traversal rate). At 0.5 BPM, one loop takes 2 minutes — deeply meditative. At 30 BPM, the descent/ascent is vertiginous.
- **Freeze**: stops phase advancement. The chord holds. Useful for demonstrating the multi-sine structure.

---

## What to listen for

1. **With headphones, close your eyes**: you'll hear the tone rise indefinitely. After 30 seconds, notice there's no sense of "how high" it is — only direction.
2. **Switch Ascending → Descending**: the immediate reversal. The phase ring's dot reverses. The brain recalibrates almost immediately — the descent illusion kicks in.
3. **Try Whole-tone at 10 BPM**: you hear distinct interval steps — like climbing a tone ladder that never reaches the top floor.
4. **Freeze**: the sound holds at a static chord of 8 octave-equivalent tones. Freeze during Ascending and you hear the "snapshot" of the illusion's current position.
5. **Raise rate to 25 BPM**: dizzying. The brain works harder to resolve pitch direction.

---

## Resonance connection

The Shepard tone is the auditory equivalent of an impossible object (Penrose stairs). Resonance's "journey" concept is also circular — the arc rises to a peak and returns, but in a way that feels like transformation rather than return. The Shepard tone demonstrates that perceptual "ascent" can be unbounded and sustainable without actual height change. That's the Resonance thesis: a listener can travel far without leaving.

---

## Polish ideas

- **Tritone paradox**: a single Shepard tone ambiguously resolves as "ascending" or "descending" depending on the listener's first language / musical culture. Two tones a tritone apart create disagreement. Could be a UI mode: "Tritone A" vs "Tritone B" — let Karel choose what he hears.
- **Glissando between modes**: smooth interpolation from Glide → Whole-tone as a slider (quantization amount 0→1). Intermediate values create partial quantization — like a pitch shifter with limited resolution.
- **Bell-curve sigma slider**: narrower sigma = only 1-2 octaves audible at once, more "pure." Wider = more octaves active simultaneously, richer but with muddier pitch percept.
- **Chord mode**: Shepard major chord (all 8 octaves of a major triad). Three sets of 8 oscillators, each a Shepard complex but tuned to a chord tone (root, M3, P5). All three rise together — an endless ascending major chord.
