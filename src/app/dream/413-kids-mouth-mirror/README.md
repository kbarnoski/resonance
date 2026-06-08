# 413 — The Magic X-Ray Mouth Mirror

## The one question
**What if a 4-year-old could sing a vowel and SEE INSIDE the mouth — a friendly
side-view cartoon head whose tongue and jaw physically move to the shape it
heard, like a magic x-ray mirror — then hear the vowel sung back?**

A cute paper-cream animal head is drawn in cross-section (it faces left). When
the child sustains a vowel, the **tongue body**, **jaw**, and **lips** glide to
the articulation the sound implies — `aaah` drops the jaw and flattens the
tongue low-and-back; `eee` nearly closes the jaw and pushes the tongue
high-and-front; `ooo` purses the lips and pulls the tongue back. Then, after the
child goes quiet, the head sings the vowel back in a dreamy whole-tone voice.

## How to use
1. Tap **Start 🎤**. The AudioContext is created inside the tap handler
   (autoplay-safe), then the mic is requested.
2. Sing a long, steady vowel: `aaah`, `ehh`, `eee`, `ohh`, `ooo`. Watch the
   tongue and jaw move continuously to match. The big label and the little
   vowel-quadrilateral dot track where your tongue is.
3. Stop singing. After ~1.2 s of quiet the head **sings your vowel back**.
4. Keep quiet ~4 s and the head drifts into a gentle idle breath.
5. **No microphone?** If the mic is denied or absent, an **attract / demo mode**
   runs hands-free: the head cycles `a → e → i → o → u`, moving the tongue and
   singing each vowel, so a no-mic reviewer sees and hears the whole idea within
   a few seconds. A `text-rose-300` notice explains the fallback.

The mic feeds an `AnalyserNode` **only** — the signal is never recorded, never
routed to the speakers, and never transmitted.

---

## Subsystem 1 — LPC formant tracking (`lpc.ts`)

We run **real Linear Predictive Coding** on every animation frame over a
~2048-sample time-domain frame pulled from the analyser.

1. **RMS gate.** Skip silent frames so the articulators freeze (and the
   sing-back timer can run) instead of chasing noise.
2. **Pre-emphasis** `y[n] = x[n] − 0.97·x[n−1]` flattens the glottal
   −6 dB/octave tilt so the vocal-tract resonances we want stand out.
3. **Hamming window** the frame to reduce spectral leakage.
4. **Autocorrelation** `r[0..p]` of the windowed frame (`p = 14`).
5. **Levinson–Durbin recursion** turns the autocorrelation into the all-pole
   LPC coefficients `a[1..p]`. Each step computes a reflection coefficient
   `k_i = −(r[i] + Σ a[j]·r[i−j]) / err`, updates the coefficients in place, and
   shrinks the prediction error `err *= (1 − k_i²)`. The result models the vocal
   tract as an all-pole filter `H(z) = 1 / A(z)`.
6. **Spectral-envelope peak-pick.** We evaluate `|A(e^{jω})|` on a frequency
   grid and find the frequency of **minimum** `|A|` (= maximum `1/|A|`, a
   resonance peak) inside two bands: **F1 ∈ 250–900 Hz** and
   **F2 ∈ 900–2800 Hz**.
7. **Exponential smoothing** (α = 0.15) on F1/F2 so the articulators glide
   rather than strobe.

### Why LPC beats FFT peak-picking for children's voices
A 4-year-old's fundamental (f0) is high — roughly 250–400 Hz — so the voice's
harmonics are **widely spaced**. A raw FFT shows tall harmonic spikes, and a
naive peak-picker (the approach used by the earlier prototype **393**, which
explicitly noted LPC was the needed fix) mistakes the loudest *harmonic* for a
*formant*. LPC instead fits a smooth all-pole **model** of the vocal tract — its
**poles are the resonances themselves**, independent of which harmonics happen
to excite them. So LPC recovers F1/F2 even when a child's sparse harmonics
straddle the true formant, exactly where FFT peak-picking fails.

---

## Subsystem 2 — Formant → tongue articulatory inversion (the heart)

This is the most literal **source-filter inversion**: from two formant
frequencies we infer the **shape of the tongue** using the classic
**vowel quadrilateral** mapping.

| Articulator | Driven by | Rule |
|---|---|---|
| **Jaw open** | F1 | high F1 (/a/) ⇒ jaw wide open |
| **Tongue height** | 1 / F1 | low F1 (/i/, /u/) ⇒ tongue raised to the palate |
| **Tongue frontness** | F2 | high F2 (/i/) ⇒ tongue pushed forward |
| **Lip rounding** | low F2 | small F2 (/u/, /o/) ⇒ lips pursed forward |

Concretely, F1 and F2 are normalized into their working ranges to give
`height = 1 − F1ₙ`, `frontness = F2ₙ`, `jaw = F1ₙ`, `round = 1 − F2ₙ`. These four
smoothed values drive the **SVG control points continuously** — the tongue is
*never* snapped between five fixed poses. The vowel quadrilateral is the
articulatory phonetics map of vowel space: the vertical axis is tongue height
(close ↔ open), the horizontal axis is tongue backness (front ↔ back); /i/ sits
high-front, /a/ low, /u/ high-back. The little trapezoid inset shows the live
(height, frontness) dot moving through that space.

For a friendly **label** and **sing-back note** only, the smoothed (F1, F2) is
classified to the nearest **Peterson & Barney (1952)** centroid using a
Bark-warped distance. The label snaps; the tongue does not.

---

## Subsystem 3 — Whole-tone sing-back (`synth.ts`)

Call-and-response in a **foreign tonal world**: a **whole-tone scale** (six
equal 200-cent steps, no tonic, no leading tone — dreamy and unanchored), one
note per vowel:

```
a→C4  e→D4  i→E4  o→F#4  u→G#4
```

To sing the vowel back, a sawtooth + sub-sine "glottal" source is shaped through
**two bandpass filters tuned to the detected F1/F2** (blended with canonical
formants for stability), plus a faint F3 for character — so the sung note
actually *sounds* like the child's vowel. A soft attack/hold/release envelope
keeps it gentle.

**Safety:** every voice flows through a master gain → **DynamicsCompressor used
as a brick-wall limiter**, so the sing-back can never blast small ears. The idle
breath pad is two detuned, slowly-undulating sines at very low gain.

---

## Constraints honored
- **Input:** mic-voice (sustained vowels). No touch/tap as primary input.
- **Output:** SVG only (paths/curves for head, jaw, lips, morphing tongue, and
  the quadrilateral inset). No Canvas2D, WebGL2, or three.js.
- **Audio:** Web Audio API only, no npm deps, client-side only (no API route).
- Mic → `AnalyserNode` only; never recorded, routed, or transmitted.
- rAF + AudioContext + MediaStream all cleaned up on Stop and on unmount.

## References
- **AURORA formant-to-tongue inversion** — arXiv:2603.17543, March 2026.
- **Peterson, G. E., & Barney, H. L. (1952).** *Control methods used in a study
  of the vowels.* JASA 24(2), 175–184. (vowel-formant centroids)
- **The vowel quadrilateral / IPA articulatory model** — height × backness map
  of vowel space.
- **Levinson–Durbin LPC source-filter model** — Fant, G. (1960), *Acoustic
  Theory of Speech Production*; Markel, J. D., & Gray, A. H. (1976), *Linear
  Prediction of Speech*.
