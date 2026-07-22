# 2218 · Missing Bass

**The one question:** *What if the deep bass drone you feel in your chest isn't actually in the sound at all?*

An ears-first, played, cosmic-ambient drone built entirely on an auditory
illusion: the felt bass of this piece is a phantom your brain constructs. There
is provably no acoustic energy at the low fundamental you hear.

## The mechanism

### Missing fundamental / residue pitch
If you present only the **upper harmonics** of a low tone — here the 3rd through
8th harmonics of a fundamental `f0` — with **no energy at `f0` itself**, the
auditory system still reconstructs and "hears" the absent low pitch. The pitch
you perceive corresponds to the *spacing* between the harmonics (their common
difference frequency), not to any physical spectral component at that frequency.

This is **residue pitch**, and it has a deep lineage:

- **August Seebeck (1841)** — sirens producing tones whose perceived pitch did
  not match the strongest present partial; the first serious challenge to a
  purely place-based account of pitch.
- **Hermann von Helmholtz** — codified the harmonic-series account of timbre and
  the fundamental; residue phenomena sit in tension with the strict place theory.
- **J. F. Schouten (1938–1940)** — the modern "residue" experiments: removing the
  fundamental (and even neighbouring harmonics) from a complex tone leaves the
  perceived low pitch intact. This is the direct basis for what this prototype does.

### Guaranteeing the low end is genuinely empty
Two independent guarantees:

1. **No source exists at `f0`.** For each phantom root we only ever create
   oscillators at `3·f0 … 8·f0`. There is literally no oscillator at the
   fundamental (nor at the 2nd harmonic / octave, which would too strongly imply it).
2. **A cascaded high-pass filter** (two biquads ≈ 24 dB/oct) at **135 Hz** sits
   above the entire phantom-root scale (top note A2 = 110 Hz) and below the
   lowest rendered harmonic (3 × 55 = 165 Hz). Any incidental low content is
   removed. The live spectrum view is fed from an `AnalyserNode` on the output,
   so you can *see* that the bars only ever appear above the cutoff — the low
   band is empty while you feel the bass.

### Binaural beat
The right ear's harmonics are detuned from the left ear's by the **beat rate**
(0–8 Hz). Because a fixed Hz offset yields the same difference frequency at every
harmonic, the whole stack beats at one coherent slow rate — a gentle entrainment
layer. This, and the illusion itself, is why **headphones are required**: the
phantom bass depends on the harmonics reaching the ear cleanly, and the binaural
beat only exists across two separated channels.

### The Reveal A/B (the "huh" moment)
**Reveal OFF** (default): pure phantom — no energy at `f0`.
**Reveal ON**: a real sine at `f0` is synthesised and routed *around* the
high-pass (drawn as an amber bar in the empty low band) so you hear the genuine
fundamental and can compare it to the pitch you were already reconstructing.
Toggle it back off and the bass persists as pure illusion.

## How to play it

- **Home row `A S D F G H J K`** — a scale of *missing* fundamentals (A natural
  minor, A1→A2, 55–110 Hz). Hold keys to sound a slow chord of phantom roots.
  Pointer taps on the on-screen keys work too.
- **↑ / ↓** (or the slider) — harmonic density / brightness (3–8 harmonics).
  More harmonics → a more vivid reconstructed bass.
- **← / →** (or the slider) — binaural beat rate, 0–8 Hz.
- **`R`** (or the button) — toggle Reveal (add / remove the real fundamental).
- **Volume** slider — master level (after a soft limiter).

Slow attack/release keep every root a drone, not a note. Audio starts only after
**Begin** (a user gesture creates and resumes the `AudioContext`); if Web Audio
is unavailable the page shows an on-brand notice instead of crashing.

## The visual

A Canvas 2D **log-frequency spectrum** driven by the real output FFT: present
upper harmonics glow violet; the region below the 135 Hz high-pass is shaded and
hatched as conspicuously **empty**. Dashed **phantom-root ghost markers** with
pulsing orbs sit in that empty low band labeled *"you hear a pitch here — there
is no sound here."* With Reveal on, a solid amber bar appears at `f0`. A slow
cosmic radial glow reacts to overall amplitude and the binaural phase.

## Honest verification notes

- **Verified deterministically (no ears needed):** the audio graph never creates
  an oscillator at `f0` while Reveal is off; a 24 dB/oct high-pass at 135 Hz sits
  above the whole scale; the on-screen spectrum is the actual output FFT, so the
  empty low band is demonstrable on screen. ESLint and TypeScript pass clean; the
  page mounts and renders pre-gesture without audio.
- **Needs ears + headphones (as expected for an illusion):** whether *you*
  reconstruct the phantom pitch, how vivid it feels versus the revealed real
  fundamental, and the felt depth of the binaural entrainment are perceptual and
  cannot be asserted from code alone. That subjective reconstruction is the whole
  point of the piece.

## References

- Seebeck, A. (1841). *Beobachtungen über einige Bedingungen der Entstehung von Tönen.*
- von Helmholtz, H. *On the Sensations of Tone.*
- Schouten, J. F. (1940). *The residue and the mechanism of hearing.* (residue pitch)
- Missing-fundamental / periodicity-pitch literature (Licklider; Terhardt) building on the above.
