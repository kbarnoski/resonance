# 393 — Vowel Mirror

**The one question:** What if your voice had a *color* — and a 4-year-old could discover that "aaah", "eee", and "ooo" each paint the whole screen a different living color, then hear the machine sing the vowel back?

## How to use

1. Tap **Start** and allow microphone access.
2. Make a long, sustained vowel sound: **aaah**, **eee**, **iii**, **ooo**, or **uuu**.
3. Hold the sound — the screen will morph to that vowel's color as the machine recognises it.
4. The machine sings the vowel back to you through formant-filtered just-intonation tones.
5. Try switching between vowels and notice how the color and face react.
6. If microphone access is denied, an attract-mode demo cycles through all vowels automatically.

No reading required. No wrong answers. Just your voice painting with color.

---

## References

- **Peterson, G. E., & Barney, H. L. (1952).** Control methods used in a study of the vowels. *Journal of the Acoustical Society of America*, 24(2), 175–184.
  Used for canonical vowel centroid coordinates: the (F1, F2) pairs that define each vowel's position in acoustic space.

- **AURORA formant-to-tongue inversion model** (arXiv:2603.17543, March 2026).
  A real-time formant-biofeedback system whose key design lesson is that raw formant numbers are too abstract for most users — the system therefore shows a friendlier *proxy*. This prototype takes that lesson literally: for a 4-year-old, the proxy is **color**, not a chart.

---

## Design notes

### 1. The magic moment
The discovery that "aaah" (warm red-orange) and "ooo" (deep blue-violet) are perceptually distinct enough to be reliably different colors — and that the color actually *changes* when you consciously shift your mouth shape — is the moment the toy works. Children don't need to know what a formant is; they just need to feel that their mouth has a color knob.

### 2. How formant detection works (and how rough it is)
The system takes a 2048-point FFT, converts dB magnitudes to linear, applies a 5-bin box-kernel smooth, then finds the peak bin in F1 (250–900 Hz) and F2 (900–2800 Hz) windows independently. Parabolic interpolation gives sub-bin frequency accuracy. The (F1, F2) pair is classified by Bark-scale Mahalanobis distance to Peterson–Barney centroids, and a softmax gives a confidence score. All estimates are exponentially smoothed (α ≈ 0.15) to prevent strobing.

**Honest assessment of robustness:** FFT peak-picking without LPC or HPS is approximate. The fundamental frequency and its harmonics create competing peaks, and the "correct" formant peak is whichever harmonic happens to land in the right band. For adult male voices with a fundamental around 100–130 Hz, the harmonic spacing is roughly 100–130 Hz — fine enough that at least one harmonic usually falls near the real formant. For children (F0 ≈ 200–300 Hz) and high female voices, harmonic spacing is wider and the method is noticeably less reliable, particularly for F1 of high vowels like /i/. A real production system would use LPC or the cepstral/HPS method. In practice, the toy works well enough for sustained vowels — especially "aaah" vs "ooo" — which are the most distinct and child-accessible sounds.

### 3. Tonal world
The sing-back uses a **just-intonation major triad on A3**: A3 = 220 Hz, C#4 = 275 Hz (ratio 5/4), E4 = 330 Hz (ratio 6/4). This is intentionally *not* D-Dorian or C-major pentatonic (overused in this lab). The JI tuning gives clean, pure-feeling intervals. The ambient pad uses the same triad plus a sub-octave A2 = 110 Hz for body. Vowel character is shaped by routing the oscillator stack through two bandpass filters tuned to the detected F1 and F2, so the machine actually sounds like it is saying the vowel.

### 4. What is rough
- High-pitched voices (children, sopranos) produce larger harmonic spacing, and the formant detector may latch onto the wrong harmonic, reducing vowel classification accuracy. A pre-emphasis filter or LPC pre-processing step would help.
- The `/i/` and `/u/` vowels are spectrally closer together than their mouth-shape difference suggests, so the color distinction is less dramatic than "aaah" vs "ooo". Future work: widen the palette gap for those two.
- The color blending uses per-channel RGB linear interpolation which can pass through desaturated greys when two saturated complementary hues blend. Interpolating in HSL or OKLab would stay more vivid.

### 5. Next-cycle deepening
- Replace FFT peak-picking with a simple LPC (order 12) or Harmonic Product Spectrum approach for more reliable F1/F2 estimation at higher fundamental frequencies.
- Add a "singing guide" visual — a small animated vowel chart showing the child's detected (F1, F2) position moving toward the target vowel, inspired directly by the AURORA biofeedback principle.
- Let the face's eye/nose/brow react to pitch height (F0), adding a second expressive dimension beyond the vowel identity.
- Make the gradient *flow* slowly using CSS `@keyframes` animated `background-position` on a larger-than-viewport gradient, so the color field feels alive even during silence.
